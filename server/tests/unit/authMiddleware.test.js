import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createAuthMiddleware } from '../../middleware/auth.js';

describe('authMiddleware', () => {
  let testDb;
  let authMiddleware;

  beforeEach(() => {
    testDb = new Database(':memory:');
    testDb.pragma('foreign_keys = ON');

    testDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        openid TEXT UNIQUE NOT NULL,
        nickname TEXT,
        avatar_url TEXT,
        water_count INTEGER NOT NULL DEFAULT 50,
        last_water_recover_time INTEGER NOT NULL,
        fertilize_count INTEGER NOT NULL DEFAULT 0,
        last_login_date TEXT,
        created_at INTEGER NOT NULL
      );
    `);

    authMiddleware = createAuthMiddleware({ getDatabase: () => testDb });
  });

  afterEach(() => {
    if (testDb) {
      testDb.close();
      testDb = null;
    }
  });

  function createMockReq(headers = {}) {
    return { headers };
  }

  function createMockRes() {
    const res = {};
    res.statusCode = null;
    res.body = null;
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (data) => {
      res.body = data;
      return res;
    };
    return res;
  }

  it('should return 401 when no token is provided', () => {
    const req = createMockReq({});
    const res = createMockRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when user is not found in database', () => {
    const req = createMockReq({ 'x-token': 'nonexistent-openid' });
    const res = createMockRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
    expect(next).not.toHaveBeenCalled();
  });

  it('should attach user to req and call next when valid x-token is provided', () => {
    const now = Date.now();
    testDb.prepare(
      'INSERT INTO users (openid, nickname, water_count, last_water_recover_time, fertilize_count, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('valid-openid', 'TestUser', 50, now, 0, now);

    const req = createMockReq({ 'x-token': 'valid-openid' });
    const res = createMockRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.openid).toBe('valid-openid');
    expect(req.user.nickname).toBe('TestUser');
  });

  it('should accept token from authorization header', () => {
    const now = Date.now();
    testDb.prepare(
      'INSERT INTO users (openid, nickname, water_count, last_water_recover_time, fertilize_count, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('auth-header-openid', 'AuthUser', 50, now, 0, now);

    const req = createMockReq({ authorization: 'auth-header-openid' });
    const res = createMockRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.openid).toBe('auth-header-openid');
  });

  it('should prefer x-token over authorization header', () => {
    const now = Date.now();
    testDb.prepare(
      'INSERT INTO users (openid, nickname, water_count, last_water_recover_time, fertilize_count, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('x-token-openid', 'XTokenUser', 50, now, 0, now);
    testDb.prepare(
      'INSERT INTO users (openid, nickname, water_count, last_water_recover_time, fertilize_count, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('auth-openid', 'AuthUser', 50, now, 0, now);

    const req = createMockReq({
      'x-token': 'x-token-openid',
      authorization: 'auth-openid',
    });
    const res = createMockRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user.openid).toBe('x-token-openid');
  });
});
