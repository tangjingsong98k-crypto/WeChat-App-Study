const treeService = require('../services/treeService');

/**
 * Tree Controller - handles HTTP requests for tree-related operations.
 */
const treeController = {
  /**
   * POST /api/tree/select
   * Select a tree species for the authenticated user.
   * Expects { species } in request body.
   */
  select(req, res) {
    try {
      const { species } = req.body;

      if (!species) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PARAMS',
            message: '缺少树种参数',
          },
        });
      }

      const result = treeService.selectSpecies(req.user.id, species);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error,
        });
      }

      return res.json({
        success: true,
        data: { tree: result.tree },
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '选择树种失败，请重试',
        },
      });
    }
  },

  /**
   * POST /api/tree/water
   * Perform watering operation for the authenticated user.
   * Returns { growScore, level, waterCount, card? }
   */
  water(req, res) {
    try {
      const result = treeService.water(req.user.id);

      return res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      if (err.code === 'TREE_NOT_SELECTED' || err.code === 'NO_WATER_COUNT') {
        return res.status(400).json({
          success: false,
          error: {
            code: err.code,
            message: err.message,
          },
        });
      }

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '浇水失败，请重试',
        },
      });
    }
  },

  /**
   * POST /api/tree/fertilize
   * Perform fertilize operation for the authenticated user.
   * Returns { healthScore, fertilizeCount }
   */
  fertilize(req, res) {
    try {
      const result = treeService.fertilize(req.user.id);

      return res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      if (err.code === 'TREE_NOT_SELECTED' || err.code === 'NO_FERTILIZE_COUNT' || err.code === 'HEALTH_FULL') {
        return res.status(400).json({
          success: false,
          error: {
            code: err.code,
            message: err.message,
          },
        });
      }

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '施肥失败，请重试',
        },
      });
    }
  },

  /**
   * GET /api/tree/status
   * Get the current tree status for the authenticated user.
   */
  getStatus(req, res) {
    try {
      const tree = treeService.getStatus(req.user.id);

      if (!tree) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'TREE_NOT_SELECTED',
            message: '请先选择树种',
          },
        });
      }

      return res.json({
        success: true,
        data: { tree },
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '获取树状态失败，请重试',
        },
      });
    }
  },
};

module.exports = treeController;
