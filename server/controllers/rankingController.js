const rankingService = require('../services/rankingService');

/**
 * Ranking Controller - handles HTTP requests for ranking-related operations.
 */
const rankingController = {
  /**
   * GET /api/ranking/all
   * Get the full ranking list (only users who participate).
   */
  getAll(req, res) {
    try {
      const rankings = rankingService.getAllRanking();

      return res.json({
        success: true,
        data: { rankings },
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '获取排行榜失败，请重试',
        },
      });
    }
  },

  /**
   * GET /api/ranking/friends
   * Get the friends ranking list for the authenticated user.
   */
  getFriends(req, res) {
    try {
      const rankings = rankingService.getFriendsRanking(req.user.id);

      return res.json({
        success: true,
        data: { rankings },
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '获取好友排行榜失败，请重试',
        },
      });
    }
  },

  /**
   * POST /api/ranking/toggle
   * Toggle the authenticated user's ranking participation status.
   */
  toggle(req, res) {
    try {
      const { participate } = req.body;
      const result = rankingService.toggleParticipation(req.user.id, participate);

      return res.json({
        success: true,
        data: { participate: result.participate },
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '切换排名状态失败，请重试',
        },
      });
    }
  },
};

module.exports = rankingController;
