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
    // user_status 레코드가 없으면 생성, 있으면 업데이트 (upsert)
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

// GET /api/users/:userId
// 특정 유저의 공개 프로필 조회 - 로그인 불필요 (공개 정보만 반환)
router.get('/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId);

  // userId가 숫자가 아닌 경우 400 반환
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
        // 팔로워/팔로잉 수만 카운트
        followers: true,
        following: true,
      },
    });

    // 유저가 없거나 탈퇴한 경우
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

// GET /api/users/me/profile
// 본인 프로필 조회 - 로그인 필요 (민감 정보 포함)
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
      email: user.email, // 본인만 이메일 볼 수 있음
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

module.exports = router;
