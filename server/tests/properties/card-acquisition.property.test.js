import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { initDatabase } from '../../db/init.js';
import { createCardModel } from '../../models/cardModel.js';
import { createUserModel } from '../../models/userModel.js';

/**
 * Feature: tree-growing-game, Property 7: 卡牌获取数量递增
 *
 * For any user and any card, when the system determines that the user gains that card,
 * the user's owned_count for that card should increase by exactly 1,
 * and all other cards' owned_count should remain unchanged.
 *
 * **Validates: Requirements 7.3**
 */
describe('Property 7: 卡牌获取数量递增', () => {
  let db;
  let cardModel;
  let userModel;

  beforeEach(() => {
    db = initDatabase(':memory:');
    const getDatabase = () => db;
    cardModel = createCardModel({ getDatabase });
    userModel = createUserModel({ getDatabase });
  });

  afterEach(() => {
    db.close();
  });

  /**
   * Arbitrary: card ID from seeded cards (1-16)
   */
  const cardIdArb = fc.integer({ min: 1, max: 16 });

  it('should increase owned_count by exactly 1 for the target card and leave other cards unchanged', () => {
    fc.assert(
      fc.property(
        cardIdArb,
        (cardId) => {
          // Create a fresh user for each iteration
          const user = userModel.create({
            openid: `test-card-${Date.now()}-${Math.random()}`,
            water_count: 50,
            last_water_recover_time: Date.now(),
            fertilize_count: 0,
            last_login_date: '2024-01-01',
            created_at: Date.now(),
          });

          // Record initial owned_count for the target card
          const initialTargetCount = cardModel.getUserCardCount(user.id, cardId);

          // Record initial owned_count for all other cards (1-16)
          const initialOtherCounts = {};
          for (let id = 1; id <= 16; id++) {
            if (id !== cardId) {
              initialOtherCounts[id] = cardModel.getUserCardCount(user.id, id);
            }
          }

          // Add the card to the user
          cardModel.addCardToUser(user.id, cardId);

          // Verify: target card's owned_count increased by exactly 1
          const newTargetCount = cardModel.getUserCardCount(user.id, cardId);
          expect(newTargetCount).toBe(initialTargetCount + 1);

          // Verify: all other cards' owned_count remain unchanged
          for (let id = 1; id <= 16; id++) {
            if (id !== cardId) {
              const newCount = cardModel.getUserCardCount(user.id, id);
              expect(newCount).toBe(initialOtherCounts[id]);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should correctly increment owned_count on repeated acquisitions of the same card', () => {
    fc.assert(
      fc.property(
        cardIdArb,
        fc.integer({ min: 1, max: 5 }),
        (cardId, timesToAdd) => {
          // Create a fresh user
          const user = userModel.create({
            openid: `test-card-repeat-${Date.now()}-${Math.random()}`,
            water_count: 50,
            last_water_recover_time: Date.now(),
            fertilize_count: 0,
            last_login_date: '2024-01-01',
            created_at: Date.now(),
          });

          // Record initial count (should be 0 for a new user)
          const initialCount = cardModel.getUserCardCount(user.id, cardId);

          // Add the same card multiple times
          for (let i = 0; i < timesToAdd; i++) {
            cardModel.addCardToUser(user.id, cardId);
          }

          // Verify: owned_count increased by exactly timesToAdd
          const finalCount = cardModel.getUserCardCount(user.id, cardId);
          expect(finalCount).toBe(initialCount + timesToAdd);
        }
      ),
      { numRuns: 100 }
    );
  });
});
