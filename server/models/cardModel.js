const { getDb } = require('../db/init');

/**
 * Card Model - handles CRUD operations for cards, card_sets, and user_cards tables.
 *
 * @param {object} [options] - Optional configuration
 * @param {function} [options.getDatabase] - Custom database getter (for testing)
 */
function createCardModel(options = {}) {
  const getDatabase = options.getDatabase || getDb;

  return {
    /**
     * Get all cards.
     * @returns {Array} all card records
     */
    getAllCards() {
      const db = getDatabase();
      return db.prepare('SELECT * FROM cards').all();
    },

    /**
     * Get a specific card by ID.
     * @param {number} cardId
     * @returns {object|undefined} card record or undefined
     */
    getCardById(cardId) {
      const db = getDatabase();
      return db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId);
    },

    /**
     * Get all user_cards for a user, joined with cards table.
     * @param {number} userId
     * @returns {Array} user card records with card details
     */
    getUserCards(userId) {
      const db = getDatabase();
      return db.prepare(`
        SELECT uc.id, uc.user_id, uc.card_id, uc.owned_count,
               c.card_name, c.card_icon, c.card_quality, c.card_possibility, c.card_set_id
        FROM user_cards uc
        JOIN cards c ON uc.card_id = c.id
        WHERE uc.user_id = ?
      `).all(userId);
    },

    /**
     * Add a card to user's collection (insert if not exists, increment if exists).
     * @param {number} userId
     * @param {number} cardId
     * @returns {object} the user_card record after update
     */
    addCardToUser(userId, cardId) {
      const db = getDatabase();
      const existing = db.prepare(
        'SELECT * FROM user_cards WHERE user_id = ? AND card_id = ?'
      ).get(userId, cardId);

      if (existing) {
        db.prepare(
          'UPDATE user_cards SET owned_count = owned_count + 1 WHERE user_id = ? AND card_id = ?'
        ).run(userId, cardId);
      } else {
        db.prepare(
          'INSERT INTO user_cards (user_id, card_id, owned_count) VALUES (?, ?, 1)'
        ).run(userId, cardId);
      }

      return db.prepare(
        'SELECT * FROM user_cards WHERE user_id = ? AND card_id = ?'
      ).get(userId, cardId);
    },

    /**
     * Get owned_count for a specific user+card combination.
     * @param {number} userId
     * @param {number} cardId
     * @returns {number} owned count (0 if not found)
     */
    getUserCardCount(userId, cardId) {
      const db = getDatabase();
      const row = db.prepare(
        'SELECT owned_count FROM user_cards WHERE user_id = ? AND card_id = ?'
      ).get(userId, cardId);
      return row ? row.owned_count : 0;
    },

    /**
     * Get all cards in a specific set.
     * @param {number} setId
     * @returns {Array} cards belonging to the set
     */
    getCardsBySetId(setId) {
      const db = getDatabase();
      return db.prepare('SELECT * FROM cards WHERE card_set_id = ?').all(setId);
    },

    /**
     * Get all card sets.
     * @returns {Array} all card set records
     */
    getAllSets() {
      const db = getDatabase();
      return db.prepare('SELECT * FROM card_sets').all();
    },
  };
}

// Export a default instance and the factory
const defaultCardModel = createCardModel();

module.exports = defaultCardModel;
module.exports.createCardModel = createCardModel;
