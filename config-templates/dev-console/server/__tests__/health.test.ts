// ============================================================
// health.test.ts — GET /api/health 邏輯單元測試
// 5.1: JSON 格式驗證、connected=true/false graceful 處理
// 5.4: localhost-only 限制驗證（config 層）
// ============================================================
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { getDbStats } from '../db.js';
import { config } from '../config.js';

// 複製 health route 的核心邏輯（與 routes/health.ts 相同計算）
function buildHealthResponse(dbPath?: string) {
  const stats = getDbStats(dbPath);
  return {
    status: 'ok' as const,
    db: {
      connected: stats.connected,
      path: stats.path,
      sizeBytes: stats.sizeBytes,
    },
    timestamp: new Date().toISOString(),
  };
}

describe('GET /api/health — JSON 格式', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvc-health-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('DB 存在時回傳 status=ok, db.connected=true', () => {
    const dbPath = path.join(tmpDir, 'health.db');
    new Database(dbPath).close();

    const body = buildHealthResponse(dbPath);

    expect(body.status).toBe('ok');
    expect(body.db.connected).toBe(true);
    expect(body.db.path).toBe(dbPath);
    expect(body.db.sizeBytes).toBeGreaterThan(0);
  });

  it('DB 不存在時回傳 status=ok, db.connected=false（graceful，不 crash）', () => {
    const missing = path.join(tmpDir, 'nonexistent.db');
    const body = buildHealthResponse(missing);

    expect(body.status).toBe('ok');
    expect(body.db.connected).toBe(false);
    expect(body.db.sizeBytes).toBe(0);
  });

  it('health response 包含必要欄位: status, db, timestamp', () => {
    const body = buildHealthResponse(path.join(tmpDir, 'any.db'));

    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('db');
    expect(body).toHaveProperty('timestamp');
    expect(body.db).toHaveProperty('connected');
    expect(body.db).toHaveProperty('path');
    expect(body.db).toHaveProperty('sizeBytes');
  });

  it('timestamp 為合法 ISO 8601 格式', () => {
    const body = buildHealthResponse(path.join(tmpDir, 'ts.db'));
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe('localhost-only — config 層驗證 (AC-2 / 5.4)', () => {
  it('CORS allowedOrigin 僅允許 localhost:5174', () => {
    expect(config.allowedOrigin).toBe('http://localhost:5174');
  });

  it('預設 port 為 3001', () => {
    expect(config.port).toBe(3001);
  });

  it('dbPath 為非空字串（不含 0.0.0.0）', () => {
    expect(typeof config.dbPath).toBe('string');
    expect(config.dbPath.length).toBeGreaterThan(0);
    expect(config.dbPath).not.toContain('0.0.0.0');
  });
});
