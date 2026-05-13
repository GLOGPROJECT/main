const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const router = express.Router();
const authenticate = require('../auth/middleware');
const optionalAuthenticate = require('../auth/optionalAuthMiddleware');
const {
  listUserProjectsWithTrophies,
  listCommunityProjectsWithTrophies,
  listMyLikedProjectsWithTrophies,
  listProjectComments,
  createProjectComment,
  deleteProjectComment,
  createProject,
  updateProject,
  deleteProject,
  toggleTrophyLike,
  countTodayProjectsForUser,
} = require('./projectService');

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');

function extFromMime(mimetype) {
  if (mimetype === 'image/jpeg') return '.jpg';
  if (mimetype === 'image/png') return '.png';
  if (mimetype === 'image/gif') return '.gif';
  if (mimetype === 'image/webp') return '.webp';
  return '.bin';
}

const coverUpload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, cb) {
      try {
        if (!fs.existsSync(UPLOAD_ROOT)) fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
        cb(null, UPLOAD_ROOT);
      } catch (e) {
        cb(e);
      }
    },
    filename(_req, file, cb) {
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extFromMime(file.mimetype)}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']).has(file.mimetype);
    cb(ok ? null : new Error('INVALID_FILE_TYPE'), ok);
  },
}).single('cover');

// GET /api/projects/me/today-count — 오늘 등록 건수(한도 3건 표시용)
router.get('/me/today-count', authenticate, async (req, res) => {
  try {
    const count = await countTodayProjectsForUser(req.user.userId);
    const max = 3;
    return res.json({ count, max, remaining: Math.max(0, max - count) });
  } catch (err) {
    console.error('[ProjectTodayCount Error]', err.message);
    return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// GET /api/projects/me/liked — 내가 좋아요한 트로피 프로젝트
router.get('/me/liked', authenticate, async (req, res) => {
  try {
    const r = await listMyLikedProjectsWithTrophies(req.user.userId, {
      last_trophy_id: req.query.last_trophy_id,
      limit: req.query.limit,
    });
    return res.json(r);
  } catch (err) {
    if (err.code === 'INVALID_CURSOR') {
      return res.status(400).json({ message: '잘못된 커서입니다.' });
    }
    console.error('[ProjectsMeLiked Error]', err.message);
    return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// GET /api/projects/community — 모든 유저 프로젝트·트로피 (트로피 탭 공용)
router.get('/community', optionalAuthenticate, async (req, res) => {
  try {
    const viewerId = req.user?.userId ?? null;
    const sortRaw = String(req.query.sort || '').toLowerCase();
    const sortMode =
      sortRaw === 'popular' ? 'popular' : sortRaw === 'oldest' ? 'oldest' : 'latest';
    const items = await listCommunityProjectsWithTrophies(viewerId, sortMode);
    return res.json({ items });
  } catch (err) {
    console.error('[ProjectsCommunity Error]', err.message);
    return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// GET /api/projects/user/:userId — 유저의 프로젝트·트로피 목록 (공개)
router.get('/user/:userId', optionalAuthenticate, async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ message: '유효하지 않은 유저 ID입니다.' });
  }
  try {
    const viewerId = req.user?.userId ?? null;
    const sortRaw = String(req.query.sort || '').toLowerCase();
    const sortMode =
      sortRaw === 'popular' ? 'popular' : sortRaw === 'oldest' ? 'oldest' : 'latest';
    const items = await listUserProjectsWithTrophies(userId, viewerId, sortMode);
    return res.json({ items });
  } catch (err) {
    console.error('[ProjectsList Error]', err.message);
    return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// POST /api/projects/upload-cover — 대표 이미지 1장 (multipart 필드명 cover)
router.post('/upload-cover', authenticate, (req, res, next) => {
  coverUpload(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: '파일은 5MB 이하여야 합니다' });
      }
      if (err.message === 'INVALID_FILE_TYPE') {
        return res.status(400).json({ message: 'jpg, png, gif, webp만 가능합니다' });
      }
      return res.status(400).json({ message: '업로드에 실패했습니다' });
    }
    next();
  });
}, (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: '파일을 선택해주세요' });
  }
  return res.json({ image_url: `/uploads/${req.file.filename}` });
});

// POST /api/projects — 프로젝트 등록 (동 트로피 자동 생성)
router.post('/', authenticate, async (req, res) => {
  try {
    const r = await createProject(req.user.userId, req.body);
    if (!r.ok) {
      const status = r.code === 'limit' ? 429 : r.code === 'duplicate' ? 409 : 400;
      return res.status(status).json({ message: r.message });
    }
    const io = req.app.get('io');
    if (io) io.emit('project:changed', { project_id: r.project_id, action: 'created' });
    return res.status(201).json({ project_id: r.project_id, trophy_id: r.trophy_id });
  } catch (err) {
    console.error('[ProjectCreate Error]', err.message);
    return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// POST /api/projects/trophies/:trophyId/like — 트로피 좋아요 토글
router.post('/trophies/:trophyId/like', authenticate, async (req, res) => {
  const trophyId = parseInt(req.params.trophyId, 10);
  if (!Number.isFinite(trophyId) || trophyId <= 0) {
    return res.status(400).json({ message: '유효하지 않은 트로피 ID입니다.' });
  }
  try {
    const r = await toggleTrophyLike(req.user.userId, trophyId);
    if (!r.ok) {
      const status = r.code === 'not_found' ? 404 : r.code === 'self' ? 400 : 400;
      return res.status(status).json({ message: r.message });
    }
    const io = req.app.get('io');
    if (io) io.emit('trophy:like_changed', { trophy_id: trophyId });
    return res.json({ liked: r.liked, like_count: r.like_count });
  } catch (err) {
    console.error('[TrophyLike Error]', err.message);
    return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// GET /api/projects/:projectId/comments — 프로젝트 댓글 목록
router.get('/:projectId/comments', async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  if (!Number.isFinite(projectId) || projectId <= 0) {
    return res.status(400).json({ message: '유효하지 않은 프로젝트 ID입니다.' });
  }
  try {
    const r = await listProjectComments(projectId);
    if (!r.ok) {
      const status = r.code === 'not_found' ? 404 : 400;
      return res.status(status).json({ message: r.message });
    }
    return res.json({ comments: r.comments });
  } catch (err) {
    console.error('[ProjectCommentsList Error]', err.message);
    return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// POST /api/projects/:projectId/comments — 프로젝트 댓글 작성 (실시간은 Socket emit)
router.post('/:projectId/comments', authenticate, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  if (!Number.isFinite(projectId) || projectId <= 0) {
    return res.status(400).json({ message: '유효하지 않은 프로젝트 ID입니다.' });
  }
  try {
    const r = await createProjectComment(req.user.userId, projectId, req.body?.content);
    if (!r.ok) {
      const status =
        r.code === 'not_found' ? 404 : r.code === 'validation' ? 400 : 400;
      return res.status(status).json({ message: r.message });
    }
    const io = req.app.get('io');
    if (io) io.to(`project:${projectId}`).emit('project_comment:new', r.comment);
    return res.status(201).json(r.comment);
  } catch (err) {
    console.error('[ProjectCommentCreate Error]', err.message);
    return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// DELETE /api/projects/:projectId/comments/:commentId — 본인 댓글 삭제
router.delete('/:projectId/comments/:commentId', authenticate, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const commentId = parseInt(req.params.commentId, 10);
  if (!Number.isFinite(projectId) || projectId <= 0 || !Number.isFinite(commentId) || commentId <= 0) {
    return res.status(400).json({ message: '유효하지 않은 ID입니다.' });
  }
  try {
    const r = await deleteProjectComment(req.user.userId, projectId, commentId);
    if (!r.ok) {
      const status =
        r.code === 'not_found' ? 404 : r.code === 'forbidden' ? 403 : r.code === 'validation' ? 400 : 400;
      return res.status(status).json({ message: r.message });
    }
    const io = req.app.get('io');
    if (io) io.to(`project:${projectId}`).emit('project_comment:deleted', { project_id: projectId, id: commentId });
    return res.status(204).send();
  } catch (err) {
    console.error('[ProjectCommentDelete Error]', err.message);
    return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// PATCH /api/projects/:projectId — 본인 프로젝트 수정 (트로피 등급·좋아요 유지)
router.patch('/:projectId', authenticate, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  if (!Number.isFinite(projectId) || projectId <= 0) {
    return res.status(400).json({ message: '유효하지 않은 프로젝트 ID입니다.' });
  }
  try {
    const r = await updateProject(req.user.userId, projectId, req.body);
    if (!r.ok) {
      const status =
        r.code === 'not_found' ? 404 : r.code === 'duplicate' ? 409 : r.code === 'validation' ? 400 : 400;
      return res.status(status).json({ message: r.message });
    }
    const io = req.app.get('io');
    if (io) io.emit('project:changed', { project_id: projectId, action: 'updated' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[ProjectUpdate Error]', err.message);
    return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// DELETE /api/projects/:projectId — 본인 프로젝트·트로피·좋아요 삭제
router.delete('/:projectId', authenticate, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  if (!Number.isFinite(projectId) || projectId <= 0) {
    return res.status(400).json({ message: '유효하지 않은 프로젝트 ID입니다.' });
  }
  try {
    const r = await deleteProject(req.user.userId, projectId);
    if (!r.ok) {
      const status = r.code === 'not_found' ? 404 : 400;
      return res.status(status).json({ message: r.message });
    }
    const io = req.app.get('io');
    if (io) io.emit('project:changed', { project_id: projectId, action: 'deleted' });
    return res.status(204).send();
  } catch (err) {
    console.error('[ProjectDelete Error]', err.message);
    return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
