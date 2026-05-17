const rankingModel = require('../models/rankingModel');
const { createRankingModel } = require('../models/rankingModel');
const { getDb } = require('../db/init');

/**
 * Ranking Service - handles ranking business logic including
 * retrieving rankings and toggling participation.
 *
 * @param {object} [options] - Optional configuration
 * @param {function} [options.getDatabase] - Custom database getter (for testing)
 * @param {object} [options.rankingModel] - Custom ranking model instance (for testing)
 */
function createRankingService(options = {}) {
  const getDatabase = options.getDatabase || getDb;
  const model = options.rankingModel || (options.getDatabase ? createRankingModel({ getDatabase: options.getDatabase }) : rankingModel);

  return {
    /**
     * Get all participating users with their tree info, sorted by grow_score descending.
     * Joins user_rankings with trees and users tables.
     *
     * @returns {Array} array of { userId, nickname, growScore, level, species }
     */
    getAllRanking() {
      const db = getDatabase();
      const rows = db.prepare(`
        SELECT u.id AS user_id, u.nickname, t.grow_score, t.level, t.species
        FROM user_rankings ur
        JOIN users u ON ur.user_id = u.id
        JOIN trees t ON t.user_id = u.id
        WHERE ur.participate = 1
        ORDER BY t.grow_score DESC
      `).all();

      return rows.map((row) => ({
        userId: row.user_id,
        nickname: row.nickname,
        growScore: row.grow_score,
        level: row.level,
        species: row.species,
      }));
    },

    /**
     * Get friends ranking for a user.
     * For now, returns the same as getAllRanking (friends system not implemented).
     *
     * @param {number} userId
     * @returns {Array} array of { userId, nickname, growScore, level, species }
     */
    getFriendsRanking(userId) {
      return this.getAllRanking();
    },

    /**
     * Toggle a user's participation status in the ranking.
     *
     * @param {number} userId
     * @param {number} participate - 0 or 1
     * @returns {object} { participate }
     */
    toggleParticipation(userId, participate) {
      model.setParticipation(userId, participate ? 1 : 0);
      return { participate: participate ? 1 : 0 };
    },

    /**
     * Get a user's current participation status.
     *
     * @param {number} userId
     * @returns {object} { participate } - 0 or 1 (defaults to 0 if no record)
     */
    getUserParticipation(userId) {
      const record = model.getParticipation(userId);
      return { participate: record ? record.participate : 0 };
    },
  };
}

// Export a default instance and the factory
const defaultRankingService = createRankingService();

module.exports = defaultRankingService;
module.exports.createRankingService = createRankingService;
