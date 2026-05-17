import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { initDatabase } from '../../db/init.js';
import { createSettlementService } from '../../services/settlementService.js';
import { createTreeService } from '../../services/treeService.js';
import { createTreeModel } from '../../models/treeModel.js';
import { createUserModel } from '../../models/userModel.js';
import {
  DAILY_DECLINE_HEALTH_SCORE,
  LOW_HEALTH_SCORE,
  UPGRADE_NEED_GROW_SCORE,
} from '../../config.js';

/**
 * Feature: tree-growing-game, Property 6: 每日结算正确性
 *
 * For any user initial state (health_score h, grow_score g, level l),
 * after daily settlement:
 * 1. newHealthScore = max(h - DAILY_DECLINE_HEALTH_SCORE, 0)
 * 2. If newHealthScore < LOW_HEALTH_SCORE:
 *    deduction = floor((UPGRADE_NEED_GROW_SCORE[l+1] - UPGRADE_NEED_GROW_SCORE[l]) * 0.1)
 *    newGrowScore = max(g - deduction, 0)
 * 3. If newHealthScore >= LOW_HEALTH_SCORE: newGrowScore = g (unchanged)
 * 4. newLevel = calculateLevel(newGrowScore)
 *
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**
 */
describe('Property 6: 每日结算正确性', () => {
  let db;
  let settlementService;
  let treeService;
  let treeModel;
  let userModel;
  const fixedTime = 1000000000000;

  beforeEach(() => {
    db = initDatabase(':memory:');
    const getDatabase = () => db;
    userModel = createUserModel({ getDatabase });
    treeModel = createTreeModel({ getDatabase });
    treeService = createTreeService({ getDatabase });
    settlementService = createSettlementService({ getDatabase, treeModel, treeService });
  });

  afterEach(() => {
    db.close();
  });

  /**
   * Arbitrary: health score in range [0, 100]
   */
  const healthScoreArb = fc.integer({ min: 0, max: 100 });

  /**
   * Arbitrary: grow score in range [0, 6000]
   */
  const growScoreArb = fc.integer({ min: 0, max: 6000 });

  /**
   * Arbitrary: tree species
   */
  const speciesArb = fc.constantFrom('apple', 'cherry', 'oak');

  it('should correctly settle daily: health decline, grow deduction when low health, and level recalculation', () => {
    fc.assert(
      fc.property(
        healthScoreArb,
        growScoreArb,
        speciesArb,
        (initialHealth, initialGrow, species) => {
          // Calculate the level from grow_score (consistent with calculateLevel)
          const initialLevel = treeService.calculateLevel(initialGrow);

          // Create user with a tree at the given state
          const user = userModel.create({
            openid: `test-settle-${Date.now()}-${Math.random()}`,
            water_count: 50,
            last_water_recover_time: fixedTime,
            fertilize_count: 0,
            last_login_date: '2024-01-01',
            created_at: fixedTime,
          });

          // Create tree for the user
          treeModel.create(user.id, species);

          // Set initial state directly in DB
          db.prepare('UPDATE trees SET health_score = ?, grow_score = ?, level = ? WHERE user_id = ?')
            .run(initialHealth, initialGrow, initialLevel, user.id);

          // Execute settlement
          const result = settlementService.settleUser(user.id);

          // Verify property a: newHealthScore = max(h - DAILY_DECLINE_HEALTH_SCORE, 0)
          const expectedHealth = Math.max(initialHealth - DAILY_DECLINE_HEALTH_SCORE, 0);
          expect(result.healthScore).toBe(expectedHealth);

          // Verify properties b and c: grow score deduction logic
          let expectedGrow;
          if (expectedHealth < LOW_HEALTH_SCORE) {
            // Low health: deduct grow score
            let deduction;
            if (initialLevel >= UPGRADE_NEED_GROW_SCORE.length - 1) {
              // Max level: use the last interval
              const lastIdx = UPGRADE_NEED_GROW_SCORE.length - 1;
              deduction = Math.floor(
                (UPGRADE_NEED_GROW_SCORE[lastIdx] - UPGRADE_NEED_GROW_SCORE[lastIdx - 1]) * 0.1
              );
            } else {
              deduction = Math.floor(
                (UPGRADE_NEED_GROW_SCORE[initialLevel + 1] - UPGRADE_NEED_GROW_SCORE[initialLevel]) * 0.1
              );
            }
            expectedGrow = Math.max(initialGrow - deduction, 0);
          } else {
            // Health is sufficient: grow score unchanged
            expectedGrow = initialGrow;
          }
          expect(result.growScore).toBe(expectedGrow);

          // Verify property d: newLevel = calculateLevel(newGrowScore)
          const expectedLevel = treeService.calculateLevel(expectedGrow);
          expect(result.level).toBe(expectedLevel);
        }
      ),
      { numRuns: 100 }
    );
  });
});
