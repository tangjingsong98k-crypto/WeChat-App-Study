import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDatabase } from '../../db/init.js';
import { createUserModel } from '../../models/userModel.js';

describe('userModel', () => {
  let db;
  let userModel;

  beforeEach(() => {
    db = initDatabase(':memory:');
    userModel = createUserModel({ getDatabase: () => db });
  });

  afterEach(() => {
    db.close();
  });

  describe('create', () => {
    it('should create a new user with all fields', () => {
      const now = Date.now();
      const user = userModel.create({
        openid: 'test-openid-123',
        nickname: 'TestUser',
        avatar_url: 'https://example.com/avatar.png',
        water_count: 50,
        last_water_recover_time: now,
        fertilize_count: 0,
        last_login_date: '2024-01-01',
        created_at: now,
      });

      expect(user).toBeDefined();
      expect(user.id).toBeGreaterThan(0);
      expect(user.openid).toBe('test-openid-123');
      expect(user.nickname).toBe('TestUser');
      expect(user.avatar_url).toBe('https://example.com/avatar.png');
      expect(user.water_count).toBe(50);
      expect(user.last_water_recover_time).toBe(now);
      expect(user.fertilize_count).toBe(0);
      expect(user.last_login_date).toBe('2024-01-01');
      expect(user.created_at).toBe(now);
    });

    it('should create a user with null nickname and avatar_url', () => {
      const now = Date.now();
      const user = userModel.create({
        openid: 'test-openid-456',
        water_count: 50,
        last_water_recover_time: now,
        fertilize_count: 0,
        last_login_date: '2024-01-01',
        created_at: now,
      });

      expect(user).toBeDefined();
      expect(user.nickname).toBeNull();
      expect(user.avatar_url).toBeNull();
    });
  });

  describe('findByOpenid', () => {
    it('should find an existing user by openid', () => {
      const now = Date.now();
      userModel.create({
        openid: 'find-me',
        water_count: 50,
        last_water_recover_time: now,
        fertilize_count: 0,
        last_login_date: '2024-01-01',
        created_at: now,
      });

      const found = userModel.findByOpenid('find-me');
      expect(found).toBeDefined();
      expect(found.openid).toBe('find-me');
    });

    it('should return undefined for non-existent openid', () => {
      const found = userModel.findByOpenid('does-not-exist');
      expect(found).toBeUndefined();
    });
  });

  describe('findById', () => {
    it('should find an existing user by id', () => {
      const now = Date.now();
      const created = userModel.create({
        openid: 'by-id-test',
        water_count: 50,
        last_water_recover_time: now,
        fertilize_count: 0,
        last_login_date: '2024-01-01',
        created_at: now,
      });

      const found = userModel.findById(created.id);
      expect(found).toBeDefined();
      expect(found.openid).toBe('by-id-test');
    });

    it('should return undefined for non-existent id', () => {
      const found = userModel.findById(9999);
      expect(found).toBeUndefined();
    });
  });

  describe('update', () => {
    it('should update specified fields', () => {
      const now = Date.now();
      const created = userModel.create({
        openid: 'update-test',
        water_count: 50,
        last_water_recover_time: now,
        fertilize_count: 0,
        last_login_date: '2024-01-01',
        created_at: now,
      });

      const updated = userModel.update(created.id, {
        water_count: 45,
        fertilize_count: 1,
      });

      expect(updated.water_count).toBe(45);
      expect(updated.fertilize_count).toBe(1);
      expect(updated.openid).toBe('update-test');
      expect(updated.last_login_date).toBe('2024-01-01');
    });

    it('should return user unchanged when no data provided', () => {
      const now = Date.now();
      const created = userModel.create({
        openid: 'no-update',
        water_count: 50,
        last_water_recover_time: now,
        fertilize_count: 0,
        last_login_date: '2024-01-01',
        created_at: now,
      });

      const result = userModel.update(created.id, {});
      expect(result.water_count).toBe(50);
    });
  });
});
