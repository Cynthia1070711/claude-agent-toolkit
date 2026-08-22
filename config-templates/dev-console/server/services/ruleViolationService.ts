// ============================================================
// ruleViolationService.ts — Rule Violation 查詢服務層
// Story: ctr-p2-violation-tracker AC3/AC5 — 讀 context_entries WHERE category='rule_violation'
// Stats constants 與 .context-db/scripts/query-violations.js 保持一致(SPEC AC5)
// ============================================================
import { getDb } from '../db.js';

export const CATEGORY = 'rule_violation';
export const BASELINE_30D = 8;          // MEMORY.md Core Rules 2026-04 前半 baseline(AC5)
export const YELLOW_MULTIPLIER = 1.2;   // > baseline × 1.2 → RED(AC5)

// ── 型別 ──────────────────────────────────────────────────────

export interface ViolationMetadata {
  violated_rule_path: string;
  rule_loaded_at_time: boolean;
  cli_enforcement: boolean;
  workflow_phase: string;
  severity: string;
  incident_summary: string;
}

export interface ViolationEntry {
  id: number;
  agent_id: string;
  timestamp: string;
  title: string;
  content: string;
  tags: string | null;
  related_files: string | null;
  story_id: string | null;
  epic_id: string | null;
  metadata: ViolationMetadata | null;
}

export interface ViolationStats {
  total_60d: number;
  total_30d_rolling: number;
  baseline: number;
  baseline_compare_pct: number;
  status: 'GREEN' | 'YELLOW' | 'RED';
  by_rule: Array<{ rule: string; count: number; last_timestamp: string }>;
  by_phase: Array<{ phase: string; count: number }>;
}

interface RawRow {
  id: number;
  agent_id: string;
  timestamp: string;
  title: string;
  content: string;
  tags: string | null;
  related_files: string | null;
  story_id: string | null;
  epic_id: string | null;
}

// ── 內部工具 ──────────────────────────────────────────────────

function parseMetadata(content: string): ViolationMetadata | null {
  try {
    const obj = JSON.parse(content);
    if (typeof obj !== 'object' || obj === null) return null;
    return obj as ViolationMetadata;
  } catch {
    return null;
  }
}

export function classifyStatus(
  count30d: number,
  baseline = BASELINE_30D,
  mult = YELLOW_MULTIPLIER,
): 'GREEN' | 'YELLOW' | 'RED' {
  if (count30d <= baseline) return 'GREEN';
  if (count30d <= baseline * mult) return 'YELLOW';
  return 'RED';
}

function taiwanISODaysAgo(days: number, now = new Date()): string {
  const ms = now.getTime() - days * 86400000;
  const tw = new Date(ms + 8 * 3600000);
  return tw.toISOString().replace('Z', '+08:00');
}

// ── 公開 API ──────────────────────────────────────────────────

/**
 * 計算 60 天 stats:total/30d rolling/by_rule/by_phase/status。
 * @param days - window 天數(預設 60),測試可傳入較小值
 */
export function getStats(days = 60): ViolationStats {
  const db = getDb();
  if (!db) {
    return emptyStats();
  }

  const since60 = taiwanISODaysAgo(days);
  const since30 = taiwanISODaysAgo(30);

  const rows = db.prepare(`
    SELECT id, agent_id, timestamp, title, content, tags, related_files, story_id, epic_id
    FROM context_entries
    WHERE category = ? AND timestamp >= ?
    ORDER BY timestamp DESC
    LIMIT 10000
  `).all(CATEGORY, since60) as RawRow[];

  const byRule = new Map<string, { rule: string; count: number; last_timestamp: string }>();
  const byPhase = new Map<string, number>();
  let total30 = 0;

  for (const r of rows) {
    const meta = parseMetadata(r.content);
    const rule = meta?.violated_rule_path || r.related_files || '(unknown)';
    const phase = meta?.workflow_phase || '(unknown)';
    const entry = byRule.get(rule) || { rule, count: 0, last_timestamp: '' };
    entry.count += 1;
    if (r.timestamp > entry.last_timestamp) entry.last_timestamp = r.timestamp;
    byRule.set(rule, entry);
    byPhase.set(phase, (byPhase.get(phase) || 0) + 1);
    if (r.timestamp >= since30) total30 += 1;
  }

  const by_rule = [...byRule.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  const by_phase = [...byPhase.entries()]
    .map(([phase, count]) => ({ phase, count }))
    .sort((a, b) => b.count - a.count);

  const baseline_compare_pct = BASELINE_30D > 0
    ? Math.round(((total30 - BASELINE_30D) / BASELINE_30D) * 100)
    : 0;

  return {
    total_60d: rows.length,
    total_30d_rolling: total30,
    baseline: BASELINE_30D,
    baseline_compare_pct,
    status: classifyStatus(total30),
    by_rule,
    by_phase,
  };
}

/**
 * 回傳最近 N 筆 rule_violation 事故,DESC timestamp。
 */
export function getRecent(limit = 20): ViolationEntry[] {
  const db = getDb();
  if (!db) return [];

  const safeLimit = Math.min(Math.max(1, limit), 200);
  const rows = db.prepare(`
    SELECT id, agent_id, timestamp, title, content, tags, related_files, story_id, epic_id
    FROM context_entries
    WHERE category = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(CATEGORY, safeLimit) as RawRow[];

  return rows.map(r => ({
    ...r,
    metadata: parseMetadata(r.content),
  }));
}

function emptyStats(): ViolationStats {
  return {
    total_60d: 0,
    total_30d_rolling: 0,
    baseline: BASELINE_30D,
    baseline_compare_pct: 0,
    status: 'GREEN',
    by_rule: [],
    by_phase: [],
  };
}
