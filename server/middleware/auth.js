const { getDb } = require('../db/init');

/**
 * Creates an authentication middleware.
 * Extracts the user's openid from request headers (x-token or Authorization)
 * and attaches the user object to req.user.
 *
 * Returns 401 AUTH_REQUIRED if token is missing or user not found.
 *
 * @param {object} [options] - Optional configuration
 * @param {function} [options.getDatabase] - Custom database getter (for testing)
 */
function createAuthMiddleware(options = {}) {
  const getDatabase = options.getDatabase || getDb;

  return function authMiddleware(req, res, next) {
    const token = req.headers['x-token'] || req.headers['authorization'];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: '请先登录',
        },
      });
    }

    const db = getDatabase();
    const user = db.prepare('SELECT * FROM users WHERE openid = ?').get(token);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: '用户不存在，请重新登录',
        },
      });
    }

    req.user = user;
    next();
  };
}

// Export both the factory and a default instance
const defaultMiddleware = createAuthMiddleware();

module.exports = defaultMiddleware;
module.exports.createAuthMiddleware = createAuthMiddleware;
