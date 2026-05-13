/**
 * GitHub GraphQL 기여 캘린더 → contribution_days 적재 → 코딩 스트릭 갱신
 * (FR-07 요지: 하루 1회 이상 기여 시 해당 일자 확정, 행 삭제 없음)
 *
 * 참고: contributionsCollection 은 API 상 1년을 넘는 from~to 를 허용하지 않음(364일 윈도).
 * includePrivateContributions 인자는 현재 스키마에서 제거됨 — 비공개 기여는 GitHub 프로필 설정·토큰 권한에 따름.
 */
const axios = require('axios');
const prisma = require('../config/db');

const GRAPHQL_URL = 'https://api.github.com/graphql';

const CONTRIBUTION_QUERY = `
  query($from: DateTime!, $to: DateTime!) {
    viewer {
      login
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
            }
          }
        }
      }
    }
  }
`;

function ymdFromDate(d) {
  return d.toISOString().slice(0, 10);
}

function addDaysYmd(ymd, deltaDays) {
  const [y, m, dd] = ymd.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, dd + deltaDays));
  return ymdFromDate(d);
}

function parseContributionDays(payload) {
  const weeks =
    payload?.data?.viewer?.contributionsCollection?.contributionCalendar?.weeks;
  if (!Array.isArray(weeks)) return { datesWithActivity: [], todayCount: 0, login: null };

  const login = payload?.data?.viewer?.login ?? null;
  const datesWithActivity = [];
  let todayCount = 0;
  const todayStr = ymdFromDate(new Date());

  for (const w of weeks) {
    for (const day of w.contributionDays || []) {
      const dateStr = day.date;
      const c = Number(day.contributionCount || 0);
      if (dateStr && c > 0) {
        datesWithActivity.push(dateStr);
        if (dateStr === todayStr) todayCount = c;
      }
    }
  }
  return { datesWithActivity, todayCount, login };
}

function buildDateSet(rows) {
  const set = new Set();
  for (const r of rows) {
    set.add(ymdFromDate(new Date(r.activity_date)));
  }
  return set;
}

/** GitHub 스타일: 오늘 미기여 시 어제부터 연속일까지 인정 */
function computeCurrentStreak(dateSet) {
  const today = ymdFromDate(new Date());
  let start = today;
  if (!dateSet.has(start)) {
    start = addDaysYmd(today, -1);
  }
  if (!dateSet.has(start)) return 0;
  let streak = 0;
  let d = start;
  while (dateSet.has(d)) {
    streak += 1;
    d = addDaysYmd(d, -1);
  }
  return streak;
}

/** 전체 기록에서 가장 긴 연속 캘린더 일수 */
function longestConsecutiveStreak(sortedAscYmd) {
  if (!sortedAscYmd.length) return 0;
  let best = 1;
  let cur = 1;
  for (let i = 1; i < sortedAscYmd.length; i += 1) {
    if (addDaysYmd(sortedAscYmd[i - 1], 1) === sortedAscYmd[i]) {
      cur += 1;
      best = Math.max(best, cur);
    } else {
      cur = 1;
    }
  }
  return best;
}

async function fetchGithubContributions(token, _includePrivate) {
  const to = new Date();
  const from = new Date(to.getTime() - 364 * 86400000);
  const res = await axios.post(
    GRAPHQL_URL,
    {
      query: CONTRIBUTION_QUERY,
      variables: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      validateStatus: () => true,
    },
  );

  const resetAt = res.headers?.['x-ratelimit-reset']
    ? parseInt(res.headers['x-ratelimit-reset'], 10) * 1000
    : null;
  const remaining = res.headers?.['x-ratelimit-remaining']
    ? parseInt(res.headers['x-ratelimit-remaining'], 10)
    : null;

  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      httpStatus: res.status,
      rateLimitResetAt: resetAt,
      rateLimitRemaining: remaining,
      graphqlErrors: [{ message: 'github_auth_failed' }],
    };
  }

  const body = res.data;
  if (body.errors && body.errors.length) {
    return {
      ok: false,
      httpStatus: res.status,
      rateLimitResetAt: resetAt,
      rateLimitRemaining: remaining,
      graphqlErrors: body.errors,
    };
  }

  return {
    ok: true,
    httpStatus: res.status,
    payload: body,
    rateLimitResetAt: resetAt,
    rateLimitRemaining: remaining,
  };
}

function dailyCoinAmountFromEnv() {
  const n = parseInt(process.env.DAILY_COIN_AMOUNT || '1', 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 100);
}

/** UTC 당일 GitHub 기여가 있으면 코인 1회(금액은 DAILY_COIN_AMOUNT, 기본 1) */
async function maybeGrantDailyContributionCoin(tx, userId, dateSet) {
  const todayStr = ymdFromDate(new Date());
  if (!dateSet.has(todayStr)) return;
  const amount = dailyCoinAmountFromEnv();
  const updated = await tx.user.updateMany({
    where: {
      user_id: userId,
      OR: [{ last_daily_coin_ymd: null }, { last_daily_coin_ymd: { not: todayStr } }],
    },
    data: {
      last_daily_coin_ymd: todayStr,
      coins: { increment: amount },
    },
  });
  if (updated.count !== 1) return;
  await tx.coinHistory.create({
    data: { user_id: userId, reason: 'daily_contribution', amount },
  });
}

/** 임시: 스트릭×배수만큼 코인 하한 (미설정이면 미적용). 운영 전 .env에서 제거 */
function tempStreakCoinsMultiplierFromEnv() {
  const n = parseInt(process.env.TEMP_STREAK_COINS_MULTIPLIER || '0', 10);
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.min(n, 1000);
}

async function maybeApplyTempStreakCoinFloor(tx, userId, newCurrent) {
  const mult = tempStreakCoinsMultiplierFromEnv();
  if (!mult) return;
  const floorCoins = Math.max(0, newCurrent) * mult;
  const u = await tx.user.findUnique({
    where: { user_id: userId },
    select: { coins: true },
  });
  if (!u || u.coins >= floorCoins) return;
  await tx.user.update({
    where: { user_id: userId },
    data: { coins: floorCoins },
  });
}

async function maybeGrantStreakCoins(tx, userId, prevCurrent, newCurrent) {
  const milestones = [
    { min: 1, amount: 1, reason: 'streak_1' },
    { min: 7, amount: 5, reason: 'streak_7' },
    { min: 30, amount: 10, reason: 'streak_30' },
    { min: 100, amount: 20, reason: 'streak_100' },
  ];

  for (const { min, amount, reason } of milestones) {
    if (prevCurrent < min && newCurrent >= min) {
      await tx.coinHistory.create({
        data: { user_id: userId, reason, amount },
      });
      await tx.user.update({
        where: { user_id: userId },
        data: { coins: { increment: amount } },
      });
      await tx.notification.create({
        data: {
          user_id: userId,
          type: 'streak_milestone',
          from_user_id: null,
          reference_id: min,
          is_read: false,
        },
      });
    }
  }
}

/**
 * @param {number} userId
 * @param {{ manual?: boolean }} [opts]
 * @returns {Promise<{ ok: boolean, message?: string, current_streak?: number, max_streak?: number, rateLimitResetAt?: number | null }>}
 */
async function syncUserStreakById(userId, opts = {}) {
  const user = await prisma.user.findUnique({
    where: { user_id: userId },
    include: { coding_streak: true },
  });

  if (!user || user.is_deleted) {
    return { ok: false, message: 'user_not_found' };
  }
  if (!user.github_access_token) {
    return { ok: false, message: 'no_github_token' };
  }

  const gh = await fetchGithubContributions(
    user.github_access_token,
    user.include_private_contributions,
  );

  if (!gh.ok) {
    const authFail = gh.graphqlErrors?.some(
      (e) =>
        String(e?.type) === 'UNAUTHORIZED' ||
        /bad credentials/i.test(String(e?.message)),
    );
    if (gh.httpStatus === 401 || authFail) {
      await prisma.user.update({
        where: { user_id: userId },
        data: { github_access_token: null },
      });
    }
    return {
      ok: false,
      message: 'github_fetch_failed',
      rateLimitResetAt: gh.rateLimitResetAt,
    };
  }

  if (typeof gh.rateLimitRemaining === 'number' && gh.rateLimitRemaining <= 0) {
    return {
      ok: false,
      message: 'github_rate_limited',
      rateLimitResetAt: gh.rateLimitResetAt,
    };
  }

  const { datesWithActivity, todayCount, login } = parseContributionDays(gh.payload);
  const uniqueNew = [...new Set(datesWithActivity)];

  const prevCurrent = user.coding_streak?.current_streak ?? 0;

  let newCurrent = prevCurrent;
  let newMax = user.coding_streak?.max_streak ?? 0;
  let lastCommitDate = null;

  await prisma.$transaction(async (tx) => {
    if (login && login !== user.github_login) {
      await tx.user.update({
        where: { user_id: userId },
        data: { github_login: login },
      });
    }

    if (uniqueNew.length) {
      await tx.contributionDay.createMany({
        data: uniqueNew.map((ymd) => ({
          user_id: userId,
          activity_date: new Date(`${ymd}T12:00:00.000Z`),
        })),
        skipDuplicates: true,
      });
    }

    const rows = await tx.contributionDay.findMany({
      where: { user_id: userId },
      select: { activity_date: true },
    });
    const dateSet = buildDateSet(rows);
    const sortedAsc = [...dateSet].sort();

    newCurrent = computeCurrentStreak(dateSet);
    const longest = longestConsecutiveStreak(sortedAsc);
    const prevMax = user.coding_streak?.max_streak ?? 0;
    newMax = Math.max(prevMax, longest, newCurrent);

    if (sortedAsc.length) {
      lastCommitDate = new Date(`${sortedAsc[sortedAsc.length - 1]}T12:00:00.000Z`);
    }

    await tx.codingStreak.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        current_streak: newCurrent,
        max_streak: newMax,
        last_commit_date: lastCommitDate,
        today_commit_count: todayCount,
      },
      update: {
        current_streak: newCurrent,
        max_streak: newMax,
        last_commit_date: lastCommitDate,
        today_commit_count: todayCount,
      },
    });

    await maybeGrantStreakCoins(tx, userId, prevCurrent, newCurrent);
    await maybeGrantDailyContributionCoin(tx, userId, dateSet);
    await maybeApplyTempStreakCoinFloor(tx, userId, newCurrent);

    if (opts.manual) {
      await tx.user.update({
        where: { user_id: userId },
        data: { last_streak_manual_refresh_at: new Date() },
      });
    }
  });

  return {
    ok: true,
    current_streak: newCurrent,
    max_streak: newMax,
    rateLimitResetAt: gh.rateLimitResetAt,
  };
}

/** DB에 저장된 스트릭 기준으로 임시 코인 하한만 적용 (GitHub 호출 없음) */
async function applyTempStreakCoinFloorForUserId(userId) {
  const mult = tempStreakCoinsMultiplierFromEnv();
  if (!mult) return;
  await prisma.$transaction(async (tx) => {
    const cs = await tx.codingStreak.findUnique({
      where: { user_id: userId },
      select: { current_streak: true },
    });
    const cur = cs?.current_streak ?? 0;
    await maybeApplyTempStreakCoinFloor(tx, userId, cur);
  });
}

/** 전체 유저 순차 동기화 (스케줄러용) */
async function syncAllUsersWithGithubToken() {
  const users = await prisma.user.findMany({
    where: {
      is_deleted: false,
      github_access_token: { not: null },
    },
    select: { user_id: true },
  });
  let ok = 0;
  let fail = 0;
  for (const u of users) {
    try {
      const r = await syncUserStreakById(u.user_id, { manual: false });
      if (r.ok) ok += 1;
      else fail += 1;
    } catch (e) {
      fail += 1;
      console.error('[streak sync user]', u.user_id, e.message);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return { total: users.length, ok, fail };
}

module.exports = {
  syncUserStreakById,
  syncAllUsersWithGithubToken,
  ymdFromDate,
  applyTempStreakCoinFloorForUserId,
};
