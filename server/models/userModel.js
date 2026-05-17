const { getDb } = require('../db/init');

/**
 * User Model - handles CRUD operations for the users table.
 *
 * @param {object} [options] - Optional configuration
 * @param {function} [options.getDatabase] - Custom database getter (for testing)
 */
function createUserModel(options = {}) {
  const getDatabase = options.getDatabase || getDb;

  return {
    /**
     * Find a user by their WeChat openid.
     * @param {string} openid
     * @returns {object|undefined} user row or undefined
     */
    findByOpenid(openid) {
      const db = getDatabase();
      return db.prepare('SELECT * FROM users WHERE openid = ?').get(openid);
    },

    /**
     * Find a user by their id.
     * @param {number} id
     * @returns {object|undefined} user row or undefined
     */
    findById(id) {
      const db = getDatabase();
      return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    },

    /**
     * Create a new user record.
     * @param {object} userData
     * @param {string} userData.openid
     * @param {string} [userData.nickname]
     * @param {string} [userData.avatar_url]
     * @param {number} userData.water_count
     * @param {number} userData.last_water_recover_time
     * @param {number} userData.fertilize_count
     * @param {string} userData.last_login_date
     * @param {number} userData.created_at
     * @returns {object} the created user
     */
    create(userData) {
      const db = getDatabase();
      const stmt = db.prepare(`
        INSERT INTO users (openid, nickname, avatar_url, water_count, last_water_recover_time, fertilize_count, last_login_date, created_at)
        VALUES (@openid, @nickname, @avatar_url, @water_count, @last_water_recover_time, @fertilize_count, @last_login_date, @created_at)
      `);
      const result = stmt.run({
        openid: userData.openid,
        nickname: userData.nickname || null,
        avatar_url: userData.avatar_url || null,
        water_count: userData.water_count,
        last_water_recover_time: userData.last_water_recover_time,
        fertilize_count: userData.fertilize_count,
        last_login_date: userData.last_login_date,
        created_at: userData.created_at,
      });
      return this.findById(result.lastInsertRowid);
    },

    /**
     * Update user fields by id.
     * @param {number} id
     * @param {object} data - key/value pairs to update
     * @returns {object|undefined} the updated user or undefined
     */
    update(id, data) {
      const db = getDatabase();
      const keys = Object.keys(data);
      if (keys.length === 0) return this.findById(id);

      const setClause = keys.map((key) => `${key} = @${key}`).join(', ');
      const stmt = db.prepare(`UPDATE users SET ${setClause} WHERE id = @id`);
      stmt.run({ ...data, id });
      return this.findById(id);
    },
  };
}

// Export a default instance and the factory
const defaultUserModel = createUserModel();

module.exports = defaultUserModel;
module.exports.createUserModel = createUserModel;
