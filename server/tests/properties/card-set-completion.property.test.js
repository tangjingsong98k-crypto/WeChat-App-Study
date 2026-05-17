import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { initDatabase } from '../../db/init.js';
import { createCardModel } from '../../models/cardModel.js';
import { createCardService } from '../../services/cardService.js';
import { createUserModel } from '../../models/userModel.js';

/**
 * Feature: tree-growing-game, Property 8: 套装完成判定正确性
 *
 * For any set and any user's card ownership state,
 * a set is marked complete if and only if every card in that set has owned_count >= 1.
 *
 * **Validates: Requirements 8.2**
 */
describe('Property 8: 套装完成判定正确性', () => {
  let db;
  let cardModel;
  let cardService;
  let userModel;

  beforeEach(() => {
    db = initDatabase(':memory:');
    const getDatabase = () => db;
    cardModel = createCardModel({ getDatabase });
    cardService = createCardService({ getDatabase });
    userModel = createUserModel({ getDatabase });
  });

  afterEach(() => {
    db.close();
  });

  /**
   * Arbitrary: for each card in each set, randomly decide if the user owns it.
   * Sets:
   *   Set 1 (四季之歌): cards 1, 2, 3, 4
   *   Set 2 (森林守护者): cards 5, 6, 7, 8
   *   Set 3 (彩虹花园): cards 9, 10, 11, 12
   *   Cards 13-16 have card_set_id = -1 (no set)
   *
   * We generate a boolean array of length 12 representing ownership for cards 1-12.
   */
  const ownershipArb = fc.array(fc.boolean(), { minLength: 12, maxLength: 12 });

  it('should mark a set as complete if and only if every card in that set has owned_count >= 1', () => {
    fc.assert(
      fc.property(
        ownershipArb,
        (ownership) => {
          // Create a fresh user for each iteration
          const user = userModel.create({
            openid: `test-set-${Date.now()}-${Math.random()}`,
            water_count: 50,
            last_water_recover_time: Date.now(),
            fertilize_count: 0,
            last_login_date: '2024-01-01',
            created_at: Date.now(),
          });

          // Add cards to user's collection based on random ownership
          for (let i = 0; i < 12; i++) {
            if (ownership[i]) {
              cardModel.addCardToUser(user.id, i + 1);
            }
          }

          // Check set completion
          const setResults = cardService.checkSetCompletion(user.id);

          // Verify each set's completion status
          // Set 1 (id=1): cards 1, 2, 3, 4 -> ownership[0], ownership[1], ownership[2], ownership[3]
          const set1Expected = ownership[0] && ownership[1] && ownership[2] && ownership[3];
          // Set 2 (id=2): cards 5, 6, 7, 8 -> ownership[4], ownership[5], ownership[6], ownership[7]
          const set2Expected = ownership[4] && ownership[5] && ownership[6] && ownership[7];
          // Set 3 (id=3): cards 9, 10, 11, 12 -> ownership[8], ownership[9], ownership[10], ownership[11]
          const set3Expected = ownership[8] && ownership[9] && ownership[10] && ownership[11];

          const set1Result = setResults.find(s => s.setId === 1);
          const set2Result = setResults.find(s => s.setId === 2);
          const set3Result = setResults.find(s => s.setId === 3);

          expect(set1Result.completed).toBe(set1Expected);
          expect(set2Result.completed).toBe(set2Expected);
          expect(set3Result.completed).toBe(set3Expected);

          // Also verify the structure of the results
          expect(set1Result.setName).toBe('四季之歌');
          expect(set2Result.setName).toBe('森林守护者');
          expect(set3Result.setName).toBe('彩虹花园');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should mark a set as incomplete if any card in that set has owned_count = 0', () => {
    fc.assert(
      fc.property(
        // Generate a set index (0-2) and a card index within that set to leave unowned
        fc.integer({ min: 0, max: 2 }),
        fc.integer({ min: 0, max: 3 }),
        (setIndex, missingCardIndex) => {
          // Create a fresh user
          const user = userModel.create({
            openid: `test-incomplete-${Date.now()}-${Math.random()}`,
            water_count: 50,
            last_water_recover_time: Date.now(),
            fertilize_count: 0,
            last_login_date: '2024-01-01',
            created_at: Date.now(),
          });

          // Add all cards in the target set EXCEPT the missing one
          const setStartCardId = setIndex * 4 + 1;
          for (let i = 0; i < 4; i++) {
            if (i !== missingCardIndex) {
              cardModel.addCardToUser(user.id, setStartCardId + i);
            }
          }

          // Check set completion
          const setResults = cardService.checkSetCompletion(user.id);
          const targetSet = setResults.find(s => s.setId === setIndex + 1);

          // The set should be incomplete since one card is missing
          expect(targetSet.completed).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
