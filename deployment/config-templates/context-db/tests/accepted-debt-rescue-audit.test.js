// ============================================================
// accepted-debt-rescue-audit.test.js (v2 — 擴展至 12 delta + orphan/zombie)
// td-accepted-debt-r3-rescue-sweep (epic-dla, P2/S)
// ============================================================
// 沿用 upsert-intentional.test.js + dla-11-tech-debt-orphan-audit 範式
// vitest + better-sqlite3 in-memory SQLite
// ≥ 40 tests covering: parseArgs, calculateFeasibility (12 delta), scoreToBucket,
//   validateArgs, queryAuditCandidates (case-insensitive status), buildCandidateEntry,
//   buildStoryStatusMap, guessFixCost, hasSpikeEvidence, buildRecommendation,
//   appendRescueMetaToDescription (idempotent), runBackfillRationale
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedDebts, seedStories } from './helpers/test-db.js';

import {
  parseArgs,
  validateArgs,
  calculateFeasibility,
  scoreToBucket,
  queryAuditCandidates,
  buildCandidateEntry,
  buildStoryStatusMap,
  guessFixCost,
  hasSpikeEvidence,
  buildRecommendation,
  appendRescueMetaToDescription,
  runBackfillRationale,
  AUDIT_CATEGORIES,
  OPEN_STATUSES,
} from '../scripts/accepted-debt-rescue-audit.js';

// ── parseArgs tests ──────────────────────────────────────────

describe('parseArgs', () => {
  it('parses --feasibility all', () => {
    const opts = parseArgs([,, '--feasibility', 'all']);
    expect(opts.feasibility).toBe('all');
    expect(opts.resolveTop).toBe(false);
  });

  it('parses --feasibility high', () => {
    const opts = parseArgs([,, '--feasibility', 'high']);
    expect(opts.feasibility).toBe('high');
  });

  it('parses --output custom path', () => {
    const opts = parseArgs([,, '--feasibility', 'all', '--output', '/tmp/out.json']);
    expect(opts.output).toBe('/tmp/out.json');
  });

  it('parses --resolve-top with --by and --in', () => {
    const opts = parseArgs([,, '--resolve-top', '--by', 'AG-SONNET', '--in', 'td-r3-sweep']);
    expect(opts.resolveTop).toBe(true);
    expect(opts.by).toBe('AG-SONNET');
    expect(opts.in).toBe('td-r3-sweep');
    expect(opts.dryRun).toBe(false);
  });

  it('parses --explain <debt-id>', () => {
    const opts = parseArgs([,, '--explain', 'TD-EFT-DLTU-001']);
    expect(opts.explain).toBe('TD-EFT-DLTU-001');
  });

  it('parses --mode backfill-rationale', () => {
    const opts = parseArgs([,, '--mode', 'backfill-rationale', '--by', 'CC-OPUS', '--in', 'td-r3-sweep']);
    expect(opts.mode).toBe('backfill-rationale');
    expect(opts.by).toBe('CC-OPUS');
    expect(opts.in).toBe('td-r3-sweep');
  });

  it('defaults dryRun=true without --resolve-top', () => {
    const opts = parseArgs([,, '--feasibility', 'all']);
    expect(opts.dryRun).toBe(true);
  });
});

// ── scoreToBucket tests ──────────────────────────────────────

describe('scoreToBucket', () => {
  it('maps score 0-39 to Low', () => {
    expect(scoreToBucket(0)).toBe('Low');
    expect(scoreToBucket(39)).toBe('Low');
  });

  it('maps score 40-64 to Medium', () => {
    expect(scoreToBucket(40)).toBe('Medium');
    expect(scoreToBucket(64)).toBe('Medium');
  });

  it('maps score 65-100 to High', () => {
    expect(scoreToBucket(65)).toBe('High');
    expect(scoreToBucket(100)).toBe('High');
  });

  it('maps negative score to Excluded', () => {
    expect(scoreToBucket(-999)).toBe('Excluded');
    expect(scoreToBucket(-1)).toBe('Excluded');
  });
});

// ── calculateFeasibility delta rule tests (12 rules) ─────────

describe('calculateFeasibility — 12 delta rules', () => {
  const baseDebt = {
    category: 'TD',
    severity: 'medium',
    description: null,
    fix_guidance: null,
    target_story: null,
    fix_cost: null,
    affected_files: null,
    story_id: 'test-story',
  };

  it('D1: low severity adds +10', () => {
    const d = { ...baseDebt, severity: 'low' };
    const r = calculateFeasibility(d);
    expect(r.deltas.D1_low_severity).toBe(10);
  });

  it('D2: CQD category adds +10', () => {
    const d = { ...baseDebt, category: 'CQD' };
    const r = calculateFeasibility(d);
    expect(r.deltas.D2_cqd_td_category).toBe(10);
  });

  it('D3: null fix_cost adds +10 (v2: reduced from +15)', () => {
    const d = { ...baseDebt, fix_cost: null };
    const r = calculateFeasibility(d);
    expect(r.deltas.D3_no_fix_cost_spike).toBe(10);
  });

  it('D4: single file adds +10', () => {
    const d = { ...baseDebt, affected_files: 'src/SomeFile.cs' };
    const r = calculateFeasibility(d);
    expect(r.deltas.D4_single_file).toBe(10);
  });

  it('D4: no affected_files (empty array) adds +10 (counts as ≤ 1)', () => {
    const d = { ...baseDebt, affected_files: null };
    const r = calculateFeasibility(d);
    expect(r.deltas.D4_single_file).toBe(10);
  });

  it('D5: WebApplicationFactory keyword adds +10', () => {
    const d = { ...baseDebt, description: 'WebApplicationFactory is available and ready' };
    const r = calculateFeasibility(d);
    expect(r.deltas.D5_empirical_keyword).toBe(10);
  });

  it('D5: 既有 keyword adds +10', () => {
    const d = { ...baseDebt, description: '既有 CustomWebApplicationFactory 已就緒' };
    const r = calculateFeasibility(d);
    expect(r.deltas.D5_empirical_keyword).toBe(10);
  });

  it('D6: schema migration keyword subtracts -20', () => {
    const d = { ...baseDebt, description: 'requires schema migration to fix this issue' };
    const r = calculateFeasibility(d);
    expect(r.deltas.D6_blocker_keyword).toBe(-20);
  });

  it('D6: ARCHITECTURE_REDESIGN keyword subtracts -20', () => {
    const d = { ...baseDebt, root_cause: 'ARCHITECTURE_REDESIGN', description: 'ARCHITECTURE_REDESIGN' };
    const r = calculateFeasibility(d);
    expect(r.deltas.D6_blocker_keyword).toBe(-20);
  });

  it('D7: target_story non-null subtracts -5', () => {
    const d = { ...baseDebt, target_story: 'some-cleanup-story' };
    const r = calculateFeasibility(d);
    expect(r.deltas.D7_has_target_story).toBe(-5);
  });

  it('D8: high severity subtracts -20', () => {
    const d = { ...baseDebt, severity: 'high' };
    const r = calculateFeasibility(d);
    expect(r.deltas.D8_high_severity).toBe(-20);
  });

  it('D9: IDD category → -999 (excluded)', () => {
    const d = { ...baseDebt, category: 'idd' };
    const r = calculateFeasibility(d);
    expect(r.deltas.D9_idd_excluded).toBe(-999);
    expect(r.score).toBe(-999);
    expect(r.bucket).toBe('Excluded');
  });

  it('D10: origin story.status=done triggers zombie (+10)', () => {
    const d = { ...baseDebt, story_id: 'old-done-story' };
    const storyMap = new Map([['old-done-story', 'done']]);
    const r = calculateFeasibility(d, storyMap);
    expect(r.is_zombie).toBe(true);
    expect(r.deltas.D10_zombie_origin_done).toBe(10);
    expect(r.origin_status).toBe('done');
  });

  it('D10: origin story.status=in-progress does NOT trigger zombie', () => {
    const d = { ...baseDebt, story_id: 'current-story' };
    const storyMap = new Map([['current-story', 'in-progress']]);
    const r = calculateFeasibility(d, storyMap);
    expect(r.is_zombie).toBe(false);
    expect(r.deltas.D10_zombie_origin_done).toBeUndefined();
  });

  it('D11: target_story.status=done triggers orphan (+20)', () => {
    const d = { ...baseDebt, target_story: 'already-done-cleanup' };
    const storyMap = new Map([['already-done-cleanup', 'done']]);
    const r = calculateFeasibility(d, storyMap);
    expect(r.is_orphan).toBe(true);
    expect(r.deltas.D11_orphan_target_done).toBe(20);
    expect(r.target_status).toBe('done');
  });

  it('D12: target_story not in stories table → phantom (+15)', () => {
    const d = { ...baseDebt, target_story: 'non-existent-cleanup' };
    const storyMap = new Map();  // empty — phantom reference
    const r = calculateFeasibility(d, storyMap);
    expect(r.is_phantom_target).toBe(true);
    expect(r.deltas.D12_phantom_target).toBe(15);
  });

  it('D11 + D7 both fire for orphan with target_story', () => {
    const d = { ...baseDebt, target_story: 'done-cleanup' };
    const storyMap = new Map([['done-cleanup', 'done']]);
    const r = calculateFeasibility(d, storyMap);
    expect(r.deltas.D7_has_target_story).toBe(-5);
    expect(r.deltas.D11_orphan_target_done).toBe(20);
    // net orphan bonus = 20 - 5 = 15 on top of base 40
  });

  it('Top-candidate pattern: low+CQD+no_fix_cost+single_file+empirical → High bucket', () => {
    // Updated for v2 formula: base 40 + 10+10+10+10+10 = 80 → High
    const d = {
      category: 'CQD',
      severity: 'low',
      description: '既有 WebApplicationFactory + Testcontainers 已就緒',
      fix_guidance: 'spike 測試',
      target_story: null,
      fix_cost: null,
      affected_files: 'tests/SubscriptionRouteTests.cs',
      story_id: 'test-story',
    };
    const r = calculateFeasibility(d);
    expect(r.bucket).toBe('High');
    expect(r.score).toBeGreaterThanOrEqual(65);
  });

  it('Blocker pattern: schema migration → Low/Medium bucket', () => {
    const d = {
      category: 'TD',
      severity: 'medium',
      description: 'requires schema migration and production data fix',
      fix_guidance: 'API breaking change needed',
      target_story: null,
      fix_cost: null,
      affected_files: null,
      story_id: 'test-story',
    };
    const r = calculateFeasibility(d);
    expect(r.deltas.D6_blocker_keyword).toBe(-20);
    expect(r.score).toBeLessThanOrEqual(65);
  });

  it('score clamped to 0-100 range', () => {
    // max positive: base 40 + D1/D2/D3/D4/D5/D10/D11/D12 = 40+10+10+10+10+10+10+20+15 = 135 → clamp 100
    const d = {
      category: 'CQD',
      severity: 'low',
      description: 'WebApplicationFactory 既有',
      fix_guidance: null,
      target_story: 'phantom-target',
      fix_cost: null,
      affected_files: 'SingleFile.cs',
      story_id: 'done-story',
    };
    const storyMap = new Map([['done-story', 'done']]);  // phantom-target not in map
    const r = calculateFeasibility(d, storyMap);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });

  it('Zombie+Orphan+Phantom combined: score still clamped to 100', () => {
    const d = {
      category: 'CQD',
      severity: 'low',
      description: 'WebApplicationFactory 既有',
      target_story: 'done-target',
      fix_cost: null,
      affected_files: null,
      story_id: 'done-origin',
    };
    const storyMap = new Map([['done-origin', 'done'], ['done-target', 'done']]);
    const r = calculateFeasibility(d, storyMap);
    expect(r.score).toBe(100);
    expect(r.is_zombie).toBe(true);
    expect(r.is_orphan).toBe(true);
    expect(r.is_phantom_target).toBe(false);  // target exists → not phantom
  });
});

// ── guessFixCost tests ───────────────────────────────────────

describe('guessFixCost', () => {
  it('returns existing fix_cost if already set', () => {
    expect(guessFixCost({ fix_cost: 'M' })).toBe('M');
  });

  it('returns XS for single file + empirical keyword', () => {
    expect(guessFixCost({
      fix_cost: null,
      severity: 'low',
      affected_files: 'a.cs',
      description: 'WebApplicationFactory available',
    })).toBe('XS');
  });

  it('returns L for blocker keyword', () => {
    expect(guessFixCost({
      fix_cost: null,
      severity: 'low',
      description: 'schema migration required',
    })).toBe('L');
  });

  it('returns M for high severity', () => {
    expect(guessFixCost({ fix_cost: null, severity: 'high' })).toBe('M');
  });
});

// ── hasSpikeEvidence / buildRecommendation tests ─────────────

describe('hasSpikeEvidence', () => {
  it('detects R3_RESCUE_META marker', () => {
    expect(hasSpikeEvidence({ description: '<!-- R3_RESCUE_META:{"x":1} -->' })).toBe(true);
  });

  it('detects resolved_at as evidence', () => {
    expect(hasSpikeEvidence({ description: '', resolved_at: '2026-04-20' })).toBe(true);
  });

  it('returns false when no marker', () => {
    expect(hasSpikeEvidence({ description: 'plain description' })).toBe(false);
  });
});

describe('buildRecommendation', () => {
  it('recognizes orphan case', () => {
    const r = buildRecommendation(
      { target_story: 'x' },
      { is_orphan: true, bucket: 'High' },
    );
    expect(r).toContain('Orphan');
  });

  it('recognizes phantom target', () => {
    const r = buildRecommendation(
      { target_story: 'ghost-story' },
      { is_phantom_target: true, bucket: 'High' },
    );
    expect(r).toContain('Phantom');
  });
});

// ── queryAuditCandidates DB integration tests ─────────────────

describe('queryAuditCandidates (case-insensitive)', () => {
  let db, cleanup;

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    cleanup = t.cleanup;
  });

  afterEach(() => { cleanup(); });

  it('returns open debts in audit categories', () => {
    seedDebts(db, [
      { debt_id: 'TD-TEST-001', category: 'accepted', severity: 'low', status: 'open' },
      { debt_id: 'TD-TEST-002', category: 'CQD', severity: 'medium', status: 'open' },
      { debt_id: 'TD-TEST-003', category: 'deferred', severity: 'low', status: 'open' },
    ]);

    const results = queryAuditCandidates(db);
    expect(results.length).toBe(3);
  });

  it('includes uppercase ACCEPTED status (F4 case-insensitive)', () => {
    seedDebts(db, [
      { debt_id: 'TD-CASE-001', category: 'TD', severity: 'low', status: 'ACCEPTED' },
      { debt_id: 'TD-CASE-002', category: 'TD', severity: 'low', status: 'accepted' },
    ]);
    const results = queryAuditCandidates(db);
    expect(results.length).toBe(2);
  });

  it('includes deferred status variants', () => {
    seedDebts(db, [
      { debt_id: 'TD-DEF-001', category: 'TD', severity: 'low', status: 'deferred' },
      { debt_id: 'TD-DEF-002', category: 'TD', severity: 'low', status: 'pending_archive' },
    ]);
    const results = queryAuditCandidates(db);
    expect(results.length).toBe(2);
  });

  it('excludes fixed debts', () => {
    seedDebts(db, [
      { debt_id: 'TD-FIXED-001', category: 'CQD', severity: 'low', status: 'fixed' },
      { debt_id: 'TD-OPEN-001', category: 'CQD', severity: 'low', status: 'open' },
    ]);
    const results = queryAuditCandidates(db);
    expect(results.find(r => r.debt_id === 'TD-FIXED-001')).toBeUndefined();
    expect(results.find(r => r.debt_id === 'TD-OPEN-001')).toBeDefined();
  });

  it('excludes wont-fix debts', () => {
    seedDebts(db, [
      { debt_id: 'TD-WF-001', category: 'CQD', severity: 'low', status: 'wont-fix' },
      { debt_id: 'TD-OPEN-002', category: 'CQD', severity: 'low', status: 'open' },
    ]);
    const results = queryAuditCandidates(db);
    expect(results.length).toBe(1);
    expect(results[0].debt_id).toBe('TD-OPEN-002');
  });

  it('returns empty array when no open debts', () => {
    const results = queryAuditCandidates(db);
    expect(results).toEqual([]);
  });

  it('includes ≥ 20 total when seeded appropriately (AC-1 precondition)', () => {
    const toSeed = Array.from({ length: 22 }, (_, i) => ({
      debt_id: `TD-BULK-${String(i).padStart(3, '0')}`,
      category: 'CQD',
      severity: 'low',
      status: 'open',
    }));
    seedDebts(db, toSeed);
    const results = queryAuditCandidates(db);
    expect(results.length).toBeGreaterThanOrEqual(20);
  });
});

// ── buildStoryStatusMap tests ──────────────────────────────────

describe('buildStoryStatusMap', () => {
  let db, cleanup;
  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    cleanup = t.cleanup;
  });
  afterEach(() => { cleanup(); });

  it('builds story_id → status map from stories table', () => {
    seedStories(db, [
      { story_id: 'story-a', status: 'done' },
      { story_id: 'story-b', status: 'in-progress' },
    ]);
    const map = buildStoryStatusMap(db);
    expect(map.get('story-a')).toBe('done');
    expect(map.get('story-b')).toBe('in-progress');
    expect(map.size).toBe(2);
  });

  it('returns empty map when stories table empty', () => {
    const map = buildStoryStatusMap(db);
    expect(map.size).toBe(0);
  });
});

// ── Orphan/Zombie integration tests ───────────────────────────

describe('Orphan/Zombie integration (D10/D11/D12)', () => {
  let db, cleanup;
  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    cleanup = t.cleanup;
  });
  afterEach(() => { cleanup(); });

  it('detects zombie: origin story done, no target → is_zombie=true', () => {
    seedStories(db, [{ story_id: 'closed-origin', status: 'done' }]);
    seedDebts(db, [
      { debt_id: 'TD-Z-001', story_id: 'closed-origin', status: 'open' },
    ]);
    const rows = queryAuditCandidates(db);
    const storyMap = buildStoryStatusMap(db);
    const feas = calculateFeasibility(rows[0], storyMap);
    expect(feas.is_zombie).toBe(true);
    expect(feas.origin_status).toBe('done');
  });

  it('detects orphan: target story done → is_orphan=true', () => {
    seedStories(db, [
      { story_id: 'open-origin', status: 'in-progress' },
      { story_id: 'done-target', status: 'done' },
    ]);
    seedDebts(db, [
      { debt_id: 'TD-O-001', story_id: 'open-origin', target_story: 'done-target', status: 'open' },
    ]);
    const rows = queryAuditCandidates(db);
    const storyMap = buildStoryStatusMap(db);
    const feas = calculateFeasibility(rows[0], storyMap);
    expect(feas.is_orphan).toBe(true);
    expect(feas.target_status).toBe('done');
  });

  it('detects phantom target: target_story not in DB → is_phantom_target=true', () => {
    seedStories(db, [{ story_id: 'origin', status: 'in-progress' }]);
    seedDebts(db, [
      { debt_id: 'TD-P-001', story_id: 'origin', target_story: 'non-existent-cleanup', status: 'open' },
    ]);
    const rows = queryAuditCandidates(db);
    const storyMap = buildStoryStatusMap(db);
    const feas = calculateFeasibility(rows[0], storyMap);
    expect(feas.is_phantom_target).toBe(true);
  });
});

// ── buildCandidateEntry tests (AC-1 schema, 13+ fields) ─────

describe('buildCandidateEntry', () => {
  it('returns all required AC-1 schema fields', () => {
    const debt = {
      debt_id: 'TD-BUILD-001',
      title: 'Test entry',
      category: 'CQD',
      severity: 'low',
      affected_files: 'src/test.cs',
      created_at: '2026-01-01T00:00:00+08:00',
      target_story: null,
      fix_cost: null,
      story_id: 'test-story',
    };
    const feas = calculateFeasibility(debt);
    const entry = buildCandidateEntry(debt, feas);

    // AC-1 required fields
    expect(entry).toHaveProperty('debt_id');
    expect(entry).toHaveProperty('title');
    expect(entry).toHaveProperty('category');
    expect(entry).toHaveProperty('severity');
    expect(entry).toHaveProperty('fix_cost');
    expect(entry).toHaveProperty('fix_cost_guess');            // NEW
    expect(entry).toHaveProperty('spike_evidence_exists');     // NEW
    expect(entry).toHaveProperty('affected_files');
    expect(entry).toHaveProperty('created_at');
    expect(entry).toHaveProperty('target_story');
    expect(entry).toHaveProperty('r3_rescue_feasibility_score'); // renamed from feasibility_score
    expect(entry).toHaveProperty('bucket');                     // renamed from feasibility_bucket
    expect(entry).toHaveProperty('recommendation');             // NEW
    expect(entry).toHaveProperty('is_zombie');                  // NEW
    expect(entry).toHaveProperty('is_orphan');                  // NEW
    expect(entry).toHaveProperty('is_phantom_target');          // NEW
  });

  it('affected_files is always an array', () => {
    const debt = {
      debt_id: 'TD-BUILD-002', title: 'Null files', category: 'TD', severity: 'medium',
      affected_files: null, created_at: '2026-01-01',
      target_story: null, fix_cost: null, story_id: 'test-story',
    };
    const feas = calculateFeasibility(debt);
    const entry = buildCandidateEntry(debt, feas);
    expect(Array.isArray(entry.affected_files)).toBe(true);
  });
});

// ── appendRescueMetaToDescription (idempotent) ───────────────

describe('appendRescueMetaToDescription (idempotent)', () => {
  let db, cleanup;
  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    cleanup = t.cleanup;
  });
  afterEach(() => { cleanup(); });

  it('appends R3_RESCUE_META blob to description', () => {
    seedDebts(db, [{ debt_id: 'TD-APP-001', description: 'Original description', status: 'open' }]);
    const ok = appendRescueMetaToDescription(db, 'TD-APP-001', { x: 1 });
    expect(ok).toBe(true);

    const row = db.prepare('SELECT description FROM tech_debt_items WHERE debt_id = ?').get('TD-APP-001');
    expect(row.description).toMatch(/R3_RESCUE_META/);
    expect(row.description).toMatch(/Original description/);
  });

  it('is idempotent: second append skipped', () => {
    seedDebts(db, [{ debt_id: 'TD-APP-002', description: '<!-- R3_RESCUE_META:{"a":1} -->', status: 'open' }]);
    const ok = appendRescueMetaToDescription(db, 'TD-APP-002', { a: 2 });
    expect(ok).toBe(false);  // already present → no-op
  });

  it('returns false for non-existent debt_id', () => {
    const ok = appendRescueMetaToDescription(db, 'TD-GHOST', { x: 1 });
    expect(ok).toBe(false);
  });
});

// ── runBackfillRationale mode tests ──────────────────────────

describe('runBackfillRationale (AC-4)', () => {
  let db, cleanup;
  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    cleanup = t.cleanup;
  });
  afterEach(() => { cleanup(); });

  it('appends blobs to High/Medium bucket candidates', () => {
    seedStories(db, [{ story_id: 'origin', status: 'in-progress' }]);
    seedDebts(db, [
      { debt_id: 'TD-BF-001', story_id: 'origin', category: 'TD', severity: 'low', description: 'plain 1', status: 'open' },
      { debt_id: 'TD-BF-002', story_id: 'origin', category: 'TD', severity: 'low', description: 'plain 2', status: 'open' },
    ]);
    const rows = queryAuditCandidates(db);
    const storyMap = buildStoryStatusMap(db);
    const candidates = rows.map(r => buildCandidateEntry(r, calculateFeasibility(r, storyMap)));
    const { appended } = runBackfillRationale(db, candidates, 'sweep-story', 'CC-OPUS', '2026-04-20T00:00:00+08:00');
    expect(appended).toBeGreaterThanOrEqual(2);

    const row1 = db.prepare('SELECT description FROM tech_debt_items WHERE debt_id = ?').get('TD-BF-001');
    expect(row1.description).toMatch(/pre_production_rationale/);
    expect(row1.description).toMatch(/fix_cost_spike_evidence/);
  });

  it('skips Low bucket candidates', () => {
    seedDebts(db, [
      { debt_id: 'TD-BF-LOW', category: 'TD', severity: 'high', description: 'schema migration cross-epic refactor', status: 'open' },  // many -20 → Low
    ]);
    const rows = queryAuditCandidates(db);
    const candidates = rows.map(r => buildCandidateEntry(r, calculateFeasibility(r)));
    // Force bucket=Low to test skip
    candidates.forEach(c => c.bucket = 'Low');
    const { appended, skipped } = runBackfillRationale(db, candidates, 'sweep-story', 'CC-OPUS', '2026-04-20T00:00:00+08:00');
    expect(appended).toBe(0);
    expect(skipped).toBe(1);
  });

  it('differentiates orphan / zombie / default rationales', () => {
    seedStories(db, [
      { story_id: 'done-origin', status: 'done' },
      { story_id: 'done-target', status: 'done' },
    ]);
    seedDebts(db, [
      { debt_id: 'TD-ORPH-001', story_id: 'done-origin', target_story: 'done-target', category: 'CQD', severity: 'low', status: 'open', description: 'orphan case' },
    ]);
    const rows = queryAuditCandidates(db);
    const storyMap = buildStoryStatusMap(db);
    const candidates = rows.map(r => buildCandidateEntry(r, calculateFeasibility(r, storyMap)));
    runBackfillRationale(db, candidates, 'sweep-story', 'CC-OPUS', '2026-04-20T00:00:00+08:00');
    const row = db.prepare('SELECT description FROM tech_debt_items WHERE debt_id = ?').get('TD-ORPH-001');
    expect(row.description).toMatch(/target_story.*done/);
  });
});

// ── AUDIT_CATEGORIES / OPEN_STATUSES sanity ──────────────────

describe('AUDIT_CATEGORIES / OPEN_STATUSES', () => {
  it('AUDIT_CATEGORIES includes all required categories', () => {
    expect(AUDIT_CATEGORIES.has('accepted')).toBe(true);
    expect(AUDIT_CATEGORIES.has('deferred')).toBe(true);
    expect(AUDIT_CATEGORIES.has('TD')).toBe(true);
    expect(AUDIT_CATEGORIES.has('CQD')).toBe(true);
    expect(AUDIT_CATEGORIES.has('test')).toBe(true);
  });

  it('AUDIT_CATEGORIES does NOT include IDD categories', () => {
    expect(AUDIT_CATEGORIES.has('idd')).toBe(false);
    expect(AUDIT_CATEGORIES.has('intentional')).toBe(false);
  });

  it('OPEN_STATUSES includes case-insensitive accepted variants', () => {
    expect(OPEN_STATUSES.has('open')).toBe(true);
    expect(OPEN_STATUSES.has('accepted')).toBe(true);
    expect(OPEN_STATUSES.has('deferred')).toBe(true);
    expect(OPEN_STATUSES.has('pending_archive')).toBe(true);
  });

  it('OPEN_STATUSES excludes fixed/wont-fix/archived', () => {
    expect(OPEN_STATUSES.has('fixed')).toBe(false);
    expect(OPEN_STATUSES.has('wont-fix')).toBe(false);
    expect(OPEN_STATUSES.has('archived')).toBe(false);
  });
});
