import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDatabase } from '../../db/init.js';
import { createRankingModel } from '../../models/rankingModel.js';

describe('rankingModel', () => {
  let db;
  let rankingModel;

  beforeEach(() => {
    db = initDatabase(':memory:');
    rankingModel = createRankingModel({ getDatabase: () => db });

    // Create test users
    const now = Date.now();
    db.prepare(`
      INSERT INTO users (openid, nickname, water_count, last_water_recover_time, fertilize_count, last_login_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('user1', 'Alice', 50, now, 0, '2024-01-01', now);
    db.prepare(`
      INSERT INTO users (openid, nickname, water_count, last_water_recover_time, fertilize_count, last_login_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('user2', 'Bob', 50, now, 0, '2024-01-01', now);
    db.prepare(`
      INSERT INTO users (openid, nickname, water_count, last_water_recover_time, fertilize_count, last_login_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('user3', 'Charlie', 50, now, 0, '2024-01-01', now);
  });

  afterEach(() => {
    db.close();
  });

  describe('getParticipation', () => {
    it('should return undefined when user has no participation record', () => {
      const result = rankingModel.getParticipation(1);
      expect(result).toBeUndefined();
    });

    it('should return the participation record when it exists', () => {
      db.prepare('INSERT INTO user_rankings (user_id, participate) VALUES (?, ?)').run(1, 1);
      const result = rankingModel.getParticipation(1);
      expect(result).toBeDefined();
      expect(result.user_id).toBe(1);
      expect(result.participate).toBe(1);
    });
  });

  describe('setParticipation', () => {
    it('should insert a new record when none exists', () => {
      const result = rankingModel.setParticipation(1, 1);
      expect(result).toBeDefined();
      expect(result.user_id).toBe(1);
      expect(result.participate).toBe(1);
    });

    it('should update an existing record', () => {
      rankingModel.setParticipation(1, 1);
      const result = rankingModel.setParticipation(1, 0);
      expect(result.user_id).toBe(1);
      expect(result.participate).toBe(0);
    });

    it('should set participate to 0', () => {
      const result = rankingModel.setParticipation(2, 0);
      expect(result.user_id).toBe(2);
      expect(result.participate).toBe(0);
    });
  });

  describe('getAllParticipants', () => {
    it('should return empty array when no participants', () => {
      const result = rankingModel.getAllParticipants();
      expect(result).toEqual([]);
    });

    it('should return only users with participate=1', () => {
      rankingModel.setParticipation(1, 1);
      rankingModel.setParticipation(2, 0);
      rankingModel.setParticipation(3, 1);

      const result = rankingModel.getAllParticipants();
      expect(result).toHaveLength(2);
      const userIds = result.map(r => r.user_id);
      expect(userIds).toContain(1);
      expect(userIds).toContain(3);
      expect(userIds).not.toContain(2);
    });
  });

  describe('getFriendsParticipants', () => {
    it('should return all participants (friends system not implemented)', () => {
      rankingModel.setParticipation(1, 1);
      rankingModel.setParticipation(2, 1);
      rankingModel.setParticipation(3, 0);

      const result = rankingModel.getFriendsParticipants(1);
      expect(result).toHaveLength(2);
      const userIds = result.map(r => r.user_id);
      expect(userIds).toContain(1);
      expect(userIds).toContain(2);
    });
  });
});
