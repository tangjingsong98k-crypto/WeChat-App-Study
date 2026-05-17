import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { createWateringTimerService } from '../../services/wateringTimerService.js';
import { WATERING_RESUME_INTERVAL, MAX_WATERING_TIME } from '../../config.js';

/**
 * Feature: tree-growing-game, Property 1: 浇水次数惰性计算正确性
 *
 * For any initial water count `w` (0 ≤ w ≤ MAX_WATERING_TIME) and any elapsed time `t` (t ≥ 0),
 * the calculated available water count should equal:
 *   min(w + floor(t / WATERING_RESUME_INTERVAL), MAX_WATERING_TIME)
 *
 * **Validates: Requirements 3.1, 3.2**
 */
describe('Property 1: 浇水次数惰性计算正确性', () => {
  /**
   * Arbitrary: initial water count in range [0, MAX_WATERING_TIME]
   */
  const waterCountArb = fc.integer({ min: 0, max: MAX_WATERING_TIME });

  /**
   * Arbitrary: elapsed time in range [0, 86400000] ms (0 to 24 hours)
   */
  const elapsedTimeArb = fc.integer({ min: 0, max: 86400000 });

  it('should compute currentCount = min(w + floor(t / WATERING_RESUME_INTERVAL), MAX_WATERING_TIME)', () => {
    fc.assert(
      fc.property(
        waterCountArb,
        elapsedTimeArb,
        (initialWaterCount, elapsedTime) => {
          const baseTime = 1000000000000; // fixed base timestamp
          const now = baseTime + elapsedTime;

          // Create service with injected time
          const service = createWateringTimerService({
            now: () => now,
          });

          // Simulate a user object
          const user = {
            water_count: initialWaterCount,
            last_water_recover_time: baseTime,
          };

          const result = service.calculateAvailableWaterCount(user);

          // Expected formula: min(w + floor(t / WATERING_RESUME_INTERVAL), MAX_WATERING_TIME)
          const expectedCount = Math.min(
            initialWaterCount + Math.floor(elapsedTime / WATERING_RESUME_INTERVAL),
            MAX_WATERING_TIME
          );

          expect(result.currentCount).toBe(expectedCount);
        }
      ),
      { numRuns: 100 }
    );
  });
});
