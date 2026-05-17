import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDatabase } from '../../db/init.js';
import { createUserService } from '../../services/userService.js';

describe('userService', () => {
  let db;
  let userService;

  beforeEach(() => {
    db = initDatabase(':memory:');
    userService = createUserService({ getDatabase: () => db });
  });

  afterEach(() => {
    db.close();
  });

  describe('login', () => {
    it('should create a new user on first login', () => {
      const result = userService.login('new-user-code');

      expect(result.token).toBe('new-user-code');
      expect(result.userData).toBeDefined();
      expect(result.userData.openid).toBe('new-user-code');
      expect(result.userData.water_count).toBe(50); // MAX_WATERING_TIME
      expect(result.userData.fertilize_count).toBe(1); // MAX_FERTILIZE_COUNT
      expect(result.userData.tree).toBeNull();
    });

    it('should initialize user with correct default values', () => {
      const result = userService.login('defaults-test');

      const user = result.userData;
      expect(user.water_count).toBe(50);
      expect(user.fertilize_count).toBe(1); // MAX_FERTILIZE_COUNT
      expect(user.last_water_recover_time).toBeGreaterThan(0);
      expect(user.created_at).toBeGreaterThan(0);
      expect(user.last_login_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should return existing user on subsequent login same day', () => {
      const first = userService.login('returning-user');
      const userId = first.userData.id;

      const second = userService.login('returning-user');
      expect(second.userData.id).toBe(userId);
      expect(second.token).toBe('returning-user');
    });

    it('should recover fertilize count on login on a new day', () => {
      userService.login('daily-recover');

      // Simulate yesterday's login date
      const user = db.prepare('SELECT * FROM users WHERE openid = ?').get('daily-recover');
      db.prepare('UPDATE users SET last_login_date = ?, fertilize_count = 0 WHERE id = ?')
        .run('2020-01-01', user.id);

      // Login again (new day)
      const result = userService.login('daily-recover');
      expect(result.userData.fertilize_count).toBe(1); // DAILY_FERTILIZE_RESUME_TIMES = 1
    });

    it('should not exceed MAX_FERTILIZE_COUNT when recovering', () => {
      userService.login('max-fertilize');

      const user = db.prepare('SELECT * FROM users WHERE openid = ?').get('max-fertilize');
      db.prepare('UPDATE users SET last_login_date = ?, fertilize_count = ? WHERE id = ?')
        .run('2020-01-01', 1, user.id); // Already at max (MAX_FERTILIZE_COUNT = 1)

      const result = userService.login('max-fertilize');
      expect(result.userData.fertilize_count).toBe(1); // Capped at MAX_FERTILIZE_COUNT
    });

    it('should include tree data if user has selected a tree', () => {
      const result = userService.login('tree-user');
      db.prepare('INSERT INTO trees (user_id, species, level, grow_score, health_score) VALUES (?, ?, ?, ?, ?)')
        .run(result.userData.id, 'apple', 0, 0, 30);

      const second = userService.login('tree-user');
      expect(second.userData.tree).toBeDefined();
      expect(second.userData.tree.species).toBe('apple');
      expect(second.userData.tree.health_score).toBe(30);
    });
  });

  describe('getUserInfo', () => {
    it('should return user info with tree data', () => {
      const loginResult = userService.login('info-user');
      db.prepare('INSERT INTO trees (user_id, species, level, grow_score, health_score) VALUES (?, ?, ?, ?, ?)')
        .run(loginResult.userData.id, 'cherry', 2, 350, 80);

      const info = userService.getUserInfo(loginResult.userData.id);
      expect(info).toBeDefined();
      expect(info.openid).toBe('info-user');
      expect(info.tree).toBeDefined();
      expect(info.tree.species).toBe('cherry');
      expect(info.tree.level).toBe(2);
    });

    it('should return null for non-existent user', () => {
      const info = userService.getUserInfo(9999);
      expect(info).toBeNull();
    });

    it('should return user with tree=null if no tree selected', () => {
      const loginResult = userService.login('no-tree-user');
      const info = userService.getUserInfo(loginResult.userData.id);
      expect(info.tree).toBeNull();
    });
  });

  describe('checkAndRecoverFertilize', () => {
    it('should recover fertilize when last_login_date differs from today', () => {
      userService.login('recover-test');
      const user = db.prepare('SELECT * FROM users WHERE openid = ?').get('recover-test');

      db.prepare('UPDATE users SET last_login_date = ?, fertilize_count = 0 WHERE id = ?')
        .run('2020-01-01', user.id);

      const oldUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
      const updated = userService.checkAndRecoverFertilize(oldUser);
      expect(updated.fertilize_count).toBe(1);
    });

    it('should not recover fertilize when same day', () => {
      const loginResult = userService.login('same-day-test');
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(loginResult.userData.id);

      const result = userService.checkAndRecoverFertilize(user);
      expect(result.fertilize_count).toBe(user.fertilize_count);
    });

    it('should cap fertilize at MAX_FERTILIZE_COUNT', () => {
      userService.login('cap-test');
      const user = db.prepare('SELECT * FROM users WHERE openid = ?').get('cap-test');

      db.prepare('UPDATE users SET last_login_date = ?, fertilize_count = ? WHERE id = ?')
        .run('2020-01-01', 1, user.id);

      const oldUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
      const updated = userService.checkAndRecoverFertilize(oldUser);
      expect(updated.fertilize_count).toBe(1); // min(1 + 1, 1) = 1
    });
  });
});
