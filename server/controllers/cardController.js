const cardService = require('../services/cardService');

/**
 * Card Controller - handles HTTP requests for card-related operations.
 */
const cardController = {
  /**
   * GET /api/cards
   * Get all cards with the authenticated user's ownership status.
   */
  getCards(req, res) {
    try {
      const cards = cardService.getAllCardsWithOwnership(req.user.id);

      return res.json({
        success: true,
        data: { cards },
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '获取卡牌列表失败，请重试',
        },
      });
    }
  },

  /**
   * GET /api/cards/sets
   * Get set completion status for the authenticated user.
   */
  getSets(req, res) {
    try {
      const sets = cardService.checkSetCompletion(req.user.id);

      return res.json({
        success: true,
        data: { sets },
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '获取套装状态失败，请重试',
        },
      });
    }
  },
};

module.exports = cardController;
