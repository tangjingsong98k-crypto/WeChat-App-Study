import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDatabase } from '../../db/init.js';
import { createUserModel } from '../../models/userModel.js';
import { createWateringTimerService } from '../../services/wateringTimerService.js';
import { WATERING_RESUME_INTERVAL, MAX_WATERING_TIME } from '../../config.js';

describe('WateringTimerService', () => {
  let db;
  let userModel;
  let service;
  let currentTime;

  beforeEach(() => {
    db = initDatabase(':memory:');
    currentTime = 1000000000000; // fixed starting time
    userModel = createUserModel({ getDatabase: () => db });
    service = createWateringTimerService({
      getDatabase: () => db,
      now: () => currentTime,
    });
  });

  afterEach(() => {
    db.close();
  });

  function createTestUser(overrides = {}) {
    const defaults = {
      openid: `test-${Date.now()}-${Math.random()}`,
      water_count: 10,
      last_water_recover_time: currentTime,
      fertilize_count: 0,
      last_login_date: '2024-01-01',
      created_at: currentTime,
    };
    return userModel.create({ ...defaults, ...overrides });
  }

  describe('calculateAvailableWaterCount', () => {
    it('should return stored count when no time has elapsed', () => {
      const user = createTestUser({ water_count: 10, last_water_recover_time: currentTime });
      const result = service.calculateAvailableWaterCount(user);

      expect(result.currentCount).toBe(10);
      expect(result.recovered).toBe(0);
      expect(result.newRecoverTime).toBe(currentTime);
    });

    it('should recover 1 count after one interval', () => {
      const user = createTestUser({
        water_count: 10,
        last_water_recover_time: currentTime - WATERING_RESUME_INTERVAL,
      });
      const result = service.calculateAvailableWaterCount(user);

      expect(result.currentCount).toBe(11);
      expect(result.recovered).toBe(1);
      expect(result.newRecoverTime).toBe(currentTime - WATERING_RESUME_INTERVAL + WATERING_RESUME_INTERVAL);
    });

    it('should recover multiple counts after multiple intervals', () => {
      const elapsed = WATERING_RESUME_INTERVAL * 5 + 1000; // 5 full intervals + partial
      const user = createTestUser({
        water_count: 10,
        last_water_recover_time: currentTime - elapsed,
      });
      const result = service.calculateAvailableWaterCount(user);

      expect(result.currentCount).toBe(15);
      expect(result.recovered).toBe(5);
      // newRecoverTime should advance by exactly 5 intervals
      expect(result.newRecoverTime).toBe(currentTime - elapsed + 5 * WATERING_RESUME_INTERVAL);
    });

    it('should cap at MAX_WATERING_TIME', () => {
      const elapsed = WATERING_RESUME_INTERVAL * 100; // way more than needed
      const user = createTestUser({
        water_count: 45,
        last_water_recover_time: currentTime - elapsed,
      });
      const result = service.calculateAvailableWaterCount(user);

      expect(result.currentCount).toBe(MAX_WATERING_TIME);
      // When at max, newRecoverTime should be set to now
      expect(result.newRecoverTime).toBe(currentTime);
    });

    it('should set newRecoverTime to now when already at max', () => {
      const user = createTestUser({
        water_count: MAX_WATERING_TIME,
        last_water_recover_time: currentTime - 10000,
      });
      const result = service.calculateAvailableWaterCount(user);

      expect(result.currentCount).toBe(MAX_WATERING_TIME);
      expect(result.newRecoverTime).toBe(currentTime);
    });

    it('should handle zero water_count with recovery', () => {
      const elapsed = WATERING_RESUME_INTERVAL * 3;
      const user = createTestUser({
        water_count: 0,
        last_water_recover_time: currentTime - elapsed,
      });
      const result = service.calculateAvailableWaterCount(user);

      expect(result.currentCount).toBe(3);
      expect(result.recovered).toBe(3);
    });

    it('should not recover for partial intervals', () => {
      const elapsed = WATERING_RESUME_INTERVAL - 1; // just under one interval
      const user = createTestUser({
        water_count: 5,
        last_water_recover_time: currentTime - elapsed,
      });
      const result = service.calculateAvailableWaterCount(user);

      expect(result.currentCount).toBe(5);
      expect(result.recovered).toBe(0);
      expect(result.newRecoverTime).toBe(currentTime - elapsed);
    });
  });

  describe('consumeWaterCount', () => {
    it('should consume one watering count', () => {
      const user = createTestUser({ water_count: 10, last_water_recover_time: currentTime });
      const result = service.consumeWaterCount(user.id);

      expect(result.waterCount).toBe(9);
      expect(result.nextRecoverTime).toBe(currentTime + WATERING_RESUME_INTERVAL);
    });

    it('should throw error when water count is 0 and no recovery', () => {
      const user = createTestUser({ water_count: 0, last_water_recover_time: currentTime });

      expect(() => service.consumeWaterCount(user.id)).toThrow('浇水次数不足，请等待恢复');
    });

    it('should throw error with NO_WATER_COUNT code', () => {
      const user = createTestUser({ water_count: 0, last_water_recover_time: currentTime });

      try {
        service.consumeWaterCount(user.id);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e.code).toBe('NO_WATER_COUNT');
      }
    });

    it('should throw error when user not found', () => {
      expect(() => service.consumeWaterCount(99999)).toThrow('用户不存在');
    });

    it('should start recovery timer when consuming from max', () => {
      const user = createTestUser({
        water_count: MAX_WATERING_TIME,
        last_water_recover_time: currentTime - 60000, // some time ago
      });
      const result = service.consumeWaterCount(user.id);

      expect(result.waterCount).toBe(MAX_WATERING_TIME - 1);
      // When consuming from max, recover time should be set to now
      expect(result.nextRecoverTime).toBe(currentTime + WATERING_RESUME_INTERVAL);
    });

    it('should use calculated recover time when not at max', () => {
      // User has 5 water, last recover was 2 intervals ago
      const lastRecover = currentTime - WATERING_RESUME_INTERVAL * 2;
      const user = createTestUser({
        water_count: 5,
        last_water_recover_time: lastRecover,
      });
      const result = service.consumeWaterCount(user.id);

      // Should have 5 + 2 recovered = 7, then consume 1 = 6
      expect(result.waterCount).toBe(6);
      // newRecoverTime = lastRecover + 2 * interval = currentTime
      expect(result.nextRecoverTime).toBe(currentTime + WATERING_RESUME_INTERVAL);
    });

    it('should persist updated values to database', () => {
      const user = createTestUser({ water_count: 10, last_water_recover_time: currentTime });
      service.consumeWaterCount(user.id);

      const updatedUser = userModel.findById(user.id);
      expect(updatedUser.water_count).toBe(9);
      expect(updatedUser.last_water_recover_time).toBe(currentTime);
    });

    it('should allow consuming after recovery from zero', () => {
      // User had 0 water but enough time has passed for 3 recoveries
      const elapsed = WATERING_RESUME_INTERVAL * 3;
      const user = createTestUser({
        water_count: 0,
        last_water_recover_time: currentTime - elapsed,
      });
      const result = service.consumeWaterCount(user.id);

      // 0 + 3 recovered = 3, consume 1 = 2
      expect(result.waterCount).toBe(2);
    });
  });
});
