import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDatabase } from '../../db/init.js';
import { createUserService } from '../../services/userService.js';
import { createAuthMiddleware } from '../../middleware/auth.js';
import express from 'express';
import http from 'http';

describe('User Controller and Routes', () => {
  let app;
  let db;
  let server;
  let baseUrl;

  beforeEach(async () => {
    db = initDatabase(':memory:');

    app = express();
    app.use(express.json());

    const userService = createUserService({ getDatabase: () => db });
    const authMiddleware = createAuthMiddleware({ getDatabase: () => db });

    const userController = {
      login(req, res) {
        try {
          const { code } = req.body;
          if (!code) {
            return res.status(400).json({
              success: false,
              error: { code: 'INVALID_PARAMS', message: '缺少登录 code 参数' },
            });
          }
          const { token, userData } = userService.login(code);
          return res.json({ success: true, data: { token, userData } });
        } catch (err) {
          return res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: '登录失败，请重试' },
          });
        }
      },
      getInfo(req, res) {
        try {
          const user = userService.getUserInfo(req.user.id);
          if (!user) {
            return res.status(404).json({
              success: false,
              error: { code: 'USER_NOT_FOUND', message: '用户不存在' },
            });
          }
          return res.json({ success: true, data: { user } });
        } catch (err) {
          return res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: '获取用户信息失败' },
          });
        }
      },
    };

    const router = express.Router();
    router.post('/login', userController.login);
    router.get('/info', authMiddleware, userController.getInfo);
    app.use('/api/user', router);

    // Start a real HTTP server on a random port
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

  describe('POST /api/user/login', () => {
    it('should create a new user on first login and return token + userData', async () => {
      const res = await fetchJson(`${baseUrl}/api/user/login`, {
        method: 'POST',
        body: { code: 'test-openid-123' },
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBe('test-openid-123');
      expect(res.body.data.userData).toBeDefined();
      expect(res.body.data.userData.openid).toBe('test-openid-123');
      expect(res.body.data.userData.water_count).toBe(50);
    });

    it('should return existing user on subsequent login', async () => {
      await fetchJson(`${baseUrl}/api/user/login`, {
        method: 'POST',
        body: { code: 'test-openid-456' },
      });
      const res = await fetchJson(`${baseUrl}/api/user/login`, {
        method: 'POST',
        body: { code: 'test-openid-456' },
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBe('test-openid-456');
    });

    it('should return 400 when code is missing', async () => {
      const res = await fetchJson(`${baseUrl}/api/user/login`, {
        method: 'POST',
        body: {},
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_PARAMS');
    });
  });

  describe('GET /api/user/info', () => {
    it('should return user info when authenticated', async () => {
      await fetchJson(`${baseUrl}/api/user/login`, {
        method: 'POST',
        body: { code: 'auth-user-789' },
      });
      const res = await fetchJson(`${baseUrl}/api/user/info`, {
        method: 'GET',
        headers: { 'x-token': 'auth-user-789' },
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.openid).toBe('auth-user-789');
    });

    it('should return 401 when no token provided', async () => {
      const res = await fetchJson(`${baseUrl}/api/user/info`, { method: 'GET' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
    });

    it('should return 401 when token is invalid', async () => {
      const res = await fetchJson(`${baseUrl}/api/user/info`, {
        method: 'GET',
        headers: { 'x-token': 'invalid-token' },
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
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
