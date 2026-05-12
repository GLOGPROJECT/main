import { MOCK_POSTS, filterPostsByTagSlug } from './feedMock';
import { isAnonymousPost } from '../utils/anonAvatar';

const PAGE_SIZE = 10;

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function dedupeById(prepend, rest) {
  const seen = new Set(prepend.map((p) => String(p.id)));
  const out = [...prepend];
  for (const p of rest) {
    const id = String(p.id);
    if (!seen.has(id)) {
      seen.add(id);
      out.push(p);
    }
  }
  return out;
}

/** 전체 피드 목업: 스크롤 데모용 길이 확장 */
function buildExtendedAllList(sortOrder) {
  if (MOCK_POSTS.length === 0) return [];
  const rows = [];
  for (let i = 0; i < 42; i += 1) {
    const base = MOCK_POSTS[i % MOCK_POSTS.length];
    rows.push({
      ...base,
      id: `mock-all-${i}`,
      likes: (base.likes || 0) + (i % 9),
      commentsCount: (base.commentsCount || 0) + (i % 4),
      body: `${base.body}\n(목 무한스크롤 #${i + 1})`,
    });
  }
  if (sortOrder === 'popular') {
    return [...rows].sort((a, b) => (b.likes || 0) - (a.likes || 0));
  }
  return rows;
}

function buildSourceList(feedType, tagSlug, sortOrder) {
  if (feedType === 'following') return [];
  if (feedType === 'anonymous') {
    let rows = MOCK_POSTS.filter(isAnonymousPost);
    if (sortOrder === 'popular') {
      rows = [...rows].sort((a, b) => (b.likes || 0) - (a.likes || 0));
    }
    return rows;
  }
  if (feedType === 'tag') {
    let rows = filterPostsByTagSlug(MOCK_POSTS, tagSlug || '');
    if (sortOrder === 'popular') {
      rows = [...rows].sort((a, b) => (b.likes || 0) - (a.likes || 0));
    }
    return rows;
  }
  return buildExtendedAllList(sortOrder);
}

/**
 * 백엔드 대체 목 fetch (cursor = 이전 페이지 마지막 post id)
 * 연동 시: GET /feed?cursor=&limit=&sort= /feed/following /tag/:slug 등으로 교체
 */
export async function fetchMockFeedPage({
  feedType,
  cursor,
  sortOrder,
  tagSlug,
  limit = PAGE_SIZE,
  prependPosts = [],
}) {
  await delay(320);
  const base = buildSourceList(feedType, tagSlug, sortOrder);
  const merged = dedupeById(prependPosts, base);

  let start = 0;
  if (cursor != null && cursor !== '') {
    const idx = merged.findIndex((p) => String(p.id) === String(cursor));
    start = idx >= 0 ? idx + 1 : merged.length;
  }

  const items = merged.slice(start, start + limit);
  const hasMore = start + items.length < merged.length;
  const nextCursor = hasMore && items.length ? String(items[items.length - 1].id) : null;

  return { items, nextCursor };
}
