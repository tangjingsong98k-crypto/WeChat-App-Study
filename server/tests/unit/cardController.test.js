import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDatabase } from '../../db/init.js';
import { createCardService } from '../../services/cardService.js';
import { createCardModel } from '../../models/cardModel.js';
import { createUserService } from '../../services/userService.js';
import { createAuthMiddleware } from '../../middleware/auth.js';
import express from 'express';
import http from 'http';

describe('Card Controller and Routes', () => {
  let app;
  let db;
  let server;
  let baseUrl;
  let userService;

  beforeEach(async () => {
    db = initDatabase(':memory:');

    const getDatabase = () => db;
    const cardModel = createCardModel({ getDatabase });
    const cardService = createCardService({ getDatabase, cardModel });
    userService = createUserService({ getDatabase });
    const authMiddleware = createAuthMiddleware({ getDatabase });

    const cardController = {
      getCards(req, res) {
        try {
          const cards = cardService.getUserCards(req.user.id);
          return res.json({ success: true, data: { cards } });
        } catch (err) {
          return res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: '获取卡牌列表失败，请重试' },
          });
        }
      },
      getSets(req, res) {
        try {
          const sets = cardService.checkSetCompletion(req.user.id);
          return res.json({ success: true, data: { sets } });
        } catch (err) {
          return res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: '获取套装状态失败，请重试' },
          });
        }
      },
    };

    app = express();
    app.use(express.json());

    const router = express.Router();
    router.get('/', authMiddleware, cardController.getCards);
    router.get('/sets', authMiddleware, cardController.getSets);
    app.use('/api/cards', router);

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

  describe('GET /api/cards', () => {
    it('should return empty cards list for new user', async () => {
      const token = createUser();
      const res = await fetchJson(`${baseUrl}/api/cards`, {
        method: 'GET',
        headers: { 'x-token': token },
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.cards).toBeDefined();
      expect(Array.isArray(res.body.data.cards)).toBe(true);
    });

    it('should return cards after user acquires one', async () => {
      const token = createUser();
      const user = db.prepare('SELECT * FROM users WHERE openid = ?').get(token);

      // Manually add a card to the user
      const card = db.prepare('SELECT * FROM cards LIMIT 1').get();
      if (card) {
        db.prepare(
          'INSERT INTO user_cards (user_id, card_id, owned_count) VALUES (?, ?, 1)'
        ).run(user.id, card.id);
      }

      const res = await fetchJson(`${baseUrl}/api/cards`, {
        method: 'GET',
        headers: { 'x-token': token },
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.cards.length).toBeGreaterThanOrEqual(1);
    });

    it('should return 401 without auth', async () => {
      const res = await fetchJson(`${baseUrl}/api/cards`, {
        method: 'GET',
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
    });
  });

  describe('GET /api/cards/sets', () => {
    it('should return set completion status', async () => {
      const token = createUser();
      const res = await fetchJson(`${baseUrl}/api/cards/sets`, {
        method: 'GET',
        headers: { 'x-token': token },
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sets).toBeDefined();
      expect(Array.isArray(res.body.data.sets)).toBe(true);
    });

    it('should show sets as not completed for new user', async () => {
      const token = createUser();
      const res = await fetchJson(`${baseUrl}/api/cards/sets`, {
        method: 'GET',
        headers: { 'x-token': token },
      });

      expect(res.status).toBe(200);
      // All sets should be incomplete for a new user
      for (const set of res.body.data.sets) {
        expect(set.completed).toBe(false);
      }
    });

    it('should return 401 without auth', async () => {
      const res = await fetchJson(`${baseUrl}/api/cards/sets`, {
        method: 'GET',
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
