const { getDb } = require('../db/init');

/**
 * Ranking Model - handles CRUD operations for the user_rankings table.
 *
 * @param {object} [options] - Optional configuration
 * @param {function} [options.getDatabase] - Custom database getter (for testing)
 */
function createRankingModel(options = {}) {
  const getDatabase = options.getDatabase || getDb;

  return {
    /**
     * Get a user's participation record.
     * @param {number} userId
     * @returns {object|undefined} ranking record or undefined
     */
    getParticipation(userId) {
      const db = getDatabase();
      return db.prepare('SELECT * FROM user_rankings WHERE user_id = ?').get(userId);
    },

    /**
     * Insert or update a user's participation status.
     * @param {number} userId
     * @param {number} participate - 0 or 1
     * @returns {object} the user_rankings record after update
     */
    setParticipation(userId, participate) {
      const db = getDatabase();
      const existing = db.prepare('SELECT * FROM user_rankings WHERE user_id = ?').get(userId);

      if (existing) {
        db.prepare('UPDATE user_rankings SET participate = ? WHERE user_id = ?').run(participate, userId);
      } else {
        db.prepare('INSERT INTO user_rankings (user_id, participate) VALUES (?, ?)').run(userId, participate);
      }

      return db.prepare('SELECT * FROM user_rankings WHERE user_id = ?').get(userId);
    },

    /**
     * Get all users with participate=1.
     * @returns {Array} all participating user ranking records
     */
    getAllParticipants() {
      const db = getDatabase();
      return db.prepare('SELECT * FROM user_rankings WHERE participate = 1').all();
    },

    /**
     * Get friends' participants for a user.
     * For now, returns all participants (friends system not implemented).
     * @param {number} userId
     * @returns {Array} all participating user ranking records
     */
    getFriendsParticipants(userId) {
      const db = getDatabase();
      return db.prepare('SELECT * FROM user_rankings WHERE participate = 1').all();
    },
  };
}

// Export a default instance and the factory
const defaultRankingModel = createRankingModel();

module.exports = defaultRankingModel;
module.exports.createRankingModel = createRankingModel;
