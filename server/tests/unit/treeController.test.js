import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDatabase } from '../../db/init.js';
import { createTreeService } from '../../services/treeService.js';
import { createUserService } from '../../services/userService.js';
import { createAuthMiddleware } from '../../middleware/auth.js';
import { createWateringTimerService } from '../../services/wateringTimerService.js';
import { createTreeModel } from '../../models/treeModel.js';
import { createUserModel } from '../../models/userModel.js';
import express from 'express';
import http from 'http';

describe('Tree Controller and Routes', () => {
  let app;
  let db;
  let server;
  let baseUrl;
  let userService;

  beforeEach(async () => {
    db = initDatabase(':memory:');

    const getDatabase = () => db;
    const treeModel = createTreeModel({ getDatabase });
    const userModel = createUserModel({ getDatabase });
    const wateringTimerService = createWateringTimerService({ getDatabase });
    const treeService = createTreeService({
      getDatabase,
      treeModel,
      userModel,
      wateringTimerService,
      cardService: null,
    });
    userService = createUserService({ getDatabase });
    const authMiddleware = createAuthMiddleware({ getDatabase });

    const treeController = {
      select(req, res) {
        try {
          const { species } = req.body;
          if (!species) {
            return res.status(400).json({
              success: false,
              error: { code: 'INVALID_PARAMS', message: '缺少树种参数' },
            });
          }
          const result = treeService.selectSpecies(req.user.id, species);
          if (!result.success) {
            return res.status(400).json({ success: false, error: result.error });
          }
          return res.json({ success: true, data: { tree: result.tree } });
        } catch (err) {
          return res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: '选择树种失败，请重试' },
          });
        }
      },
      water(req, res) {
        try {
          const result = treeService.water(req.user.id);
          return res.json({ success: true, data: result });
        } catch (err) {
          if (err.code === 'TREE_NOT_SELECTED' || err.code === 'NO_WATER_COUNT') {
            return res.status(400).json({
              success: false,
              error: { code: err.code, message: err.message },
            });
          }
          return res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: '浇水失败，请重试' },
          });
        }
      },
      fertilize(req, res) {
        try {
          const result = treeService.fertilize(req.user.id);
          return res.json({ success: true, data: result });
        } catch (err) {
          if (err.code === 'TREE_NOT_SELECTED' || err.code === 'NO_FERTILIZE_COUNT') {
            return res.status(400).json({
              success: false,
              error: { code: err.code, message: err.message },
            });
          }
          return res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: '施肥失败，请重试' },
          });
        }
      },
      getStatus(req, res) {
        try {
          const tree = treeService.getStatus(req.user.id);
          if (!tree) {
            return res.status(400).json({
              success: false,
              error: { code: 'TREE_NOT_SELECTED', message: '请先选择树种' },
            });
          }
          return res.json({ success: true, data: { tree } });
        } catch (err) {
          return res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: '获取树状态失败，请重试' },
          });
        }
      },
    };

    app = express();
    app.use(express.json());

    const router = express.Router();
    router.post('/select', authMiddleware, treeController.select);
    router.post('/water', authMiddleware, treeController.water);
    router.post('/fertilize', authMiddleware, treeController.fertilize);
    router.get('/status', authMiddleware, treeController.getStatus);
    app.use('/api/tree', router);

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

  /** Helper: create a user and return the token */
  function createUser(openid = 'test-user-1') {
    userService.login(openid);
    return openid;
  }

  describe('POST /api/tree/select', () => {
    it('should select a valid tree species', async () => {
      const token = createUser();
      const res = await fetchJson(`${baseUrl}/api/tree/select`, {
        method: 'POST',
        headers: { 'x-token': token },
        body: { species: 'apple' },
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tree).toBeDefined();
      expect(res.body.data.tree.species).toBe('apple');
    });

    it('should return 400 for missing species param', async () => {
      const token = createUser();
      const res = await fetchJson(`${baseUrl}/api/tree/select`, {
        method: 'POST',
        headers: { 'x-token': token },
        body: {},
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_PARAMS');
    });

    it('should return 400 for invalid species', async () => {
      const token = createUser();
      const res = await fetchJson(`${baseUrl}/api/tree/select`, {
        method: 'POST',
        headers: { 'x-token': token },
        body: { species: 'banana' },
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_SPECIES');
    });

    it('should return 400 when species already selected', async () => {
      const token = createUser();
      await fetchJson(`${baseUrl}/api/tree/select`, {
        method: 'POST',
        headers: { 'x-token': token },
        body: { species: 'apple' },
      });
      const res = await fetchJson(`${baseUrl}/api/tree/select`, {
        method: 'POST',
        headers: { 'x-token': token },
        body: { species: 'cherry' },
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('SPECIES_ALREADY_SELECTED');
    });

    it('should return 401 without auth', async () => {
      const res = await fetchJson(`${baseUrl}/api/tree/select`, {
        method: 'POST',
        body: { species: 'apple' },
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
    });
  });

  describe('POST /api/tree/water', () => {
    it('should water successfully when tree exists and water count > 0', async () => {
      const token = createUser();
      await fetchJson(`${baseUrl}/api/tree/select`, {
        method: 'POST',
        headers: { 'x-token': token },
        body: { species: 'oak' },
      });

      const res = await fetchJson(`${baseUrl}/api/tree/water`, {
        method: 'POST',
        headers: { 'x-token': token },
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.growScore).toBe(10);
      expect(res.body.data.level).toBe(0);
      expect(res.body.data.waterCount).toBeDefined();
    });

    it('should return 400 TREE_NOT_SELECTED when no tree', async () => {
      const token = createUser();
      const res = await fetchJson(`${baseUrl}/api/tree/water`, {
        method: 'POST',
        headers: { 'x-token': token },
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('TREE_NOT_SELECTED');
    });
  });

  describe('POST /api/tree/fertilize', () => {
    it('should fertilize successfully when tree exists and fertilize count > 0', async () => {
      const token = createUser();
      // Give the user fertilize_count = 1
      const user = db.prepare('SELECT * FROM users WHERE openid = ?').get(token);
      db.prepare('UPDATE users SET fertilize_count = 1 WHERE id = ?').run(user.id);

      await fetchJson(`${baseUrl}/api/tree/select`, {
        method: 'POST',
        headers: { 'x-token': token },
        body: { species: 'cherry' },
      });

      const res = await fetchJson(`${baseUrl}/api/tree/fertilize`, {
        method: 'POST',
        headers: { 'x-token': token },
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.healthScore).toBe(55); // 30 + 25
      expect(res.body.data.fertilizeCount).toBe(0);
    });

    it('should return 400 TREE_NOT_SELECTED when no tree', async () => {
      const token = createUser();
      const res = await fetchJson(`${baseUrl}/api/tree/fertilize`, {
        method: 'POST',
        headers: { 'x-token': token },
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('TREE_NOT_SELECTED');
    });

    it('should return 400 NO_FERTILIZE_COUNT when count is 0', async () => {
      const token = createUser();
      // Manually set fertilize_count to 0 for this test
      const user = db.prepare('SELECT * FROM users WHERE openid = ?').get(token);
      db.prepare('UPDATE users SET fertilize_count = 0 WHERE id = ?').run(user.id);

      await fetchJson(`${baseUrl}/api/tree/select`, {
        method: 'POST',
        headers: { 'x-token': token },
        body: { species: 'cherry' },
      });
      // User now has fertilize_count = 0, so trying to fertilize should fail
      const res = await fetchJson(`${baseUrl}/api/tree/fertilize`, {
        method: 'POST',
        headers: { 'x-token': token },
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('NO_FERTILIZE_COUNT');
    });
  });

  describe('GET /api/tree/status', () => {
    it('should return tree status when tree exists', async () => {
      const token = createUser();
      await fetchJson(`${baseUrl}/api/tree/select`, {
        method: 'POST',
        headers: { 'x-token': token },
        body: { species: 'apple' },
      });

      const res = await fetchJson(`${baseUrl}/api/tree/status`, {
        method: 'GET',
        headers: { 'x-token': token },
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tree).toBeDefined();
      expect(res.body.data.tree.species).toBe('apple');
      expect(res.body.data.tree.grow_score).toBe(0);
      expect(res.body.data.tree.health_score).toBe(30);
    });

    it('should return 400 TREE_NOT_SELECTED when no tree', async () => {
      const token = createUser();
      const res = await fetchJson(`${baseUrl}/api/tree/status`, {
        method: 'GET',
        headers: { 'x-token': token },
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('TREE_NOT_SELECTED');
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
