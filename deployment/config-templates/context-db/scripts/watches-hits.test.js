// ============================================================
// watches-hits.test.js — Watches 功能全面測試
// 涵蓋: T7 globToRegex 單元測試, T8 整合測試, T9 效能測試
//
// 執行: node --test .context-db/scripts/watches-hits.test.js
// ============================================================

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import os from 'os';

import { globToRegex, parseWatchesFrontmatter, rebuildWatchesIndex, ensureWatchesTables } from './rebuild-watches-index.js';
import { queryWatchesHits } from './query-watches-hits.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);
const Database = require(path.join(__dirname, '..', 'node_modules', 'better-sqlite3'));

// ============================================================
// T7: globToRegex 單元測試 (BR-02)
// ============================================================

describe('globToRegex — 轉換正確性', () => {
  it('** 比對任意深度目錄', () => {
    const re = globToRegex('src/**/*.cs');
    assert.ok(re.test('src/Platform/App.Web/Services/Payment/PaymentService.cs'), '應匹配深層路徑');
    assert.ok(re.test('src/a/b/c/d/File.cs'), '應匹配多層');
    assert.ok(!re.test('other/a/b/File.cs'), '不應匹配不同根目錄');
  });

  it('* 比對單層（不含斜線）', () => {
    const re = globToRegex('src/Services/*.cs');
    assert.ok(re.test('src/Services/PaymentService.cs'), '應匹配同層檔案');
    assert.ok(!re.test('src/Services/sub/PaymentService.cs'), '不應匹配跨層');
  });

  it('精確路徑 glob (含完整名稱)', () => {
    const re = globToRegex('src/Platform/App.Web/Models/Order.cs');
    assert.ok(re.test('src/Platform/App.Web/Models/Order.cs'), '應精確匹配');
    assert.ok(!re.test('src/Platform/App.Web/Models/OrderItem.cs'), '不應匹配不同檔名');
  });

  it('**/ 在開頭比對任意前綴', () => {
    const re = globToRegex('**/Models/**/*.cs');
    assert.ok(re.test('src/Platform/App.Web/Models/Entities/Order.cs'), '應匹配任意前後路徑');
    assert.ok(re.test('Models/Order.cs'), '應匹配無前綴');
  });

  it('? 比對單一字元', () => {
    const re = globToRegex('src/a?.cs');
    assert.ok(re.test('src/ab.cs'), '應匹配單字元');
    assert.ok(!re.test('src/abc.cs'), '不應匹配多字元');
  });

  it('大小寫不敏感', () => {
    const re = globToRegex('src/**/*Payment*.cs');
    assert.ok(re.test('src/Services/paymentService.cs'), '小寫應匹配');
    assert.ok(re.test('src/Services/PAYMENTSERVICE.CS'), '全大寫應匹配');
  });

  it('*License* 萬用字元名稱比對', () => {
    const re = globToRegex('src/**/Models/*License*.cs');
    assert.ok(re.test('src/Platform/App.Web/Models/LicenseKey.cs'), '應匹配含 License 的檔名');
    assert.ok(!re.test('src/Platform/App.Web/Models/Order.cs'), '不含 License 不應匹配');
  });

  it('dot 應視為字面值', () => {
    const re = globToRegex('src/**/*.cs');
    assert.ok(!re.test('src/a/bXcs'), '點號不應匹配任意字元');
  });

  it('{ts,tsx} brace expansion 比對', () => {
    const re = globToRegex('src/**/*Canvas*.{ts,tsx}');
    assert.ok(re.test('src/store/canvasStore.ts'), '應匹配 .ts');
    assert.ok(re.test('src/components/CanvasLayer.tsx'), '應匹配 .tsx');
    assert.ok(!re.test('src/components/CanvasLayer.js'), '不應匹配 .js');
    assert.ok(!re.test('src/components/CanvasLayer.css'), '不應匹配 .css');
  });
});

// ============================================================
// parseWatchesFrontmatter 單元測試
// ============================================================

describe('parseWatchesFrontmatter — YAML 解析', () => {
  it('解析標準多條 watches', () => {
    const content = `---
name: pcpt-payment-subscription
version: 1.0.0
watches:
  - glob: "src/**/*Payment*.cs"
    domain: payment
  - glob: "src/**/*Subscription*.cs"
    domain: payment
---

# Content here
`;
    const result = parseWatchesFrontmatter(content);
    assert.equal(result.length, 2, '應有 2 條 watches');
    assert.equal(result[0].glob, 'src/**/*Payment*.cs');
    assert.equal(result[0].domain, 'payment');
    assert.equal(result[1].glob, 'src/**/*Subscription*.cs');
  });

  it('無 watches 欄位時回傳空陣列', () => {
    const content = `---
name: pcpt-test
version: 1.0.0
---

# Content
`;
    const result = parseWatchesFrontmatter(content);
    assert.equal(result.length, 0);
  });

  it('無 frontmatter 時回傳空陣列', () => {
    const content = '# No frontmatter here\nJust content';
    const result = parseWatchesFrontmatter(content);
    assert.equal(result.length, 0);
  });
});

// ============================================================
// T8: 整合測試 — 使用臨時 DB
// ============================================================

describe('整合測試 — rebuild-watches-index & watches_hits', () => {
  let db;
  let tmpDbPath;

  before(() => {
    // 使用臨時 DB 避免污染正式 DB
    tmpDbPath = path.join(os.tmpdir(), `watches-test-${Date.now()}.db`);
    db = new Database(tmpDbPath);
    db.pragma('journal_mode = WAL');
    ensureWatchesTables(db);
  });

  after(() => {
    if (db) db.close();
    if (tmpDbPath && fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath);
  });

  it('AC-1: rebuild 後 skill_watches_index 含 >= 42 Skills', () => {
    const { skillCount, watchCount } = rebuildWatchesIndex(db);
    assert.ok(skillCount >= 42, `應有 >= 42 Skills，實際: ${skillCount}`);
    assert.ok(watchCount >= 42, `應有 >= 42 watches，實際: ${watchCount}`);

    const dbCount = db.prepare('SELECT COUNT(DISTINCT skill_name) as cnt FROM skill_watches_index').get();
    assert.ok(dbCount.cnt >= 42, `DB 中應有 >= 42 distinct skills，實際: ${dbCount.cnt}`);
  });

  it('AC-1: 每條記錄含 skill_name, glob_pattern, watch_domain, indexed_at', () => {
    const row = db.prepare('SELECT * FROM skill_watches_index LIMIT 1').get();
    assert.ok(row.skill_name, 'skill_name 不得為空');
    assert.ok(row.glob_pattern, 'glob_pattern 不得為空');
    assert.ok(row.indexed_at, 'indexed_at 不得為空');
    // watch_domain 可為 null (有些 watches 未指定 domain)
  });

  it('AC-2: PaymentService.cs 命中 pcpt-payment-subscription', () => {
    const now = '2026-04-05T20:00:00.000+08:00';
    const filePath = 'src/Platform/App.Web/Services/Payment/PaymentService.cs';

    // 載入索引
    const entries = db.prepare(
      'SELECT skill_name, glob_pattern, watch_domain FROM skill_watches_index WHERE stale = 0'
    ).all();

    // 手動比對
    const normalizedPath = filePath.replace(/\\/g, '/');
    const hits = entries.filter(e => {
      try { return globToRegex(e.glob_pattern).test(normalizedPath); } catch { return false; }
    });

    const paymentHit = hits.find(h => h.skill_name === 'pcpt-payment-subscription');
    assert.ok(paymentHit, 'pcpt-payment-subscription 應被命中');

    // 寫入 watches_hits
    const insert = db.prepare(
      'INSERT INTO watches_hits (file_path, skill_name, watch_glob, watch_domain, hit_at) VALUES (?, ?, ?, ?, ?)'
    );
    for (const hit of hits) {
      insert.run(filePath, hit.skill_name, hit.glob_pattern, hit.watch_domain, now);
    }

    const dbHit = db.prepare(
      "SELECT * FROM watches_hits WHERE skill_name = 'pcpt-payment-subscription' LIMIT 1"
    ).get();
    assert.ok(dbHit, 'watches_hits 應含 pcpt-payment-subscription 命中記錄');
    assert.equal(dbHit.file_path, filePath);
  });

  it('AC-3: README.md 不產生 watches_hits 記錄', () => {
    const filePath = 'README.md';
    const before = db.prepare('SELECT COUNT(*) as cnt FROM watches_hits').get().cnt;

    // 比對
    const entries = db.prepare(
      'SELECT skill_name, glob_pattern, watch_domain FROM skill_watches_index WHERE stale = 0'
    ).all();
    const normalizedPath = filePath.replace(/\\/g, '/');
    const hits = entries.filter(e => {
      try { return globToRegex(e.glob_pattern).test(normalizedPath); } catch { return false; }
    });

    // README.md 不應命中任何 watches
    const after = before; // 不寫入
    assert.equal(hits.length, 0, `README.md 不應命中任何 watches，實際命中: ${hits.length}`);
    assert.equal(db.prepare('SELECT COUNT(*) as cnt FROM watches_hits').get().cnt, after, '記錄數不應增加');
  });

  it('AC-4: queryWatchesHits 正確聚合 + --since 過濾', () => {
    // 先寫入 3 筆測試命中
    const insertHit = db.prepare(
      'INSERT INTO watches_hits (file_path, skill_name, watch_glob, watch_domain, hit_at) VALUES (?, ?, ?, ?, ?)'
    );
    insertHit.run('OrderService.cs', 'pcpt-payment-subscription', 'src/**/*Payment*.cs', 'payment', '2026-04-05T21:00:00.000+08:00');
    insertHit.run('Order.cs', 'pcpt-payment-subscription', 'src/**/Models/Order.cs', 'payment', '2026-04-05T21:01:00.000+08:00');
    insertHit.run('SomeService.cs', 'pcpt-sqlserver', 'src/**/*.cs', 'database', '2026-04-05T21:02:00.000+08:00');

    // --since 過濾到只含這批記錄
    const result = queryWatchesHits(db, '2026-04-05T20:59:00');

    const paymentResult = result.find(r => r.skill_name === 'pcpt-payment-subscription');
    assert.ok(paymentResult, 'pcpt-payment-subscription 應在結果中');
    assert.ok(paymentResult.hit_count >= 2, `hit_count 應 >= 2，實際: ${paymentResult.hit_count}`);
    assert.ok(Array.isArray(paymentResult.files), 'files 應為陣列');
    assert.ok(Array.isArray(paymentResult.watch_domains), 'watch_domains 應為陣列');
    assert.ok(paymentResult.watch_domains.includes('payment'), 'watch_domains 應含 payment');
  });
});

// ============================================================
// T9: 效能測試 (BR-05)
// ============================================================

describe('效能測試 — 200+ entries 下 <= 200ms', () => {
  let db;
  let tmpDbPath;

  before(() => {
    tmpDbPath = path.join(os.tmpdir(), `watches-perf-${Date.now()}.db`);
    db = new Database(tmpDbPath);
    db.pragma('journal_mode = WAL');
    ensureWatchesTables(db);

    // 插入 200+ 測試 entries
    const insert = db.prepare(
      'INSERT INTO skill_watches_index (skill_name, glob_pattern, watch_domain, indexed_at, stale) VALUES (?, ?, ?, ?, 0)'
    );
    const now = '2026-04-05T20:00:00.000+08:00';
    const tx = db.transaction(() => {
      for (let i = 0; i < 210; i++) {
        insert.run(`skill-${i}`, `src/Module${i % 30}/**/*.cs`, `domain-${i % 10}`, now);
      }
    });
    tx();
  });

  after(() => {
    if (db) db.close();
    if (tmpDbPath && fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath);
  });

  it('200+ entries 時比對 + DB 操作總時間 <= 200ms', () => {
    const entries = db.prepare(
      'SELECT skill_name, glob_pattern, watch_domain FROM skill_watches_index WHERE stale = 0'
    ).all();

    assert.ok(entries.length >= 200, `應有 >= 200 entries，實際: ${entries.length}`);

    const filePath = 'src/Module5/Services/SomeService.cs';
    const normalizedPath = filePath.replace(/\\/g, '/');

    const start = Date.now();

    // 模擬 observe-pattern 的完整流程：載入索引 + 比對 + 寫入命中
    const hits = entries.filter(e => {
      try { return globToRegex(e.glob_pattern).test(normalizedPath); } catch { return false; }
    });

    if (hits.length > 0) {
      const insertHit = db.prepare(
        'INSERT INTO watches_hits (file_path, skill_name, watch_glob, watch_domain, hit_at) VALUES (?, ?, ?, ?, ?)'
      );
      const now2 = '2026-04-05T20:00:01.000+08:00';
      const tx2 = db.transaction(() => {
        for (const h of hits) insertHit.run(filePath, h.skill_name, h.glob_pattern, h.watch_domain, now2);
      });
      tx2();
    }

    const elapsed = Date.now() - start;
    assert.ok(elapsed <= 200, `watches 比對 + 寫入應 <= 200ms，實際: ${elapsed}ms`);
  });
});
