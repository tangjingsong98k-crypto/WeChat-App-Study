import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { createTreeService } from '../../services/treeService.js';
import { UPGRADE_NEED_GROW_SCORE } from '../../config.js';

/**
 * Feature: tree-growing-game, Property 5: 等级计算一致性
 *
 * For any non-negative grow score `g` and the upgrade threshold config `UPGRADE_NEED_GROW_SCORE`,
 * the calculated level should be the maximum level where UPGRADE_NEED_GROW_SCORE[level] <= g.
 * This property covers both upgrade and downgrade scenarios.
 *
 * **Validates: Requirements 5.1, 5.2, 6.5**
 */
describe('Property 5: 等级计算一致性', () => {
  const treeService = createTreeService({});

  const maxLevel = UPGRADE_NEED_GROW_SCORE.length - 1;

  /**
   * Arbitrary: grow score in range [0, 10000]
   */
  const growScoreArb = fc.integer({ min: 0, max: 10000 });

  it('should calculate level as the maximum level where UPGRADE_NEED_GROW_SCORE[level] <= growScore', () => {
    fc.assert(
      fc.property(
        growScoreArb,
        (growScore) => {
          const level = treeService.calculateLevel(growScore);

          // The calculated level must satisfy: UPGRADE_NEED_GROW_SCORE[level] <= growScore
          expect(UPGRADE_NEED_GROW_SCORE[level]).toBeLessThanOrEqual(growScore);

          // If level < maxLevel, then UPGRADE_NEED_GROW_SCORE[level + 1] > growScore
          // (i.e., the next level's threshold is not yet reached)
          if (level < maxLevel) {
            expect(UPGRADE_NEED_GROW_SCORE[level + 1]).toBeGreaterThan(growScore);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
