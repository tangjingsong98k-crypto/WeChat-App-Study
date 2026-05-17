const cardModel = require('../models/cardModel');
const { createCardModel } = require('../models/cardModel');
const { GAIN_CARD_POSSIBILITY } = require('../config');
const { getDb } = require('../db/init');

/**
 * Card Service - handles card acquisition, collection, and set completion logic.
 *
 * @param {object} [options] - Optional configuration
 * @param {function} [options.getDatabase] - Custom database getter (for testing)
 * @param {object} [options.cardModel] - Custom card model instance (for testing)
 * @param {function} [options.randomFn] - Custom random function (for testing), defaults to Math.random
 */
function createCardService(options = {}) {
  const getDatabase = options.getDatabase || getDb;
  const model = options.cardModel || (options.getDatabase ? createCardModel({ getDatabase: options.getDatabase }) : cardModel);
  const randomFn = options.randomFn || Math.random;

  return {
    /**
     * Try to gain a card for a user.
     *
     * Steps:
     * 1. Random check against GAIN_CARD_POSSIBILITY
     * 2. If passes: weighted random selection from all cards based on card_possibility
     * 3. Call addCardToUser to increment count
     * 4. Return the gained card or null
     *
     * @param {number} userId
     * @returns {object|null} the gained card with details, or null if no card gained
     */
    tryGainCard(userId) {
      // 1. Probability check
      if (randomFn() >= GAIN_CARD_POSSIBILITY) {
        return null;
      }

      // 2. Get all cards and perform weighted random selection
      const allCards = model.getAllCards();
      if (allCards.length === 0) {
        return null;
      }

      const selectedCard = this.weightedRandomSelect(allCards);
      if (!selectedCard) {
        return null;
      }

      // 3. Add card to user's collection
      model.addCardToUser(userId, selectedCard.id);

      // 4. Return the gained card
      return selectedCard;
    },

    /**
     * Perform weighted random selection from a list of cards.
     * Each card's card_possibility is used as its weight.
     *
     * @param {Array} cards - array of card objects with card_possibility field
     * @returns {object|null} the selected card or null if no valid cards
     */
    weightedRandomSelect(cards) {
      const totalWeight = cards.reduce((sum, card) => sum + card.card_possibility, 0);
      if (totalWeight <= 0) {
        return null;
      }

      let random = randomFn() * totalWeight;
      for (const card of cards) {
        random -= card.card_possibility;
        if (random <= 0) {
          return card;
        }
      }

      // Fallback: return last card (shouldn't normally reach here due to floating point)
      return cards[cards.length - 1];
    },

    /**
     * Get user's card collection.
     *
     * @param {number} userId
     * @returns {Array} user's cards with details
     */
    getUserCards(userId) {
      return model.getUserCards(userId);
    },

    /**
     * Get ALL cards with user's owned count (0 for unowned).
     * @param {number} userId
     * @returns {Array} all cards with owned_count field
     */
    getAllCardsWithOwnership(userId) {
      const allCards = model.getAllCards();
      const userCards = model.getUserCards(userId);
      const ownedMap = new Map();
      for (const uc of userCards) {
        ownedMap.set(uc.card_id, uc.owned_count);
      }
      return allCards.map(card => ({
        ...card,
        owned_count: ownedMap.get(card.id) || 0,
      }));
    },

    /**
     * Check set completion status for a user.
     * For each set, check if user owns at least 1 of every card in that set.
     *
     * @param {number} userId
     * @returns {Array} array of { setId, setName, effectDescription, completed: boolean }
     */
    checkSetCompletion(userId) {
      const allSets = model.getAllSets();
      const userCards = model.getUserCards(userId);

      // Build a map of cardId -> owned_count for quick lookup
      const ownedMap = new Map();
      for (const uc of userCards) {
        ownedMap.set(uc.card_id, uc.owned_count);
      }

      return allSets.map((set) => {
        const setCards = model.getCardsBySetId(set.id);
        const completed = setCards.length > 0 && setCards.every(
          (card) => (ownedMap.get(card.id) || 0) >= 1
        );

        return {
          setId: set.id,
          setName: set.set_name,
          effectDescription: set.effect_description,
          completed,
        };
      });
    },

    /**
     * Check if a user has completed a specific set.
     * @param {number} userId
     * @param {number} setId
     * @returns {boolean}
     */
    hasCompletedSet(userId, setId) {
      const userCards = model.getUserCards(userId);
      const setCards = model.getCardsBySetId(setId);
      if (setCards.length === 0) return false;

      const ownedMap = new Map();
      for (const uc of userCards) {
        ownedMap.set(uc.card_id, uc.owned_count);
      }

      return setCards.every((card) => (ownedMap.get(card.id) || 0) >= 1);
    },
  };
}

// Export a default instance and the factory
const defaultCardService = createCardService();

module.exports = defaultCardService;
module.exports.createCardService = createCardService;
