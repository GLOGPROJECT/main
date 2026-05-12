/**
 * F01 해시태그 API
 * @see md/F01Feed.md
 */

const hashtagService = require('../services/hashtagService');

/** GET /hashtags/autocomplete — 공개 */
async function autocomplete(req, res, next) {
  try {
    const list = await hashtagService.autocomplete(req.query.q);
    res.json(list);
  } catch (err) {
    next(err);
  }
}

/** GET /hashtags/popular — 공개 (선택: ?limit=1~200) */
async function popular(req, res, next) {
  try {
    const list = await hashtagService.popular(req.query.limit);
    res.json(list);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  autocomplete,
  popular,
};
