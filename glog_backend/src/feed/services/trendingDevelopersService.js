/**
 * GitHub 토큰이 있는 공개 유저 대상으로 지표를 모아 트렌딩 순위·강점 한 줄을 계산합니다.
 * (순위는 결정적 점수, 강점 문구는 지표 기반 템플릿)
 */

const prisma = require('../../config/db');
const { Prisma } = require('@prisma/client');

const CANDIDATE_LIMIT = 450;
const RESULT_LIMIT = 8;

/** @param {unknown} v */
function num(v) {
  if (v == null) return 0;
  if (typeof v === 'bigint') return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {Array<{ user_id: unknown; tag_name: unknown; cnt: unknown }>} rows
 * @returns {Map<number, { tag: string; cnt: number }>}
 */
function bestTagPerUser(rows) {
  const m = new Map();
  for (const r of rows) {
    const uid = num(r.user_id);
    const tag = String(r.tag_name || '').trim();
    const cnt = num(r.cnt);
    if (!uid || !tag) continue;
    const prev = m.get(uid);
    if (!prev || cnt > prev.cnt) m.set(uid, { tag, cnt });
  }
  return m;
}

/**
 * @param {number[]} userIds
 */
async function fetchTopProjectTagsByUser(userIds) {
  if (!userIds.length) return new Map();
  const rows = await prisma.$queryRaw`
    SELECT p.user_id AS user_id, pt.tag_name AS tag_name, COUNT(*) AS cnt
    FROM project_tags pt
    INNER JOIN projects p ON p.projects_id = pt.project_id
    WHERE p.is_deleted = 0 AND p.user_id IN (${Prisma.join(userIds)})
    GROUP BY p.user_id, pt.tag_name
  `;
  return bestTagPerUser(rows);
}

async function fetchCandidateRows() {
  return prisma.$queryRaw`
    SELECT
      u.user_id AS user_id,
      u.nickname AS nickname,
      u.avatar_url AS avatar_url,
      IFNULL(cs.current_streak, 0) AS current_streak,
      IFNULL(cs.max_streak, 0) AS max_streak,
      (
        SELECT COUNT(*)
        FROM projects p
        WHERE p.user_id = u.user_id AND p.is_deleted = 0
      ) AS project_count,
      (
        SELECT COUNT(*)
        FROM trophies t
        INNER JOIN projects p ON p.projects_id = t.project_id
        WHERE t.user_id = u.user_id AND p.is_deleted = 0 AND t.grade = 'gold'
      ) AS gold_trophy_count,
      (
        SELECT COUNT(*)
        FROM follows f
        WHERE f.following_id = u.user_id
      ) AS follower_count,
      (
        SELECT COUNT(*)
        FROM follows f
        WHERE f.follower_id = u.user_id
      ) AS following_count,
      (
        SELECT COUNT(*)
        FROM posts po
        WHERE po.user_id = u.user_id
          AND po.is_deleted = 0
          AND po.type IN ('public', 'secret')
          AND po.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)
      ) AS posts_week,
      (
        SELECT IFNULL(SUM(po.like_count), 0)
        FROM posts po
        WHERE po.user_id = u.user_id
          AND po.is_deleted = 0
          AND po.type IN ('public', 'secret')
      ) AS likes_received,
      (
        SELECT COUNT(*)
        FROM contribution_days cd
        WHERE cd.user_id = u.user_id
      ) AS contribution_days
    FROM users u
    LEFT JOIN coding_streaks cs ON cs.user_id = u.user_id
    WHERE u.is_deleted = 0
      AND u.is_private = 0
      AND u.github_access_token IS NOT NULL
      AND TRIM(u.github_access_token) <> ''
    ORDER BY u.updated_at DESC
    LIMIT ${CANDIDATE_LIMIT}
  `;
}

/**
 * @param {Record<string, unknown>} r
 * @param {{ tag: string; cnt: number } | undefined} topTag
 */
function buildDimensions(r, topTag) {
  const streak = Math.max(num(r.current_streak), Math.floor(num(r.max_streak) * 0.35));
  const projects = num(r.project_count);
  const gold = num(r.gold_trophy_count);
  const followers = num(r.follower_count);
  const following = num(r.following_count);
  const weekPosts = num(r.posts_week);
  const likes = num(r.likes_received);
  const contrib = num(r.contribution_days);
  const tagCnt = topTag?.cnt ?? 0;
  const tagName = topTag?.tag ?? '';

  return {
    streak: { key: 'streak', value: streak, label: streak >= 1 ? `🔥 ${streak}일 스트릭` : null },
    projects: { key: 'projects', value: projects, label: projects >= 1 ? `📁 프로젝트 ${projects}개` : null },
    gold: { key: 'gold', value: gold, label: gold >= 1 ? `🏆 금 트로피 ${gold}개` : null },
    followers: { key: 'followers', value: followers, label: followers >= 1 ? `👥 팔로워 ${followers}` : null },
    following: {
      key: 'following',
      value: following,
      label: following >= 1 ? `➡️ 팔로우 중 ${following}` : null,
    },
    week: { key: 'week', value: weekPosts, label: weekPosts >= 1 ? `✍️ 이번 주 게시 ${weekPosts}` : null },
    likes: { key: 'likes', value: likes, label: likes >= 1 ? `❤️ 받은 좋아요 ${likes}` : null },
    contrib: { key: 'contrib', value: contrib, label: contrib >= 1 ? `✅ 기여 인정 ${contrib}일` : null },
    tech: {
      key: 'tech',
      value: tagCnt,
      label: tagCnt >= 2 && tagName ? `🌵 ${tagName} 집중` : null,
    },
  };
}

function scoreRow(d) {
  const streak = d.streak.value;
  const projects = d.projects.value;
  const gold = d.gold.value;
  const followers = d.followers.value;
  const weekPosts = d.week.value;
  const likes = d.likes.value;
  const contrib = d.contrib.value;
  const tech = d.tech.value;
  return (
    streak * 2.6 +
    projects * 6.2 +
    gold * 11 +
    Math.log2(1 + followers) * 14 +
    Math.log2(1 + d.following.value) * 2.2 +
    weekPosts * 4.5 +
    Math.log2(1 + likes) * 3.4 +
    contrib * 0.42 +
    tech * 3.1
  );
}

const HIGHLIGHT_PRIORITY = [
  'streak',
  'contrib',
  'projects',
  'likes',
  'week',
  'followers',
  'gold',
  'tech',
  'following',
];

/**
 * @param {ReturnType<typeof buildDimensions>} d
 * @param {Record<string, number>} maxByKey
 */
function pickHighlight(d, maxByKey) {
  const dims = Object.values(d).filter((x) => x && typeof x.value === 'number' && x.label);
  if (!dims.length) return { key: 'active', label: '✨ 활발한 활동' };
  let bestKey = null;
  let bestRatio = -1;
  for (const dim of dims) {
    const max = Math.max(1, maxByKey[dim.key] || 0);
    const ratio = dim.value / max;
    if (ratio > bestRatio + 1e-9) {
      bestRatio = ratio;
      bestKey = dim.key;
    } else if (Math.abs(ratio - bestRatio) <= 1e-9 && bestKey) {
      const pi = HIGHLIGHT_PRIORITY.indexOf(dim.key);
      const pb = HIGHLIGHT_PRIORITY.indexOf(bestKey);
      if (pi !== -1 && pb !== -1 && pi < pb) bestKey = dim.key;
    }
  }
  const chosen = bestKey ? d[bestKey] : null;
  if (!chosen?.label) return { key: 'active', label: '✨ 활발한 활동' };
  return { key: chosen.key, label: chosen.label };
}

/**
 * @param {number | null} viewerId
 * @param {number[]} targetIds
 */
async function fetchFollowingSet(viewerId, targetIds) {
  if (viewerId == null || !targetIds.length) return new Set();
  const rows = await prisma.follow.findMany({
    where: { follower_id: viewerId, following_id: { in: targetIds } },
    select: { following_id: true },
  });
  return new Set(rows.map((r) => r.following_id));
}

/**
 * @param {number | null} viewerId
 */
async function listTrendingDevelopers(viewerId) {
  const rawRows = await fetchCandidateRows();
  if (!rawRows.length) return { developers: [] };

  const userIds = rawRows.map((r) => num(r.user_id)).filter((id) => id > 0);
  const tagMap = await fetchTopProjectTagsByUser(userIds);

  const enriched = rawRows.map((r) => {
    const uid = num(r.user_id);
    const dims = buildDimensions(r, tagMap.get(uid));
    return { r, uid, dims, score: scoreRow(dims) };
  });

  const maxByKey = {};
  for (const { dims } of enriched) {
    for (const k of Object.keys(dims)) {
      const dim = dims[k];
      if (!dim || typeof dim.value !== 'number') continue;
      maxByKey[k] = Math.max(maxByKey[k] || 0, dim.value);
    }
  }

  enriched.sort((a, b) => b.score - a.score);
  const top = enriched.slice(0, RESULT_LIMIT);
  const ids = top.map((x) => x.uid);
  const followingSet = await fetchFollowingSet(viewerId, ids);

  const developers = top.map((row, idx) => {
    const hl = pickHighlight(row.dims, maxByKey);
    return {
      rank: idx + 1,
      user_id: row.uid,
      nickname: String(row.r.nickname || ''),
      avatar_url: row.r.avatar_url ? String(row.r.avatar_url) : null,
      current_streak: num(row.r.current_streak),
      highlight: hl.label,
      highlight_key: hl.key,
      is_following: followingSet.has(row.uid),
    };
  });

  return { developers };
}

module.exports = {
  listTrendingDevelopers,
};
