const { getDb } = require('../db/init');

/**
 * Tree Model - handles CRUD operations for the trees table.
 *
 * @param {object} [options] - Optional configuration
 * @param {function} [options.getDatabase] - Custom database getter (for testing)
 */
function createTreeModel(options = {}) {
  const getDatabase = options.getDatabase || getDb;

  return {
    /**
     * Create a new tree record for a user.
     * @param {number} userId
     * @param {string} species - one of 'apple', 'cherry', 'oak'
     * @returns {object} the created tree record
     */
    create(userId, species) {
      const db = getDatabase();
      const stmt = db.prepare(`
        INSERT INTO trees (user_id, species, level, grow_score, health_score)
        VALUES (?, ?, 0, 0, 30)
      `);
      const result = stmt.run(userId, species);
      return this.findByUserId(userId);
    },

    /**
     * Find a tree by user ID.
     * @param {number} userId
     * @returns {object|undefined} tree row or undefined
     */
    findByUserId(userId) {
      const db = getDatabase();
      return db.prepare('SELECT * FROM trees WHERE user_id = ?').get(userId);
    },

    /**
     * Update tree fields by user ID.
     * @param {number} userId
     * @param {object} data - key/value pairs to update
     * @returns {object|undefined} the updated tree or undefined
     */
    update(userId, data) {
      const db = getDatabase();
      const keys = Object.keys(data);
      if (keys.length === 0) return this.findByUserId(userId);

      const setClause = keys.map((key) => `${key} = @${key}`).join(', ');
      const stmt = db.prepare(`UPDATE trees SET ${setClause} WHERE user_id = @user_id`);
      stmt.run({ ...data, user_id: userId });
      return this.findByUserId(userId);
    },

    /**
     * Delete a tree record by user ID (for testing).
     * @param {number} userId
     * @returns {boolean} true if a row was deleted
     */
    delete(userId) {
      const db = getDatabase();
      const result = db.prepare('DELETE FROM trees WHERE user_id = ?').run(userId);
      return result.changes > 0;
    },
  };
}

// Export a default instance and the factory
const defaultTreeModel = createTreeModel();

module.exports = defaultTreeModel;
module.exports.createTreeModel = createTreeModel;
