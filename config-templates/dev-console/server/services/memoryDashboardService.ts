// ============================================================
// memoryDashboardService.ts — Memory DB health dashboard charts
// Story: td-devconsole-godnode-and-mem-dashboard (BR-MEM-001 ~ 004)
// 4 SQL aggregations, all read-only on existing schema
// ============================================================
import { getDb } from '../db.js';

export interface DailyContextRow {
  day: string;
  category: string;
  cnt: number;
}

export interface DailyContextResult {
  data: DailyContextRow[];
  categories: string[];
  days: number;
}

export interface DebtSeverityRow {
  severity: string;
  status: string;
  cnt: number;
}

export interface DebtSeverityResult {
  data: DebtSeverityRow[];
  severities: string[];
  statuses: string[];
}

export interface IddSubtypeRow {
  idd_type: string;
  status: string;
  cnt: number;
}

export interface IddSubtypeResult {
  data: IddSubtypeRow[];
  types: string[];
  // CR F-M12 fix: surface non-canonical idd_type rows like getStoryFunnel.other_count for symmetry
  other_count: number;
}

const CANONICAL_IDD_TYPES = ['COM', 'STR', 'REG', 'USR'];

export interface StoryFunnelRow {
  status: string;
  cnt: number;
}

export interface StoryFunnelResult {
  data: StoryFunnelRow[];
  stages: string[];
  other_count: number;
}

const FUNNEL_STAGES = ['backlog', 'ready-for-dev', 'in-progress', 'review', 'done'];

/** BR-MEM-001 — Daily add_context 趨勢 by category */
export function getDailyContextTrend(days = 30): DailyContextResult {
  const db = getDb();
  if (!db) return { data: [], categories: [], days };

  const safeDays = Math.min(365, Math.max(1, Number(days) || 30));

  // SQLite timestamp 多為 ISO8601 字串(含 +08:00 後綴或 UTC),
  // DATE() 直接取前 10 字 yyyy-MM-dd 即可(已是 Taiwan time 寫入)
  // CR F-H4+M1 fix: bind safeDays as parameter (avoid raw SQL interpolation pattern);
  // align date('now', ...) with Taiwan time so the WHERE filter and the substr-derived
  // grouping use the same reference frame (rows near midnight Taipei stay consistent).
  const rows = db.prepare(`
    SELECT substr(timestamp, 1, 10) AS day,
           COALESCE(category, 'unknown') AS category,
           COUNT(*) AS cnt
    FROM context_entries
    WHERE timestamp >= date('now', '+8 hours', ?)
    GROUP BY day, category
    ORDER BY day ASC, category ASC
  `).all(`-${safeDays} days`) as DailyContextRow[];

  const categories = Array.from(new Set(rows.map(r => r.category))).sort();

  return { data: rows, categories, days: safeDays };
}

/** BR-MEM-002 — Tech Debt severity × status matrix(LOWER 正規化) */
export function getDebtSeverityMatrix(): DebtSeverityResult {
  const db = getDb();
  if (!db) return { data: [], severities: [], statuses: [] };

  // LOWER 正規化大小寫混雜(LOW/low、HIGH/high、ACCEPTED/accepted)
  const rows = db.prepare(`
    SELECT LOWER(severity) AS severity,
           LOWER(status) AS status,
           SUM(cnt) AS cnt
    FROM (
      SELECT severity, status, COUNT(*) AS cnt
      FROM tech_debt_items
      WHERE severity IS NOT NULL AND status IS NOT NULL
      GROUP BY severity, status
    )
    GROUP BY LOWER(severity), LOWER(status)
    ORDER BY severity, status
  `).all() as DebtSeverityRow[];

  const severities = Array.from(new Set(rows.map(r => r.severity))).sort();
  const statuses = Array.from(new Set(rows.map(r => r.status))).sort();

  return { data: rows, severities, statuses };
}

/** BR-MEM-003 — IDD 4 sub-types pie data */
export function getIddSubtypes(): IddSubtypeResult {
  const db = getDb();
  if (!db) return { data: [], types: CANONICAL_IDD_TYPES, other_count: 0 };

  const rows = db.prepare(`
    SELECT idd_type, status, COUNT(*) AS cnt
    FROM intentional_decisions
    WHERE idd_type IS NOT NULL
    GROUP BY idd_type, status
    ORDER BY idd_type, status
  `).all() as IddSubtypeRow[];

  // CR F-M12 fix: split rows into canonical (COM/STR/REG/USR) vs other (legacy / typo / future)
  // Mirrors getStoryFunnel.other_count pattern so callers can render asymmetric drift visibly.
  const canonical: IddSubtypeRow[] = [];
  let otherCount = 0;
  for (const row of rows) {
    if (CANONICAL_IDD_TYPES.includes(row.idd_type)) {
      canonical.push(row);
    } else {
      otherCount += row.cnt;
    }
  }

  return { data: canonical, types: CANONICAL_IDD_TYPES, other_count: otherCount };
}

/** BR-MEM-004 — Story status pipeline funnel(5 stages + Other) */
export function getStoryFunnel(): StoryFunnelResult {
  const db = getDb();
  if (!db) return { data: [], stages: FUNNEL_STAGES, other_count: 0 };

  const rows = db.prepare(`
    SELECT status, COUNT(*) AS cnt
    FROM stories
    WHERE status IS NOT NULL
    GROUP BY status
  `).all() as StoryFunnelRow[];

  // 5 stages 順序固定;非 5 stages 的 status(skipped/split/superseded/cancelled/deleted)
  // 聚合到 other_count
  const stageMap = new Map<string, number>();
  let otherCount = 0;
  for (const row of rows) {
    if (FUNNEL_STAGES.includes(row.status)) {
      stageMap.set(row.status, row.cnt);
    } else {
      otherCount += row.cnt;
    }
  }

  const data = FUNNEL_STAGES.map(stage => ({
    status: stage,
    cnt: stageMap.get(stage) ?? 0,
  }));

  return { data, stages: FUNNEL_STAGES, other_count: otherCount };
}
