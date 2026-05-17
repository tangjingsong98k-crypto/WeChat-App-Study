import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDatabase } from '../../db/init.js';
import { createTreeModel } from '../../models/treeModel.js';
import { createUserModel } from '../../models/userModel.js';

describe('treeModel', () => {
  let db;
  let treeModel;
  let userModel;
  let testUser;

  beforeEach(() => {
    db = initDatabase(':memory:');
    treeModel = createTreeModel({ getDatabase: () => db });
    userModel = createUserModel({ getDatabase: () => db });

    // Create a test user
    const now = Date.now();
    testUser = userModel.create({
      openid: 'tree-test-user',
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

  describe('create', () => {
    it('should create a tree with default values', () => {
      const tree = treeModel.create(testUser.id, 'apple');

      expect(tree).toBeDefined();
      expect(tree.id).toBeGreaterThan(0);
      expect(tree.user_id).toBe(testUser.id);
      expect(tree.species).toBe('apple');
      expect(tree.level).toBe(0);
      expect(tree.grow_score).toBe(0);
      expect(tree.health_score).toBe(30);
    });

    it('should enforce unique user_id constraint', () => {
      treeModel.create(testUser.id, 'apple');

      expect(() => {
        treeModel.create(testUser.id, 'cherry');
      }).toThrow();
    });
  });

  describe('findByUserId', () => {
    it('should find an existing tree by user ID', () => {
      treeModel.create(testUser.id, 'oak');

      const found = treeModel.findByUserId(testUser.id);
      expect(found).toBeDefined();
      expect(found.species).toBe('oak');
      expect(found.user_id).toBe(testUser.id);
    });

    it('should return undefined for non-existent user ID', () => {
      const found = treeModel.findByUserId(9999);
      expect(found).toBeUndefined();
    });
  });

  describe('update', () => {
    it('should update specified fields', () => {
      treeModel.create(testUser.id, 'cherry');

      const updated = treeModel.update(testUser.id, {
        level: 3,
        grow_score: 650,
        health_score: 80,
      });

      expect(updated.level).toBe(3);
      expect(updated.grow_score).toBe(650);
      expect(updated.health_score).toBe(80);
      expect(updated.species).toBe('cherry');
    });

    it('should return tree unchanged when no data provided', () => {
      treeModel.create(testUser.id, 'apple');

      const result = treeModel.update(testUser.id, {});
      expect(result.species).toBe('apple');
      expect(result.level).toBe(0);
    });
  });

  describe('delete', () => {
    it('should delete an existing tree', () => {
      treeModel.create(testUser.id, 'oak');

      const deleted = treeModel.delete(testUser.id);
      expect(deleted).toBe(true);

      const found = treeModel.findByUserId(testUser.id);
      expect(found).toBeUndefined();
    });

    it('should return false when no tree exists', () => {
      const deleted = treeModel.delete(9999);
      expect(deleted).toBe(false);
    });
  });
});
