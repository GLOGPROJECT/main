const { verifyAccessToken } = require('./jwt');

/** Bearer가 있으면 검증해 req.user 설정, 없거나 실패하면 req.user=null (401 없음) */
function optionalAuthenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }
  const token = authHeader.slice(7);
  try {
    req.user = verifyAccessToken(token);
  } catch {
    req.user = null;
  }
  next();
}

module.exports = optionalAuthenticate;
