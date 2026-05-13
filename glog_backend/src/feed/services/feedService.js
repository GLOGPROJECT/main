/**
 * F01 피드 조회·작성/수정/삭제 (Prisma)
 * @see md/F01Feed.md
 */

const fs = require('fs');
const path = require('path');
const prisma = require('../../config/db');
const { UPLOAD_ROOT } = require('../middlewares/uploadMiddleware');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

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

function authorNotBlockedWhere(viewerId, blockedIds) {
  if (!viewerId || blockedIds.length === 0) return {};
  return {
    OR: [{ user_id: null }, { user_id: { notIn: blockedIds } }],
  };
}

async function buildCursorWherePopular(lastPostId) {
  if (lastPostId === undefined || lastPostId === null || lastPostId === '') {
    return {};
  }
  const id = parseInt(lastPostId, 10);
  if (Number.isNaN(id)) {
    const e = new Error('INVALID_CURSOR');
    e.code = 'INVALID_CURSOR';
    throw e;
  }
  const anchor = await prisma.post.findFirst({
    where: { post_id: id, is_deleted: false },
    select: { post_id: true, created_at: true, like_count: true },
  });
  if (!anchor) {
    const e = new Error('INVALID_CURSOR');
    e.code = 'INVALID_CURSOR';
    throw e;
  }
  const lc = Number(anchor.like_count ?? 0);
  return {
    OR: [
      { like_count: { lt: lc } },
      {
        AND: [
          { like_count: lc },
          {
            OR: [
              { created_at: { lt: anchor.created_at } },
              { AND: [{ created_at: anchor.created_at }, { post_id: { lt: anchor.post_id } }] },
            ],
          },
        ],
      },
    ],
  };
}

async function buildCursorWhere(lastPostId) {
  if (lastPostId === undefined || lastPostId === null || lastPostId === '') {
    return {};
  }
  const id = parseInt(lastPostId, 10);
  if (Number.isNaN(id)) {
    const e = new Error('INVALID_CURSOR');
    e.code = 'INVALID_CURSOR';
    throw e;
  }
  const anchor = await prisma.post.findFirst({
    where: { post_id: id, is_deleted: false },
    select: { post_id: true, created_at: true },
  });
  if (!anchor) {
    const e = new Error('INVALID_CURSOR');
    e.code = 'INVALID_CURSOR';
    throw e;
  }
  return {
    OR: [{ created_at: { lt: anchor.created_at } }, { AND: [{ created_at: anchor.created_at }, { post_id: { lt: anchor.post_id } }] }],
  };
}

function resolveAssetUrl(publicBase, imageUrl) {
  if (!imageUrl) return '';
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) return imageUrl;
  const p = imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`;
  return `${publicBase}${p}`;
}

/** 클라이언트 JSON → DB 저장용 링크 미리보기(무효 시 null) */
function normalizeLinkPreviewForDb(raw) {
  if (raw == null || raw === '') return null;
  let o = raw;
  if (typeof raw === 'string') {
    try {
      o = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== 'object') return null;
  const url = String(o.url || '')
    .replace(/\u0000/g, '')
    .trim();
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    void new URL(url);
  } catch {
    return null;
  }
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    host = '';
  }
  const image = String(o.image || '')
    .replace(/\u0000/g, '')
    .trim();
  return {
    url: url.slice(0, 2048),
    title: (String(o.title || '')
      .replace(/\u0000/g, '')
      .trim() || host || url).slice(0, 500),
    description: String(o.description || '')
      .replace(/\u0000/g, '')
      .trim()
      .slice(0, 500),
    image: image ? image.slice(0, 2048) : null,
  };
}

/** 본문 끝 마커에 링크 미리보기(JSON base64) — DB 컬럼 없이 저장 */
const GLOG_LINK_BLOCK = /(?:\r?\n)*<!--\s*GLOG_LINK:([A-Za-z0-9+/=]+)\s*-->\s*$/;

function splitContentAndLink(rawContent) {
  const full = String(rawContent ?? '');
  const m = full.match(GLOG_LINK_BLOCK);
  if (!m) return { content: full, link_preview: null };
  const content = full.slice(0, m.index).trimEnd();
  try {
    const o = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'));
    const n = normalizeLinkPreviewForDb(o);
    if (!n?.url) return { content: full, link_preview: null };
    return {
      content,
      link_preview: {
        url: n.url,
        title: n.title,
        description: n.description || '',
        image: n.image || '',
      },
    };
  } catch {
    return { content: full, link_preview: null };
  }
}

function encodeLinkFooter(linkPreview) {
  const n = normalizeLinkPreviewForDb(linkPreview);
  if (!n?.url) return '';
  const payload = JSON.stringify({
    url: n.url,
    title: n.title,
    description: n.description || '',
    image: n.image || '',
  });
  return `\n\n<!--GLOG_LINK:${Buffer.from(payload, 'utf8').toString('base64')}-->`;
}

/** 코드 펜스·이미지·링크 미리보기가 있으면 본문 맨 앞(첫 ``` 이전)에 일반 글 1자 이상 */
function validateLeadingPlainForPost(rawTrimmed, { hasImages, hasLinkPreview }) {
  const trimmed = String(rawTrimmed ?? '').trim();
  const { content: bodyWithoutLink } = splitContentAndLink(trimmed);
  const hasFence = bodyWithoutLink.includes('```');
  const rich = hasFence || hasImages || Boolean(hasLinkPreview);
  if (!rich) return;
  const i = bodyWithoutLink.indexOf('```');
  const leading = (i < 0 ? bodyWithoutLink : bodyWithoutLink.slice(0, i)).trim();
  if (!leading) {
    throw err(
      'VALIDATION_ERROR',
      '코드 블록·이미지·링크 미리보기를 사용하는 경우 본문 맨 위에 글자를 1자 이상 입력해 주세요.'
    );
  }
}

/**
 * @param {import('@prisma/client').Post & { user?: object, images?: object[], post_hashtags?: object[], likes?: object[] }} post
 */
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

  const images = (post.images || [])
    .slice()
    .sort((a, b) => a.display_order - b.display_order)
    .map((im) => ({
      image_url: resolveAssetUrl(publicBase, im.image_url),
      display_order: im.display_order,
    }));

  const hashtags = (post.post_hashtags || []).map((ph) => ({ name: ph.hashtag?.name || '' })).filter((h) => h.name);

  const { content: bodyText, link_preview } = splitContentAndLink(post.content);

  const isLiked = Boolean(viewerId && post.likes && post.likes.length > 0);

  const anonIdx =
    post.anonymous_avatar_index != null && post.anonymous_avatar_index !== undefined
      ? Number(post.anonymous_avatar_index)
      : undefined;

  return {
    post_id: post.post_id,
    content: bodyText,
    type: post.type,
    is_edited: post.is_edited,
    like_count: post.like_count,
    comment_count: post.comment_count,
    created_at: post.created_at,
    user: userDto,
    images,
    hashtags,
    link_preview,
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

async function queryPostsPage({ where, viewerId, last_post_id, limit, publicBase, sort = 'latest' }) {
  const take = limit + 1;
  const blockedIds = await getBlockedUserIds(viewerId);
  const popular = String(sort).toLowerCase() === 'popular';
  const cursorWhere = popular ? await buildCursorWherePopular(last_post_id) : await buildCursorWhere(last_post_id);

  const mergedWhere = {
    AND: [where, authorNotBlockedWhere(viewerId, blockedIds), cursorWhere],
  };

  const orderBy = popular
    ? [{ like_count: 'desc' }, { created_at: 'desc' }, { post_id: 'desc' }]
    : [{ created_at: 'desc' }, { post_id: 'desc' }];

  const rows = await prisma.post.findMany({
    where: mergedWhere,
    orderBy,
    take,
    include: postListInclude(viewerId),
  });

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && slice.length ? slice[slice.length - 1].post_id : null;

  return {
    posts: slice.map((p) => mapPost(p, viewerId, publicBase)),
    nextCursor,
  };
}

async function listPublicFeed({ last_post_id, limit: limitRaw }, viewerId, publicBase) {
  const limit = clampLimit(limitRaw);
  return queryPostsPage({
    where: { is_deleted: false, type: { in: ['public', 'anonymous'] } },
    viewerId,
    last_post_id,
    limit,
    publicBase,
  });
}

async function listAnonymousFeed({ last_post_id, limit: limitRaw, q: qRaw, sort: sortRaw }, viewerId, publicBase) {
  const limit = clampLimit(limitRaw);
  let q = qRaw != null ? String(qRaw).trim() : '';
  if (q.length > 100) q = q.slice(0, 100);
  const sort = String(sortRaw || '').toLowerCase() === 'popular' ? 'popular' : 'latest';
  return queryPostsPage({
    where: {
      is_deleted: false,
      type: 'anonymous',
      ...(q ? { content: { contains: q } } : {}),
    },
    viewerId,
    last_post_id,
    limit,
    publicBase,
    sort,
  });
}

async function listFollowingFeed({ last_post_id, limit: limitRaw }, viewerId, publicBase) {
  const limit = clampLimit(limitRaw);
  const follows = await prisma.follow.findMany({
    where: { follower_id: viewerId },
    select: { following_id: true },
  });
  const ids = follows.map((f) => f.following_id);
  const followingCount = ids.length;

  const isFirstPage =
    last_post_id === undefined || last_post_id === null || last_post_id === '';

  let followingUsers = [];
  if (followingCount > 0 && isFirstPage) {
    const rows = await prisma.user.findMany({
      where: { user_id: { in: ids }, is_deleted: false },
      orderBy: { nickname: 'asc' },
      take: 30,
      select: { user_id: true, nickname: true, avatar_url: true },
    });
    followingUsers = rows.map((u) => ({
      user_id: u.user_id,
      nickname: u.nickname,
      avatar_url: u.avatar_url || null,
    }));
  }

  if (ids.length === 0) {
    return { posts: [], nextCursor: null, following_count: 0, following_users: [] };
  }
  const page = await queryPostsPage({
    where: { is_deleted: false, type: { in: ['public', 'anonymous'] }, user_id: { in: ids } },
    viewerId,
    last_post_id,
    limit,
    publicBase,
  });
  return {
    ...page,
    following_count: followingCount,
    ...(isFirstPage ? { following_users: followingUsers } : {}),
  };
}

async function listTagFeed(tagname, { last_post_id, limit: limitRaw, sort }, viewerId, publicBase) {
  const limit = clampLimit(limitRaw);
  const name = String(tagname || '').trim().toLowerCase();
  if (!name) {
    return { posts: [], nextCursor: null, hashtag: null };
  }
  const tag = await prisma.hashtag.findFirst({
    where: { name },
    select: { hashtag_id: true, name: true, use_count: true },
  });
  if (!tag) {
    return { posts: [], nextCursor: null, hashtag: null };
  }
  const sortMode = String(sort || '').toLowerCase() === 'popular' ? 'popular' : 'latest';
  const page = await queryPostsPage({
    where: {
      is_deleted: false,
      type: { in: ['public', 'anonymous'] },
      post_hashtags: { some: { hashtag_id: tag.hashtag_id } },
    },
    viewerId,
    last_post_id,
    limit,
    publicBase,
    sort: sortMode,
  });
  return {
    ...page,
    hashtag: {
      hashtag_id: tag.hashtag_id,
      name: tag.name,
      use_count: tag.use_count,
    },
  };
}

async function listUserFeed(targetUserId, { last_post_id, limit: limitRaw, sort: sortRaw }, viewerId, publicBase) {
  const limit = clampLimit(limitRaw);
  const sort = String(sortRaw || '').toLowerCase() === 'popular' ? 'popular' : 'latest';
  const user = await prisma.user.findUnique({
    where: { user_id: targetUserId },
    select: { user_id: true, is_deleted: true, is_private: true },
  });
  if (!user || user.is_deleted) {
    const e = new Error('USER_NOT_FOUND');
    e.code = 'USER_NOT_FOUND';
    throw e;
  }
  if (user.is_private && viewerId !== user.user_id) {
    return { posts: [], nextCursor: null };
  }

  // 본인: 공개·익명·비밀 등 전부 / 타인·비로그인: 공개만(익명 글은 본인 피드에서만 노출)
  const isSelf = viewerId != null && Number(viewerId) === Number(user.user_id);
  const typeWhere = isSelf ? {} : { type: 'public' };

  return queryPostsPage({
    where: { is_deleted: false, user_id: targetUserId, ...typeWhere },
    viewerId,
    last_post_id,
    limit,
    publicBase,
    sort,
  });
}

async function toggleLikePost(userId, postId) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`SELECT post_id, like_count, is_deleted FROM posts WHERE post_id = ${postId} LIMIT 1 FOR UPDATE`;
    const row = rows[0];
    if (!row) {
      throw err('POST_NOT_FOUND', '게시글을 찾을 수 없습니다.', 404);
    }
    const del = row.is_deleted;
    if (del === true || del === 1 || del === '\x01') {
      throw err('POST_NOT_FOUND', '게시글을 찾을 수 없습니다.', 404);
    }

    let likeCount = row.like_count;
    if (typeof likeCount === 'bigint') likeCount = Number(likeCount);
    else likeCount = Number(likeCount ?? 0);

    const existing = await tx.postLike.findFirst({
      where: { user_id: userId, post_id: postId },
      select: { user_id: true },
    });

    if (existing) {
      await tx.postLike.deleteMany({ where: { user_id: userId, post_id: postId } });
      const next = Math.max(0, likeCount - 1);
      await tx.post.update({
        where: { post_id: postId },
        data: { like_count: next },
      });
      return { liked: false, likeCount: next };
    }

    await tx.postLike.create({
      data: { user_id: userId, post_id: postId },
    });
    const next = likeCount + 1;
    await tx.post.update({
      where: { post_id: postId },
      data: { like_count: next },
    });
    return { liked: true, likeCount: next };
  });
}

async function getPostById(postId, viewerId, publicBase) {
  const post = await prisma.post.findFirst({
    where: { post_id: postId },
    include: postListInclude(viewerId),
  });

  if (!post || post.is_deleted) {
    const e = new Error('POST_NOT_FOUND');
    e.code = 'POST_NOT_FOUND';
    throw e;
  }

  const blockedIds = await getBlockedUserIds(viewerId);
  if (viewerId && post.user_id != null && blockedIds.includes(post.user_id)) {
    const e = new Error('POST_NOT_FOUND');
    e.code = 'POST_NOT_FOUND';
    throw e;
  }

  const isOwner = viewerId != null && post.user_id != null && post.user_id === viewerId;
  if (post.type === 'secret' && !isOwner) {
    const e = new Error('POST_NOT_FOUND');
    e.code = 'POST_NOT_FOUND';
    throw e;
  }

  return { post: mapPost(post, viewerId, publicBase) };
}

const POST_TYPES = new Set(['public', 'anonymous', 'secret']);
const MAX_HASHTAGS = 5;
const MAX_CONTENT = 5000;

function err(code, message, httpStatus = 400) {
  const e = new Error(message);
  e.code = code;
  e.httpStatus = httpStatus;
  return e;
}

function safeUnlinkUpload(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') return;
  const m = imageUrl.match(/^\/uploads\/([^/]+)$/);
  if (!m) return;
  const root = path.resolve(UPLOAD_ROOT);
  const fp = path.resolve(path.join(root, m[1]));
  if (!fp.startsWith(root)) return;
  try {
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch {
    /* ignore */
  }
}

/** # 제거·소문자, 순서 유지 중복 제거. 고유 태그가 5개 초과면 400 */
function normalizeHashtagList(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    let s = String(item ?? '')
      .trim()
      .replace(/^#+/, '')
      .trim()
      .toLowerCase();
    if (!s) continue;
    if (s.length > 100) s = s.slice(0, 100);
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  if (out.length > MAX_HASHTAGS) {
    throw err('VALIDATION_ERROR', `해시태그는 최대 ${MAX_HASHTAGS}개까지 지정할 수 있습니다.`);
  }
  return out;
}

function validateContent(trimmed, { required }) {
  if (required && !trimmed) {
    throw err('VALIDATION_ERROR', '내용을 입력해 주세요.');
  }
  if (trimmed && trimmed.length > MAX_CONTENT) {
    throw err('VALIDATION_ERROR', `본문은 ${MAX_CONTENT}자 이하여야 합니다.`);
  }
}

function validateType(typeStr, { required }) {
  if (required && (typeStr == null || typeStr === '')) {
    throw err('VALIDATION_ERROR', '게시글 유형(type)이 필요합니다.');
  }
  if (typeStr == null || typeStr === '') return undefined;
  const t = String(typeStr).trim();
  if (!POST_TYPES.has(t)) {
    throw err('VALIDATION_ERROR', '유효하지 않은 게시글 유형입니다.');
  }
  return t;
}

async function attachHashtagsTx(tx, postId, names) {
  for (const name of names) {
    let ht = await tx.hashtag.findUnique({ where: { name } });
    if (!ht) {
      // DB에 hashtag_id AUTO_INCREMENT가 없을 때 upsert create가 P2011로 실패할 수 있음 → MAX+1
      const idRows = await tx.$queryRaw`SELECT COALESCE(MAX(hashtag_id), 0) AS m FROM hashtags FOR UPDATE`;
      const m = idRows[0]?.m ?? 0;
      const nextHid = (typeof m === 'bigint' ? Number(m) : Number(m)) + 1;
      ht = await tx.hashtag.create({
        data: { hashtag_id: nextHid, name, use_count: 1 },
      });
    } else {
      await tx.hashtag.update({
        where: { hashtag_id: ht.hashtag_id },
        data: { use_count: { increment: 1 } },
      });
    }
    await tx.postHashtag.create({
      data: { post_id: postId, hashtag_id: ht.hashtag_id },
    });
  }
}

async function decrementHashtagUseTx(tx, hashtagId) {
  const row = await tx.hashtag.findUnique({ where: { hashtag_id: hashtagId } });
  if (!row || row.use_count <= 0) return;
  await tx.hashtag.update({
    where: { hashtag_id: hashtagId },
    data: { use_count: row.use_count - 1 },
  });
}

async function removePostHashtagsAndDecrementTx(tx, postId) {
  const links = await tx.postHashtag.findMany({ where: { post_id: postId }, select: { hashtag_id: true } });
  for (const { hashtag_id } of links) {
    await decrementHashtagUseTx(tx, hashtag_id);
  }
  await tx.postHashtag.deleteMany({ where: { post_id: postId } });
}

async function insertPostImagesTx(tx, postId, files) {
  const list = Array.isArray(files) ? files : [];
  const withNames = list.filter((f) => f && f.filename);
  if (withNames.length === 0) return;

  // DB에 post_images.id AUTO_INCREMENT가 없을 때 대비 (posts.post_id 와 동일 패턴)
  const idRows = await tx.$queryRaw`SELECT COALESCE(MAX(id), 0) AS m FROM post_images FOR UPDATE`;
  let nextImageId = (typeof idRows[0]?.m === 'bigint' ? Number(idRows[0].m) : Number(idRows[0]?.m ?? 0)) + 1;

  let displayOrder = 0;
  for (const f of withNames) {
    await tx.postImage.create({
      data: {
        id: nextImageId,
        post_id: postId,
        image_url: `/uploads/${f.filename}`,
        display_order: displayOrder,
      },
    });
    nextImageId += 1;
    displayOrder += 1;
  }
}

async function loadPostMap(postId, viewerId, publicBase) {
  const post = await prisma.post.findFirst({
    where: { post_id: postId, is_deleted: false },
    include: postListInclude(viewerId),
  });
  if (!post) {
    throw err('POST_NOT_FOUND', '게시글을 찾을 수 없습니다.', 404);
  }
  return mapPost(post, viewerId, publicBase);
}

/**
 * @param {number} authorId
 * @param {{ content: string, type: string, hashtags: string[], anonymous_avatar_index?: number, link_preview?: object }} payload
 * @param {Express.Multer.File[]} files
 */
async function createPost(authorId, payload, files, publicBase) {
  const trimmed = String(payload.content ?? '').trim();
  validateContent(trimmed, { required: true });
  const type = validateType(payload.type, { required: true });
  const tagNames = normalizeHashtagList(payload.hashtags);
  const linkPreview = normalizeLinkPreviewForDb(payload.link_preview);
  const uploadedImages = Array.isArray(files) ? files.filter((f) => f && f.filename) : [];
  validateLeadingPlainForPost(trimmed, {
    hasImages: uploadedImages.length > 0,
    hasLinkPreview: Boolean(linkPreview?.url),
  });

  if (type === 'public' && tagNames.length < 1) {
    throw err('VALIDATION_ERROR', '공개 게시글은 해시태그를 1개 이상 입력해 주세요.');
  }

  let anonAvatarIdx = null;
  if (type === 'anonymous') {
    const raw = payload.anonymous_avatar_index;
    const n = typeof raw === 'number' ? raw : parseInt(raw, 10);
    anonAvatarIdx = Number.isFinite(n) && n >= 0 && n <= 9 ? n : Math.floor(Math.random() * 10);
  }

  let contentToSave = trimmed;
  if (linkPreview?.url) {
    const suffix = encodeLinkFooter(linkPreview);
    if (suffix && contentToSave.length + suffix.length > MAX_CONTENT) {
      throw err('VALIDATION_ERROR', `본문과 링크 정보 합은 ${MAX_CONTENT}자 이하여야 합니다.`);
    }
    contentToSave += suffix;
  }

  // DB에 post_id AUTO_INCREMENT가 없으면 Prisma 기본 create가 P2011로 실패함 → MAX+1 할당
  const postId = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`SELECT COALESCE(MAX(post_id), 0) AS m FROM posts FOR UPDATE`;
    const m = rows[0]?.m ?? 0;
    const nextId = (typeof m === 'bigint' ? Number(m) : Number(m)) + 1;

    const post = await tx.post.create({
      data: {
        post_id: nextId,
        user_id: authorId,
        content: contentToSave,
        type,
        anonymous_avatar_index: anonAvatarIdx,
        is_deleted: false,
        is_edited: false,
      },
    });
    await insertPostImagesTx(tx, post.post_id, files);
    await attachHashtagsTx(tx, post.post_id, tagNames);
    return post.post_id;
  });

  const postDto = await loadPostMap(postId, authorId, publicBase);
  return { post: postDto };
}

/**
 * @param {number} authorId
 * @param {{ content?: string, type?: string, hashtags?: string[] }} payload — hashtags 키가 있으면 교체
 */
async function updatePost(authorId, postId, payload, files, publicBase) {
  const existing = await prisma.post.findFirst({
    where: { post_id: postId, is_deleted: false },
    include: { images: true, post_hashtags: { select: { hashtag_id: true } } },
  });
  if (!existing) {
    throw err('POST_NOT_FOUND', '게시글을 찾을 수 없습니다.', 404);
  }
  if (existing.user_id !== authorId) {
    throw err('FORBIDDEN', '본인의 게시글만 수정할 수 있습니다.', 403);
  }

  const nextContent =
    payload.content !== undefined ? String(payload.content).trim() : undefined;
  if (nextContent !== undefined) {
    validateContent(nextContent, { required: true });
  }
  const incomingImages = Array.isArray(files) ? files.filter((f) => f && f.filename) : [];
  const finalContentTrimmed =
    nextContent !== undefined ? String(nextContent).trim() : String(existing.content ?? '').trim();
  const { link_preview: finalLink } = splitContentAndLink(finalContentTrimmed);
  validateLeadingPlainForPost(finalContentTrimmed, {
    hasImages: incomingImages.length > 0,
    hasLinkPreview: Boolean(finalLink?.url),
  });
  const nextType = validateType(payload.type, { required: false });
  const replaceTags = Object.prototype.hasOwnProperty.call(payload, 'hashtags');
  const tagNames = replaceTags ? normalizeHashtagList(payload.hashtags) : null;

  await prisma.$transaction(async (tx) => {
    const row = await tx.post.findFirst({
      where: { post_id: postId, is_deleted: false },
      include: { images: true },
    });
    if (!row || row.user_id !== authorId) {
      throw err('POST_NOT_FOUND', '게시글을 찾을 수 없습니다.', 404);
    }

    if (replaceTags) {
      await removePostHashtagsAndDecrementTx(tx, postId);
    }

    for (const im of row.images) {
      safeUnlinkUpload(im.image_url);
    }
    await tx.postImage.deleteMany({ where: { post_id: postId } });
    await insertPostImagesTx(tx, postId, files);

    await tx.post.update({
      where: { post_id: postId },
      data: {
        ...(nextContent !== undefined ? { content: nextContent } : {}),
        ...(nextType !== undefined ? { type: nextType } : {}),
        is_edited: true,
      },
    });

    if (replaceTags) {
      await attachHashtagsTx(tx, postId, tagNames);
    }
  });

  const postDto = await loadPostMap(postId, authorId, publicBase);
  return { post: postDto };
}

async function deletePost(authorId, postId) {
  const existing = await prisma.post.findFirst({
    where: { post_id: postId, is_deleted: false },
    include: {
      images: true,
      post_hashtags: { select: { hashtag_id: true } },
    },
  });
  if (!existing) {
    throw err('POST_NOT_FOUND', '게시글을 찾을 수 없습니다.', 404);
  }
  if (existing.user_id !== authorId) {
    throw err('FORBIDDEN', '본인의 게시글만 삭제할 수 있습니다.', 403);
  }

  await prisma.$transaction(async (tx) => {
    const post = await tx.post.findFirst({
      where: { post_id: postId, is_deleted: false },
      include: { images: true, post_hashtags: { select: { hashtag_id: true } } },
    });
    if (!post || post.user_id !== authorId) {
      throw err('POST_NOT_FOUND', '게시글을 찾을 수 없습니다.', 404);
    }

    for (const { hashtag_id } of post.post_hashtags) {
      await decrementHashtagUseTx(tx, hashtag_id);
    }
    await tx.postHashtag.deleteMany({ where: { post_id: postId } });
    await tx.postLike.deleteMany({ where: { post_id: postId } });

    for (const im of post.images) {
      safeUnlinkUpload(im.image_url);
    }
    await tx.postImage.deleteMany({ where: { post_id: postId } });

    await tx.comment.updateMany({
      where: { post_id: postId, is_deleted: false },
      data: { is_deleted: true, deleted_at: new Date() },
    });

    await tx.post.update({
      where: { post_id: postId },
      data: { is_deleted: true, deleted_at: new Date() },
    });
  });

  return { message: '삭제되었습니다' };
}

async function listSuggestedUsers(viewerId, limitRaw) {
  let n = parseInt(limitRaw, 10);
  if (Number.isNaN(n) || n < 1) n = 15;
  n = Math.min(n, 30);
  const blockedIds = await getBlockedUserIds(viewerId);
  const exclude = new Set(blockedIds);
  exclude.add(viewerId);
  const followingRows = await prisma.follow.findMany({
    where: { follower_id: viewerId },
    select: { following_id: true },
  });
  for (const f of followingRows) exclude.add(f.following_id);
  const notIn = [...exclude];

  const rows = await prisma.user.findMany({
    where: { is_deleted: false, user_id: { notIn } },
    orderBy: { created_at: 'desc' },
    take: n,
    select: { user_id: true, nickname: true, avatar_url: true, is_private: true },
  });
  return {
    users: rows.map((u) => ({
      user_id: u.user_id,
      nickname: u.nickname,
      avatar_url: u.avatar_url || null,
      is_private: Boolean(u.is_private),
    })),
  };
}

async function followUser(viewerId, targetId) {
  if (viewerId === targetId) {
    throw err('VALIDATION_ERROR', '자기 자신을 팔로우할 수 없습니다.');
  }
  const target = await prisma.user.findFirst({
    where: { user_id: targetId, is_deleted: false },
    select: { user_id: true },
  });
  if (!target) {
    throw err('USER_NOT_FOUND', '사용자를 찾을 수 없습니다.', 404);
  }
  try {
    await prisma.follow.create({
      data: { follower_id: viewerId, following_id: targetId },
    });
  } catch (e) {
    if (e.code === 'P2002') return { following: true };
    throw e;
  }
  return { following: true };
}

async function unfollowUser(viewerId, targetId) {
  await prisma.follow.deleteMany({
    where: { follower_id: viewerId, following_id: targetId },
  });
  return { following: false };
}

const SEOUL_TZ = 'Asia/Seoul';
const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

function seoulYmdOf(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SEOUL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function seoulWeekdayShort(d) {
  return new Intl.DateTimeFormat('en-US', { timeZone: SEOUL_TZ, weekday: 'short' }).format(d);
}

function mondayYmdSeoulWeekContaining(ref = new Date()) {
  let cur = new Date(ref.getTime());
  for (let i = 0; i < 14; i += 1) {
    if (seoulWeekdayShort(cur) === 'Mon') return seoulYmdOf(cur);
    cur = new Date(cur.getTime() - 86400000);
  }
  return seoulYmdOf(ref);
}

function addCalendarDaysSeoulYmd(ymd, n) {
  const base = new Date(`${ymd}T12:00:00+09:00`);
  return seoulYmdOf(new Date(base.getTime() + n * 86400000));
}

/** 서울 기준 월요일 시작 주간, 로그인 유저 게시글(삭제 제외) 일별 건수 */
async function getWeeklyActivity(userId) {
  const mondayYmd = mondayYmdSeoulWeekContaining(new Date());
  const dayYmds = [];
  for (let i = 0; i < 7; i += 1) dayYmds.push(addCalendarDaysSeoulYmd(mondayYmd, i));
  const startUtc = new Date(`${mondayYmd}T00:00:00+09:00`);
  const nextMondayYmd = addCalendarDaysSeoulYmd(mondayYmd, 7);
  const endUtc = new Date(`${nextMondayYmd}T00:00:00+09:00`);
  const todayYmd = seoulYmdOf(new Date());

  const rows = await prisma.post.findMany({
    where: {
      user_id: userId,
      is_deleted: false,
      created_at: { gte: startUtc, lt: endUtc },
    },
    select: { created_at: true },
  });

  const counts = Object.fromEntries(dayYmds.map((k) => [k, 0]));
  for (const r of rows) {
    const k = seoulYmdOf(r.created_at);
    if (Object.prototype.hasOwnProperty.call(counts, k)) counts[k] += 1;
  }

  const maxCount = Math.max(1, ...dayYmds.map((k) => counts[k]));

  return {
    weekKey: mondayYmd,
    days: dayYmds.map((ymd, i) => ({
      ymd,
      label: DAY_LABELS[i],
      count: counts[ymd],
      isToday: ymd === todayYmd,
    })),
    maxCount,
  };
}

async function listFollowingMembers(viewerId) {
  const follows = await prisma.follow.findMany({
    where: { follower_id: viewerId },
    select: { following_id: true },
  });
  const ids = follows.map((f) => f.following_id);
  if (ids.length === 0) {
    return { users: [] };
  }
  const rows = await prisma.user.findMany({
    where: { user_id: { in: ids }, is_deleted: false },
    orderBy: { nickname: 'asc' },
    take: 200,
    select: { user_id: true, nickname: true, avatar_url: true },
  });
  return {
    users: rows.map((u) => ({
      user_id: u.user_id,
      nickname: u.nickname,
      avatar_url: u.avatar_url || null,
    })),
  };
}

module.exports = {
  listPublicFeed,
  listAnonymousFeed,
  listFollowingFeed,
  listTagFeed,
  listUserFeed,
  getPostById,
  toggleLikePost,
  createPost,
  updatePost,
  deletePost,
  listSuggestedUsers,
  followUser,
  unfollowUser,
  listFollowingMembers,
  getWeeklyActivity,
};
