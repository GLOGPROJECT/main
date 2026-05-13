/**
 * 로컬 스트릭 진단: 토큰 유무, coding_streaks, contribution_days 개수,
 * syncUserStreakById 1회 실행 결과(에러 메시지).
 * 사용: node scripts/diagnoseStreak.js
 */
require('dotenv').config();
const axios = require('axios');
const prisma = require('../src/config/db');
const { syncUserStreakById } = require('../src/services/streakSyncService');

const GRAPHQL_URL = 'https://api.github.com/graphql';
const CONTRIBUTION_QUERY = `
  query($from: DateTime!, $to: DateTime!) {
    viewer {
      login
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks { contributionDays { date contributionCount } }
        }
      }
    }
  }
`;

async function printGithubGraphqlErrors(token, includePrivate) {
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
  console.log('GitHub GraphQL HTTP status:', res.status);
  if (res.data?.errors?.length) {
    console.log(
      'GraphQL errors (type/message만):',
      JSON.stringify(
        res.data.errors.map((e) => ({ type: e.type, message: e.message })),
        null,
        2,
      ),
    );
  } else {
    console.log('GraphQL errors: (없음)');
  }
}

async function main() {
  const users = await prisma.user.findMany({
    where: { is_deleted: false, github_access_token: { not: null } },
    select: {
      user_id: true,
      nickname: true,
      github_login: true,
      include_private_contributions: true,
      github_access_token: true,
      coding_streak: true,
    },
  });

  console.log('--- users with github_access_token ---');
  if (!users.length) {
    console.log('(없음) → 스트릭 동기화가 돌아가지 않습니다. GitHub 로그인 시 토큰이 저장되는지 확인하세요.');
    await prisma.$disconnect();
    return;
  }

  for (const u of users) {
    const dayCnt = await prisma.contributionDay.count({ where: { user_id: u.user_id } });
    console.log(
      JSON.stringify(
        {
          user_id: u.user_id,
          nickname: u.nickname,
          github_login: u.github_login,
          has_github_token: Boolean(u.github_access_token),
          token_length: u.github_access_token ? String(u.github_access_token).length : 0,
          include_private_contributions: u.include_private_contributions,
          coding_streak_row: u.coding_streak,
          contribution_days_count: dayCnt,
        },
        null,
        2,
      ),
    );

    console.log('--- raw GitHub GraphQL (에러만 출력, 토큰 값은 출력 안 함) ---');
    await printGithubGraphqlErrors(u.github_access_token, u.include_private_contributions);

    console.log(`--- syncUserStreakById(${u.user_id}) dry run ---`);
    const r = await syncUserStreakById(u.user_id, { manual: false });
    console.log('sync result:', JSON.stringify(r, null, 2));

    const after = await prisma.user.findUnique({
      where: { user_id: u.user_id },
      include: { coding_streak: true },
    });
    console.log(
      'after DB:',
      JSON.stringify(
        {
          current_streak: after.coding_streak?.current_streak ?? 0,
          max_streak: after.coding_streak?.max_streak ?? 0,
          contribution_days: await prisma.contributionDay.count({ where: { user_id: u.user_id } }),
        },
        null,
        2,
      ),
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
