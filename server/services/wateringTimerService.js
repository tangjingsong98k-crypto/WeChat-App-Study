const { getDb } = require('../db/init');
const { createUserModel } = require('../models/userModel');
const { WATERING_RESUME_INTERVAL, MAX_WATERING_TIME } = require('../config');

/**
 * Watering Timer Service - handles lazy calculation of available watering count
 * and consumption of watering opportunities.
 *
 * Instead of using timers to recover watering count for each user,
 * we calculate the current available count on-demand based on elapsed time.
 *
 * @param {object} [options] - Optional configuration
 * @param {function} [options.getDatabase] - Custom database getter (for testing)
 * @param {object} [options.userModel] - Custom user model instance (for testing)
 * @param {function} [options.now] - Custom time function (for testing), defaults to Date.now
 */
function createWateringTimerService(options = {}) {
  const getDatabase = options.getDatabase || getDb;
  const model = options.userModel || (options.getDatabase ? createUserModel({ getDatabase: options.getDatabase }) : createUserModel());
  const getNow = options.now || Date.now;

  return {
    /**
     * Calculate the current available watering count for a user based on
     * elapsed time since last_water_recover_time.
     *
     * Logic:
     * 1. elapsed = now - user.last_water_recover_time
     * 2. recovered = floor(elapsed / WATERING_RESUME_INTERVAL)
     * 3. currentCount = min(user.water_count + recovered, MAX_WATERING_TIME)
     * 4. newRecoverTime = last_water_recover_time + (recovered * WATERING_RESUME_INTERVAL)
     * 5. If currentCount >= MAX_WATERING_TIME, newRecoverTime = now (stop accumulating)
     *
     * @param {object} user - User record from database
     * @param {number} user.water_count - Stored watering count
     * @param {number} user.last_water_recover_time - Timestamp of last recovery calculation
     * @returns {{ currentCount: number, newRecoverTime: number, recovered: number }}
     */
    calculateAvailableWaterCount(user) {
      const now = getNow();
      const elapsed = now - user.last_water_recover_time;
      const recovered = Math.floor(elapsed / WATERING_RESUME_INTERVAL);
      const currentCount = Math.min(
        user.water_count + recovered,
        MAX_WATERING_TIME
      );

      let newRecoverTime;
      if (currentCount >= MAX_WATERING_TIME) {
        // At max capacity, stop accumulating - set recover time to now
        newRecoverTime = now;
      } else {
        // Advance recover time by the number of recovered intervals
        newRecoverTime = user.last_water_recover_time + (recovered * WATERING_RESUME_INTERVAL);
      }

      return { currentCount, newRecoverTime, recovered };
    },

    /**
     * Consume one watering opportunity for a user.
     *
     * Logic:
     * 1. Get user from database
     * 2. Calculate current available count via lazy calculation
     * 3. If currentCount <= 0, throw error
     * 4. If user was at max (currentCount === MAX_WATERING_TIME), set last_water_recover_time to now (start recovery timer)
     * 5. Otherwise keep the calculated newRecoverTime
     * 6. Update user: water_count = currentCount - 1, last_water_recover_time = appropriate value
     * 7. Return updated water count and next recover time
     *
     * @param {number} userId - User ID
     * @returns {{ waterCount: number, nextRecoverTime: number }}
     * @throws {Error} If user not found or no watering count available
     */
    consumeWaterCount(userId) {
      const user = model.findById(userId);
      if (!user) {
        const error = new Error('用户不存在');
        error.code = 'USER_NOT_FOUND';
        throw error;
      }

      const { currentCount, newRecoverTime } = this.calculateAvailableWaterCount(user);

      if (currentCount <= 0) {
        const error = new Error('浇水次数不足，请等待恢复');
        error.code = 'NO_WATER_COUNT';
        error.data = { nextRecoverTime: newRecoverTime + WATERING_RESUME_INTERVAL };
        throw error;
      }

      const now = getNow();
      let recoverTimeToStore;

      if (currentCount >= MAX_WATERING_TIME) {
        // Was at max, now consuming one - start recovery timer from now
        recoverTimeToStore = now;
      } else {
        // Keep the calculated newRecoverTime
        recoverTimeToStore = newRecoverTime;
      }

      const newWaterCount = currentCount - 1;
      model.update(userId, {
        water_count: newWaterCount,
        last_water_recover_time: recoverTimeToStore,
      });

      return {
        waterCount: newWaterCount,
        nextRecoverTime: recoverTimeToStore + WATERING_RESUME_INTERVAL,
      };
    },
  };
}

// Export a default instance and the factory
const defaultWateringTimerService = createWateringTimerService();

module.exports = defaultWateringTimerService;
module.exports.createWateringTimerService = createWateringTimerService;
