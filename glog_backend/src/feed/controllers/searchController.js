/**
 * F01 통합 검색 API
 * @see md/F01Feed.md
 */

const searchService = require('../services/searchService');

function publicBaseFromReq(req) {
  return `${req.protocol}://${req.get('host')}`;
}

/** GET /search — 선택 인증 */
async function search(req, res, next) {
  try {
    const viewerId = req.user?.userId ?? null;
    const base = publicBaseFromReq(req);
    const type = req.query.type;
    const result = await searchService.search(req.query.q, type, req.query, viewerId, base);
    if (String(type || '').toLowerCase() === 'post' && result && Object.prototype.hasOwnProperty.call(result, 'usedFallback')) {
      res.setHeader('X-Search-Fallback', result.usedFallback ? 'true' : 'false');
      const { usedFallback, ...body } = result;
      return res.json(body);
    }
    return res.json(result);
  } catch (err) {
    if (err.code === 'VALIDATION_ERROR') {
      return res.status(err.httpStatus || 400).json({ error: err.message, code: err.code });
    }
    if (err.code === 'INVALID_CURSOR') {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    return next(err);
  }
}

/** GET /search/autocomplete — 선택 인증 */
async function autocomplete(req, res, next) {
  try {
    const viewerId = req.user?.userId ?? null;
    const data = await searchService.autocomplete(req.query.q, viewerId);
    return res.json(data);
  } catch (err) {
    if (err.code === 'VALIDATION_ERROR') {
      return res.status(err.httpStatus || 400).json({ error: err.message, code: err.code });
    }
    return next(err);
  }
}

module.exports = {
  search,
  autocomplete,
};
