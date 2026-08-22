// ============================================================
// roadmapService.ts — /api/roadmap 唯讀投影層（tdb-1-track-plan-roadmap）
// 資料來源：stories LEFT JOIN track_plan（epic 白名單自 track_plan 動態推導）。
// 零寫入路徑（AC12）；排序 = 優先序 + 依賴放行 + 解鎖槓桿（純計算，不落地任何衍生欄位）。
// ============================================================
import { getDb } from '../db.js';

// ── 型別 ─────────────────────────────────────────────────────────

export type Lane = 'manual' | 'dispatch' | 'reconcile';
export type Gate = 'inflight' | 'unlocked' | 'waiting-external' | 'blocked' | 'paused';

export interface ChildrenProgress {
  done: number;
  total: number;
}

export interface RoadmapCard {
  story_id: string;
  title: string;
  title_short: string;
  priority: string | null;
  complexity: string | null;
  gate: Gate;
  gate_note: string | null;
  gate_since: string;
  unlock_note: string | null;
  unlock_leverage: number;
  deps_raw: string | null;
  blocked_by: string[];
  children_progress: ChildrenProgress | null;
  unplanned: boolean;
  seq: number | null;
  updated_at: string;
}

export interface RoadmapLaneGroup {
  lane: Lane;
  cards: RoadmapCard[];
}

export interface RoadmapKpi {
  total: number;
  done: number;
  unplanned: number;
  pending: number;
  inflight: number;
  paused: number;
}

export interface RoadmapResult {
  kpi: RoadmapKpi;
  lanes: RoadmapLaneGroup[];
  generated_at: string;
}

// ── 終態 status 集合 —— 對齊 migrate-track-plan.js TERMINAL_STATUSES（逐字同源）───

const TERMINAL_STATUSES = new Set([
  'done', 'cancelled', 'cancelled-merged', 'superseded', 'split', 'skipped', 'deleted',
]);

function isTerminalStatus(status: string | null | undefined): boolean {
  return !!status && TERMINAL_STATUSES.has(status);
}

// ── §1 resolveDependencies —— 四步正規化管線 ────────────────────────
// 剝括號（全形+半形，逐層迭代）→ 正則抽取 kebab-case id-shaped token（涵蓋分隔符切分 + 散文
// 內嵌兩種來源）→ 範圍展開（tdb-1~4）→ 邊界前綴匹配（story_id === token 或 startsWith(token+'-')，
// 多重命中 = 不解析）。

export interface DependencyResolution {
  /** 已解析的完整 story_id 清單（去重，不含未解析 token）。 */
  blockedBy: string[];
  /** 原文以「無」開頭（顯式聲明零依賴）—— 與「無法解析」語意不同，不觸發 deps_raw ⚠。 */
  explicitlyNone: boolean;
  /** blockedBy 的子集：來自範圍/清單記法展開（tdb-1~4 / ccb-1/2/3）—— 供 reconcile lane
   *  children_progress 使用（子卡清單，非泛用 blocked_by 全量，見 AC8 tdb-controller-track-db 案例）。 */
  rangeChildren: string[];
}

// 捕捉 kebab-case id-shaped token,尾端可接「~digit」範圍記法或「/digit」重複清單記法
// （後者可疊加,如 ccb-1/2/3）。兩者皆視為「子卡清單」provenance,供 children_progress 使用。
const TOKEN_RE = /[a-z][a-z0-9]*(?:-[a-z0-9]+)+(?:~\d+|(?:\/\d+)+)?/gi;
const RANGE_RE = /^(.+)-(\d+)~(\d+)$/;
const SLASH_LIST_RE = /^(.+)-(\d+)((?:\/\d+)+)$/;

function stripParens(text: string): string {
  let prev;
  let cur = text;
  // 全形（）與半形()皆需剝除，內容視為註記（進行中 / done / 範式來源等），不參與 token 抽取。
  // 迭代到無變化為止，涵蓋一層巢狀括號。
  do {
    prev = cur;
    cur = cur.replace(/\([^()]*\)/g, ' ').replace(/（[^（）]*）/g, ' ');
  } while (cur !== prev);
  return cur;
}

/**
 * 範圍記法正規化 —— 真實語料「whp-1 ~ whp-11」空格型（前綴於後端點重複,中間含空白）
 * 先摺疊為緊湊型「whp-1~11」再交 TOKEN_RE（緊湊型「tdb-1~4」本就可直接被 TOKEN_RE 捕捉,此函式對其為 no-op）。
 */
function normalizeSpacedRanges(text: string): string {
  return text.replace(/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)-(\d+)\s*~\s*\1-(\d+)/gi, '$1-$2~$3');
}

/** 範圍「tdb-1~4」或清單「ccb-1/2/3」token 展開為完整候選 id 陣列；一般 token 原樣回傳。 */
function expandListToken(token: string): { tokens: string[]; isRange: boolean } {
  const rangeMatch = token.match(RANGE_RE);
  if (rangeMatch) {
    const prefix = rangeMatch[1];
    const start = parseInt(rangeMatch[2], 10);
    const end = parseInt(rangeMatch[3], 10);
    if (Number.isFinite(start) && Number.isFinite(end) && start <= end && end - start <= 50) {
      const out: string[] = [];
      for (let i = start; i <= end; i++) out.push(`${prefix}-${i}`);
      return { tokens: out, isRange: true };
    }
    return { tokens: [token], isRange: false }; // 異常範圍（end < start 或跨度過大）視為一般 token，交邊界前綴匹配自然判失敗
  }
  const slashMatch = token.match(SLASH_LIST_RE);
  if (slashMatch) {
    const prefix = slashMatch[1];
    const nums = [slashMatch[2], ...slashMatch[3].split('/').filter(Boolean)];
    return { tokens: nums.map((n) => `${prefix}-${n}`), isRange: true };
  }
  return { tokens: [token], isRange: false };
}

/** 邊界前綴匹配：exact 或 `known.startsWith(token + '-')`；多重命中一律視為未解析（不得任選其一）。 */
function matchKnownId(token: string, knownIds: readonly string[]): string | null {
  const hits = knownIds.filter((id) => id === token || id.startsWith(`${token}-`));
  return hits.length === 1 ? hits[0] : null;
}

export function resolveDependencies(depsText: string | null | undefined, knownStoryIds: readonly string[]): DependencyResolution {
  const raw = (depsText || '').trim();
  if (!raw) return { blockedBy: [], explicitlyNone: false, rangeChildren: [] };

  const explicitlyNone = raw.startsWith('無');
  const stripped = normalizeSpacedRanges(stripParens(raw));
  const rawTokens = stripped.match(TOKEN_RE) || [];

  const resolved = new Set<string>();
  const rangeResolved = new Set<string>();
  for (const rawToken of rawTokens) {
    const { tokens: expandedTokens, isRange } = expandListToken(rawToken);
    for (const expanded of expandedTokens) {
      const hit = matchKnownId(expanded, knownStoryIds);
      if (hit) {
        resolved.add(hit);
        if (isRange) rangeResolved.add(hit);
      }
    }
  }
  return { blockedBy: [...resolved], explicitlyNone, rangeChildren: [...rangeResolved] };
}

// ── §2 Gate 計算 —— 六段顯式優先序 ──────────────────────────────────

interface GateInput {
  planState: string | null; // null = unplanned（未進 track_plan）
  storyStatus: string;
  pauseReason: string | null;
  unlockNote: string | null;
  blockedBy: string[];
  explicitlyNone: boolean;
  statusOf: (storyId: string) => string | undefined;
}

function computeGate(input: GateInput): { gate: Gate; gate_note: string | null } {
  const { planState, storyStatus, pauseReason, unlockNote, blockedBy, explicitlyNone, statusOf } = input;

  if (planState === 'paused' && storyStatus === 'in-progress') {
    return { gate: 'paused', gate_note: pauseReason || null };
  }
  if (planState === 'unlocked') {
    return { gate: 'unlocked', gate_note: null };
  }
  if (storyStatus === 'in-progress') {
    return { gate: 'inflight', gate_note: null };
  }
  const unresolved = blockedBy.filter((id) => !isTerminalStatus(statusOf(id)));
  if (unresolved.length > 0) {
    return { gate: 'blocked', gate_note: `等待: ${unresolved.join(', ')}` };
  }
  if (blockedBy.length === 0 && !explicitlyNone && unlockNote) {
    return { gate: 'waiting-external', gate_note: unlockNote };
  }
  return { gate: 'unlocked', gate_note: null };
}

// ── §3 排序鍵 —— gate 群 → priority → unlock_leverage desc → seq asc(NULL 末) → story_id ──

const GATE_RANK: Record<Gate, number> = {
  inflight: 0, unlocked: 1, 'waiting-external': 2, blocked: 3, paused: 4,
};
const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

function compareCards(a: RoadmapCard, b: RoadmapCard): number {
  const g = GATE_RANK[a.gate] - GATE_RANK[b.gate];
  if (g !== 0) return g;
  const pa = PRIORITY_RANK[a.priority || ''] ?? 99;
  const pb = PRIORITY_RANK[b.priority || ''] ?? 99;
  if (pa !== pb) return pa - pb;
  if (a.unlock_leverage !== b.unlock_leverage) return b.unlock_leverage - a.unlock_leverage;
  const sa = a.seq ?? Number.MAX_SAFE_INTEGER;
  const sb = b.seq ?? Number.MAX_SAFE_INTEGER;
  if (sa !== sb) return sa - sb;
  return a.story_id < b.story_id ? -1 : a.story_id > b.story_id ? 1 : 0;
}

// ── §4 DB row 型別 ───────────────────────────────────────────────

interface RenderRow {
  story_id: string;
  epic_id: string;
  title: string;
  status: string;
  priority: string | null;
  complexity: string | null;
  dependencies: string | null;
  story_updated_at: string;
  lane: Lane | null;
  seq: number | null;
  plan_state: string | null;
  pause_reason: string | null;
  unlock_note: string | null;
  plan_updated_at: string | null;
}

function titleShort(title: string): string {
  return title.length > 24 ? `${title.slice(0, 24)}…` : title;
}

function nowTaiwan(): string {
  return `${new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).replace(' ', 'T')}+08:00`;
}

export function isDbReady(): boolean {
  return getDb() !== null;
}

/**
 * 唯讀投影 —— stories LEFT JOIN track_plan（epic 白名單自 track_plan 動態推導,見 background §校正 2）。
 * 零寫入路徑（AC12）。
 */
export function getRoadmap(): RoadmapResult {
  const db = getDb();
  if (!db) throw new Error('DB not ready');

  const renderRows = db
    .prepare(
      `SELECT
         s.story_id, s.epic_id, s.title, s.status, s.priority, s.complexity,
         s.dependencies, s.updated_at AS story_updated_at,
         tp.lane, tp.seq, tp.plan_state, tp.pause_reason, tp.unlock_note,
         tp.updated_at AS plan_updated_at
       FROM stories s
       LEFT JOIN track_plan tp ON tp.story_id = s.story_id
       WHERE s.epic_id IN (
         SELECT DISTINCT st.epic_id FROM track_plan tp2
         JOIN stories st ON st.story_id = tp2.story_id
       )
       AND s.status NOT IN ('done','cancelled','cancelled-merged','superseded','split','skipped','deleted')`,
    )
    .all() as RenderRow[];

  // track_plan 全列狀態表 —— 供 unlock_leverage 反查 + children_progress 依賴解析的 knownIds 全集。
  const trackPlanRows = db
    .prepare(
      `SELECT tp.story_id, tp.lane, tp.plan_state, s.status
       FROM track_plan tp
       JOIN stories s ON s.story_id = tp.story_id`,
    )
    .all() as Array<{ story_id: string; lane: Lane; plan_state: string; status: string }>;

  const knownStoryIds = trackPlanRows.map((r) => r.story_id);
  const statusMap = new Map<string, string>(trackPlanRows.map((r) => [r.story_id, r.status]));
  const statusOf = (id: string): string | undefined => statusMap.get(id);

  const kpiTotal = trackPlanRows.length;
  const kpiDone = trackPlanRows.filter((r) => r.plan_state === 'done-exited').length;

  // Pass 1 —— 逐卡解析 dependencies,先算出 blocked_by(unlock_leverage 反查需要全量結果)。
  const resolved = renderRows.map((row) => ({
    row,
    dep: resolveDependencies(row.dependencies, knownStoryIds),
  }));

  // 反查槓桿：對每個候選 story_id,計算「其他仍待推卡（本次 renderRows 集合內）」把它列入 blocked_by 的次數。
  const leverageCount = new Map<string, number>();
  for (const { row, dep } of resolved) {
    for (const dep_id of dep.blockedBy) {
      if (dep_id === row.story_id) continue;
      leverageCount.set(dep_id, (leverageCount.get(dep_id) || 0) + 1);
    }
  }

  let unplannedCount = 0;
  const cards: RoadmapCard[] = [];
  const byLane: Record<Lane, RoadmapCard[]> = { manual: [], dispatch: [], reconcile: [] };

  for (const { row, dep } of resolved) {
    const unplanned = row.lane === null;
    if (unplanned) unplannedCount++;
    const { gate, gate_note } = computeGate({
      planState: row.plan_state,
      storyStatus: row.status,
      pauseReason: row.pause_reason,
      unlockNote: row.unlock_note,
      blockedBy: dep.blockedBy,
      explicitlyNone: dep.explicitlyNone,
      statusOf,
    });

    const lane: Lane = row.lane ?? 'dispatch';
    // children_progress 僅計「範圍/清單記法」展開的子卡（tdb-1~4 / ccb-1/2/3），非泛用 blocked_by 全量
    // ——避免母卡若同時混雜其他非子卡的阻塞依賴（如 tdb-controller-track-db 的 whp-4 D6 收口項）污染子卡計數。
    const children = lane === 'reconcile'
      ? { done: dep.rangeChildren.filter((id) => statusOf(id) === 'done').length, total: dep.rangeChildren.length }
      : null;

    const showDepsRaw = dep.blockedBy.length === 0 && !dep.explicitlyNone && !row.unlock_note;

    const card: RoadmapCard = {
      story_id: row.story_id,
      title: row.title,
      title_short: titleShort(row.title),
      priority: row.priority,
      complexity: row.complexity,
      gate,
      gate_note,
      gate_since: (row.plan_updated_at && row.plan_updated_at > row.story_updated_at)
        ? row.plan_updated_at
        : row.story_updated_at,
      unlock_note: row.unlock_note,
      unlock_leverage: leverageCount.get(row.story_id) || 0,
      deps_raw: showDepsRaw ? row.dependencies : null,
      blocked_by: dep.blockedBy,
      children_progress: children,
      unplanned,
      seq: row.seq,
      updated_at: row.plan_updated_at || row.story_updated_at,
    };
    cards.push(card);
    byLane[lane].push(card);
  }
  (Object.keys(byLane) as Lane[]).forEach((lane) => byLane[lane].sort(compareCards));

  const pending = cards.filter((c) => c.gate === 'unlocked' || c.gate === 'waiting-external' || c.gate === 'blocked').length;
  const inflight = cards.filter((c) => c.gate === 'inflight').length;
  const paused = cards.filter((c) => c.gate === 'paused').length;

  return {
    kpi: { total: kpiTotal, done: kpiDone, unplanned: unplannedCount, pending, inflight, paused },
    lanes: (['manual', 'dispatch', 'reconcile'] as Lane[]).map((lane) => ({ lane, cards: byLane[lane] })),
    generated_at: nowTaiwan(),
  };
}
