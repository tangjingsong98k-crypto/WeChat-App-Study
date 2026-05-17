const userService = require('../services/userService');

/**
 * User Controller - handles HTTP requests for user-related operations.
 */
const userController = {
  /**
   * POST /api/user/login
   * Handles WeChat login. Extracts code from request body,
   * delegates to userService.login, and returns token + userData.
   */
  login(req, res) {
    try {
      const { code } = req.body;

      if (!code) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PARAMS',
            message: '缺少登录 code 参数',
          },
        });
      }

      const { token, userData } = userService.login(code);

      return res.json({
        success: true,
        data: { token, userData },
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '登录失败，请重试',
        },
      });
    }
  },

  /**
   * GET /api/user/info
   * Returns the authenticated user's info.
   * Requires auth middleware (req.user must be set).
   */
  getInfo(req, res) {
    try {
      const user = userService.getUserInfo(req.user.id);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: '用户不存在',
          },
        });
      }

      return res.json({
        success: true,
        data: { user },
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '获取用户信息失败',
        },
      });
    }
  },

  /**
   * GET /api/user/settlement
   * Check for unread settlement results.
   */
  getSettlement(req, res) {
    try {
      const { getDb } = require('../db/init');
      const db = getDb();
      const result = db.prepare(
        'SELECT * FROM settlement_results WHERE user_id = ? AND read_flag = 0'
      ).get(req.user.id);

      if (!result) {
        return res.json({ success: true, data: { hasSettlement: false } });
      }

      // Mark as read
      db.prepare('UPDATE settlement_results SET read_flag = 1 WHERE user_id = ?').run(req.user.id);

      return res.json({
        success: true,
        data: {
          hasSettlement: true,
          healthLost: result.health_lost,
          growLost: result.grow_lost,
          levelBefore: result.level_before,
          levelAfter: result.level_after,
        },
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: '获取结算信息失败' },
      });
    }
  },
};

module.exports = userController;
