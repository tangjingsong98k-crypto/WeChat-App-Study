const userModel = require('../models/userModel');
const { createUserModel } = require('../models/userModel');
const defaultWateringTimerService = require('./wateringTimerService');
const { createWateringTimerService } = require('./wateringTimerService');
const {
  MAX_WATERING_TIME,
  DAILY_FERTILIZE_RESUME_TIMES,
  MAX_FERTILIZE_COUNT,
  SET_BONUS_MAX_WATER,
} = require('../config');
const { getDb } = require('../db/init');
const defaultCardService = require('./cardService');
const { createCardService } = require('./cardService');

/**
 * User Service - handles login logic, user info retrieval, and daily fertilize recovery.
 *
 * @param {object} [options] - Optional configuration
 * @param {function} [options.getDatabase] - Custom database getter (for testing)
 * @param {object} [options.userModel] - Custom user model instance (for testing)
 * @param {object} [options.wateringTimerService] - Custom watering timer service (for testing)
 */
function createUserService(options = {}) {
  const getDatabase = options.getDatabase || getDb;
  const model = options.userModel || (options.getDatabase ? createUserModel({ getDatabase: options.getDatabase }) : userModel);
  const wateringTimer = options.wateringTimerService || (options.getDatabase ? createWateringTimerService({ getDatabase: options.getDatabase }) : defaultWateringTimerService);
  const cardSvc = options.cardService !== undefined ? options.cardService : (options.getDatabase ? createCardService({ getDatabase: options.getDatabase }) : defaultCardService);

  return {
    /**
     * Handle user login.
     * Simplified: uses the code directly as openid (no actual WeChat API call).
     *
     * Logic:
     * 1. Use code as openid
     * 2. Find user by openid
     * 3. If not found, create new user with defaults
     * 4. If found, check daily fertilize recovery
     * 5. Update last_login_date
     * 6. Return token (openid) and user data
     *
     * @param {string} code - WeChat login code (used as openid directly)
     * @returns {object} { token, userData }
     */
    login(code) {
      const openid = code;
      const now = Date.now();
      const today = getTodayDateString();

      let user = model.findByOpenid(openid);

      if (!user) {
        // First-time login: create new user, nickname defaults to openid (the ID itself)
        user = model.create({
          openid,
          nickname: openid,
          water_count: MAX_WATERING_TIME,
          last_water_recover_time: now,
          fertilize_count: MAX_FERTILIZE_COUNT,
          last_login_date: today,
          created_at: now,
        });
      } else {
        // Existing user: check and recover fertilize count
        user = this.checkAndRecoverFertilize(user);
        // Update last_login_date
        user = model.update(user.id, { last_login_date: today });
      }

      // Get tree data if exists
      const db = getDatabase();
      const tree = db.prepare('SELECT * FROM trees WHERE user_id = ?').get(user.id);

      return {
        token: openid,
        userData: {
          ...user,
          tree: tree || null,
        },
      };
    },

    /**
     * Get user info with tree data.
     * Applies lazy watering count calculation to return accurate current values.
     * @param {number} userId
     * @returns {object|null} user info with tree, or null if not found
     */
    getUserInfo(userId) {
      const user = model.findById(userId);
      if (!user) return null;

      // Calculate effective max water time (with set 3 bonus)
      let maxWaterTime = MAX_WATERING_TIME;
      if (cardSvc && typeof cardSvc.hasCompletedSet === 'function') {
        if (cardSvc.hasCompletedSet(userId, 3)) {
          maxWaterTime += SET_BONUS_MAX_WATER;
        }
      }

      // Apply lazy calculation to get actual current water count
      const { currentCount, newRecoverTime } = wateringTimer.calculateAvailableWaterCount(user, maxWaterTime);

      const db = getDatabase();
      const tree = db.prepare('SELECT * FROM trees WHERE user_id = ?').get(user.id);

      return {
        ...user,
        water_count: currentCount,
        last_water_recover_time: newRecoverTime,
        max_water_time: maxWaterTime,
        tree: tree || null,
      };
    },

    /**
     * Check if it's a new day and recover fertilize count.
     *
     * If last_login_date differs from today:
     *   - Add DAILY_FERTILIZE_RESUME_TIMES to fertilize_count
     *   - Cap at MAX_FERTILIZE_COUNT
     *
     * @param {object} user - user record from database
     * @returns {object} updated user record
     */
    checkAndRecoverFertilize(user) {
      const today = getTodayDateString();

      if (user.last_login_date !== today) {
        const newFertilizeCount = Math.min(
          user.fertilize_count + DAILY_FERTILIZE_RESUME_TIMES,
          MAX_FERTILIZE_COUNT
        );
        return model.update(user.id, { fertilize_count: newFertilizeCount });
      }

      return user;
    },
  };
}

/**
 * Get today's date as YYYY-MM-DD string.
 * @returns {string}
 */
function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Export a default instance and the factory
const defaultUserService = createUserService();

module.exports = defaultUserService;
module.exports.createUserService = createUserService;
module.exports.getTodayDateString = getTodayDateString;
