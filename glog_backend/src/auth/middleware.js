const { verifyAccessToken } = require('./jwt');

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: '인증이 필요합니다.' });
  }

  const token = authHeader.slice(7);
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    return res.status(401).json({ message: '토큰이 만료되었거나 유효하지 않습니다.' });
  }
}

module.exports = authenticate;
