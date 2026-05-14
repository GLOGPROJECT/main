const express = require('express');
const router = express.Router();
const prisma = require('../config/db');

// GET /api/stats
// 랜딩 페이지 통계: 가입 개발자 수, 참여 국가 수, 오늘 커밋 총합, 오늘 커밋 상위 2명
router.get('/', async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [userCount, countries, todayCommitSum, topRaw] = await Promise.all([
      // 탈퇴하지 않은 전체 가입 개발자 수
      prisma.user.count({ where: { is_deleted: false } }),

      // 고유 국가 수
      prisma.user.groupBy({
        by: ['country'],
        where: { country: { not: null }, is_deleted: false },
      }),

      // 오늘 전체 회원들의 커밋 횟수 합계
      prisma.codingStreak.aggregate({
        _sum: { today_commit_count: true },
        where: { last_reset_date: { gte: todayStart, lte: todayEnd } },
      }),

      // 오늘 커밋 횟수 기준 상위 유저들 조회
      prisma.codingStreak.findMany({
        where: {
          today_commit_count: { gt: 0 },
          last_reset_date: { gte: todayStart, lte: todayEnd },
        },
        orderBy: { today_commit_count: 'desc' },
        include: { user: { select: { nickname: true, avatar_url: true } } },
      }),
    ]);

    // 동점자 처리: 커밋 수가 같은 경우 랜덤으로 섞은 뒤 상위 2명 선택
    let topCommitters = topRaw;
    if (topCommitters.length >= 2 && topCommitters[0].today_commit_count === topCommitters[1].today_commit_count) {
      // 1위 동점자들만 따로 추출해서 랜덤 셔플
      const topCount = topCommitters[0].today_commit_count;
      const tied = topCommitters.filter(s => s.today_commit_count === topCount);
      for (let i = tied.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tied[i], tied[j]] = [tied[j], tied[i]];
      }
      topCommitters = [...tied, ...topCommitters.filter(s => s.today_commit_count !== topCount)];
    }

    res.json({
      userCount,
      countryCount: countries.length,
      todayCommits: todayCommitSum._sum.today_commit_count || 0,
      topCommitters: topCommitters.slice(0, 2).map((s) => ({
        nickname: s.user.nickname,
        avatarUrl: s.user.avatar_url,
        commitCount: s.today_commit_count,
      })),
    });
  } catch (err) {
    console.error('[Stats Error]', err.message);
    res.status(500).json({ message: '서버 오류' });
  }
});

// GET /api/stats/featured
// 6시간마다 갱신되는 랜덤 유저 2명 — 오늘 커밋 횟수 포함 (0이면 0으로 표시)
let featuredCache = { users: [], expiresAt: 0 };

router.get('/featured', async (req, res) => {
  try {
    // 캐시가 유효하면 그대로 반환
    if (Date.now() < featuredCache.expiresAt) {
      return res.json(featuredCache.users);
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // 전체 가입 유저 수 조회
    const totalCount = await prisma.user.count({ where: { is_deleted: false } });
    if (totalCount === 0) return res.json([]);

    // 랜덤 offset 2개로 유저 뽑기
    const offsets = [];
    while (offsets.length < Math.min(2, totalCount)) {
      const r = Math.floor(Math.random() * totalCount);
      if (!offsets.includes(r)) offsets.push(r);
    }

    const picked = await Promise.all(offsets.map(skip =>
      prisma.user.findFirst({
        where: { is_deleted: false },
        skip,
        select: { user_id: true, nickname: true },
      })
    ));

    // 각 유저의 오늘 커밋 횟수 조회 (없으면 0)
    const users = await Promise.all(picked.filter(Boolean).map(async (u) => {
      const [streak, techStacks] = await Promise.all([
        prisma.codingStreak.findFirst({
          where: { user_id: u.user_id, last_reset_date: { gte: todayStart, lte: todayEnd } },
          select: { today_commit_count: true },
        }),
        prisma.userTechStack.findMany({
          where: { user_id: u.user_id },
          select: { stack_name: true },
          take: 2,
        }),
      ]);
      return {
        nickname: u.nickname,
        commitCount: streak?.today_commit_count ?? 0,
        techStacks: techStacks.map(t => t.stack_name),
      };
    }));

    // 6시간 캐시 저장
    featuredCache = { users, expiresAt: Date.now() + 6 * 60 * 60 * 1000 };
    res.json(users);
  } catch (err) {
    console.error('[Featured Error]', err.message);
    res.status(500).json({ message: '서버 오류' });
  }
});

module.exports = router;
