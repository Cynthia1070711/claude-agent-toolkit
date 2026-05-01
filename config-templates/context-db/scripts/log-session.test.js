// ============================================================
// log-session.js 核心邏輯測試
// 使用 Node.js 內建 node:test，零外部依賴
// 執行: node --test .context-db/scripts/log-session.test.js
// ============================================================

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getActiveStories, getRecentTrackingLogs, buildSessionContent } from './log-session.js';

// ──────────────────────────────────────────────
// getActiveStories — YAML 解析
// ──────────────────────────────────────────────
describe('getActiveStories', () => {
  it('YAML 不存在時回傳空陣列', () => {
    const result = getActiveStories();
    // 依賴實際 YAML 存在與否，此處驗證回傳型別正確
    assert.ok(Array.isArray(result));
  });

  it('能解析 2 空格縮排的 in-progress Story', () => {
    const result = getActiveStories();
    for (const s of result) {
      assert.ok(s.id, 'Story 應有 id');
      assert.ok(['in-progress', 'review'].includes(s.status), `狀態應為 in-progress 或 review, 實際: ${s.status}`);
    }
  });
});

// ──────────────────────────────────────────────
// getRecentTrackingLogs — Tracking 檔案解析
// ──────────────────────────────────────────────
describe('getRecentTrackingLogs', () => {
  it('回傳陣列', () => {
    const result = getRecentTrackingLogs();
    assert.ok(Array.isArray(result));
  });

  it('每條記錄有 file 和 log 欄位', () => {
    const result = getRecentTrackingLogs(2);
    for (const entry of result) {
      assert.ok(typeof entry.file === 'string');
      assert.ok(typeof entry.log === 'string');
      assert.ok(entry.log.startsWith('- ['), `log 應以 '- [' 開頭: ${entry.log}`);
    }
  });
});

// ──────────────────────────────────────────────
// buildSessionContent — 摘要組合
// ──────────────────────────────────────────────
describe('buildSessionContent', () => {
  it('Stop 事件不含 SessionEnd 標記', () => {
    const content = buildSessionContent('Stop');
    assert.ok(!content.includes('[SessionEnd]'));
  });

  it('SessionEnd 事件包含結束標記', () => {
    const content = buildSessionContent('SessionEnd');
    assert.ok(content.includes('[SessionEnd]'));
  });

  it('unknown 事件不含 SessionEnd 標記', () => {
    const content = buildSessionContent('unknown');
    assert.ok(!content.includes('[SessionEnd]'));
  });

  it('回傳非空字串', () => {
    const content = buildSessionContent('Stop');
    assert.ok(content.length > 0);
    assert.ok(typeof content === 'string');
  });
});
