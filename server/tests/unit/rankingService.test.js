import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDatabase } from '../../db/init.js';
import { createRankingService } from '../../services/rankingService.js';

describe('rankingService', () => {
  let db;
  let rankingService;

  beforeEach(() => {
    db = initDatabase(':memory:');
    rankingService = createRankingService({ getDatabase: () => db });

    // Create test users with trees
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

    // Create trees for users
    db.prepare('INSERT INTO trees (user_id, species, level, grow_score, health_score) VALUES (?, ?, ?, ?, ?)').run(1, 'apple', 3, 500, 80);
    db.prepare('INSERT INTO trees (user_id, species, level, grow_score, health_score) VALUES (?, ?, ?, ?, ?)').run(2, 'cherry', 5, 1200, 60);
    db.prepare('INSERT INTO trees (user_id, species, level, grow_score, health_score) VALUES (?, ?, ?, ?, ?)').run(3, 'oak', 1, 50, 90);
  });

  afterEach(() => {
    db.close();
  });

  describe('getAllRanking', () => {
    it('should return empty array when no participants', () => {
      const result = rankingService.getAllRanking();
      expect(result).toEqual([]);
    });

    it('should return only participating users sorted by grow_score descending', () => {
      db.prepare('INSERT INTO user_rankings (user_id, participate) VALUES (?, ?)').run(1, 1);
      db.prepare('INSERT INTO user_rankings (user_id, participate) VALUES (?, ?)').run(2, 1);
      db.prepare('INSERT INTO user_rankings (user_id, participate) VALUES (?, ?)').run(3, 0);

      const result = rankingService.getAllRanking();
      expect(result).toHaveLength(2);

      // Should be sorted by grow_score descending: Bob (1200) > Alice (500)
      expect(result[0].userId).toBe(2);
      expect(result[0].nickname).toBe('Bob');
      expect(result[0].growScore).toBe(1200);
      expect(result[0].level).toBe(5);
      expect(result[0].species).toBe('cherry');

      expect(result[1].userId).toBe(1);
      expect(result[1].nickname).toBe('Alice');
      expect(result[1].growScore).toBe(500);
      expect(result[1].level).toBe(3);
      expect(result[1].species).toBe('apple');
    });

    it('should not include users with participate=0', () => {
      db.prepare('INSERT INTO user_rankings (user_id, participate) VALUES (?, ?)').run(1, 0);
      db.prepare('INSERT INTO user_rankings (user_id, participate) VALUES (?, ?)').run(2, 0);

      const result = rankingService.getAllRanking();
      expect(result).toEqual([]);
    });
  });

  describe('getFriendsRanking', () => {
    it('should return same result as getAllRanking (friends system not implemented)', () => {
      db.prepare('INSERT INTO user_rankings (user_id, participate) VALUES (?, ?)').run(1, 1);
      db.prepare('INSERT INTO user_rankings (user_id, participate) VALUES (?, ?)').run(2, 1);

      const allRanking = rankingService.getAllRanking();
      const friendsRanking = rankingService.getFriendsRanking(1);
      expect(friendsRanking).toEqual(allRanking);
    });
  });

  describe('toggleParticipation', () => {
    it('should set participation to 1', () => {
      const result = rankingService.toggleParticipation(1, 1);
      expect(result).toEqual({ participate: 1 });
    });

    it('should set participation to 0', () => {
      rankingService.toggleParticipation(1, 1);
      const result = rankingService.toggleParticipation(1, 0);
      expect(result).toEqual({ participate: 0 });
    });

    it('should handle truthy values as 1', () => {
      const result = rankingService.toggleParticipation(1, true);
      expect(result).toEqual({ participate: 1 });
    });

    it('should handle falsy values as 0', () => {
      const result = rankingService.toggleParticipation(1, false);
      expect(result).toEqual({ participate: 0 });
    });

    it('should immediately affect ranking visibility', () => {
      // Create tree for user 1 (already done in beforeEach)
      rankingService.toggleParticipation(1, 1);

      let ranking = rankingService.getAllRanking();
      expect(ranking).toHaveLength(1);
      expect(ranking[0].userId).toBe(1);

      // Toggle off
      rankingService.toggleParticipation(1, 0);
      ranking = rankingService.getAllRanking();
      expect(ranking).toHaveLength(0);
    });
  });

  describe('getUserParticipation', () => {
    it('should return participate=0 when no record exists', () => {
      const result = rankingService.getUserParticipation(1);
      expect(result).toEqual({ participate: 0 });
    });

    it('should return current participation status', () => {
      rankingService.toggleParticipation(1, 1);
      const result = rankingService.getUserParticipation(1);
      expect(result).toEqual({ participate: 1 });
    });

    it('should reflect updated status after toggle', () => {
      rankingService.toggleParticipation(1, 1);
      rankingService.toggleParticipation(1, 0);
      const result = rankingService.getUserParticipation(1);
      expect(result).toEqual({ participate: 0 });
    });
  });
});
