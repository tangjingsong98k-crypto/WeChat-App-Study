import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { initDatabase } from '../../db/init.js';
import { createTreeService } from '../../services/treeService.js';
import { createUserModel } from '../../models/userModel.js';
import { USER_FERTILIZE_RECOVER_EFFECT } from '../../config.js';

/**
 * Feature: tree-growing-game, Property 3: 施肥健康值计算正确性
 *
 * For any user with fertilize_count > 0 and any initial health score h (0 <= h <= 100),
 * after fertilizing: health_score = min(h + USER_FERTILIZE_RECOVER_EFFECT, 100),
 * and fertilize_count decreases by 1.
 * When fertilize_count = 0, the operation throws NO_FERTILIZE_COUNT error.
 *
 * **Validates: Requirements 4.3, 4.4, 4.5**
 */
describe('Property 3: 施肥健康值计算正确性', () => {
  let db;
  let treeService;
  let userModel;
  const fixedTime = 1000000000000;

  beforeEach(() => {
    db = initDatabase(':memory:');
    const getDatabase = () => db;
    userModel = createUserModel({ getDatabase });
    treeService = createTreeService({ getDatabase, cardService: null });
  });

  afterEach(() => {
    db.close();
  });

  /**
   * Arbitrary: initial health score in range [0, 99] (100 is blocked by HEALTH_FULL)
   */
  const healthScoreArb = fc.integer({ min: 0, max: 99 });

  /**
   * Arbitrary: tree species
   */
  const speciesArb = fc.constantFrom('apple', 'cherry', 'oak');

  it('should increase health_score by USER_FERTILIZE_RECOVER_EFFECT (capped at 100) and decrease fertilize_count by 1 when fertilize_count > 0', () => {
    fc.assert(
      fc.property(
        healthScoreArb,
        speciesArb,
        (initialHealth, species) => {
          // Create user with fertilize_count = 1
          const user = userModel.create({
            openid: `test-fertilize-${Date.now()}-${Math.random()}`,
            water_count: 0,
            last_water_recover_time: fixedTime,
            fertilize_count: 1,
            last_login_date: '2024-01-01',
            created_at: fixedTime,
          });

          // Select a tree species for the user
          treeService.selectSpecies(user.id, species);

          // Set initial health score directly in DB
          db.prepare('UPDATE trees SET health_score = ? WHERE user_id = ?').run(initialHealth, user.id);

          // Perform fertilize
          const result = treeService.fertilize(user.id);

          // Verify: health_score = min(h + USER_FERTILIZE_RECOVER_EFFECT, 100)
          const expectedHealth = Math.min(initialHealth + USER_FERTILIZE_RECOVER_EFFECT, 100);
          expect(result.healthScore).toBe(expectedHealth);

          // Verify: fertilize_count decreases by 1
          expect(result.fertilizeCount).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should throw NO_FERTILIZE_COUNT error when fertilize_count is 0', () => {
    fc.assert(
      fc.property(
        healthScoreArb,
        speciesArb,
        (initialHealth, species) => {
          // Create user with fertilize_count = 0
          const user = userModel.create({
            openid: `test-no-fertilize-${Date.now()}-${Math.random()}`,
            water_count: 0,
            last_water_recover_time: fixedTime,
            fertilize_count: 0,
            last_login_date: '2024-01-01',
            created_at: fixedTime,
          });

          // Select a tree species
          treeService.selectSpecies(user.id, species);

          // Set initial health score
          db.prepare('UPDATE trees SET health_score = ? WHERE user_id = ?').run(initialHealth, user.id);

          // Fertilize should throw NO_FERTILIZE_COUNT
          try {
            treeService.fertilize(user.id);
            expect.fail('Expected NO_FERTILIZE_COUNT error to be thrown');
          } catch (error) {
            expect(error.code).toBe('NO_FERTILIZE_COUNT');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
