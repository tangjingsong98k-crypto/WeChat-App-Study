import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { initDatabase } from '../../db/init.js';
import { createUserService } from '../../services/userService.js';
import { createUserModel } from '../../models/userModel.js';
import {
  DAILY_FERTILIZE_RESUME_TIMES,
  MAX_FERTILIZE_COUNT,
} from '../../config.js';

/**
 * Feature: tree-growing-game, Property 4: 每日施肥次数恢复逻辑
 *
 * For any user, if current date differs from last_login_date,
 * fertilize_count should recover by DAILY_FERTILIZE_RESUME_TIMES
 * (capped at MAX_FERTILIZE_COUNT); if same date, no change.
 *
 * **Validates: Requirements 4.1, 4.2**
 */
describe('Property 4: 每日施肥次数恢复逻辑', () => {
  let db;
  let userService;
  let userModel;

  beforeEach(() => {
    db = initDatabase(':memory:');
    userModel = createUserModel({ getDatabase: () => db });
    userService = createUserService({ getDatabase: () => db });
  });

  afterEach(() => {
    db.close();
  });

  /**
   * Helper: get today's date string in YYYY-MM-DD format.
   */
  function getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Arbitrary: generate a date string that is NOT today (different day).
   */
  const differentDayArb = fc.date({
    min: new Date('2020-01-01'),
    max: new Date('2030-12-31'),
  }).filter((d) => {
    const today = new Date();
    return (
      d.getFullYear() !== today.getFullYear() ||
      d.getMonth() !== today.getMonth() ||
      d.getDate() !== today.getDate()
    );
  }).map((d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  /**
   * Arbitrary: fertilize_count in range [0, MAX_FERTILIZE_COUNT + 4]
   * to test edge cases beyond the max.
   */
  const fertilizeCountArb = fc.integer({ min: 0, max: Math.max(MAX_FERTILIZE_COUNT + 4, 5) });

  it('should recover fertilize_count when last_login_date differs from today (different day)', () => {
    fc.assert(
      fc.property(
        fertilizeCountArb,
        differentDayArb,
        (initialFertilizeCount, lastLoginDate) => {
          // Create a user with the generated fertilize_count and last_login_date
          const now = Date.now();
          const user = userModel.create({
            openid: `test-user-${now}-${Math.random()}`,
            water_count: 50,
            last_water_recover_time: now,
            fertilize_count: initialFertilizeCount,
            last_login_date: lastLoginDate,
            created_at: now,
          });

          // Call checkAndRecoverFertilize
          const updatedUser = userService.checkAndRecoverFertilize(user);

          // Expected: fertilize_count = min(old + DAILY_FERTILIZE_RESUME_TIMES, MAX_FERTILIZE_COUNT)
          const expected = Math.min(
            initialFertilizeCount + DAILY_FERTILIZE_RESUME_TIMES,
            MAX_FERTILIZE_COUNT
          );

          expect(updatedUser.fertilize_count).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should NOT change fertilize_count when last_login_date is today (same day)', () => {
    const today = getTodayDateString();

    fc.assert(
      fc.property(
        fertilizeCountArb,
        (initialFertilizeCount) => {
          // Create a user with today's date as last_login_date
          const now = Date.now();
          const user = userModel.create({
            openid: `test-user-same-day-${now}-${Math.random()}`,
            water_count: 50,
            last_water_recover_time: now,
            fertilize_count: initialFertilizeCount,
            last_login_date: today,
            created_at: now,
          });

          // Call checkAndRecoverFertilize
          const updatedUser = userService.checkAndRecoverFertilize(user);

          // Expected: fertilize_count unchanged
          expect(updatedUser.fertilize_count).toBe(initialFertilizeCount);
        }
      ),
      { numRuns: 100 }
    );
  });
});
