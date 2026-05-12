/**
 * F01 댓글 — 목록·작성·소프트 삭제
 * @see md/F01Feed.md
 */

const prisma = require('../../config/db');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function err(code, message, httpStatus = 400) {
  const e = new Error(message);
  e.code = code;
  e.httpStatus = httpStatus;
  return e;
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

async function assertPostReadableForComments(postId, viewerId) {
  const post = await prisma.post.findFirst({
    where: { post_id: postId },
    select: { post_id: true, user_id: true, type: true, is_deleted: true },
  });
  if (!post || post.is_deleted) {
    throw err('POST_NOT_FOUND', '게시글을 찾을 수 없습니다.', 404);
  }
  const blockedIds = await getBlockedUserIds(viewerId);
  if (viewerId && post.user_id != null && blockedIds.includes(post.user_id)) {
    throw err('POST_NOT_FOUND', '게시글을 찾을 수 없습니다.', 404);
  }
  const isOwner = viewerId != null && post.user_id != null && post.user_id === viewerId;
  if (post.type === 'secret' && !isOwner) {
    throw err('POST_NOT_FOUND', '게시글을 찾을 수 없습니다.', 404);
  }
  return post;
}

function mapCommentRow(row) {
  if (!row) return null;
  if (row.is_deleted) {
    return {
      id: row.id,
      content: '삭제된 댓글입니다',
      is_deleted: true,
      created_at: row.created_at,
      user: null,
    };
  }
  const u = row.user;
  return {
    id: row.id,
    content: row.content,
    is_deleted: false,
    created_at: row.created_at,
    user: u
      ? { user_id: u.user_id, nickname: u.nickname, avatar_url: u.avatar_url || null }
      : { user_id: 0, nickname: '알 수 없음', avatar_url: null },
  };
}

async function listCommentsForPost(postId, viewerId, { last_comment_id, limit: limitRaw }) {
  await assertPostReadableForComments(postId, viewerId);

  let limit = parseInt(limitRaw, 10);
  if (Number.isNaN(limit) || limit < 1) limit = DEFAULT_LIMIT;
  limit = Math.min(limit, MAX_LIMIT);

  const rawCursor = last_comment_id != null && last_comment_id !== '' ? last_comment_id : null;
  const cursorId = rawCursor != null ? parseInt(rawCursor, 10) : null;
  if (rawCursor != null && Number.isNaN(cursorId)) {
    throw err('INVALID_CURSOR', '유효하지 않은 커서입니다.', 400);
  }

  const rows = await prisma.comment.findMany({
    where: {
      post_id: postId,
      ...(cursorId != null ? { id: { lt: cursorId } } : {}),
    },
    orderBy: { id: 'desc' },
    take: limit + 1,
    include: {
      user: { select: { user_id: true, nickname: true, avatar_url: true } },
    },
  });

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && slice.length ? slice[slice.length - 1].id : null;

  return {
    comments: slice.map(mapCommentRow),
    nextCursor,
  };
}

async function createComment(authorId, postId, content) {
  const trimmed = String(content ?? '').trim();
  if (!trimmed) {
    throw err('VALIDATION_ERROR', '댓글 내용을 입력해 주세요.');
  }
  if (trimmed.length > 1000) {
    throw err('VALIDATION_ERROR', '댓글은 1000자 이하여야 합니다.');
  }

  const newId = await prisma.$transaction(async (tx) => {
    const post = await tx.post.findFirst({
      where: { post_id: postId, is_deleted: false },
      select: { post_id: true, user_id: true, type: true },
    });
    if (!post) {
      throw err('POST_NOT_FOUND', '게시글을 찾을 수 없습니다.', 404);
    }
    if (post.type === 'secret' && post.user_id !== authorId) {
      throw err('POST_NOT_FOUND', '게시글을 찾을 수 없습니다.', 404);
    }

    // DB에 comments.id AUTO_INCREMENT가 없을 때 Prisma 기본 create가 실패할 수 있음 → MAX+1 (post_images 등과 동일)
    const idRows = await tx.$queryRaw`SELECT COALESCE(MAX(id), 0) AS m FROM comments FOR UPDATE`;
    const m = idRows[0]?.m ?? 0;
    const nextCommentId = (typeof m === 'bigint' ? Number(m) : Number(m)) + 1;

    const created = await tx.comment.create({
      data: {
        id: nextCommentId,
        post_id: postId,
        user_id: authorId,
        content: trimmed,
        is_deleted: false,
      },
      select: { id: true },
    });

    await tx.post.update({
      where: { post_id: postId },
      data: { comment_count: { increment: 1 } },
    });

    return created.id;
  });

  const row = await prisma.comment.findUnique({
    where: { id: newId },
    include: { user: { select: { user_id: true, nickname: true, avatar_url: true } } },
  });
  return mapCommentRow(row);
}

async function softDeleteComment(requesterId, commentId) {
  await prisma.$transaction(async (tx) => {
    const c = await tx.comment.findFirst({
      where: { id: commentId },
      select: { id: true, post_id: true, user_id: true, is_deleted: true },
    });
    if (!c) {
      throw err('POST_NOT_FOUND', '댓글을 찾을 수 없습니다.', 404);
    }
    if (c.user_id !== requesterId) {
      throw err('FORBIDDEN', '본인의 댓글만 삭제할 수 있습니다.', 403);
    }
    if (c.is_deleted) {
      return;
    }

    await tx.comment.update({
      where: { id: commentId },
      data: { is_deleted: true, deleted_at: new Date() },
    });

    const post = await tx.post.findUnique({
      where: { post_id: c.post_id },
      select: { comment_count: true },
    });
    const next = Math.max(0, (post?.comment_count ?? 1) - 1);
    await tx.post.update({
      where: { post_id: c.post_id },
      data: { comment_count: next },
    });
  });
}

module.exports = {
  listCommentsForPost,
  createComment,
  softDeleteComment,
};
