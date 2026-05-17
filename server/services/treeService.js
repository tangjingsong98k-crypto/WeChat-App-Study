const treeModel = require('../models/treeModel');
const { createTreeModel } = require('../models/treeModel');
const userModelModule = require('../models/userModel');
const { createUserModel } = require('../models/userModel');
const { TREE_SPECIES, UPGRADE_NEED_GROW_SCORE, WATERING_GROW_SCORE, USER_FERTILIZE_RECOVER_EFFECT, SET_BONUS_GROW_SCORE, SET_BONUS_MAX_WATER, MAX_WATERING_TIME } = require('../config');
const { getDb } = require('../db/init');
const defaultWateringTimerService = require('./wateringTimerService');
const defaultCardService = require('./cardService');

/**
 * Tree Service - handles tree selection, watering, level calculation, and tree status.
 *
 * @param {object} [options] - Optional configuration
 * @param {function} [options.getDatabase] - Custom database getter (for testing)
 * @param {object} [options.treeModel] - Custom tree model instance (for testing)
 * @param {object} [options.userModel] - Custom user model instance (for testing)
 * @param {object} [options.wateringTimerService] - Watering timer service instance
 * @param {object|null} [options.cardService] - Card service instance (null to disable)
 */
function createTreeService(options = {}) {
  const getDatabase = options.getDatabase || getDb;
  const model = options.treeModel || (options.getDatabase ? createTreeModel({ getDatabase: options.getDatabase }) : treeModel);
  const userMdl = options.userModel || (options.getDatabase ? createUserModel({ getDatabase: options.getDatabase }) : userModelModule);
  const wateringTimer = options.wateringTimerService || defaultWateringTimerService;
  const cardService = options.cardService !== undefined ? options.cardService : defaultCardService;

  return {
    /**
     * Select a tree species for a user.
     *
     * Validates:
     * - species is in the allowed list (TREE_SPECIES)
     * - user has not already selected a species
     *
     * @param {number} userId
     * @param {string} species
     * @returns {object} { success: true, tree } or { success: false, error }
     */
    selectSpecies(userId, species) {
      // Validate species
      if (!TREE_SPECIES.includes(species)) {
        return {
          success: false,
          error: { code: 'INVALID_SPECIES', message: '无效的树种' },
        };
      }

      // Check if user already has a tree
      const existingTree = model.findByUserId(userId);
      if (existingTree) {
        return {
          success: false,
          error: { code: 'SPECIES_ALREADY_SELECTED', message: '已选择过树种' },
        };
      }

      // Create tree record
      const tree = model.create(userId, species);
      return { success: true, tree };
    },

    /**
     * Calculate the tree level based on grow score.
     *
     * Finds the maximum level where UPGRADE_NEED_GROW_SCORE[level] <= growScore.
     *
     * @param {number} growScore - the current grow score
     * @returns {number} the calculated level
     */
    calculateLevel(growScore) {
      let level = 0;
      for (let i = UPGRADE_NEED_GROW_SCORE.length - 1; i >= 0; i--) {
        if (growScore >= UPGRADE_NEED_GROW_SCORE[i]) {
          level = i;
          break;
        }
      }
      return level;
    },

    /**
     * Perform watering operation for a user.
     *
     * Steps:
     * 1. Check if user has a tree (return TREE_NOT_SELECTED error if not)
     * 2. Consume one watering count via wateringTimerService (throws NO_WATER_COUNT if 0)
     * 3. Increase grow_score by WATERING_GROW_SCORE
     * 4. Recalculate level
     * 5. Update tree record
     * 6. Try to gain a card (if cardService is available)
     * 7. Return result
     *
     * @param {number} userId
     * @returns {object} { growScore, level, waterCount, card? }
     * @throws {Error} TREE_NOT_SELECTED if user has no tree
     * @throws {Error} NO_WATER_COUNT if watering count is 0 (from wateringTimerService)
     */
    water(userId) {
      // 1. Check if user has a tree
      const tree = model.findByUserId(userId);
      if (!tree) {
        const error = new Error('请先选择树种');
        error.code = 'TREE_NOT_SELECTED';
        throw error;
      }

      // 2. Consume one watering count (with set 3 bonus for max capacity)
      let effectiveMax = MAX_WATERING_TIME;
      if (cardService && typeof cardService.hasCompletedSet === 'function') {
        if (cardService.hasCompletedSet(userId, 3)) {
          effectiveMax += SET_BONUS_MAX_WATER;
        }
      }
      const { waterCount, nextRecoverTime, maxWaterTime } = wateringTimer.consumeWaterCount(userId, effectiveMax);

      // 3. Increase grow_score (with set 1 bonus if completed)
      let growBonus = WATERING_GROW_SCORE;
      if (cardService && typeof cardService.hasCompletedSet === 'function') {
        if (cardService.hasCompletedSet(userId, 1)) {
          growBonus += SET_BONUS_GROW_SCORE;
        }
      }
      const newGrowScore = tree.grow_score + growBonus;

      // 4. Recalculate level
      const newLevel = this.calculateLevel(newGrowScore);

      // 5. Update tree record
      model.update(userId, {
        grow_score: newGrowScore,
        level: newLevel,
      });

      // 6. Try to gain a card (optional - cardService may not be available yet)
      let card = null;
      if (cardService && typeof cardService.tryGainCard === 'function') {
        card = cardService.tryGainCard(userId);
      }

      // 7. Return result
      const result = {
        growScore: newGrowScore,
        level: newLevel,
        waterCount,
        nextRecoverTime,
        maxWaterTime,
      };

      if (card) {
        result.card = card;
      }

      return result;
    },

    /**
     * Perform fertilize operation for a user.
     *
     * Steps:
     * 1. Check if user has a tree (return TREE_NOT_SELECTED error if not)
     * 2. Get user from database to check fertilize_count
     * 3. If fertilize_count <= 0, throw error with code NO_FERTILIZE_COUNT
     * 4. Decrease user's fertilize_count by 1
     * 5. Increase tree's health_score by USER_FERTILIZE_RECOVER_EFFECT, capped at 100
     * 6. Update both user (fertilize_count) and tree (health_score) records
     * 7. Return { healthScore, fertilizeCount }
     *
     * @param {number} userId
     * @returns {object} { healthScore, fertilizeCount }
     * @throws {Error} TREE_NOT_SELECTED if user has no tree
     * @throws {Error} NO_FERTILIZE_COUNT if fertilize count is 0
     */
    fertilize(userId) {
      // 1. Check if user has a tree
      const tree = model.findByUserId(userId);
      if (!tree) {
        const error = new Error('请先选择树种');
        error.code = 'TREE_NOT_SELECTED';
        throw error;
      }

      // 2. Get user from database to check fertilize_count
      const user = userMdl.findById(userId);

      // 3. If fertilize_count <= 0, throw error
      if (!user || user.fertilize_count <= 0) {
        const error = new Error('施肥次数不足');
        error.code = 'NO_FERTILIZE_COUNT';
        throw error;
      }

      // 4. Decrease user's fertilize_count by 1
      const newFertilizeCount = user.fertilize_count - 1;

      // 5. Increase tree's health_score by USER_FERTILIZE_RECOVER_EFFECT, capped at 100
      const newHealthScore = Math.min(tree.health_score + USER_FERTILIZE_RECOVER_EFFECT, 100);

      // 6. Update both user and tree records
      userMdl.update(userId, { fertilize_count: newFertilizeCount });
      model.update(userId, { health_score: newHealthScore });

      // 7. Return result
      return {
        healthScore: newHealthScore,
        fertilizeCount: newFertilizeCount,
      };
    },

    /**
     * Get the current tree status for a user.
     *
     * @param {number} userId
     * @returns {object|null} tree status or null if no tree
     */
    getStatus(userId) {
      const tree = model.findByUserId(userId);
      if (!tree) return null;
      return tree;
    },
  };
}

// Export a default instance and the factory
const defaultTreeService = createTreeService();

module.exports = defaultTreeService;
module.exports.createTreeService = createTreeService;
