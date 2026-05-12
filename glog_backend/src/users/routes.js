const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const authenticate = require('../auth/middleware');

// PATCH /api/users/me/status
// 본인 온라인 상태 변경 - 로그인 필요 (online / away / offline)
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
    const user = await prisma.user.findUnique({
      where: { user_id: req.user.userId },
      include: {
        tech_stacks: true,
        coding_streak: true,
        user_status: true,
        followers: true,
        following: true,
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
      follower_count: user.followers.length,
      following_count: user.following.length,
      status: user.user_status?.status ?? 'offline',
    });
  } catch (err) {
    console.error('[GetMyProfile Error]', err.message);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// PATCH /api/users/me/profile
// 본인 프로필 수정 - bio, tech_stacks만 변경 가능, 기술스택 최대 5개 제한
router.patch('/me/profile', authenticate, async (req, res) => {
  const { bio, tech_stacks } = req.body;

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
      data: { bio: bio ?? undefined },
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
    });
  } catch (err) {
    console.error('[UpdateProfile Error]', err.message);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
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
        followers: true,
        following: true,
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
      follower_count: user.followers.length,
      following_count: user.following.length,
      status: user.user_status?.status ?? 'offline',
    });
  } catch (err) {
    console.error('[GetUser Error]', err.message);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
