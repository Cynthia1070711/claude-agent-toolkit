// ============================================================
// godNodeService.test.ts — Story td-devconsole-godnode-and-mem-dashboard
// 測試: listGodNodes (BR-VIS-001/002/003) + getDistribution (BR-VIS-005) + hasCentralityScore
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

function initTestDb(dbPath: string): Database.Database {
  const conn = new Database(dbPath);
  conn.pragma('journal_mode = WAL');

  conn.exec(`
    CREATE TABLE symbol_index (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      symbol_type TEXT,
      symbol_name TEXT,
      full_name TEXT,
      namespace TEXT,
      start_line INTEGER,
      end_line INTEGER,
      signature TEXT,
      indexed_at TEXT,
      centrality_score REAL NOT NULL DEFAULT 0
    );
  `);

  // Seed: 7 symbols(含 Migrations / ModelSnapshot / Tests + 4 normal namespaces)
  const seeds = [
    { name: 'AnnouncementService', ns: 'PhyCool.Web.Services.BackOffice', score: 83.24, file: 'src/.../AnnouncementService.cs' },
    { name: 'HelpContentService',  ns: 'PhyCool.Web.Services.BackOffice', score: 82.68, file: 'src/.../HelpContentService.cs' },
    { name: 'I18nResourceSeeder',  ns: 'PhyCool.Web.Data',                score: 78.96, file: 'src/.../I18nResourceSeeder.cs' },
    { name: 'AssetService',        ns: 'PhyCool.Web.Services',            score: 76.52, file: 'src/.../AssetService.cs' },
    { name: 'M_2026_05_01',        ns: 'PhyCool.Web.Migrations',          score: 5.0,   file: 'src/.../M_2026_05_01.cs' },  // 排除
    { name: 'PhyCoolDbContextModelSnapshot', ns: 'PhyCool.Web.Data.ModelSnapshot', score: 3.0, file: 'src/.../snap.cs' },  // 排除
    { name: 'TestHelper',          ns: 'PhyCool.Web.Tests.Unit',          score: 2.0,   file: 'src/.../TestHelper.cs' },  // 排除
    { name: 'ZeroScore',           ns: 'PhyCool.Web.Services',            score: 0,     file: 'src/.../Zero.cs' },  // 排除(score=0)
  ];

  const insert = conn.prepare(`
    INSERT INTO symbol_index (symbol_name, namespace, full_name, file_path, symbol_type, start_line, end_line, signature, indexed_at, centrality_score)
    VALUES (?, ?, ?, ?, 'class', 1, 100, 'public class X', '2026-05-02T10:00:00+08:00', ?)
  `);
  for (const s of seeds) {
    insert.run(s.name, s.ns, `${s.ns}.${s.name}`, s.file, s.score);
  }

  return conn;
}

vi.mock('../../db.js', async () => {
  const { createDbConnection } = await import('../../db.js');
  return { createDbConnection, getDb: vi.fn(), resetDb: vi.fn() };
});

vi.mock('../../config.js', () => ({
  config: { dbPath: '', port: 3001, allowedOrigin: '', projectRoot: 'C:/test/repo' },
}));

import * as db from '../../db.js';
import { listGodNodes, getDistribution, hasCentralityScore } from '../godNodeService.js';

describe('godNodeService', () => {
  let tmpDir: string;
  let tmpDbPath: string;
  let conn: Database.Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvc-godnode-svc-'));
    tmpDbPath = path.join(tmpDir, 'godnode.db');
    conn = initTestDb(tmpDbPath);
    vi.mocked(db.getDb).mockReturnValue(conn);
  });

  afterEach(() => {
    conn.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('hasCentralityScore', () => {
    it('returns true when centrality_score column exists', () => {
      expect(hasCentralityScore()).toBe(true);
    });

    it('returns false when DB is null', () => {
      vi.mocked(db.getDb).mockReturnValueOnce(null);
      expect(hasCentralityScore()).toBe(false);
    });
  });

  describe('listGodNodes (BR-VIS-001/002/003)', () => {
    it('default limit=10, exclude generated namespaces (BR-VIS-002)', () => {
      const r = listGodNodes({ limit: 10 });
      expect(r.total).toBe(4); // 4 normal namespaces (排除 Migrations/ModelSnapshot/Tests/Zero)
      expect(r.filter.excluded_namespaces).toEqual(['Migrations', 'ModelSnapshot', 'Tests']);
      const names = r.god_nodes.map(n => n.symbol_name);
      expect(names).toContain('AnnouncementService');
      expect(names).not.toContain('M_2026_05_01');
      expect(names).not.toContain('PhyCoolDbContextModelSnapshot');
      expect(names).not.toContain('TestHelper');
      expect(names).not.toContain('ZeroScore');
    });

    it('include_generated=true returns generated namespaces too', () => {
      const r = listGodNodes({ limit: 100, include_generated: true });
      expect(r.total).toBe(7); // ZeroScore 仍排除(centrality=0)
      expect(r.filter.excluded_namespaces).toEqual([]);
    });

    it('limit clamped to [1, 100]', () => {
      const overLimit = listGodNodes({ limit: 999 });
      expect(overLimit.filter.limit).toBe(100);
      const negLimit = listGodNodes({ limit: -5 });
      expect(negLimit.filter.limit).toBe(1); // Math.max(1, -5) = 1
      const undefLimit = listGodNodes({});
      expect(undefLimit.filter.limit).toBe(10); // undefined → default 10
    });

    it('sorts by centrality_score DESC', () => {
      const r = listGodNodes({ limit: 4 });
      const scores = r.god_nodes.map(n => n.centrality_score);
      expect(scores).toEqual([83.24, 82.68, 78.96, 76.52]);
    });

    it('namespace filter narrows results', () => {
      const r = listGodNodes({ limit: 10, namespace: 'BackOffice' });
      expect(r.total).toBe(2);
      expect(r.filter.namespace).toBe('BackOffice');
      expect(r.god_nodes.every(n => n.namespace.includes('BackOffice'))).toBe(true);
    });

    it('absolute_path resolved from config.projectRoot with forward slash', () => {
      const r = listGodNodes({ limit: 1 });
      expect(r.god_nodes[0].absolute_path).toContain('/');
      expect(r.god_nodes[0].absolute_path).not.toContain('\\');
      expect(r.god_nodes[0].absolute_path.startsWith('C:/test/repo')).toBe(true);
    });

    it('returns empty when DB null', () => {
      vi.mocked(db.getDb).mockReturnValueOnce(null);
      const r = listGodNodes({ limit: 10 });
      expect(r.total).toBe(0);
      expect(r.god_nodes).toEqual([]);
    });
  });

  describe('getDistribution (BR-VIS-005)', () => {
    it('computes total/non_zero/pct for excluded set', () => {
      const d = getDistribution({ include_generated: false });
      expect(d.total).toBe(5); // 5 non-generated symbols (含 ZeroScore)
      expect(d.non_zero_count).toBe(4);
      expect(d.non_zero_pct).toBeCloseTo(80, 0); // 4/5 = 80%
      expect(d.max).toBe(83.24);
      expect(d.include_generated).toBe(false);
    });

    it('R2: returns last_computed + by_namespace dashboard fields', () => {
      const d = getDistribution({ include_generated: false });
      // last_computed = seed 設定的 indexed_at(MAX of non-zero)
      expect(d.last_computed).toBe('2026-05-02T10:00:00+08:00');
      // by_namespace 是 array 含 namespace count/avg/max
      expect(Array.isArray(d.by_namespace)).toBe(true);
      expect(d.by_namespace.length).toBeGreaterThan(0);
      const back = d.by_namespace.find(n => n.namespace === 'PhyCool.Web.Services.BackOffice');
      expect(back).toBeDefined();
      expect(back?.count).toBe(2); // 2 BackOffice god nodes in seed
      expect(back?.max).toBeCloseTo(83.24, 2);
    });

    it('include_generated=true increases total', () => {
      const d = getDistribution({ include_generated: true });
      expect(d.total).toBe(8); // 全 8 symbols
      expect(d.non_zero_count).toBe(7); // 排除 ZeroScore
      expect(d.max).toBe(83.24);
    });

    it('returns p50/p75/p95/p99 between min and max', () => {
      const d = getDistribution({ include_generated: false });
      expect(d.p50).toBeGreaterThanOrEqual(d.min);
      expect(d.p99).toBeLessThanOrEqual(d.max);
      expect(d.p75).toBeLessThanOrEqual(d.p95);
      expect(d.p50).toBeLessThanOrEqual(d.p75);
    });

    it('returns zeros when DB null', () => {
      vi.mocked(db.getDb).mockReturnValueOnce(null);
      const d = getDistribution();
      expect(d.total).toBe(0);
      expect(d.non_zero_count).toBe(0);
      expect(d.max).toBe(0);
    });
  });
});
