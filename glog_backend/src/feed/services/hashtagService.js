/**
 * F01 해시태그 — 자동완성·인기 목록
 * @see md/F01Feed.md
 */

const prisma = require('../../config/db');

const AUTOCOMPLETE_LIMIT = 5;
const POPULAR_LIMIT = 10;
const POPULAR_MAX = 200;

/** 게시글 저장 시와 동일 규칙으로 검색어 정규화 */
function normalizeHashtagQuery(raw) {
  let s = String(raw ?? '')
    .trim()
    .replace(/^#+/, '')
    .trim()
    .toLowerCase();
  if (!s) return '';
  if (s.length > 100) s = s.slice(0, 100);
  return s;
}

function mapRow(r) {
  return {
    hashtag_id: r.hashtag_id,
    name: r.name,
    use_count: r.use_count,
  };
}

/** GET /hashtags/autocomplete */
async function autocomplete(qRaw) {
  const prefix = normalizeHashtagQuery(qRaw);
  if (!prefix) return [];

  const rows = await prisma.hashtag.findMany({
    where: { name: { contains: prefix } },
    orderBy: { use_count: 'desc' },
    take: AUTOCOMPLETE_LIMIT,
    select: { hashtag_id: true, name: true, use_count: true },
  });
  return rows.map(mapRow);
}

/**
 * GET /hashtags/popular
 * @param {unknown} [limitRaw] — 쿼리 limit (1~POPULAR_MAX), 없으면 기본 10
 */
async function popular(limitRaw) {
  let take = POPULAR_LIMIT;
  if (limitRaw !== undefined && limitRaw !== null && limitRaw !== '') {
    const n = parseInt(String(limitRaw), 10);
    if (Number.isFinite(n) && n >= 1) take = Math.min(POPULAR_MAX, n);
  }
  const rows = await prisma.hashtag.findMany({
    where: { use_count: { gt: 0 } },
    orderBy: { use_count: 'desc' },
    take,
    select: { hashtag_id: true, name: true, use_count: true },
  });
  return rows.map(mapRow);
}

module.exports = {
  normalizeHashtagQuery,
  autocomplete,
  popular,
};
