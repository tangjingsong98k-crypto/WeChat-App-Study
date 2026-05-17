import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDatabase } from '../../db/init.js';
import { createTreeService } from '../../services/treeService.js';
import { createUserModel } from '../../models/userModel.js';
import { createWateringTimerService } from '../../services/wateringTimerService.js';

describe('treeService', () => {
  let db;
  let treeService;
  let userModel;
  let wateringTimerService;
  let testUser;

  beforeEach(() => {
    db = initDatabase(':memory:');
    const getDatabase = () => db;
    userModel = createUserModel({ getDatabase });
    wateringTimerService = createWateringTimerService({ getDatabase });
    treeService = createTreeService({ getDatabase, wateringTimerService });

    // Create a test user
    const now = Date.now();
    testUser = userModel.create({
      openid: 'tree-service-test-user',
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

  describe('selectSpecies', () => {
    it('should successfully select a valid species', () => {
      const result = treeService.selectSpecies(testUser.id, 'apple');

      expect(result.success).toBe(true);
      expect(result.tree).toBeDefined();
      expect(result.tree.species).toBe('apple');
      expect(result.tree.user_id).toBe(testUser.id);
      expect(result.tree.level).toBe(0);
      expect(result.tree.grow_score).toBe(0);
      expect(result.tree.health_score).toBe(30);
    });

    it('should accept all valid species', () => {
      const users = [];
      const now = Date.now();
      for (let i = 0; i < 3; i++) {
        users.push(userModel.create({
          openid: `species-test-${i}`,
          water_count: 50,
          last_water_recover_time: now,
          fertilize_count: 0,
          last_login_date: '2024-01-01',
          created_at: now,
        }));
      }

      const species = ['apple', 'cherry', 'oak'];
      species.forEach((s, i) => {
        const result = treeService.selectSpecies(users[i].id, s);
        expect(result.success).toBe(true);
        expect(result.tree.species).toBe(s);
      });
    });

    it('should reject invalid species', () => {
      const result = treeService.selectSpecies(testUser.id, 'banana');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_SPECIES');
    });

    it('should reject empty species', () => {
      const result = treeService.selectSpecies(testUser.id, '');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_SPECIES');
    });

    it('should reject duplicate species selection', () => {
      treeService.selectSpecies(testUser.id, 'apple');
      const result = treeService.selectSpecies(testUser.id, 'cherry');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('SPECIES_ALREADY_SELECTED');
    });
  });

  describe('calculateLevel', () => {
    it('should return level 0 for grow score 0', () => {
      expect(treeService.calculateLevel(0)).toBe(0);
    });

    it('should return level 0 for grow score below first threshold', () => {
      expect(treeService.calculateLevel(50)).toBe(0);
      expect(treeService.calculateLevel(99)).toBe(0);
    });

    it('should return level 1 at exactly 100 grow score', () => {
      expect(treeService.calculateLevel(100)).toBe(1);
    });

    it('should return level 1 for grow score between 100 and 299', () => {
      expect(treeService.calculateLevel(200)).toBe(1);
      expect(treeService.calculateLevel(299)).toBe(1);
    });

    it('should return level 2 at exactly 300 grow score', () => {
      expect(treeService.calculateLevel(300)).toBe(2);
    });

    it('should return max level for very high grow score', () => {
      expect(treeService.calculateLevel(5500)).toBe(10);
      expect(treeService.calculateLevel(9999)).toBe(10);
    });

    it('should handle boundary values correctly', () => {
      // UPGRADE_NEED_GROW_SCORE: [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, 5500]
      const thresholds = [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, 5500];
      thresholds.forEach((threshold, expectedLevel) => {
        expect(treeService.calculateLevel(threshold)).toBe(expectedLevel);
      });
    });
  });

  describe('getStatus', () => {
    it('should return null when user has no tree', () => {
      const status = treeService.getStatus(testUser.id);
      expect(status).toBeNull();
    });

    it('should return tree status when user has a tree', () => {
      treeService.selectSpecies(testUser.id, 'oak');

      const status = treeService.getStatus(testUser.id);
      expect(status).toBeDefined();
      expect(status.species).toBe('oak');
      expect(status.level).toBe(0);
      expect(status.grow_score).toBe(0);
      expect(status.health_score).toBe(30);
    });
  });

  describe('water', () => {
    it('should throw TREE_NOT_SELECTED when user has no tree', () => {
      expect(() => treeService.water(testUser.id)).toThrow();
      try {
        treeService.water(testUser.id);
      } catch (e) {
        expect(e.code).toBe('TREE_NOT_SELECTED');
      }
    });

    it('should increase grow_score by WATERING_GROW_SCORE (10) on each watering', () => {
      treeService.selectSpecies(testUser.id, 'apple');

      const result = treeService.water(testUser.id);

      expect(result.growScore).toBe(10);
      expect(result.level).toBe(0);
      expect(result.waterCount).toBe(49);
    });

    it('should decrease water count by 1', () => {
      treeService.selectSpecies(testUser.id, 'cherry');

      const result = treeService.water(testUser.id);
      expect(result.waterCount).toBe(49);

      const result2 = treeService.water(testUser.id);
      expect(result2.waterCount).toBe(48);
    });

    it('should accumulate grow_score across multiple waterings', () => {
      treeService.selectSpecies(testUser.id, 'oak');

      treeService.water(testUser.id);
      treeService.water(testUser.id);
      const result = treeService.water(testUser.id);

      expect(result.growScore).toBe(30);
    });

    it('should trigger level up when grow_score reaches threshold', () => {
      treeService.selectSpecies(testUser.id, 'apple');

      // Water 10 times to reach grow_score = 100 (level 1 threshold)
      let result;
      for (let i = 0; i < 10; i++) {
        result = treeService.water(testUser.id);
      }

      expect(result.growScore).toBe(100);
      expect(result.level).toBe(1);
    });

    it('should persist grow_score and level to the tree record', () => {
      treeService.selectSpecies(testUser.id, 'apple');

      treeService.water(testUser.id);

      const status = treeService.getStatus(testUser.id);
      expect(status.grow_score).toBe(10);
      expect(status.level).toBe(0);
    });

    it('should throw NO_WATER_COUNT when water count is 0', () => {
      // Create a user with 0 water count
      const now = Date.now();
      const dryUser = userModel.create({
        openid: 'dry-user',
        water_count: 0,
        last_water_recover_time: now,
        fertilize_count: 0,
        last_login_date: '2024-01-01',
        created_at: now,
      });

      const getDatabase = () => db;
      const dryWateringTimer = createWateringTimerService({ getDatabase, now: () => now });
      const dryTreeService = createTreeService({
        getDatabase,
        wateringTimerService: dryWateringTimer,
      });
      dryTreeService.selectSpecies(dryUser.id, 'oak');

      expect(() => dryTreeService.water(dryUser.id)).toThrow();
      try {
        dryTreeService.water(dryUser.id);
      } catch (e) {
        expect(e.code).toBe('NO_WATER_COUNT');
      }
    });

    it('should call cardService.tryGainCard when cardService is provided', () => {
      const mockCard = { id: 1, card_name: 'Test Card' };
      const mockCardService = {
        tryGainCard: (userId) => mockCard,
      };

      const getDatabase = () => db;
      const serviceWithCards = createTreeService({
        getDatabase,
        wateringTimerService,
        cardService: mockCardService,
      });
      serviceWithCards.selectSpecies(testUser.id, 'apple');

      const result = serviceWithCards.water(testUser.id);

      expect(result.card).toEqual(mockCard);
    });

    it('should not include card in result when cardService returns null', () => {
      const mockCardService = {
        tryGainCard: (userId) => null,
      };

      const getDatabase = () => db;
      const serviceWithCards = createTreeService({
        getDatabase,
        wateringTimerService,
        cardService: mockCardService,
      });
      serviceWithCards.selectSpecies(testUser.id, 'apple');

      const result = serviceWithCards.water(testUser.id);

      expect(result.card).toBeUndefined();
    });

    it('should work without cardService (null)', () => {
      const getDatabase = () => db;
      const noCardService = createTreeService({ getDatabase, wateringTimerService, cardService: null });
      noCardService.selectSpecies(testUser.id, 'apple');

      const result = noCardService.water(testUser.id);

      expect(result.card).toBeUndefined();
      expect(result.growScore).toBe(10);
    });
  });

  describe('fertilize', () => {
    it('should throw TREE_NOT_SELECTED when user has no tree', () => {
      expect(() => treeService.fertilize(testUser.id)).toThrow();
      try {
        treeService.fertilize(testUser.id);
      } catch (e) {
        expect(e.code).toBe('TREE_NOT_SELECTED');
      }
    });

    it('should throw NO_FERTILIZE_COUNT when fertilize_count is 0', () => {
      treeService.selectSpecies(testUser.id, 'apple');
      // testUser has fertilize_count = 0 by default

      expect(() => treeService.fertilize(testUser.id)).toThrow();
      try {
        treeService.fertilize(testUser.id);
      } catch (e) {
        expect(e.code).toBe('NO_FERTILIZE_COUNT');
      }
    });

    it('should increase health_score by USER_FERTILIZE_RECOVER_EFFECT (25)', () => {
      // Create a user with fertilize_count = 1
      const now = Date.now();
      const fertUser = userModel.create({
        openid: 'fert-user-1',
        water_count: 50,
        last_water_recover_time: now,
        fertilize_count: 1,
        last_login_date: '2024-01-01',
        created_at: now,
      });
      treeService.selectSpecies(fertUser.id, 'apple');

      const result = treeService.fertilize(fertUser.id);

      // Initial health_score is 30, +25 = 55
      expect(result.healthScore).toBe(55);
      expect(result.fertilizeCount).toBe(0);
    });

    it('should cap health_score at 100', () => {
      // Create a user with fertilize_count = 1
      const now = Date.now();
      const fertUser = userModel.create({
        openid: 'fert-user-cap',
        water_count: 50,
        last_water_recover_time: now,
        fertilize_count: 1,
        last_login_date: '2024-01-01',
        created_at: now,
      });
      treeService.selectSpecies(fertUser.id, 'cherry');

      // Manually set health_score to 90 so that 90 + 25 > 100
      const getDatabase = () => db;
      const { createTreeModel: ctm } = require('../../models/treeModel.js');
      const treeModelInstance = ctm({ getDatabase });
      treeModelInstance.update(fertUser.id, { health_score: 90 });

      const result = treeService.fertilize(fertUser.id);

      expect(result.healthScore).toBe(100);
      expect(result.fertilizeCount).toBe(0);
    });

    it('should decrease fertilize_count by 1', () => {
      const now = Date.now();
      const fertUser = userModel.create({
        openid: 'fert-user-dec',
        water_count: 50,
        last_water_recover_time: now,
        fertilize_count: 1,
        last_login_date: '2024-01-01',
        created_at: now,
      });
      treeService.selectSpecies(fertUser.id, 'oak');

      const result = treeService.fertilize(fertUser.id);

      expect(result.fertilizeCount).toBe(0);

      // Verify it persisted
      const updatedUser = userModel.findById(fertUser.id);
      expect(updatedUser.fertilize_count).toBe(0);
    });

    it('should persist health_score to the tree record', () => {
      const now = Date.now();
      const fertUser = userModel.create({
        openid: 'fert-user-persist',
        water_count: 50,
        last_water_recover_time: now,
        fertilize_count: 1,
        last_login_date: '2024-01-01',
        created_at: now,
      });
      treeService.selectSpecies(fertUser.id, 'apple');

      treeService.fertilize(fertUser.id);

      const status = treeService.getStatus(fertUser.id);
      expect(status.health_score).toBe(55); // 30 + 25
    });

    it('should not allow fertilize after count reaches 0', () => {
      const now = Date.now();
      const fertUser = userModel.create({
        openid: 'fert-user-exhaust',
        water_count: 50,
        last_water_recover_time: now,
        fertilize_count: 1,
        last_login_date: '2024-01-01',
        created_at: now,
      });
      treeService.selectSpecies(fertUser.id, 'cherry');

      // First fertilize should succeed
      const result = treeService.fertilize(fertUser.id);
      expect(result.fertilizeCount).toBe(0);

      // Second fertilize should fail
      expect(() => treeService.fertilize(fertUser.id)).toThrow();
      try {
        treeService.fertilize(fertUser.id);
      } catch (e) {
        expect(e.code).toBe('NO_FERTILIZE_COUNT');
      }
    });
  });
});
