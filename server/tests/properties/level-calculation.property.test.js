import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { createTreeService } from '../../services/treeService.js';
import { UPGRADE_NEED_GROW_SCORE } from '../../config.js';

/**
 * Feature: tree-growing-game, Property 5: 等级计算一致性
 *
 * For any non-negative grow score `g` and the upgrade threshold config `UPGRADE_NEED_GROW_SCORE`,
 * the calculated level should be consistent:
 * - For levels within the array: UPGRADE_NEED_GROW_SCORE[level] <= g < UPGRADE_NEED_GROW_SCORE[level+1]
 * - For levels beyond the array: uses fixed increment (last interval) per level
 *
 * **Validates: Requirements 5.1, 5.2, 6.5**
 */
describe('Property 5: 等级计算一致性', () => {
  const treeService = createTreeService({});

  const maxIdx = UPGRADE_NEED_GROW_SCORE.length - 1;
  const lastInterval = UPGRADE_NEED_GROW_SCORE[maxIdx] - UPGRADE_NEED_GROW_SCORE[maxIdx - 1];

  /**
   * Arbitrary: grow score in range [0, 20000]
   */
  const growScoreArb = fc.integer({ min: 0, max: 20000 });

  it('should calculate level consistently for any grow score', () => {
    fc.assert(
      fc.property(
        growScoreArb,
        (growScore) => {
          const level = treeService.calculateLevel(growScore);

          // Level must be non-negative
          expect(level).toBeGreaterThanOrEqual(0);

          // Calculate the threshold for this level
          let levelThreshold;
          if (level <= maxIdx) {
            levelThreshold = UPGRADE_NEED_GROW_SCORE[level];
          } else {
            levelThreshold = UPGRADE_NEED_GROW_SCORE[maxIdx] + (level - maxIdx) * lastInterval;
          }

          // growScore must be >= threshold for this level
          expect(growScore).toBeGreaterThanOrEqual(levelThreshold);

          // growScore must be < threshold for next level
          let nextThreshold;
          if (level + 1 <= maxIdx) {
            nextThreshold = UPGRADE_NEED_GROW_SCORE[level + 1];
          } else {
            nextThreshold = UPGRADE_NEED_GROW_SCORE[maxIdx] + (level + 1 - maxIdx) * lastInterval;
          }
          expect(growScore).toBeLessThan(nextThreshold);
        }
      ),
      { numRuns: 200 }
    );
  });
});
