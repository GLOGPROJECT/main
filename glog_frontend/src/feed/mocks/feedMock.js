/** 피드 UI용 목 데이터 (API·DB 없음) — 백엔드 연동 전환 단계: 기본 시드 제거 */
export const MOCK_POSTS = [];
export const MOCK_COMMENTS_BY_POST = {};

const SS_COMMENTS_PREFIX = 'glog:comments:';
const SS_DELETED_POSTS = 'glog:deleted-post-ids';

export function readDeletedPostIds() {
  try {
    const raw = sessionStorage.getItem(SS_DELETED_POSTS);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

export function addDeletedPostId(postId) {
  const id = String(postId);
  const next = [...new Set([...readDeletedPostIds(), id])];
  try {
    sessionStorage.setItem(SS_DELETED_POSTS, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function buildDefaultCommentList(postId) {
  const seed = (MOCK_COMMENTS_BY_POST[postId] ?? []).map((c, idx) => ({
    ...c,
    createdAt: c.createdAt ?? `2026-04-${String(10 + idx).padStart(2, '0')} 09:30`,
  }));
  return [...seed];
}

function stripLegacyMockComments(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((c) => {
    if (!c) return false;
    if (String(c.id).startsWith('s-')) return false;
    if (String(c.body || '').includes('목 무한스크롤 댓글')) return false;
    if (['reader1', 'dev_bot', 'guest_user'].includes(c.author)) return false;
    return true;
  });
}

/**
 * 전체 피드 무한스크롤 id(mock-all-n) → 목 댓글/세션 기준 원글 id
 * (mockInfiniteFeed.js 의 buildExtendedAllList 와 동일한 원형 규칙)
 */
export function getCommentThreadPostId(postId) {
  const m = /^mock-all-(\d+)$/.exec(String(postId));
  if (!m) return String(postId);
  const i = parseInt(m[1], 10);
  if (MOCK_POSTS.length === 0) return String(postId);
  if (!Number.isFinite(i) || i < 0) return String(postId);
  return String(MOCK_POSTS[i % MOCK_POSTS.length].id);
}

/** 목 전체 피드에서만 쓰는 합성 id → 카드와 동일한 글 객체 */
function resolveSyntheticAllFeedPost(id) {
  const m = /^mock-all-(\d+)$/.exec(String(id));
  if (!m) return null;
  const i = parseInt(m[1], 10);
  if (MOCK_POSTS.length === 0) return null;
  if (!Number.isFinite(i) || i < 0) return null;
  const base = MOCK_POSTS[i % MOCK_POSTS.length];
  return {
    ...base,
    id,
    likes: (base.likes || 0) + (i % 9),
    commentsCount: (base.commentsCount || 0) + (i % 4),
    body: `${base.body}\n(목 무한스크롤 #${i + 1})`,
  };
}

export function getCommentListForPost(postId) {
  const threadId = getCommentThreadPostId(postId);
  const key = SS_COMMENTS_PREFIX + threadId;
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return stripLegacyMockComments(arr);
    }
  } catch {
    /* ignore */
  }
  return buildDefaultCommentList(threadId);
}

export function setCommentListForPost(postId, list) {
  const threadId = getCommentThreadPostId(postId);
  try {
    sessionStorage.setItem(SS_COMMENTS_PREFIX + threadId, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function mutateCommentListForPost(postId, fn) {
  const prev = [...getCommentListForPost(postId)];
  const next = fn(prev);
  setCommentListForPost(postId, next);
  return next;
}

export const MOCK_RECOMMENDED_USERS = [
  { id: 'u1', handle: 'orbit_dev', blurb: '98 day streak' },
  { id: 'u2', handle: 'stack_sarah', blurb: '12 projects' },
  { id: 'u3', handle: 'mono_min', blurb: 'Full stack' },
];

export const MOCK_TRENDING_DEVS = [
  { id: 't1', handle: 'kim_dev', blurb: '111 day streak' },
  { id: 't2', handle: 'dev_chris', blurb: '7 projects' },
  { id: 't3', handle: 'junocode', blurb: 'Lv. 8' },
];

export const MOCK_POPULAR_TAGS = [
  { tag: 'React', count: '1.2k' },
  { tag: 'TypeScript', count: '982' },
  { tag: 'Next.js', count: '843' },
  { tag: 'Docker', count: '410' },
  { tag: '알고리즘', count: '320' },
];

function parseMockCountToNumber(count) {
  if (typeof count === 'number') return count;
  const s = String(count).trim().toLowerCase();
  const m = s.match(/^([\d.]+)\s*k$/);
  if (m) return Math.round(parseFloat(m[1]) * 1000);
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

/** 인기 태그 + 목 게시글에 등장한 태그 합쳐 posts 내림차순 (자동완성 목) */
let mockTagCatalogSorted = null;
function getMockTagCatalogSorted() {
  if (mockTagCatalogSorted) return mockTagCatalogSorted;
  const map = new Map();
  for (const row of MOCK_POPULAR_TAGS) {
    const k = row.tag.toLowerCase();
    map.set(k, { tag: row.tag, posts: parseMockCountToNumber(row.count) });
  }
  for (const p of MOCK_POSTS) {
    for (const t of p.tags || []) {
      const k = t.toLowerCase();
      if (!map.has(k)) map.set(k, { tag: t, posts: 1 });
    }
  }
  mockTagCatalogSorted = [...map.values()].sort((a, b) => b.posts - a.posts);
  return mockTagCatalogSorted;
}

/** 연동 시: GET /hashtags/autocomplete?q= … 상위 5개 */
export function getMockHashtagSuggestions(query) {
  const q = String(query || '').replace(/^#+/, '').trim().toLowerCase();
  const catalog = getMockTagCatalogSorted();
  if (!q) return catalog.slice(0, 5);
  return catalog.filter((x) => x.tag.toLowerCase().includes(q)).slice(0, 5);
}

/** 태그 피드 헤더 pill — 인기 목 숫자 우선, 없으면 목 게시글 개수 */
export function getMockTagPostCountDisplay(slug) {
  if (!slug) return '—';
  const key = slug.replace(/^#/, '').toLowerCase();
  const row = MOCK_POPULAR_TAGS.find((x) => x.tag.toLowerCase() === key);
  if (row) return `${row.count} posts`;
  const n = filterPostsByTagSlug(MOCK_POSTS, slug).length;
  return `${n} posts`;
}

export function getPostById(postId) {
  const id = String(postId);
  if (readDeletedPostIds().includes(id)) return null;
  try {
    const raw = sessionStorage.getItem(`glog:post:${id}`);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  const fromMock = MOCK_POSTS.find((p) => String(p.id) === id);
  if (fromMock) return fromMock;
  return resolveSyntheticAllFeedPost(id);
}

export function getCommentsForPost(postId) {
  return getCommentListForPost(postId);
}

export function filterPostsByTagSlug(posts, slug) {
  if (!slug) return posts;
  const key = slug.replace(/^#/, '').toLowerCase();
  return posts.filter((p) =>
    p.tags.some((t) => t.toLowerCase().replace(/\s/g, '') === key || t.toLowerCase() === key)
  );
}
