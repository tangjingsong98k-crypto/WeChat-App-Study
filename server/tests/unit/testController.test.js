import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDatabase } from '../../db/init.js';
import { createTestController } from '../../controllers/testController.js';
import { createRankingModel } from '../../models/rankingModel.js';
import { createTreeService } from '../../services/treeService.js';
import express from 'express';
import http from 'http';

describe('Test Controller and Routes', () => {
  let app;
  let db;
  let server;
  let baseUrl;

  beforeEach(async () => {
    db = initDatabase(':memory:');

    const getDatabase = () => db;
    const rankingModel = createRankingModel({ getDatabase });
    const treeService = createTreeService({ getDatabase });

    const testController = createTestController({ getDatabase, rankingModel, treeService });

    app = express();
    app.use(express.json());

    const router = express.Router();
    router.post('/fake-user', testController.createFakeUser);
    app.use('/api/test', router);

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, () => resolve());
    });
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (db) db.close();
  });

  describe('POST /api/test/fake-user', () => {
    it('should create a fake user with species and growScore', async () => {
      const res = await fetchJson(`${baseUrl}/api/test/fake-user`, {
        method: 'POST',
        body: { species: 'apple', growScore: 150 },
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.userId).toBeDefined();
      expect(res.body.data.openid).toBeDefined();
      expect(res.body.data.openid).toMatch(/^fake-/);

      // Verify user was created in database
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(res.body.data.userId);
      expect(user).toBeDefined();
      expect(user.openid).toBe(res.body.data.openid);

      // Verify tree was created with correct values
      const tree = db.prepare('SELECT * FROM trees WHERE user_id = ?').get(user.id);
      expect(tree).toBeDefined();
      expect(tree.species).toBe('apple');
      expect(tree.grow_score).toBe(150);
      expect(tree.level).toBe(1); // 150 >= 100 (level 1 threshold)
    });

    it('should calculate level correctly from growScore', async () => {
      const res = await fetchJson(`${baseUrl}/api/test/fake-user`, {
        method: 'POST',
        body: { species: 'cherry', growScore: 650 },
      });

      expect(res.status).toBe(200);
      const tree = db.prepare('SELECT * FROM trees WHERE user_id = ?').get(res.body.data.userId);
      expect(tree.level).toBe(3); // 650 >= 600 (level 3 threshold)
    });

    it('should set level to 0 for growScore below first threshold', async () => {
      const res = await fetchJson(`${baseUrl}/api/test/fake-user`, {
        method: 'POST',
        body: { species: 'oak', growScore: 50 },
      });

      expect(res.status).toBe(200);
      const tree = db.prepare('SELECT * FROM trees WHERE user_id = ?').get(res.body.data.userId);
      expect(tree.level).toBe(0);
      expect(tree.grow_score).toBe(50);
    });

    it('should add cards to the fake user', async () => {
      const res = await fetchJson(`${baseUrl}/api/test/fake-user`, {
        method: 'POST',
        body: {
          species: 'apple',
          growScore: 100,
          cards: [
            { cardId: 1, count: 3 },
            { cardId: 2, count: 1 },
          ],
        },
      });

      expect(res.status).toBe(200);
      const userId = res.body.data.userId;

      // Verify cards were added
      const card1 = db.prepare('SELECT * FROM user_cards WHERE user_id = ? AND card_id = ?').get(userId, 1);
      const card2 = db.prepare('SELECT * FROM user_cards WHERE user_id = ? AND card_id = ?').get(userId, 2);

      expect(card1.owned_count).toBe(3);
      expect(card2.owned_count).toBe(1);
    });

    it('should set ranking participation when participate is true', async () => {
      const res = await fetchJson(`${baseUrl}/api/test/fake-user`, {
        method: 'POST',
        body: { species: 'apple', growScore: 200, participate: true },
      });

      expect(res.status).toBe(200);
      const userId = res.body.data.userId;

      const ranking = db.prepare('SELECT * FROM user_rankings WHERE user_id = ?').get(userId);
      expect(ranking).toBeDefined();
      expect(ranking.participate).toBe(1);
    });

    it('should not set ranking participation when participate is false or absent', async () => {
      const res = await fetchJson(`${baseUrl}/api/test/fake-user`, {
        method: 'POST',
        body: { species: 'apple', growScore: 200 },
      });

      expect(res.status).toBe(200);
      const userId = res.body.data.userId;

      const ranking = db.prepare('SELECT * FROM user_rankings WHERE user_id = ?').get(userId);
      expect(ranking).toBeUndefined();
    });

    it('should make fake user appear in ranking when participate is true', async () => {
      const res = await fetchJson(`${baseUrl}/api/test/fake-user`, {
        method: 'POST',
        body: { species: 'cherry', growScore: 500, participate: true },
      });

      expect(res.status).toBe(200);
      const userId = res.body.data.userId;

      // Verify user appears in ranking participants
      const participants = db.prepare('SELECT * FROM user_rankings WHERE participate = 1').all();
      const found = participants.find((p) => p.user_id === userId);
      expect(found).toBeDefined();
    });

    it('should use custom nickname when provided', async () => {
      const res = await fetchJson(`${baseUrl}/api/test/fake-user`, {
        method: 'POST',
        body: { nickname: '测试玩家A', species: 'oak', growScore: 0 },
      });

      expect(res.status).toBe(200);
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(res.body.data.userId);
      expect(user.nickname).toBe('测试玩家A');
    });

    it('should generate a default nickname when not provided', async () => {
      const res = await fetchJson(`${baseUrl}/api/test/fake-user`, {
        method: 'POST',
        body: { species: 'apple', growScore: 0 },
      });

      expect(res.status).toBe(200);
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(res.body.data.userId);
      expect(user.nickname).toBeDefined();
      expect(user.nickname.startsWith('假人_')).toBe(true);
    });

    it('should return 400 when species is missing', async () => {
      const res = await fetchJson(`${baseUrl}/api/test/fake-user`, {
        method: 'POST',
        body: { growScore: 100 },
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_PARAMS');
    });

    it('should return 400 when growScore is missing', async () => {
      const res = await fetchJson(`${baseUrl}/api/test/fake-user`, {
        method: 'POST',
        body: { species: 'apple' },
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_PARAMS');
    });

    it('should not require authentication', async () => {
      // No x-token header - should still work
      const res = await fetchJson(`${baseUrl}/api/test/fake-user`, {
        method: 'POST',
        body: { species: 'apple', growScore: 0 },
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should handle empty cards array gracefully', async () => {
      const res = await fetchJson(`${baseUrl}/api/test/fake-user`, {
        method: 'POST',
        body: { species: 'apple', growScore: 100, cards: [] },
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const userCards = db.prepare('SELECT * FROM user_cards WHERE user_id = ?').all(res.body.data.userId);
      expect(userCards.length).toBe(0);
    });

    it('should create unique openids for multiple fake users', async () => {
      const res1 = await fetchJson(`${baseUrl}/api/test/fake-user`, {
        method: 'POST',
        body: { species: 'apple', growScore: 100 },
      });
      const res2 = await fetchJson(`${baseUrl}/api/test/fake-user`, {
        method: 'POST',
        body: { species: 'cherry', growScore: 200 },
      });

      expect(res1.body.data.openid).not.toBe(res2.body.data.openid);
    });
  });
});

/**
 * Helper to make HTTP requests using native fetch.
 */
async function fetchJson(url, options = {}) {
  const { method = 'GET', body, headers = {} } = options;
  const fetchOptions = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
  };
  if (body) {
    fetchOptions.body = JSON.stringify(body);
  }
  const response = await fetch(url, fetchOptions);
  const json = await response.json();
  return { status: response.status, body: json };
}
