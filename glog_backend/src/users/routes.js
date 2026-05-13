const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const authenticate = require('../auth/middleware');
const { syncUserStreakById, applyTempStreakCoinFloorForUserId } = require('../services/streakSyncService');

// PATCH /api/users/me/status — 온라인 상태
// POST /api/users/me/streak/sync — GitHub 기여 스트릭 수동 동기화(1시간 1회)
router.post('/me/streak/sync', authenticate, async (req, res) => {
  try {
    const u = await prisma.user.findUnique({
      where: { user_id: req.user.userId },
      select: { last_streak_manual_refresh_at: true, github_access_token: true },
    });
    if (!u?.github_access_token) {
      return res.status(400).json({ message: 'GitHub 연동 토큰이 없습니다. 다시 로그인해 주세요.' });
    }
    if (u.last_streak_manual_refresh_at) {
      const elapsed = Date.now() - new Date(u.last_streak_manual_refresh_at).getTime();
      const HOUR_MS = 3600000;
      if (elapsed < HOUR_MS) {
        return res.status(429).json({
          message: '수동 새로고침은 1시간에 1회만 가능합니다.',
          retryAfterMs: HOUR_MS - elapsed,
        });
      }
    }
    const r = await syncUserStreakById(req.user.userId, { manual: true });
    if (!r.ok) {
      const status = r.message === 'github_rate_limited' ? 429 : 502;
      return res.status(status).json({
        message: r.message,
        rateLimitResetAt: r.rateLimitResetAt ?? null,
      });
    }
    return res.json({
      current_streak: r.current_streak,
      max_streak: r.max_streak,
      rateLimitResetAt: r.rateLimitResetAt ?? null,
    });
  } catch (err) {
    console.error('[StreakSync Error]', err.message);
    return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

router.patch('/me/status', authenticate, async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['online', 'away', 'offline'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: '유효하지 않은 상태값입니다.' });
  }

  try {
    await prisma.userStatus.upsert({
      where: { user_id: req.user.userId },
      update: { status, last_active_at: new Date() },
      create: { user_id: req.user.userId, status },
    });

    res.json({ status });
  } catch (err) {
    console.error('[UpdateStatus Error]', err.message);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// GET /api/users/me/profile
// 본인 프로필 조회 - 로그인 필요 (민감 정보 포함)
// /:userId 보다 먼저 정의해야 'me'가 userId로 매칭되지 않음
router.get('/me/profile', authenticate, async (req, res) => {
  try {
    await applyTempStreakCoinFloorForUserId(req.user.userId);

    const user = await prisma.user.findUnique({
      where: { user_id: req.user.userId },
      include: {
        tech_stacks: true,
        coding_streak: true,
        user_status: true,
        _count: {
          select: { followers: true, following: true },
        },
      },
    });

    if (!user || user.is_deleted) {
      return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
    }

    res.json({
      user_id: user.user_id,
      nickname: user.nickname,
      avatar_url: user.avatar_url,
      bio: user.bio,
      country: user.country,
      email: user.email,
      coins: user.coins,
      is_private: user.is_private,
      tech_stacks: user.tech_stacks.map((t) => t.stack_name),
      current_streak: user.coding_streak?.current_streak ?? 0,
      max_streak: user.coding_streak?.max_streak ?? 0,
      follower_count: user._count.followers,
      following_count: user._count.following,
      status: user.user_status?.status ?? 'offline',
      include_private_contributions: user.include_private_contributions,
      has_github_token: Boolean(user.github_access_token),
    });
  } catch (err) {
    console.error('[GetMyProfile Error]', err.message);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// PATCH /api/users/me/profile
// 본인 프로필 수정 - bio, tech_stacks만 변경 가능, 기술스택 최대 5개 제한
router.patch('/me/profile', authenticate, async (req, res) => {
  const { bio, tech_stacks, include_private_contributions } = req.body;

  if (include_private_contributions !== undefined && typeof include_private_contributions !== 'boolean') {
    return res.status(400).json({ message: 'include_private_contributions는 true/false여야 합니다.' });
  }

  // 기술스택 최대 5개 제한
  if (tech_stacks !== undefined) {
    if (!Array.isArray(tech_stacks)) {
      return res.status(400).json({ message: 'tech_stacks는 배열이어야 합니다.' });
    }
    if (tech_stacks.length > 5) {
      return res.status(400).json({ message: '기술 스택은 최대 5개까지 선택할 수 있습니다.' });
    }
  }

  try {
    // bio 업데이트
    await prisma.user.update({
      where: { user_id: req.user.userId },
      data: {
        bio: bio ?? undefined,
        ...(include_private_contributions !== undefined
          ? { include_private_contributions }
          : {}),
      },
    });

    // tech_stacks가 전달된 경우 기존 것 삭제 후 새로 삽입
    if (tech_stacks !== undefined) {
      await prisma.userTechStack.deleteMany({
        where: { user_id: req.user.userId },
      });

      if (tech_stacks.length > 0) {
        await prisma.userTechStack.createMany({
          data: tech_stacks.map((stack_name) => ({
            user_id: req.user.userId,
            stack_name,
          })),
        });
      }
    }

    res.json({
      bio: bio ?? null,
      tech_stacks: tech_stacks ?? [],
      ...(include_private_contributions !== undefined
        ? { include_private_contributions }
        : {}),
    });
  } catch (err) {
    console.error('[UpdateProfile Error]', err.message);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// GET /api/users/globe
// 지구본에 표시할 유저 목록 — globe_lat/lon이 설정된 유저만 반환
router.get('/globe', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        is_deleted: false,
        globe_lat: { not: null },
        globe_lon: { not: null },
      },
      include: {
        user_status: true,
        tech_stacks: true,
      },
      take: 100,
    });

    res.json(users.map((u) => ({
      id: u.user_id,
      name: u.nickname,
      bio: u.bio || '',
      avatar_url: u.avatar_url,
      lat: parseFloat(u.globe_lat),
      lon: parseFloat(u.globe_lon),
      country: u.country,
      tech_stacks: u.tech_stacks.map((t) => t.stack_name),
      status: u.user_status?.status ?? 'offline',
      color: '#4e9af1',
    })));
  } catch (err) {
    console.error('[GetGlobeUsers Error]', err.message);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// GET /api/users/search?q= — 닉네임 부분 검색 (로그인 필요, 프로젝트 기여자 추가용). `/:userId`보다 먼저 등록.
router.get('/search', authenticate, async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 40);
  if (q.length < 1) {
    return res.json({ users: [] });
  }
  try {
    const me = req.user.userId;
    const users = await prisma.user.findMany({
      where: {
        is_deleted: false,
        NOT: { user_id: me },
        nickname: { contains: q },
      },
      select: { user_id: true, nickname: true, avatar_url: true },
      take: 15,
      orderBy: { nickname: 'asc' },
    });
    return res.json({ users });
  } catch (err) {
    console.error('[UserSearch Error]', err.message);
    return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// GET /api/users/:userId
// 특정 유저의 공개 프로필 조회 - 로그인 불필요 (공개 정보만 반환)
router.get('/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId);

  if (isNaN(userId)) {
    return res.status(400).json({ message: '유효하지 않은 유저 ID입니다.' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { user_id: userId },
      include: {
        tech_stacks: true,
        coding_streak: true,
        user_status: true,
        _count: {
          select: { followers: true, following: true },
        },
      },
    });

    if (!user || user.is_deleted) {
      return res.status(404).json({ message: '존재하지 않는 유저입니다.' });
    }

    res.json({
      user_id: user.user_id,
      nickname: user.nickname,
      avatar_url: user.avatar_url,
      bio: user.bio,
      country: user.country,
      coins: user.coins,
      is_private: user.is_private,
      tech_stacks: user.tech_stacks.map((t) => t.stack_name),
      current_streak: user.coding_streak?.current_streak ?? 0,
      max_streak: user.coding_streak?.max_streak ?? 0,
      follower_count: user._count.followers,
      following_count: user._count.following,
      status: user.user_status?.status ?? 'offline',
    });
  } catch (err) {
    console.error('[GetUser Error]', err.message);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
