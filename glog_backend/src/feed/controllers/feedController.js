/**
 * F01 피드 HTTP
 * @see md/F01Feed.md
 */

const feedService = require('../services/feedService');
const commentService = require('../services/commentService');
const linkPreviewService = require('../services/linkPreviewService');

function publicBaseFromReq(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function handleFeedError(err, res) {
  if (err.code === 'INVALID_CURSOR') {
    return res.status(400).json({ error: '유효하지 않은 커서입니다.', code: 'INVALID_CURSOR' });
  }
  if (err.code === 'USER_NOT_FOUND') {
    return res.status(404).json({ error: '사용자를 찾을 수 없습니다.', code: 'USER_NOT_FOUND' });
  }
  if (err.code === 'POST_NOT_FOUND') {
    return res.status(404).json({ error: err.message || '삭제된 게시글입니다', code: 'POST_NOT_FOUND' });
  }
  return null;
}

/** multipart `hashtags`: JSON 배열 문자열 또는 배열 */
function parseHashtagsInput(raw) {
  if (raw === undefined || raw === null || raw === '') return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const j = JSON.parse(raw);
      return Array.isArray(j) ? j : [];
    } catch {
      const e = new Error('해시태그는 JSON 배열 형식이어야 합니다.');
      e.code = 'VALIDATION_ERROR';
      throw e;
    }
  }
  const e = new Error('해시태그 형식이 올바르지 않습니다.');
  e.code = 'VALIDATION_ERROR';
  throw e;
}

function handleWriteError(err, res) {
  if (err.code === 'VALIDATION_ERROR') {
    return res.status(err.httpStatus || 400).json({ error: err.message, code: err.code });
  }
  if (err.code === 'FORBIDDEN') {
    return res.status(403).json({ error: err.message, code: err.code });
  }
  if (err.code === 'POST_NOT_FOUND') {
    return res.status(404).json({ error: err.message, code: err.code });
  }
  return null;
}

/** GET /feed — 공개·익명, 선택 인증. ?type=anonymous 이면 익명만, 익명 시 ?q= 본문 부분일치 */
async function listFeed(req, res, next) {
  try {
    const viewerId = req.user?.userId ?? null;
    const base = publicBaseFromReq(req);
    const typeParam = String(req.query.type || '').toLowerCase();
    const params = { last_post_id: req.query.last_post_id, limit: req.query.limit };
    if (typeParam === 'anonymous') {
      params.sort = req.query.sort;
      if (req.query.q != null && String(req.query.q).trim() !== '') {
        params.q = String(req.query.q).trim().slice(0, 100);
      }
    }
    const result =
      typeParam === 'anonymous'
        ? await feedService.listAnonymousFeed(params, viewerId, base)
        : await feedService.listPublicFeed(params, viewerId, base);
    res.json(result);
  } catch (err) {
    const sent = handleFeedError(err, res);
    if (sent) return;
    next(err);
  }
}

/** GET /feed/following — JWT 필수 */
async function listFollowingFeed(req, res, next) {
  try {
    const viewerId = req.user.userId;
    const base = publicBaseFromReq(req);
    const result = await feedService.listFollowingFeed(
      { last_post_id: req.query.last_post_id, limit: req.query.limit },
      viewerId,
      base
    );
    res.json(result);
  } catch (err) {
    const sent = handleFeedError(err, res);
    if (sent) return;
    next(err);
  }
}

/** GET /feed/following/members — 팔로우 중인 유저 목록 */
async function listFollowingMembers(req, res, next) {
  try {
    const viewerId = req.user.userId;
    const result = await feedService.listFollowingMembers(viewerId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/** GET /tag/:tagname */
async function getTagFeed(req, res, next) {
  try {
    const viewerId = req.user?.userId ?? null;
    const base = publicBaseFromReq(req);
    const tagname = decodeURIComponent(req.params.tagname || '');
    const result = await feedService.listTagFeed(
      tagname,
      { last_post_id: req.query.last_post_id, limit: req.query.limit, sort: req.query.sort },
      viewerId,
      base
    );
    res.json(result);
  } catch (err) {
    const sent = handleFeedError(err, res);
    if (sent) return;
    next(err);
  }
}

/** GET /feed/user/:userId */
async function listUserFeed(req, res, next) {
  try {
    const uid = parseInt(req.params.userId, 10);
    if (Number.isNaN(uid)) {
      return res.status(400).json({ error: '잘못된 사용자 ID입니다.', code: 'VALIDATION_ERROR' });
    }
    const viewerId = req.user?.userId ?? null;
    const base = publicBaseFromReq(req);
    const result = await feedService.listUserFeed(uid, { last_post_id: req.query.last_post_id, limit: req.query.limit }, viewerId, base);
    res.json(result);
  } catch (err) {
    const sent = handleFeedError(err, res);
    if (sent) return;
    next(err);
  }
}

/** GET /feed/:postId */
async function getPost(req, res, next) {
  try {
    const pid = parseInt(req.params.postId, 10);
    if (Number.isNaN(pid)) {
      return res.status(400).json({ error: '잘못된 게시글 ID입니다.', code: 'VALIDATION_ERROR' });
    }
    const viewerId = req.user?.userId ?? null;
    const base = publicBaseFromReq(req);
    const result = await feedService.getPostById(pid, viewerId, base);
    res.json(result);
  } catch (err) {
    const sent = handleFeedError(err, res);
    if (sent) return;
    next(err);
  }
}

async function createPost(req, res, next) {
  try {
    const viewerId = req.user.userId;
    const base = publicBaseFromReq(req);
    const hashtags = parseHashtagsInput(req.body?.hashtags);
    const rawAnon = req.body?.anonymous_avatar_index;
    const anonParsed = rawAnon != null && rawAnon !== '' ? parseInt(rawAnon, 10) : undefined;
    let link_preview;
    let linkRaw = req.body?.link_preview;
    if (Array.isArray(linkRaw)) linkRaw = linkRaw[0];
    if (Buffer.isBuffer(linkRaw)) linkRaw = linkRaw.toString('utf8');
    if (linkRaw != null && linkRaw !== '') {
      try {
        link_preview = typeof linkRaw === 'string' ? JSON.parse(linkRaw.trim()) : linkRaw;
      } catch {
        link_preview = undefined;
      }
    }
    const payload = {
      content: req.body?.content,
      type: req.body?.type,
      hashtags,
      anonymous_avatar_index: Number.isFinite(anonParsed) ? anonParsed : undefined,
      link_preview,
    };
    const result = await feedService.createPost(viewerId, payload, req.files || [], base);
    return res.status(201).json(result);
  } catch (err) {
    if (handleWriteError(err, res)) return;
    next(err);
  }
}

async function updatePost(req, res, next) {
  try {
    const viewerId = req.user.userId;
    const base = publicBaseFromReq(req);
    const pid = parseInt(req.params.postId, 10);
    if (Number.isNaN(pid)) {
      return res.status(400).json({ error: '잘못된 게시글 ID입니다.', code: 'VALIDATION_ERROR' });
    }
    const body = req.body || {};
    const payload = {};
    if (Object.prototype.hasOwnProperty.call(body, 'content')) payload.content = body.content;
    if (Object.prototype.hasOwnProperty.call(body, 'type')) payload.type = body.type;
    if (Object.prototype.hasOwnProperty.call(body, 'hashtags')) {
      payload.hashtags = parseHashtagsInput(body.hashtags);
    }
    const result = await feedService.updatePost(viewerId, pid, payload, req.files || [], base);
    return res.json(result);
  } catch (err) {
    if (handleWriteError(err, res)) return;
    next(err);
  }
}

async function deletePost(req, res, next) {
  try {
    const viewerId = req.user.userId;
    const pid = parseInt(req.params.postId, 10);
    if (Number.isNaN(pid)) {
      return res.status(400).json({ error: '잘못된 게시글 ID입니다.', code: 'VALIDATION_ERROR' });
    }
    const result = await feedService.deletePost(viewerId, pid);
    return res.status(200).json(result);
  } catch (err) {
    if (handleWriteError(err, res)) return;
    next(err);
  }
}

async function toggleLike(req, res, next) {
  try {
    const viewerId = req.user.userId;
    const pid = parseInt(req.params.postId, 10);
    if (Number.isNaN(pid)) {
      return res.status(400).json({ error: '잘못된 게시글 ID입니다.', code: 'VALIDATION_ERROR' });
    }
    const result = await feedService.toggleLikePost(viewerId, pid);
    return res.status(200).json(result);
  } catch (err) {
    if (handleWriteError(err, res)) return;
    next(err);
  }
}

/** GET /feed/:postId/comments — 선택 인증 */
async function listComments(req, res, next) {
  try {
    const pid = parseInt(req.params.postId, 10);
    if (Number.isNaN(pid)) {
      return res.status(400).json({ error: '잘못된 게시글 ID입니다.', code: 'VALIDATION_ERROR' });
    }
    const viewerId = req.user?.userId ?? null;
    const result = await commentService.listCommentsForPost(pid, viewerId, {
      last_comment_id: req.query.last_comment_id ?? req.query.cursor,
      limit: req.query.limit,
    });
    res.json(result);
  } catch (err) {
    const sent = handleFeedError(err, res);
    if (sent) return;
    if (handleWriteError(err, res)) return;
    next(err);
  }
}

/** GET /feed/suggested-users — 팔로우 추천(최근 가입 등) */
async function listSuggestedUsers(req, res, next) {
  try {
    const viewerId = req.user.userId;
    const result = await feedService.listSuggestedUsers(viewerId, req.query.limit);
    res.json(result);
  } catch (err) {
    const sent = handleFeedError(err, res);
    if (sent) return;
    next(err);
  }
}

/** POST /feed/follow/:targetUserId */
async function followUser(req, res, next) {
  try {
    const viewerId = req.user.userId;
    const tid = parseInt(req.params.targetUserId, 10);
    if (Number.isNaN(tid)) {
      return res.status(400).json({ error: '잘못된 사용자 ID입니다.', code: 'VALIDATION_ERROR' });
    }
    const result = await feedService.followUser(viewerId, tid);
    return res.status(200).json(result);
  } catch (err) {
    const sent = handleFeedError(err, res);
    if (sent) return;
    if (handleWriteError(err, res)) return;
    next(err);
  }
}

/** DELETE /feed/follow/:targetUserId */
async function unfollowUser(req, res, next) {
  try {
    const viewerId = req.user.userId;
    const tid = parseInt(req.params.targetUserId, 10);
    if (Number.isNaN(tid)) {
      return res.status(400).json({ error: '잘못된 사용자 ID입니다.', code: 'VALIDATION_ERROR' });
    }
    const result = await feedService.unfollowUser(viewerId, tid);
    return res.status(200).json(result);
  } catch (err) {
    if (handleWriteError(err, res)) return;
    next(err);
  }
}

/** GET /feed/weekly-activity — JWT 필수, 서울 기준 월~일 이번 주 게시글 수 */
async function getWeeklyActivity(req, res, next) {
  try {
    const userId = req.user.userId;
    const data = await feedService.getWeeklyActivity(userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

/** GET /feed/embed/preview?url= — JWT 필수, OG 메타 */
async function getLinkPreview(req, res) {
  try {
    const url = req.query.url;
    if (url == null || String(url).trim() === '') {
      return res.status(400).json({ error: 'url 파라미터가 필요합니다.', code: 'VALIDATION_ERROR' });
    }
    const preview = await linkPreviewService.fetchOgPreview(String(url).trim());
    return res.json(preview);
  } catch (err) {
    const msg = err.message || '링크 미리보기에 실패했습니다.';
    return res.status(400).json({ error: msg, code: err.code || 'LINK_PREVIEW_ERROR' });
  }
}

/** POST /feed/:postId/comments — JWT 필수 */
async function createComment(req, res, next) {
  try {
    const viewerId = req.user.userId;
    const pid = parseInt(req.params.postId, 10);
    if (Number.isNaN(pid)) {
      return res.status(400).json({ error: '잘못된 게시글 ID입니다.', code: 'VALIDATION_ERROR' });
    }
    const content = req.body?.content;
    const comment = await commentService.createComment(viewerId, pid, content);
    return res.status(201).json({ comment });
  } catch (err) {
    if (handleWriteError(err, res)) return;
    next(err);
  }
}

module.exports = {
  listFeed,
  listFollowingFeed,
  listFollowingMembers,
  getTagFeed,
  listUserFeed,
  getPost,
  getWeeklyActivity,
  getLinkPreview,
  createPost,
  updatePost,
  deletePost,
  toggleLike,
  listComments,
  createComment,
  listSuggestedUsers,
  followUser,
  unfollowUser,
};
