/**
 * F01 댓글 삭제 — DELETE /comments/:commentId
 * @see md/F01Feed.md
 */

const commentService = require('../services/commentService');

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

/** DELETE /comments/:commentId — JWT 필수 */
async function deleteComment(req, res, next) {
  try {
    const cid = parseInt(req.params.commentId, 10);
    if (Number.isNaN(cid)) {
      return res.status(400).json({ error: '잘못된 댓글 ID입니다.', code: 'VALIDATION_ERROR' });
    }
    const postId = await commentService.softDeleteComment(req.user.userId, cid);
    const io = req.app.get('io');
    if (io && postId != null) io.emit('feed_comment:deleted', { post_id: postId, comment_id: cid });
    return res.status(200).json({ message: '삭제되었습니다' });
  } catch (err) {
    if (handleWriteError(err, res)) return;
    next(err);
  }
}

module.exports = {
  deleteComment,
};
