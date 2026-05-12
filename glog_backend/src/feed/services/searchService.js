/**
 * F01 통합 검색
 * @see md/F01Feed.md
 */

const { Prisma } = require('@prisma/client');
const prisma = require('../../config/db');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function err(code, message, httpStatus = 400) {
  const e = new Error(message);
  e.code = code;
  e.httpStatus = httpStatus;
  return e;
}

function clampLimit(raw) {
  let n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) n = DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

async function getBlockedUserIds(viewerId) {
  if (!viewerId) return [];
  const rows = await prisma.block.findMany({
    where: { OR: [{ blocker_id: viewerId }, { blocked_id: viewerId }] },
    select: { blocker_id: true, blocked_id: true },
  });
  const ids = new Set();
  for (const r of rows) {
    if (r.blocker_id === viewerId) ids.add(r.blocked_id);
    if (r.blocked_id === viewerId) ids.add(r.blocker_id);
  }
  return [...ids];
}

function normalizeSearchQ(raw) {
  const q = String(raw ?? '').trim();
  if (!q) throw err('VALIDATION_ERROR', '검색어를 입력해 주세요.');
  if (q.length < 1 || q.length > 100) throw err('VALIDATION_ERROR', '검색어는 1자 이상 100자 이하여야 합니다.');
  return q;
}

function mapUserSearchRow(u) {
  if (u.is_private) {
    return {
      user_id: u.user_id,
      nickname: u.nickname,
      avatar_url: u.avatar_url || null,
      is_private: true,
    };
  }
  return {
    user_id: u.user_id,
    nickname: u.nickname,
    avatar_url: u.avatar_url || null,
    is_private: false,
  };
}

async function buildUserCursorWhere(lastUserId) {
  if (lastUserId === undefined || lastUserId === null || lastUserId === '') return {};
  const id = parseInt(lastUserId, 10);
  if (Number.isNaN(id)) {
    throw err('INVALID_CURSOR', '유효하지 않은 커서입니다.');
  }
  const anchor = await prisma.user.findFirst({
    where: { user_id: id, is_deleted: false },
    select: { user_id: true, created_at: true },
  });
  if (!anchor) throw err('INVALID_CURSOR', '유효하지 않은 커서입니다.');
  return {
    OR: [{ created_at: { lt: anchor.created_at } }, { AND: [{ created_at: anchor.created_at }, { user_id: { lt: anchor.user_id } }] }],
  };
}

async function searchUsers(qRaw, { cursor, limit: limitRaw }, viewerId) {
  const q = normalizeSearchQ(qRaw);
  const limit = clampLimit(limitRaw);
  const blockedIds = await getBlockedUserIds(viewerId);
  const exclude = new Set(blockedIds);
  if (viewerId) exclude.add(viewerId);
  const notIn = [...exclude];

  const cursorWhere = await buildUserCursorWhere(cursor);

  const rows = await prisma.user.findMany({
    where: {
      is_deleted: false,
      ...(notIn.length ? { user_id: { notIn } } : {}),
      nickname: { contains: q },
      ...(Object.keys(cursorWhere).length ? cursorWhere : {}),
    },
    orderBy: [{ created_at: 'desc' }, { user_id: 'desc' }],
    take: limit + 1,
    select: {
      user_id: true,
      nickname: true,
      avatar_url: true,
      is_private: true,
      created_at: true,
    },
  });

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && slice.length ? String(slice[slice.length - 1].user_id) : null;

  return { users: slice.map(mapUserSearchRow), nextCursor };
}

async function buildPostCursorWhere(lastPostId) {
  if (lastPostId === undefined || lastPostId === null || lastPostId === '') return {};
  const id = parseInt(lastPostId, 10);
  if (Number.isNaN(id)) throw err('INVALID_CURSOR', '유효하지 않은 커서입니다.');
  const anchor = await prisma.post.findFirst({
    where: { post_id: id, is_deleted: false },
    select: { post_id: true, created_at: true },
  });
  if (!anchor) throw err('INVALID_CURSOR', '유효하지 않은 커서입니다.');
  return {
    OR: [{ created_at: { lt: anchor.created_at } }, { AND: [{ created_at: anchor.created_at }, { post_id: { lt: anchor.post_id } }] }],
  };
}

function booleanModeQuery(q) {
  const parts = String(q)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .map((w) => w.replace(/[^\w\uAC00-\uD7A3\u3040-\u30FF\u4E00-\u9FFF-]/g, ''))
    .filter((w) => w.length > 0);
  if (parts.length === 0) return null;
  return parts.map((p) => `+${p}*`).join(' ');
}

function mapPost(post, viewerId, publicBase) {
  const isOwner = viewerId != null && post.user_id != null && post.user_id === viewerId;
  const hideAuthor = post.type === 'anonymous' && !isOwner;
  const rawUser = post.user;
  let userDto;
  if (hideAuthor || !rawUser) {
    userDto = { user_id: 0, nickname: '익명', avatar_url: null };
  } else {
    userDto = {
      user_id: rawUser.user_id,
      nickname: rawUser.nickname,
      avatar_url: rawUser.avatar_url || null,
    };
  }
  const resolveAssetUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    const p = url.startsWith('/') ? url : `/${url}`;
    return `${publicBase}${p}`;
  };
  const images = (post.images || [])
    .slice()
    .sort((a, b) => a.display_order - b.display_order)
    .map((im) => ({
      image_url: resolveAssetUrl(im.image_url),
      display_order: im.display_order,
    }));
  const hashtags = (post.post_hashtags || []).map((ph) => ({ name: ph.hashtag?.name || '' })).filter((h) => h.name);
  const isLiked = Boolean(viewerId && post.likes && post.likes.length > 0);
  const anonIdx =
    post.anonymous_avatar_index != null && post.anonymous_avatar_index !== undefined
      ? Number(post.anonymous_avatar_index)
      : undefined;
  return {
    post_id: post.post_id,
    content: post.content,
    type: post.type,
    is_edited: post.is_edited,
    like_count: post.like_count,
    comment_count: post.comment_count,
    created_at: post.created_at,
    user: userDto,
    images,
    hashtags,
    isLiked,
    anonymousAvatarIndex: Number.isFinite(anonIdx) && anonIdx >= 0 && anonIdx < 10 ? anonIdx : undefined,
    isOwner,
  };
}

const postListInclude = (viewerId) => ({
  user: { select: { user_id: true, nickname: true, avatar_url: true } },
  images: { orderBy: { display_order: 'asc' } },
  post_hashtags: { include: { hashtag: { select: { name: true } } } },
  ...(viewerId
    ? {
        likes: {
          where: { user_id: viewerId },
          take: 1,
          select: { user_id: true },
        },
      }
    : {}),
});

async function searchPostsLike(q, cursor, limit, viewerId, publicBase) {
  const blockedIds = await getBlockedUserIds(viewerId);
  const cursorWhere = await buildPostCursorWhere(cursor);

  const andParts = [];
  if (viewerId && blockedIds.length) {
    andParts.push({ OR: [{ user_id: null }, { user_id: { notIn: blockedIds } }] });
  }
  if (Object.keys(cursorWhere).length) {
    andParts.push(cursorWhere);
  }
  andParts.push({
    OR: [
      { content: { contains: q } },
      { post_hashtags: { some: { hashtag: { name: { contains: q } } } } },
    ],
  });

  const rows = await prisma.post.findMany({
    where: {
      is_deleted: false,
      type: 'public',
      AND: andParts,
    },
    orderBy: [{ created_at: 'desc' }, { post_id: 'desc' }],
    take: limit + 1,
    include: postListInclude(viewerId),
  });

  const withTagBoost = rows.map((p) => {
    const tagHit = (p.post_hashtags || []).some((ph) =>
      String(ph.hashtag?.name || '')
        .toLowerCase()
        .includes(q.toLowerCase())
    );
    return { p, tagHit };
  });
  withTagBoost.sort((a, b) => {
    if (b.tagHit !== a.tagHit) return (b.tagHit ? 1 : 0) - (a.tagHit ? 1 : 0);
    const ca = new Date(a.p.created_at).getTime();
    const cb = new Date(b.p.created_at).getTime();
    if (cb !== ca) return cb - ca;
    return b.p.post_id - a.p.post_id;
  });

  const sortedPosts = withTagBoost.map((x) => x.p);
  const hasMore = sortedPosts.length > limit;
  const slice = hasMore ? sortedPosts.slice(0, limit) : sortedPosts;
  const nextCursor = hasMore && slice.length ? String(slice[slice.length - 1].post_id) : null;

  return {
    posts: slice.map((p) => mapPost(p, viewerId, publicBase)),
    nextCursor,
    usedFallback: true,
  };
}

/** 본문·태그명 부분일치, 작성일 최신순만 (인기/관련도 정렬 없음) */
async function searchPostsLatestOnly(q, cursor, limit, viewerId, publicBase) {
  const blockedIds = await getBlockedUserIds(viewerId);
  const cursorWhere = await buildPostCursorWhere(cursor);

  const andParts = [];
  if (viewerId && blockedIds.length) {
    andParts.push({ OR: [{ user_id: null }, { user_id: { notIn: blockedIds } }] });
  }
  if (Object.keys(cursorWhere).length) {
    andParts.push(cursorWhere);
  }
  andParts.push({
    OR: [
      { content: { contains: q } },
      { post_hashtags: { some: { hashtag: { name: { contains: q } } } } },
    ],
  });

  const rows = await prisma.post.findMany({
    where: {
      is_deleted: false,
      type: 'public',
      AND: andParts,
    },
    orderBy: [{ created_at: 'desc' }, { post_id: 'desc' }],
    take: limit + 1,
    include: postListInclude(viewerId),
  });

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && slice.length ? String(slice[slice.length - 1].post_id) : null;

  return {
    posts: slice.map((p) => mapPost(p, viewerId, publicBase)),
    nextCursor,
    usedFallback: true,
  };
}

async function searchPostsFulltext(q, cursor, limit, viewerId, publicBase) {
  const bool = booleanModeQuery(q);
  if (!bool) return null;

  const blockedIds = await getBlockedUserIds(viewerId);
  let cursorParams = [];
  if (cursor !== undefined && cursor !== null && cursor !== '') {
    const id = parseInt(cursor, 10);
    if (Number.isNaN(id)) throw err('INVALID_CURSOR', '유효하지 않은 커서입니다.');
    const anchor = await prisma.post.findFirst({
      where: { post_id: id, is_deleted: false },
      select: { post_id: true, created_at: true },
    });
    if (!anchor) throw err('INVALID_CURSOR', '유효하지 않은 커서입니다.');
    cursorParams = [anchor.created_at, anchor.post_id];
  }

  const blockedSql =
    viewerId && blockedIds.length
      ? Prisma.sql`AND (p.user_id IS NULL OR p.user_id NOT IN (${Prisma.join(blockedIds)}))`
      : Prisma.empty;

  const cursorSql =
    cursorParams.length === 2
      ? Prisma.sql`AND (p.created_at < ${cursorParams[0]} OR (p.created_at = ${cursorParams[0]} AND p.post_id < ${cursorParams[1]}))`
      : Prisma.empty;

  const sql = Prisma.sql`
    SELECT p.post_id
    FROM posts p
    WHERE p.is_deleted = 0
      AND p.type = 'public'
      AND MATCH(p.content) AGAINST (${bool} IN BOOLEAN MODE)
      ${blockedSql}
      ${cursorSql}
    ORDER BY MATCH(p.content) AGAINST (${bool} IN BOOLEAN MODE) DESC, p.created_at DESC, p.post_id DESC
    LIMIT ${limit + 1}
  `;

  let idRows;
  try {
    idRows = await prisma.$queryRaw(sql);
  } catch {
    return null;
  }

  const ids = idRows.map((r) => Number(r.post_id)).filter((n) => Number.isFinite(n));
  if (ids.length === 0) {
    return { posts: [], nextCursor: null, usedFallback: false };
  }

  const posts = await prisma.post.findMany({
    where: { post_id: { in: ids } },
    include: postListInclude(viewerId),
  });
  const order = new Map(ids.map((id, i) => [id, i]));
  posts.sort((a, b) => (order.get(a.post_id) ?? 0) - (order.get(b.post_id) ?? 0));

  const hasMore = posts.length > limit;
  const slice = hasMore ? posts.slice(0, limit) : posts;
  const nextCursor = hasMore && slice.length ? String(slice[slice.length - 1].post_id) : null;

  return {
    posts: slice.map((p) => mapPost(p, viewerId, publicBase)),
    nextCursor,
    usedFallback: false,
  };
}

async function searchPosts(qRaw, { cursor, limit: limitRaw, sort }, viewerId, publicBase) {
  const q = normalizeSearchQ(qRaw);
  const limit = clampLimit(limitRaw);
  const sortLatest = String(sort || '').toLowerCase() === 'latest';

  if (sortLatest) {
    return searchPostsLatestOnly(q, cursor, limit, viewerId, publicBase);
  }

  let result = await searchPostsFulltext(q, cursor, limit, viewerId, publicBase);
  if (result === null) {
    result = await searchPostsLike(q, cursor, limit, viewerId, publicBase);
  }

  return result;
}

async function search(qRaw, typeRaw, query, viewerId, publicBase) {
  const type = String(typeRaw || '').toLowerCase();
  if (type !== 'user' && type !== 'post') {
    throw err('VALIDATION_ERROR', 'type은 user 또는 post 여야 합니다.');
  }
  const cursor = query.cursor ?? (type === 'post' ? query.last_post_id : query.last_user_id);

  if (type === 'user') {
    return searchUsers(qRaw, { cursor, limit: query.limit }, viewerId);
  }
  return searchPosts(qRaw, { cursor, limit: query.limit, sort: query.sort }, viewerId, publicBase);
}

async function autocompleteUsers(q, viewerId, take) {
  const blockedIds = await getBlockedUserIds(viewerId);
  const notIn = [...new Set(blockedIds)];

  const rows = await prisma.user.findMany({
    where: {
      is_deleted: false,
      ...(notIn.length ? { user_id: { notIn } } : {}),
      nickname: { contains: q },
    },
    orderBy: { created_at: 'desc' },
    take,
    select: { user_id: true, nickname: true, avatar_url: true },
  });
  return rows.map((u) => ({
    user_id: u.user_id,
    nickname: u.nickname,
    avatar_url: u.avatar_url || null,
  }));
}

async function autocompleteSuggestions(q, viewerId) {
  const blockedIds = await getBlockedUserIds(viewerId);

  const andParts = [
    {
      OR: [
        { content: { contains: q } },
        { post_hashtags: { some: { hashtag: { name: { contains: q } } } } },
      ],
    },
  ];
  if (viewerId && blockedIds.length) {
    andParts.unshift({ OR: [{ user_id: null }, { user_id: { notIn: blockedIds } }] });
  }

  const tagRows = await prisma.hashtag.findMany({
    where: { name: { contains: q } },
    orderBy: { use_count: 'desc' },
    take: 2,
    select: { hashtag_id: true, name: true, use_count: true },
  });

  const postRows = await prisma.post.findMany({
    where: {
      is_deleted: false,
      type: 'public',
      AND: andParts,
    },
    orderBy: [{ created_at: 'desc' }, { post_id: 'desc' }],
    take: 2,
    select: {
      post_id: true,
      content: true,
      user: { select: { nickname: true } },
    },
  });

  const suggestions = [];
  for (const t of tagRows) {
    suggestions.push({ type: 'hashtag', hashtag_id: t.hashtag_id, name: t.name, use_count: t.use_count });
  }
  for (const p of postRows) {
    const snippet = String(p.content || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
    suggestions.push({
      type: 'post',
      post_id: p.post_id,
      snippet,
      author_nickname: p.user?.nickname || null,
    });
  }
  return suggestions.slice(0, 3);
}

async function autocomplete(qRaw, viewerId) {
  const trimmed = String(qRaw ?? '').trim();
  if (!trimmed) {
    return { users: [], suggestions: [] };
  }
  if (trimmed.length > 100) throw err('VALIDATION_ERROR', '검색어는 100자 이하여야 합니다.');

  const users = await autocompleteUsers(trimmed, viewerId, 2);
  const suggestions = await autocompleteSuggestions(trimmed, viewerId);
  return { users, suggestions };
}

module.exports = {
  search,
  autocomplete,
};
