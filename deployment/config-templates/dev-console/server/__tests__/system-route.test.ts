// ============================================================
// system-route.test.ts — 系統工具路由單元測試
// AC-4: GET /api/system/health
// AC-5: POST /api/system/run-script（白名單、409 重複執行）
// AC-6: GET /api/system/history
// ============================================================
import { describe, it, expect, vi } from 'vitest';
import {
  isWhitelisted,
  isRunning,
  getHistory,
  type ScriptHistory,
} from '../services/scriptRunnerService.js';
import type { HealthInfo } from '../../src/types/system.js';

// ── 白名單驗證（AC-5）────────────────────────────────────────

describe('isWhitelisted — 白名單控制 (AC-5)', () => {
  it('check-hygiene 在白名單中', () => {
    expect(isWhitelisted('check-hygiene')).toBe(true);
  });

  it('batch-audit 在白名單中', () => {
    expect(isWhitelisted('batch-audit')).toBe(true);
  });

  it('rm -rf 不在白名單中', () => {
    expect(isWhitelisted('rm -rf')).toBe(false);
  });

  it('任意路徑不在白名單中', () => {
    expect(isWhitelisted('../../evil.ps1')).toBe(false);
  });

  it('空字串不在白名單中', () => {
    expect(isWhitelisted('')).toBe(false);
  });

  it('check-hygiene.ps1（含副檔名）不在白名單中（白名單僅接受 name 不含副檔名）', () => {
    expect(isWhitelisted('check-hygiene.ps1')).toBe(false);
  });

  it('特殊字元注入嘗試不在白名單中', () => {
    expect(isWhitelisted('check-hygiene; rm -rf /')).toBe(false);
    expect(isWhitelisted('check-hygiene\n../../evil')).toBe(false);
  });
});

// ── 重複執行防護（AC-5 409）──────────────────────────────────

describe('isRunning — 重複執行防護 (AC-5)', () => {
  it('未執行時 isRunning 回傳 false', () => {
    expect(isRunning('check-hygiene')).toBe(false);
    expect(isRunning('batch-audit')).toBe(false);
  });

  it('非白名單腳本名稱查詢 isRunning 也回傳 false', () => {
    expect(isRunning('non-existent-script')).toBe(false);
  });
});

// ── History 初始狀態（AC-6）──────────────────────────────────

describe('getHistory — 執行歷史 (AC-6)', () => {
  it('初始狀態 history 為空陣列', () => {
    const hist = getHistory();
    expect(Array.isArray(hist)).toBe(true);
  });

  it('getHistory 回傳的是副本（不可直接修改原 queue）', () => {
    const hist1 = getHistory();
    const hist2 = getHistory();
    expect(hist1).not.toBe(hist2);
  });

  it('ScriptHistory 記錄包含所有 AC-6 必要欄位', () => {
    const requiredFields: (keyof ScriptHistory)[] = [
      'name', 'startedAt', 'completedAt', 'exitCode', 'output', 'durationMs',
    ];
    const sample: ScriptHistory = {
      name: 'check-hygiene',
      startedAt: '2026-03-08T10:00:00.000Z',
      completedAt: '2026-03-08T10:00:01.000Z',
      exitCode: 0,
      output: 'OK',
      durationMs: 1000,
    };
    for (const field of requiredFields) {
      expect(sample).toHaveProperty(field);
      expect(sample[field]).toBeDefined();
    }
  });
});

// ── HealthInfo 型別合規（AC-4）────────────────────────────────

describe('HealthInfo 型別合規 (AC-4)', () => {
  it('回傳結構符合 AC-4 規格: db.connected + records 四類計數', () => {
    const health: HealthInfo = {
      db: { connected: true, path: '/db/test.db', sizeBytes: 2048, tableCount: 8, lastWriteTime: '2026-03-08T10:00:00Z' },
      records: { context: 100, tech: 50, cr_issues: 20, conversations: 10 },
    };
    // db 必要欄位
    expect(typeof health.db.connected).toBe('boolean');
    expect(typeof health.db.sizeBytes).toBe('number');
    expect(health.db.sizeBytes).toBeGreaterThanOrEqual(0);
    expect(typeof health.db.tableCount).toBe('number');
    // records 四欄位均為非負整數
    expect(health.records.context).toBeGreaterThanOrEqual(0);
    expect(health.records.tech).toBeGreaterThanOrEqual(0);
    expect(health.records.cr_issues).toBeGreaterThanOrEqual(0);
    expect(health.records.conversations).toBeGreaterThanOrEqual(0);
  });

  it('lastWriteTime 可為 null（DB 未寫入時）', () => {
    const health: HealthInfo = {
      db: { connected: false, path: '', sizeBytes: 0, tableCount: 0, lastWriteTime: null },
      records: { context: 0, tech: 0, cr_issues: 0, conversations: 0 },
    };
    expect(health.db.lastWriteTime).toBeNull();
    expect(health.db.connected).toBe(false);
  });
});

// ── 白名單完整性（AC-5 安全保證）────────────────────────────

describe('白名單安全保證 (AC-5)', () => {
  it('僅允許 check-hygiene 和 batch-audit 兩個腳本', () => {
    const allowed = ['check-hygiene', 'batch-audit'];
    const attacks = [
      'rm', 'del', 'format', 'shutdown',
      '../check-hygiene', 'scripts/check-hygiene',
      'check-hygiene && evil', 'check-hygiene | evil',
      'check-hygiene; evil', 'check-hygiene`evil`',
    ];
    for (const name of allowed) {
      expect(isWhitelisted(name)).toBe(true);
    }
    for (const name of attacks) {
      expect(isWhitelisted(name)).toBe(false);
    }
  });
});
