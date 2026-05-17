const { getDb } = require('../db/init');
const { createTreeModel } = require('../models/treeModel');
const defaultTreeService = require('./treeService');
const { createTreeService } = require('./treeService');
const {
  DAILY_DECLINE_HEALTH_SCORE,
  LOW_HEALTH_SCORE,
  UPGRADE_NEED_GROW_SCORE,
} = require('../config');

/**
 * Settlement Service - handles daily settlement logic.
 *
 * Each day, every user's tree health declines. If health drops below the
 * low threshold, grow score is also deducted, potentially causing level loss.
 *
 * @param {object} [options] - Optional configuration
 * @param {function} [options.getDatabase] - Custom database getter (for testing)
 * @param {object} [options.treeModel] - Custom tree model instance (for testing)
 * @param {object} [options.treeService] - Custom tree service instance (for testing)
 */
function createSettlementService(options = {}) {
  const getDatabase = options.getDatabase || getDb;
  const model = options.treeModel || createTreeModel({ getDatabase });
  const treeSvc = options.treeService || createTreeService({ getDatabase });

  return {
    /**
     * Execute daily settlement for all users who have trees.
     *
     * Each user is settled independently - one user's failure does not
     * affect other users.
     *
     * @returns {object} { processed: number, failed: number }
     */
    executeDailySettlement() {
      const db = getDatabase();
      const trees = db.prepare('SELECT * FROM trees').all();

      let processed = 0;
      let failed = 0;

      for (const tree of trees) {
        try {
          this.settleUser(tree.user_id);
          processed++;
        } catch (err) {
          failed++;
        }
      }

      return { processed, failed };
    },

    /**
     * Execute settlement for a single user.
     *
     * Steps:
     * 1. Get user's tree (skip if no tree)
     * 2. Decrease health_score by DAILY_DECLINE_HEALTH_SCORE
     * 3. If new health_score < 0, set to 0
     * 4. If new health_score < LOW_HEALTH_SCORE:
     *    - Calculate grow score deduction based on current level interval
     *    - Decrease grow_score by the deduction amount
     *    - If new grow_score < 0, set to 0
     * 5. Recalculate level based on new grow_score
     * 6. Update tree record atomically using a transaction
     *
     * @param {number} userId
     * @returns {object} { healthScore, growScore, level } after settlement
     */
    settleUser(userId) {
      const db = getDatabase();
      const tree = model.findByUserId(userId);

      if (!tree) {
        return null;
      }

      // Use a transaction to ensure atomicity
      const settle = db.transaction(() => {
        // Step 2: Decrease health_score
        let newHealthScore = tree.health_score - DAILY_DECLINE_HEALTH_SCORE;

        // Step 3: Floor at 0
        if (newHealthScore < 0) {
          newHealthScore = 0;
        }

        let newGrowScore = tree.grow_score;

        // Step 4: If health is low, deduct grow score
        if (newHealthScore < LOW_HEALTH_SCORE) {
          const currentLevel = tree.level;
          let deduction;

          if (currentLevel >= UPGRADE_NEED_GROW_SCORE.length - 1) {
            // Max level: use the last interval
            const lastIdx = UPGRADE_NEED_GROW_SCORE.length - 1;
            deduction = Math.floor(
              (UPGRADE_NEED_GROW_SCORE[lastIdx] - UPGRADE_NEED_GROW_SCORE[lastIdx - 1]) * 0.1
            );
          } else {
            deduction = Math.floor(
              (UPGRADE_NEED_GROW_SCORE[currentLevel + 1] - UPGRADE_NEED_GROW_SCORE[currentLevel]) * 0.1
            );
          }

          newGrowScore = newGrowScore - deduction;

          if (newGrowScore < 0) {
            newGrowScore = 0;
          }
        }

        // Step 5: Recalculate level
        const newLevel = treeSvc.calculateLevel(newGrowScore);

        // Step 6: Update tree record
        model.update(userId, {
          health_score: newHealthScore,
          grow_score: newGrowScore,
          level: newLevel,
        });

        return {
          healthScore: newHealthScore,
          growScore: newGrowScore,
          level: newLevel,
        };
      });

      return settle();
    },
  };
}

// Export a default instance and the factory
const defaultSettlementService = createSettlementService();

module.exports = defaultSettlementService;
module.exports.createSettlementService = createSettlementService;
