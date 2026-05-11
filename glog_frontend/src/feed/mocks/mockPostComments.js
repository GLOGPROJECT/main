import { getCommentListForPost } from './feedMock';

const PAGE = 10;

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sliceByCursor(all, cursor, limit) {
  let start = 0;
  if (cursor != null && cursor !== '') {
    const idx = all.findIndex((c) => String(c.id) === String(cursor));
    start = idx >= 0 ? idx + 1 : all.length;
  }
  const items = all.slice(start, start + limit);
  const hasMore = start + items.length < all.length;
  const nextCursor = hasMore && items.length ? String(items[items.length - 1].id) : null;
  return { items, nextCursor };
}

/** 연동 시: GET /feed/:postId/comments?cursor=&limit=20 */
export async function fetchMockPostCommentsPage({ postId, cursor, limit = PAGE }) {
  await delay(240);
  const all = getCommentListForPost(postId);
  return sliceByCursor(all, cursor, limit);
}
