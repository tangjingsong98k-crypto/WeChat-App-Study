import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDatabase } from '../../db/init.js';
import { createCardModel } from '../../models/cardModel.js';
import { createUserModel } from '../../models/userModel.js';

describe('cardModel', () => {
  let db;
  let cardModel;
  let userModel;
  let testUser;

  beforeEach(() => {
    db = initDatabase(':memory:');
    cardModel = createCardModel({ getDatabase: () => db });
    userModel = createUserModel({ getDatabase: () => db });

    // Create a test user
    const now = Date.now();
    testUser = userModel.create({
      openid: 'card-test-user',
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

  describe('getAllCards', () => {
    it('should return all seeded cards', () => {
      const cards = cardModel.getAllCards();
      expect(cards.length).toBe(16); // 4 + 4 + 4 + 4 from seed data
    });

    it('should have correct card structure', () => {
      const cards = cardModel.getAllCards();
      const card = cards[0];
      expect(card).toHaveProperty('id');
      expect(card).toHaveProperty('card_name');
      expect(card).toHaveProperty('card_icon');
      expect(card).toHaveProperty('card_quality');
      expect(card).toHaveProperty('card_possibility');
      expect(card).toHaveProperty('card_set_id');
    });
  });

  describe('getCardById', () => {
    it('should return a specific card', () => {
      const card = cardModel.getCardById(1);
      expect(card).toBeDefined();
      expect(card.id).toBe(1);
      expect(card.card_name).toBe('春之芽');
    });

    it('should return undefined for non-existent card', () => {
      const card = cardModel.getCardById(9999);
      expect(card).toBeUndefined();
    });
  });

  describe('getUserCards', () => {
    it('should return empty array for user with no cards', () => {
      const cards = cardModel.getUserCards(testUser.id);
      expect(cards).toEqual([]);
    });

    it('should return user cards with card details', () => {
      cardModel.addCardToUser(testUser.id, 1);
      cardModel.addCardToUser(testUser.id, 3);

      const cards = cardModel.getUserCards(testUser.id);
      expect(cards.length).toBe(2);
      expect(cards[0]).toHaveProperty('card_name');
      expect(cards[0]).toHaveProperty('card_quality');
      expect(cards[0]).toHaveProperty('owned_count');
    });
  });

  describe('addCardToUser', () => {
    it('should create a new user_card record with owned_count=1', () => {
      const result = cardModel.addCardToUser(testUser.id, 1);
      expect(result.user_id).toBe(testUser.id);
      expect(result.card_id).toBe(1);
      expect(result.owned_count).toBe(1);
    });

    it('should increment owned_count for existing user_card', () => {
      cardModel.addCardToUser(testUser.id, 1);
      const result = cardModel.addCardToUser(testUser.id, 1);
      expect(result.owned_count).toBe(2);
    });

    it('should handle multiple different cards independently', () => {
      cardModel.addCardToUser(testUser.id, 1);
      cardModel.addCardToUser(testUser.id, 2);
      cardModel.addCardToUser(testUser.id, 1);

      expect(cardModel.getUserCardCount(testUser.id, 1)).toBe(2);
      expect(cardModel.getUserCardCount(testUser.id, 2)).toBe(1);
    });
  });

  describe('getUserCardCount', () => {
    it('should return 0 for card not owned', () => {
      const count = cardModel.getUserCardCount(testUser.id, 1);
      expect(count).toBe(0);
    });

    it('should return correct count after adding cards', () => {
      cardModel.addCardToUser(testUser.id, 1);
      cardModel.addCardToUser(testUser.id, 1);
      cardModel.addCardToUser(testUser.id, 1);

      const count = cardModel.getUserCardCount(testUser.id, 1);
      expect(count).toBe(3);
    });
  });

  describe('getCardsBySetId', () => {
    it('should return cards belonging to a set', () => {
      const cards = cardModel.getCardsBySetId(1);
      expect(cards.length).toBe(4); // 四季之歌 set has 4 cards
      cards.forEach((card) => {
        expect(card.card_set_id).toBe(1);
      });
    });

    it('should return cards with no set (set_id = -1)', () => {
      const cards = cardModel.getCardsBySetId(-1);
      expect(cards.length).toBe(4); // 4 cards with no set
      cards.forEach((card) => {
        expect(card.card_set_id).toBe(-1);
      });
    });

    it('should return empty array for non-existent set', () => {
      const cards = cardModel.getCardsBySetId(999);
      expect(cards).toEqual([]);
    });
  });

  describe('getAllSets', () => {
    it('should return all card sets', () => {
      const sets = cardModel.getAllSets();
      expect(sets.length).toBe(3);
    });

    it('should have correct set structure', () => {
      const sets = cardModel.getAllSets();
      const set = sets[0];
      expect(set).toHaveProperty('id');
      expect(set).toHaveProperty('set_name');
      expect(set).toHaveProperty('effect_description');
    });
  });
});
