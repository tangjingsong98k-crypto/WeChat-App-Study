import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { initDatabase } from '../../db/init.js';
import { createTreeService } from '../../services/treeService.js';
import { createWateringTimerService } from '../../services/wateringTimerService.js';
import { createUserModel } from '../../models/userModel.js';
import { WATERING_GROW_SCORE } from '../../config.js';

/**
 * Feature: tree-growing-game, Property 2: 浇水操作状态变更正确性
 *
 * For any user with water_count > 0 and a selected tree species,
 * after watering: water_count decreases by 1, grow_score increases by WATERING_GROW_SCORE.
 * When water_count = 0, the operation throws NO_WATER_COUNT error.
 * When user has no tree, the operation throws TREE_NOT_SELECTED error.
 *
 * **Validates: Requirements 3.3, 3.4**
 */
describe('Property 2: 浇水操作状态变更正确性', () => {
  let db;
  let treeService;
  let wateringTimerService;
  let userModel;
  const fixedTime = 1000000000000;

  beforeEach(() => {
    db = initDatabase(':memory:');
    const getDatabase = () => db;
    userModel = createUserModel({ getDatabase });
    wateringTimerService = createWateringTimerService({ getDatabase, now: () => fixedTime });
    treeService = createTreeService({ getDatabase, wateringTimerService, cardService: null });
  });

  afterEach(() => {
    db.close();
  });

  /**
   * Arbitrary: water count in range [1, 50] (has water)
   */
  const waterCountWithWaterArb = fc.integer({ min: 1, max: 50 });

  /**
   * Arbitrary: initial grow score in range [0, 5000]
   */
  const growScoreArb = fc.integer({ min: 0, max: 5000 });

  /**
   * Arbitrary: tree species
   */
  const speciesArb = fc.constantFrom('apple', 'cherry', 'oak');

  it('should decrease water count by 1 and increase grow score by WATERING_GROW_SCORE when user has water and tree', () => {
    fc.assert(
      fc.property(
        waterCountWithWaterArb,
        growScoreArb,
        speciesArb,
        (waterCount, initialGrowScore, species) => {
          // Create user with given water count
          const user = userModel.create({
            openid: `test-water-${Date.now()}-${Math.random()}`,
            water_count: waterCount,
            last_water_recover_time: fixedTime,
            fertilize_count: 0,
            last_login_date: '2024-01-01',
            created_at: fixedTime,
          });

          // Select a tree species for the user
          treeService.selectSpecies(user.id, species);

          // Set initial grow score if non-zero
          if (initialGrowScore > 0) {
            db.prepare('UPDATE trees SET grow_score = ? WHERE user_id = ?').run(initialGrowScore, user.id);
          }

          // Perform watering
          const result = treeService.water(user.id);

          // Verify: water count decreased by 1
          expect(result.waterCount).toBe(waterCount - 1);

          // Verify: grow score increased by WATERING_GROW_SCORE
          expect(result.growScore).toBe(initialGrowScore + WATERING_GROW_SCORE);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should throw NO_WATER_COUNT error when water count is 0', () => {
    fc.assert(
      fc.property(
        growScoreArb,
        speciesArb,
        (initialGrowScore, species) => {
          // Create user with 0 water count
          const user = userModel.create({
            openid: `test-no-water-${Date.now()}-${Math.random()}`,
            water_count: 0,
            last_water_recover_time: fixedTime,
            fertilize_count: 0,
            last_login_date: '2024-01-01',
            created_at: fixedTime,
          });

          // Select a tree species
          treeService.selectSpecies(user.id, species);

          // Set initial grow score
          if (initialGrowScore > 0) {
            db.prepare('UPDATE trees SET grow_score = ? WHERE user_id = ?').run(initialGrowScore, user.id);
          }

          // Watering should throw NO_WATER_COUNT
          try {
            treeService.water(user.id);
            // Should not reach here
            expect.fail('Expected NO_WATER_COUNT error to be thrown');
          } catch (error) {
            expect(error.code).toBe('NO_WATER_COUNT');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should throw TREE_NOT_SELECTED error when user has no tree', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        (waterCount) => {
          // Create user without selecting a tree
          const user = userModel.create({
            openid: `test-no-tree-${Date.now()}-${Math.random()}`,
            water_count: waterCount,
            last_water_recover_time: fixedTime,
            fertilize_count: 0,
            last_login_date: '2024-01-01',
            created_at: fixedTime,
          });

          // Do NOT select a tree species

          // Watering should throw TREE_NOT_SELECTED
          try {
            treeService.water(user.id);
            // Should not reach here
            expect.fail('Expected TREE_NOT_SELECTED error to be thrown');
          } catch (error) {
            expect(error.code).toBe('TREE_NOT_SELECTED');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
