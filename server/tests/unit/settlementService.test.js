import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDatabase } from '../../db/init.js';
import { createSettlementService } from '../../services/settlementService.js';
import { createTreeService } from '../../services/treeService.js';
import { createUserModel } from '../../models/userModel.js';
import { createTreeModel } from '../../models/treeModel.js';

describe('settlementService', () => {
  let db;
  let settlementService;
  let treeService;
  let userModel;
  let treeModel;

  beforeEach(() => {
    db = initDatabase(':memory:');
    const getDatabase = () => db;
    userModel = createUserModel({ getDatabase });
    treeModel = createTreeModel({ getDatabase });
    treeService = createTreeService({ getDatabase });
    settlementService = createSettlementService({ getDatabase, treeModel, treeService });
  });

  afterEach(() => {
    db.close();
  });

  function createTestUser(overrides = {}) {
    const now = Date.now();
    return userModel.create({
      openid: `settle-test-${Math.random().toString(36).slice(2)}`,
      water_count: 50,
      last_water_recover_time: now,
      fertilize_count: 0,
      last_login_date: '2024-01-01',
      created_at: now,
      ...overrides,
    });
  }

  function createTestTree(userId, overrides = {}) {
    treeService.selectSpecies(userId, 'apple');
    if (Object.keys(overrides).length > 0) {
      treeModel.update(userId, overrides);
    }
    return treeModel.findByUserId(userId);
  }

  describe('settleUser', () => {
    it('should return null if user has no tree', () => {
      const user = createTestUser();
      const result = settlementService.settleUser(user.id);
      expect(result).toBeNull();
    });

    it('should decrease health_score by DAILY_DECLINE_HEALTH_SCORE (20)', () => {
      const user = createTestUser();
      createTestTree(user.id, { health_score: 80 });

      const result = settlementService.settleUser(user.id);

      expect(result.healthScore).toBe(60);
    });

    it('should floor health_score at 0', () => {
      const user = createTestUser();
      createTestTree(user.id, { health_score: 10 });

      const result = settlementService.settleUser(user.id);

      expect(result.healthScore).toBe(0);
    });

    it('should not deduct grow_score when health_score >= LOW_HEALTH_SCORE after decline', () => {
      const user = createTestUser();
      // health_score 50 - 20 = 30, which is >= 20 (LOW_HEALTH_SCORE)
      createTestTree(user.id, { health_score: 50, grow_score: 500, level: 2 });

      const result = settlementService.settleUser(user.id);

      expect(result.healthScore).toBe(30);
      expect(result.growScore).toBe(500);
      expect(result.level).toBe(2);
    });

    it('should deduct grow_score when health_score < LOW_HEALTH_SCORE after decline', () => {
      const user = createTestUser();
      // health_score 30 - 20 = 10, which is < 20 (LOW_HEALTH_SCORE)
      // level 2: interval = (600 - 300) * 0.1 = 30
      createTestTree(user.id, { health_score: 30, grow_score: 500, level: 2 });

      const result = settlementService.settleUser(user.id);

      expect(result.healthScore).toBe(10);
      expect(result.growScore).toBe(470); // 500 - 30
    });

    it('should floor grow_score at 0 when deduction exceeds current grow_score', () => {
      const user = createTestUser();
      // health_score 10 - 20 = -10 -> 0, which is < 20
      // level 1: interval = (300 - 100) * 0.1 = 20
      createTestTree(user.id, { health_score: 10, grow_score: 5, level: 1 });

      const result = settlementService.settleUser(user.id);

      expect(result.healthScore).toBe(0);
      expect(result.growScore).toBe(0); // 5 - 20 -> 0
    });

    it('should recalculate level after grow_score deduction', () => {
      const user = createTestUser();
      // health_score 20 - 20 = 0, which is < 20
      // level 2: interval = (600 - 300) * 0.1 = 30
      // grow_score 310 - 30 = 280, which is < 300 (level 2 threshold), so level drops to 1
      createTestTree(user.id, { health_score: 20, grow_score: 310, level: 2 });

      const result = settlementService.settleUser(user.id);

      expect(result.healthScore).toBe(0);
      expect(result.growScore).toBe(280);
      expect(result.level).toBe(1); // dropped from level 2 to level 1
    });

    it('should handle max level correctly (use last interval)', () => {
      const user = createTestUser();
      // Max level is 10 (index 10 in UPGRADE_NEED_GROW_SCORE)
      // health_score 30 - 20 = 10, which is < 20
      // level 10 (max): last interval = (5500 - 4500) * 0.1 = 100
      createTestTree(user.id, { health_score: 30, grow_score: 5600, level: 10 });

      const result = settlementService.settleUser(user.id);

      expect(result.healthScore).toBe(10);
      expect(result.growScore).toBe(5500); // 5600 - 100
      expect(result.level).toBe(10); // still level 10
    });

    it('should handle level 0 correctly', () => {
      const user = createTestUser();
      // health_score 10 - 20 = -10 -> 0, which is < 20
      // level 0: interval = (100 - 0) * 0.1 = 10
      createTestTree(user.id, { health_score: 10, grow_score: 50, level: 0 });

      const result = settlementService.settleUser(user.id);

      expect(result.healthScore).toBe(0);
      expect(result.growScore).toBe(40); // 50 - 10
      expect(result.level).toBe(0);
    });

    it('should persist changes to the database', () => {
      const user = createTestUser();
      createTestTree(user.id, { health_score: 80, grow_score: 200, level: 1 });

      settlementService.settleUser(user.id);

      const tree = treeModel.findByUserId(user.id);
      expect(tree.health_score).toBe(60);
      expect(tree.grow_score).toBe(200);
      expect(tree.level).toBe(1);
    });

    it('should handle health_score exactly at LOW_HEALTH_SCORE boundary', () => {
      const user = createTestUser();
      // health_score 40 - 20 = 20, which is NOT < 20 (it equals LOW_HEALTH_SCORE)
      // So no grow_score deduction
      createTestTree(user.id, { health_score: 40, grow_score: 500, level: 2 });

      const result = settlementService.settleUser(user.id);

      expect(result.healthScore).toBe(20);
      expect(result.growScore).toBe(500); // no deduction
    });

    it('should handle health_score just below LOW_HEALTH_SCORE boundary', () => {
      const user = createTestUser();
      // health_score 39 - 20 = 19, which IS < 20
      // level 2: interval = (600 - 300) * 0.1 = 30
      createTestTree(user.id, { health_score: 39, grow_score: 500, level: 2 });

      const result = settlementService.settleUser(user.id);

      expect(result.healthScore).toBe(19);
      expect(result.growScore).toBe(470); // 500 - 30
    });
  });

  describe('executeDailySettlement', () => {
    it('should return { processed: 0, failed: 0 } when no users have trees', () => {
      const result = settlementService.executeDailySettlement();

      expect(result.processed).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should process all users with trees', () => {
      const user1 = createTestUser();
      const user2 = createTestUser();
      const user3 = createTestUser();
      createTestTree(user1.id, { health_score: 80 });
      createTestTree(user2.id, { health_score: 60 });
      createTestTree(user3.id, { health_score: 40 });

      const result = settlementService.executeDailySettlement();

      expect(result.processed).toBe(3);
      expect(result.failed).toBe(0);

      // Verify each tree was settled
      expect(treeModel.findByUserId(user1.id).health_score).toBe(60);
      expect(treeModel.findByUserId(user2.id).health_score).toBe(40);
      expect(treeModel.findByUserId(user3.id).health_score).toBe(20);
    });

    it('should not skip other users when one user fails', () => {
      const user1 = createTestUser();
      const user2 = createTestUser();
      createTestTree(user1.id, { health_score: 80 });
      createTestTree(user2.id, { health_score: 60 });

      // Create a service with a broken treeModel for the first user
      const getDatabase = () => db;
      const brokenModel = {
        findByUserId(userId) {
          if (userId === user1.id) {
            throw new Error('Simulated failure');
          }
          return treeModel.findByUserId(userId);
        },
        update: treeModel.update.bind(treeModel),
      };

      const brokenService = createSettlementService({
        getDatabase,
        treeModel: brokenModel,
        treeService,
      });

      const result = brokenService.executeDailySettlement();

      expect(result.failed).toBe(1);
      expect(result.processed).toBe(1);

      // user2 should still be settled
      expect(treeModel.findByUserId(user2.id).health_score).toBe(40);
    });

    it('should not process users without trees', () => {
      const userWithTree = createTestUser();
      const userWithoutTree = createTestUser();
      createTestTree(userWithTree.id, { health_score: 80 });

      const result = settlementService.executeDailySettlement();

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(0);
    });
  });
});
