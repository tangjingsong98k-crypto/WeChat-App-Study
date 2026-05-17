import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDatabase } from '../../db/init.js';
import { createRankingService } from '../../services/rankingService.js';
import { createRankingModel } from '../../models/rankingModel.js';
import { createUserService } from '../../services/userService.js';
import { createAuthMiddleware } from '../../middleware/auth.js';
import express from 'express';
import http from 'http';

describe('Ranking Controller and Routes', () => {
  let app;
  let db;
  let server;
  let baseUrl;
  let userService;
  let rankingService;

  beforeEach(async () => {
    db = initDatabase(':memory:');

    const getDatabase = () => db;
    const rankingModel = createRankingModel({ getDatabase });
    rankingService = createRankingService({ getDatabase, rankingModel });
    userService = createUserService({ getDatabase });
    const authMiddleware = createAuthMiddleware({ getDatabase });

    const rankingController = {
      getAll(req, res) {
        try {
          const rankings = rankingService.getAllRanking();
          return res.json({ success: true, data: { rankings } });
        } catch (err) {
          return res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: '获取排行榜失败，请重试' },
          });
        }
      },
      getFriends(req, res) {
        try {
          const rankings = rankingService.getFriendsRanking(req.user.id);
          return res.json({ success: true, data: { rankings } });
        } catch (err) {
          return res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: '获取好友排行榜失败，请重试' },
          });
        }
      },
      toggle(req, res) {
        try {
          const { participate } = req.body;
          const result = rankingService.toggleParticipation(req.user.id, participate);
          return res.json({ success: true, data: { participate: result.participate } });
        } catch (err) {
          return res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: '切换排名状态失败，请重试' },
          });
        }
      },
    };

    app = express();
    app.use(express.json());

    const router = express.Router();
    router.get('/all', authMiddleware, rankingController.getAll);
    router.get('/friends', authMiddleware, rankingController.getFriends);
    router.post('/toggle', authMiddleware, rankingController.toggle);
    app.use('/api/ranking', router);

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

  /** Helper: create a user with a tree and return the token */
  function createUserWithTree(openid = 'test-user-1', species = 'apple') {
    userService.login(openid);
    const user = db.prepare('SELECT * FROM users WHERE openid = ?').get(openid);
    db.prepare('INSERT INTO trees (user_id, species, level, grow_score, health_score) VALUES (?, ?, 0, 0, 30)').run(user.id, species);
    return openid;
  }

  describe('GET /api/ranking/all', () => {
    it('should return empty rankings when no users participate', async () => {
      const token = createUserWithTree();
      const res = await fetchJson(`${baseUrl}/api/ranking/all`, {
        method: 'GET',
        headers: { 'x-token': token },
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.rankings).toBeDefined();
      expect(Array.isArray(res.body.data.rankings)).toBe(true);
      expect(res.body.data.rankings.length).toBe(0);
    });

    it('should return participating users sorted by grow_score', async () => {
      const token1 = createUserWithTree('user-1', 'apple');
      const token2 = createUserWithTree('user-2', 'cherry');

      // Set grow scores
      const user1 = db.prepare('SELECT * FROM users WHERE openid = ?').get('user-1');
      const user2 = db.prepare('SELECT * FROM users WHERE openid = ?').get('user-2');
      db.prepare('UPDATE trees SET grow_score = 200 WHERE user_id = ?').run(user1.id);
      db.prepare('UPDATE trees SET grow_score = 500 WHERE user_id = ?').run(user2.id);

      // Both participate
      rankingService.toggleParticipation(user1.id, true);
      rankingService.toggleParticipation(user2.id, true);

      const res = await fetchJson(`${baseUrl}/api/ranking/all`, {
        method: 'GET',
        headers: { 'x-token': token1 },
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.rankings.length).toBe(2);
      // user-2 has higher grow_score, should be first
      expect(res.body.data.rankings[0].growScore).toBe(500);
      expect(res.body.data.rankings[1].growScore).toBe(200);
    });

    it('should exclude users who do not participate', async () => {
      const token1 = createUserWithTree('user-1', 'apple');
      createUserWithTree('user-2', 'cherry');

      const user1 = db.prepare('SELECT * FROM users WHERE openid = ?').get('user-1');
      const user2 = db.prepare('SELECT * FROM users WHERE openid = ?').get('user-2');

      // Only user1 participates
      rankingService.toggleParticipation(user1.id, true);
      rankingService.toggleParticipation(user2.id, false);

      const res = await fetchJson(`${baseUrl}/api/ranking/all`, {
        method: 'GET',
        headers: { 'x-token': token1 },
      });

      expect(res.status).toBe(200);
      expect(res.body.data.rankings.length).toBe(1);
      expect(res.body.data.rankings[0].userId).toBe(user1.id);
    });

    it('should return 401 without auth', async () => {
      const res = await fetchJson(`${baseUrl}/api/ranking/all`, {
        method: 'GET',
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
    });
  });

  describe('GET /api/ranking/friends', () => {
    it('should return friends ranking for authenticated user', async () => {
      const token = createUserWithTree('user-1', 'apple');
      const user = db.prepare('SELECT * FROM users WHERE openid = ?').get('user-1');
      rankingService.toggleParticipation(user.id, true);

      const res = await fetchJson(`${baseUrl}/api/ranking/friends`, {
        method: 'GET',
        headers: { 'x-token': token },
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.rankings).toBeDefined();
      expect(Array.isArray(res.body.data.rankings)).toBe(true);
    });

    it('should return 401 without auth', async () => {
      const res = await fetchJson(`${baseUrl}/api/ranking/friends`, {
        method: 'GET',
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
    });
  });

  describe('POST /api/ranking/toggle', () => {
    it('should toggle participation to true', async () => {
      const token = createUserWithTree('user-1', 'apple');

      const res = await fetchJson(`${baseUrl}/api/ranking/toggle`, {
        method: 'POST',
        headers: { 'x-token': token },
        body: { participate: true },
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.participate).toBe(1);
    });

    it('should toggle participation to false', async () => {
      const token = createUserWithTree('user-1', 'apple');
      const user = db.prepare('SELECT * FROM users WHERE openid = ?').get('user-1');
      rankingService.toggleParticipation(user.id, true);

      const res = await fetchJson(`${baseUrl}/api/ranking/toggle`, {
        method: 'POST',
        headers: { 'x-token': token },
        body: { participate: false },
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.participate).toBe(0);
    });

    it('should reflect toggle in ranking list immediately', async () => {
      const token = createUserWithTree('user-1', 'apple');

      // Toggle on
      await fetchJson(`${baseUrl}/api/ranking/toggle`, {
        method: 'POST',
        headers: { 'x-token': token },
        body: { participate: true },
      });

      let res = await fetchJson(`${baseUrl}/api/ranking/all`, {
        method: 'GET',
        headers: { 'x-token': token },
      });
      expect(res.body.data.rankings.length).toBe(1);

      // Toggle off
      await fetchJson(`${baseUrl}/api/ranking/toggle`, {
        method: 'POST',
        headers: { 'x-token': token },
        body: { participate: false },
      });

      res = await fetchJson(`${baseUrl}/api/ranking/all`, {
        method: 'GET',
        headers: { 'x-token': token },
      });
      expect(res.body.data.rankings.length).toBe(0);
    });

    it('should return 401 without auth', async () => {
      const res = await fetchJson(`${baseUrl}/api/ranking/toggle`, {
        method: 'POST',
        body: { participate: true },
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
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
