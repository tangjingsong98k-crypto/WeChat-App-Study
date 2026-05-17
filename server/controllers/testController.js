const userModel = require('../models/userModel');
const { createUserModel } = require('../models/userModel');
const treeModel = require('../models/treeModel');
const { createTreeModel } = require('../models/treeModel');
const cardModel = require('../models/cardModel');
const { createCardModel } = require('../models/cardModel');
const rankingModel = require('../models/rankingModel');
const { createRankingModel } = require('../models/rankingModel');
const treeService = require('../services/treeService');
const { createTreeService } = require('../services/treeService');
const { MAX_WATERING_TIME } = require('../config');
const { getDb } = require('../db/init');

/**
 * Creates a test controller with optional dependency injection for testing.
 *
 * @param {object} [options] - Optional configuration
 * @param {function} [options.getDatabase] - Custom database getter (for testing)
 * @param {object} [options.userModel] - Custom user model instance
 * @param {object} [options.treeModel] - Custom tree model instance
 * @param {object} [options.cardModel] - Custom card model instance
 * @param {object} [options.rankingModel] - Custom ranking model instance
 * @param {object} [options.treeService] - Custom tree service instance
 */
function createTestController(options = {}) {
  const getDatabase = options.getDatabase || getDb;
  const userMdl = options.userModel || (options.getDatabase ? createUserModel({ getDatabase: options.getDatabase }) : userModel);
  const treeMdl = options.treeModel || (options.getDatabase ? createTreeModel({ getDatabase: options.getDatabase }) : treeModel);
  const cardMdl = options.cardModel || (options.getDatabase ? createCardModel({ getDatabase: options.getDatabase }) : cardModel);
  const rankingMdl = options.rankingModel || (options.getDatabase ? createRankingModel({ getDatabase: options.getDatabase }) : rankingModel);
  const treeSvc = options.treeService || (options.getDatabase ? createTreeService({ getDatabase: options.getDatabase }) : treeService);

  return {
    /**
     * POST /api/test/fake-user
     * Create a fake user for testing purposes.
     *
     * Request body:
     * - nickname {string} (optional) - nickname for the fake user
     * - species {string} - tree species: 'apple', 'cherry', or 'oak'
     * - growScore {number} - the grow score to set
     * - cards {Array<{cardId, count}>} (optional) - cards to add
     * - participate {boolean} (optional) - whether to participate in ranking
     *
     * Response: { success: true, data: { userId, openid } }
     */
    createFakeUser(req, res) {
      try {
        const { nickname, species, growScore, cards, participate } = req.body;

        // Validate required fields
        if (!species) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_PARAMS', message: '缺少必要参数 species' },
          });
        }

        if (growScore === undefined || growScore === null) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_PARAMS', message: '缺少必要参数 growScore' },
          });
        }

        // Generate a unique openid for the fake user
        const openid = `fake-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
        const now = Date.now();
        const today = new Date().toISOString().slice(0, 10);

        // Create user
        const user = userMdl.create({
          openid,
          nickname: nickname || `假人_${openid.slice(5, 13)}`,
          avatar_url: null,
          water_count: MAX_WATERING_TIME,
          last_water_recover_time: now,
          fertilize_count: 0,
          last_login_date: today,
          created_at: now,
        });

        // Create tree with specified species and growScore
        const level = treeSvc.calculateLevel(growScore);
        const db = getDatabase();
        db.prepare(
          'INSERT INTO trees (user_id, species, level, grow_score, health_score) VALUES (?, ?, ?, ?, 30)'
        ).run(user.id, species, level, growScore);

        // Add cards if specified
        if (cards && Array.isArray(cards)) {
          for (const { cardId, count } of cards) {
            if (cardId && count > 0) {
              for (let i = 0; i < count; i++) {
                cardMdl.addCardToUser(user.id, cardId);
              }
            }
          }
        }

        // Set ranking participation if specified
        if (participate) {
          rankingMdl.setParticipation(user.id, 1);
        }

        return res.json({
          success: true,
          data: { userId: user.id, openid },
        });
      } catch (err) {
        return res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: '创建假人用户失败' },
        });
      }
    },
  };
}

// Export a default instance and the factory
const defaultTestController = createTestController();

module.exports = defaultTestController;
module.exports.createTestController = createTestController;
