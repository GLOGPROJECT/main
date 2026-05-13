const prisma = require('../config/db');

const DAILY_LOGIN_REWARD = 700;

/** KST(UTC+9) 기준 오늘 날짜 YYYY-MM-DD */
function getTodayKST() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/**
 * POST /api/auth/daily-reward
 * 하루 첫 로그인 보상 700 코인 지급.
 * 이미 오늘 받은 경우 rewarded: false 반환.
 */
async function claimDailyReward(req, res) {
  const userId = req.user.userId;
  const today = getTodayKST();

  try {
    const user = await prisma.user.findUnique({
      where: { user_id: userId },
      select: { last_login_reward_ymd: true, coins: true, is_deleted: true },
    });

    if (!user || user.is_deleted) {
      return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
    }

    // 오늘 이미 받은 경우
    if (user.last_login_reward_ymd === today) {
      return res.json({ rewarded: false, coins: user.coins });
    }

    const updated = await prisma.user.update({
      where: { user_id: userId },
      data: {
        coins: { increment: DAILY_LOGIN_REWARD },
        last_login_reward_ymd: today,
      },
      select: { coins: true },
    });

    return res.json({ rewarded: true, amount: DAILY_LOGIN_REWARD, coins: updated.coins });
  } catch (err) {
    console.error('[DailyReward Error]', err.message);
    return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
}

module.exports = { claimDailyReward };
