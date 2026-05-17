import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDatabase } from '../../db/init.js';
import { createCardModel } from '../../models/cardModel.js';
import { createCardService } from '../../services/cardService.js';
import { createUserModel } from '../../models/userModel.js';

describe('cardService', () => {
  let db;
  let cardModel;
  let cardService;
  let userModel;
  let testUser;

  beforeEach(() => {
    db = initDatabase(':memory:');
    cardModel = createCardModel({ getDatabase: () => db });
    userModel = createUserModel({ getDatabase: () => db });

    // Create a test user
    const now = Date.now();
    testUser = userModel.create({
      openid: 'card-service-test-user',
      water_count: 50,
      last_water_recover_time: now,
      fertilize_count: 0,
      last_login_date: '2024-01-01',
      created_at: now,
    });
  });

  afterEach(() => {
    db.close();
  });

  describe('tryGainCard', () => {
    it('should return null when probability check fails', () => {
      // randomFn returns 0.5 which is >= 0.1 (GAIN_CARD_POSSIBILITY)
      cardService = createCardService({
        getDatabase: () => db,
        randomFn: () => 0.5,
      });

      const result = cardService.tryGainCard(testUser.id);
      expect(result).toBeNull();
    });

    it('should return a card when probability check passes', () => {
      let callCount = 0;
      // First call: 0.05 (passes probability check < 0.1)
      // Second call: 0.5 (used for weighted selection)
      cardService = createCardService({
        getDatabase: () => db,
        randomFn: () => {
          callCount++;
          return callCount === 1 ? 0.05 : 0.5;
        },
      });

      const result = cardService.tryGainCard(testUser.id);
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('card_name');
      expect(result).toHaveProperty('card_quality');
    });

    it('should add the card to user collection when gained', () => {
      let callCount = 0;
      cardService = createCardService({
        getDatabase: () => db,
        randomFn: () => {
          callCount++;
          return callCount === 1 ? 0.05 : 0.01; // Will select first card (highest weight)
        },
      });

      const result = cardService.tryGainCard(testUser.id);
      expect(result).not.toBeNull();

      const count = cardModel.getUserCardCount(testUser.id, result.id);
      expect(count).toBe(1);
    });

    it('should increment count when gaining same card again', () => {
      let callCount = 0;
      cardService = createCardService({
        getDatabase: () => db,
        randomFn: () => {
          callCount++;
          // Always pass probability check and select same card (very low random for weighted)
          return callCount % 2 === 1 ? 0.05 : 0.01;
        },
      });

      const first = cardService.tryGainCard(testUser.id);
      callCount = 0; // Reset for second call
      const second = cardService.tryGainCard(testUser.id);

      // Both should select the same card (first card with highest weight)
      expect(first.id).toBe(second.id);
      const count = cardModel.getUserCardCount(testUser.id, first.id);
      expect(count).toBe(2);
    });
  });

  describe('weightedRandomSelect', () => {
    it('should select card based on weights', () => {
      cardService = createCardService({
        getDatabase: () => db,
        randomFn: () => 0.01, // Very low random - should select first card
      });

      const cards = [
        { id: 1, card_possibility: 50 },
        { id: 2, card_possibility: 30 },
        { id: 3, card_possibility: 20 },
      ];

      const selected = cardService.weightedRandomSelect(cards);
      expect(selected.id).toBe(1);
    });

    it('should select last card with high random value', () => {
      cardService = createCardService({
        getDatabase: () => db,
        randomFn: () => 0.99, // Very high random - should select last card
      });

      const cards = [
        { id: 1, card_possibility: 10 },
        { id: 2, card_possibility: 10 },
        { id: 3, card_possibility: 80 },
      ];

      const selected = cardService.weightedRandomSelect(cards);
      expect(selected.id).toBe(3);
    });

    it('should return null for empty cards array', () => {
      cardService = createCardService({
        getDatabase: () => db,
        randomFn: () => 0.5,
      });

      const selected = cardService.weightedRandomSelect([]);
      expect(selected).toBeNull();
    });

    it('should return null when total weight is 0', () => {
      cardService = createCardService({
        getDatabase: () => db,
        randomFn: () => 0.5,
      });

      const cards = [
        { id: 1, card_possibility: 0 },
        { id: 2, card_possibility: 0 },
      ];

      const selected = cardService.weightedRandomSelect(cards);
      expect(selected).toBeNull();
    });
  });

  describe('getUserCards', () => {
    it('should return empty array for user with no cards', () => {
      cardService = createCardService({ getDatabase: () => db });

      const cards = cardService.getUserCards(testUser.id);
      expect(cards).toEqual([]);
    });

    it('should return user cards with details', () => {
      cardModel.addCardToUser(testUser.id, 1);
      cardModel.addCardToUser(testUser.id, 2);
      cardService = createCardService({ getDatabase: () => db });

      const cards = cardService.getUserCards(testUser.id);
      expect(cards.length).toBe(2);
      expect(cards[0]).toHaveProperty('card_name');
      expect(cards[0]).toHaveProperty('owned_count');
    });
  });

  describe('checkSetCompletion', () => {
    beforeEach(() => {
      cardService = createCardService({ getDatabase: () => db });
    });

    it('should return all sets as incomplete when user has no cards', () => {
      const sets = cardService.checkSetCompletion(testUser.id);
      expect(sets.length).toBe(3);
      sets.forEach((set) => {
        expect(set.completed).toBe(false);
      });
    });

    it('should mark set as complete when user owns all cards in set', () => {
      // Set 1 (四季之歌) has cards 1, 2, 3, 4
      cardModel.addCardToUser(testUser.id, 1);
      cardModel.addCardToUser(testUser.id, 2);
      cardModel.addCardToUser(testUser.id, 3);
      cardModel.addCardToUser(testUser.id, 4);

      const sets = cardService.checkSetCompletion(testUser.id);
      const set1 = sets.find((s) => s.setId === 1);
      expect(set1.completed).toBe(true);
    });

    it('should not mark set as complete when missing one card', () => {
      // Set 1 has cards 1, 2, 3, 4 - only add 3 of them
      cardModel.addCardToUser(testUser.id, 1);
      cardModel.addCardToUser(testUser.id, 2);
      cardModel.addCardToUser(testUser.id, 3);

      const sets = cardService.checkSetCompletion(testUser.id);
      const set1 = sets.find((s) => s.setId === 1);
      expect(set1.completed).toBe(false);
    });

    it('should return correct structure for each set', () => {
      const sets = cardService.checkSetCompletion(testUser.id);
      const set = sets[0];
      expect(set).toHaveProperty('setId');
      expect(set).toHaveProperty('setName');
      expect(set).toHaveProperty('effectDescription');
      expect(set).toHaveProperty('completed');
    });

    it('should handle multiple sets independently', () => {
      // Complete set 1 (cards 1-4) but not set 2 (cards 5-8)
      cardModel.addCardToUser(testUser.id, 1);
      cardModel.addCardToUser(testUser.id, 2);
      cardModel.addCardToUser(testUser.id, 3);
      cardModel.addCardToUser(testUser.id, 4);
      // Only add some cards from set 2
      cardModel.addCardToUser(testUser.id, 5);

      const sets = cardService.checkSetCompletion(testUser.id);
      const set1 = sets.find((s) => s.setId === 1);
      const set2 = sets.find((s) => s.setId === 2);
      expect(set1.completed).toBe(true);
      expect(set2.completed).toBe(false);
    });
  });
});
