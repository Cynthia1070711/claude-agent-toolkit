// ============================================================
// db-story-service.ts — 從 SQLite DB 讀取 Story 資料
// 取代 yaml-service.ts 作為 Stories API 的主要資料來源
// DB-first 策略：stories 表為唯一 source of truth
// ============================================================
import { getDb } from '../db.js';
import type {
  StoryEntry,
  StoryMetadata,
  StoryStatus,
  StoryFilters,
  StoryStats,
  EpicSummary,
  ParsedSprintStatus,
  DateRange,
  SortBy,
  EpicProgress,
  ComplexityDistribution,
} from './yaml-service.js';

// re-export types for route layer
export type { StoryEntry, StoryFilters, StoryStats, EpicSummary };

// ── DB 連線就緒判定 ── [tdb-2 BR-017 / AC10]
// sprint-status.yaml 凍結後,DB 不可用時**不得**回退讀該檔;route 層改以
// dbUnavailable() 503 明示分流(對齊 ccb-3 範式 channel.ts / roadmap.ts),
// 避免回 200 + 全零而讓使用者無法分辨「DB 掛了」與「專案 0 張卡」。
export function isDbReady(): boolean {
  return getDb() !== null;
}

// ── DB row 型別 ──
interface DbStoryRow {
  story_id: string;
  epic_id: string;
  domain: string;
  title: string;
  status: string;
  priority: string | null;
  complexity: string | null;
  story_type: string | null;
  tags: string | null;
  dev_agent: string | null;
  review_agent: string | null;
  cr_score: number | null;
  test_count: number | null;
  created_at: string;
  updated_at: string | null;
}

// ── DB row → StoryEntry 轉換 ──
function toStoryEntry(row: DbStoryRow, rerunMap?: Map<string, Record<string, number>>): StoryEntry {
  const metadata: StoryMetadata = {
    complexity: row.complexity,
    priority: row.priority,
    crScore: row.cr_score,
    testCount: row.test_count,
    devAgent: row.dev_agent,
    reviewAgent: row.review_agent,
    createdAgent: null,
    lastUpdated: row.updated_at?.split('T')[0] ?? row.created_at ?? null,
    comment: buildComment(row),
    rerun: rerunMap?.get(row.story_id) ?? null,
  };

  return {
    id: row.story_id,
    key: row.story_id,
    epicId: row.epic_id,
    title: row.title,
    status: row.status as StoryStatus,
    isEpic: false,
    metadata,
  };
}

// ── phase 正規化對照表（AC 共用唯一映射）──
function normalizeRerunPhase(phase: string): string {
  switch (phase) {
    case 'create-story': return 'create';
    case 'dev-story': return 'dev';
    case 'code-review': return 'review';
    default: return phase;
  }
}

// ── 重跑聚合（tdb-5）── 單一資料來源 = worker_runs（stories 表其他欄位受污染,詳見 Story background 校正 2）
// storyId 省略 = 全庫聚合（列表路徑）；給定 = 只聚合該筆（單列路徑，不為一列掃全表）。
function buildRerunMap(
  db: NonNullable<ReturnType<typeof getDb>>,
  storyId?: string,
): Map<string, Record<string, number>> {
  const map = new Map<string, Record<string, number>>();

  interface RerunRow { story_id: string; phase: string; mx: number }
  let rows: RerunRow[];
  try {
    const stmt = db.prepare(
      `SELECT story_id, phase, MAX(attempt) AS mx FROM worker_runs
       ${storyId ? 'WHERE story_id = ?' : ''}
       GROUP BY story_id, phase HAVING mx > 1`,
    );
    rows = (storyId ? stmt.all(storyId) : stmt.all()) as RerunRow[];
  } catch (err) {
    // +CR F3：原為空 catch。本函式是本卡唯一功能，查詢失敗時全庫徽章一律消失，
    // 而 AC2 的驗收（全庫 rerun 皆為 null）在「正確地無重跑」與「查詢整個壞掉」
    // 兩種情況下結果相同 —— 無訊號則兩者永遠無法區分。至少留下可觀測的一行。
    console.warn('[db-story-service] buildRerunMap 查詢失敗，本次不顯示重跑徽章:', err);
    return map;
  }

  for (const r of rows) {
    const phase = normalizeRerunPhase(r.phase);
    const entry = map.get(r.story_id) ?? {};
    entry[phase] = r.mx;
    map.set(r.story_id, entry);
  }

  return map;
}

function buildComment(row: DbStoryRow): string {
  const parts: string[] = [];
  if (row.complexity) parts.push(row.complexity);
  if (row.priority) parts.push(row.priority);
  if (row.cr_score !== null) parts.push(`CR:${row.cr_score}`);
  if (row.test_count !== null) parts.push(`${row.test_count} tests`);
  if (row.dev_agent) parts.push(`dev:${row.dev_agent}`);
  if (row.review_agent) parts.push(`reviewed:${row.review_agent}`);
  return parts.join(', ');
}

// ── DateRange → ISO 8601 起始時間（UTC+8 台灣時區）──
export function getDateRangeStart(range: DateRange): string {
  // 取得台灣當地時間
  const now = new Date();
  const twNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));

  let start: Date;
  switch (range) {
    case 'today':
      start = new Date(twNow.getFullYear(), twNow.getMonth(), twNow.getDate(), 0, 0, 0, 0);
      break;
    case '3d':
      start = new Date(twNow.getFullYear(), twNow.getMonth(), twNow.getDate() - 2, 0, 0, 0, 0);
      break;
    case 'week': {
      const dayOfWeek = twNow.getDay(); // 0=Sun
      const daysBack = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 週一為起點
      start = new Date(twNow.getFullYear(), twNow.getMonth(), twNow.getDate() - daysBack, 0, 0, 0, 0);
      break;
    }
    case 'month':
      start = new Date(twNow.getFullYear(), twNow.getMonth(), 1, 0, 0, 0, 0);
      break;
  }

  // 產生 "YYYY-MM-DD" 格式（純日期前綴）
  // DB 中 updated_at 有兩種格式：
  //   "2026-03-17 19:41:46"（無時區）和 "2026-03-17T21:42:20+08:00"（ISO 8601）
  // 使用純日期前綴確保兩種格式都能正確比較（SQLite 字串排序）
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
}

// ── 查詢 Story 列表 ──
const BASE_COLUMNS = `story_id, epic_id, domain, title, status, priority, complexity,
  story_type, tags, dev_agent, review_agent, cr_score, test_count, created_at, updated_at`;

export function getDbStoryList(filters?: StoryFilters): StoryEntry[] {
  const db = getDb();
  if (!db) return [];

  const conditions: string[] = [];
  const params: Record<string, string> = {};

  if (filters?.epicId) {
    conditions.push('epic_id = @epicId');
    params['epicId'] = filters.epicId;
  }
  if (filters?.status) {
    conditions.push('status = @status');
    params['status'] = filters.status;
  }
  if (filters?.dateRange) {
    const startTs = getDateRangeStart(filters.dateRange);
    conditions.push('(updated_at >= @dateStart OR (updated_at IS NULL AND created_at >= @dateStart))');
    params['dateStart'] = startTs;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // 動態排序（BR-006）
  let orderBy = 'updated_at DESC, created_at DESC';
  if (filters?.sortBy) {
    switch (filters.sortBy) {
      case 'date_asc':
        orderBy = 'updated_at ASC, created_at ASC';
        break;
      case 'epic_asc':
        orderBy = 'epic_id ASC, updated_at DESC';
        break;
      case 'epic_desc':
        orderBy = 'epic_id DESC, updated_at DESC';
        break;
      // 'date_desc' 與預設相同
    }
  }

  const sql = `SELECT ${BASE_COLUMNS} FROM stories ${where} ORDER BY ${orderBy}`;

  let rows: DbStoryRow[];
  try {
    rows = db.prepare(sql).all(params) as DbStoryRow[];
  } catch (err) {
    console.error('[db-story-service] 查詢失敗:', (err as Error).message);
    return [];
  }

  const rerunMap = buildRerunMap(db);
  let entries = rows.map(row => toStoryEntry(row, rerunMap));

  // 文字搜尋（client-side filter，因為 FTS5 需要 3+ 字元）
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    entries = entries.filter(
      s =>
        s.key.toLowerCase().includes(q) ||
        s.title.toLowerCase().includes(q) ||
        s.metadata.comment.toLowerCase().includes(q),
    );
  }

  return entries;
}

// ── 統計各狀態數量 ──
export function getDbStoryStats(epicId?: string, dateRange?: DateRange): StoryStats {
  const db = getDb();
  if (!db) {
    return { total: 0, backlog: 0, readyForDev: 0, inProgress: 0, review: 0, done: 0, cancelled: 0, other: 0 };
  }

  const conditions: string[] = [];
  const params: Record<string, string> = {};

  if (epicId) {
    conditions.push('epic_id = @epicId');
    params['epicId'] = epicId;
  }
  if (dateRange) {
    const startTs = getDateRangeStart(dateRange);
    conditions.push('(updated_at >= @dateStart OR (updated_at IS NULL AND created_at >= @dateStart))');
    params['dateStart'] = startTs;
  }

  const condition = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  interface CountRow { status: string; cnt: number }
  let rows: CountRow[];
  try {
    rows = db.prepare(
      `SELECT status, COUNT(*) as cnt FROM stories ${condition} GROUP BY status`,
    ).all(params) as CountRow[];
  } catch {
    return { total: 0, backlog: 0, readyForDev: 0, inProgress: 0, review: 0, done: 0, cancelled: 0, other: 0 };
  }

  const stats: StoryStats = {
    total: 0, backlog: 0, readyForDev: 0, inProgress: 0, review: 0, done: 0, cancelled: 0, other: 0,
  };

  for (const r of rows) {
    stats.total += r.cnt;
    switch (r.status) {
      case 'backlog':
      case 'creating': stats.backlog += r.cnt; break;
      case 'ready-for-dev': stats.readyForDev += r.cnt; break;
      case 'in-progress': stats.inProgress += r.cnt; break;
      case 'review':
      case 'reviewing': stats.review += r.cnt; break;
      case 'done': stats.done += r.cnt; break;
      case 'cancelled':
      case 'cancelled-merged':
      case 'superseded':
      case 'split':
        stats.cancelled += r.cnt; break;
      default: stats.other += r.cnt;
    }
  }

  return stats;
}

// ── Epic 清單 ──
export function getDbEpicList(): EpicSummary[] {
  const db = getDb();
  if (!db) return [];

  interface EpicRow { epic_id: string; cnt: number }
  let rows: EpicRow[];
  try {
    rows = db.prepare(
      `SELECT epic_id, COUNT(*) as cnt FROM stories GROUP BY epic_id ORDER BY epic_id`,
    ).all() as EpicRow[];
  } catch {
    return [];
  }

  return rows.map(r => ({
    epicId: r.epic_id,
    storyCount: r.cnt,
    epicStatus: 'active',
  }));
}

// ── 狀態更新（直接寫 DB）──
export function updateDbStoryStatus(storyId: string, newStatus: string): boolean {
  const db = getDb();
  if (!db) return false;

  try {
    const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).replace(' ', 'T') + '+08:00';
    const result = db.prepare(
      `UPDATE stories SET status = ?, updated_at = ? WHERE story_id = ?`,
    ).run(newStatus, now, storyId);
    return result.changes > 0;
  } catch (err) {
    console.error('[db-story-service] 狀態更新失敗:', (err as Error).message);
    return false;
  }
}

// ── 檢查 Story 是否存在 ──
export function getDbStory(storyId: string): StoryEntry | null {
  const db = getDb();
  if (!db) return null;

  try {
    const row = db.prepare(
      `SELECT ${BASE_COLUMNS} FROM stories WHERE story_id = ?`,
    ).get(storyId) as DbStoryRow | undefined;
    if (!row) return null;
    // +CR F4：原為 buildRerunMap(db)，單列查詢卻做全庫 GROUP BY。
    return toStoryEntry(row, buildRerunMap(db, storyId));
  } catch {
    return null;
  }
}

// ── Epic 完成進度（含各狀態詳細分佈）── [tdb-2 BR-013: 取代 yaml-service.getEpicProgress]
export function getDbEpicProgress(): EpicProgress[] {
  const db = getDb();
  if (!db) return [];

  interface StatusCountRow { epic_id: string; status: string; cnt: number }
  let rows: StatusCountRow[];
  try {
    rows = db.prepare(
      `SELECT epic_id, status, COUNT(*) as cnt FROM stories GROUP BY epic_id, status`,
    ).all() as StatusCountRow[];
  } catch {
    return [];
  }

  const epicMap = new Map<string, Omit<EpicProgress, 'epicId' | 'completionPct'>>();

  for (const r of rows) {
    if (!epicMap.has(r.epic_id)) {
      epicMap.set(r.epic_id, {
        epicStatus: 'active', totalStories: 0, doneCount: 0, inProgressCount: 0,
        reviewCount: 0, readyForDevCount: 0, backlogCount: 0, cancelledCount: 0,
      });
    }
    const e = epicMap.get(r.epic_id)!;
    e.totalStories += r.cnt;
    switch (r.status) {
      case 'done': e.doneCount += r.cnt; break;
      case 'in-progress': e.inProgressCount += r.cnt; break;
      case 'review':
      case 'reviewing': e.reviewCount += r.cnt; break;
      case 'ready-for-dev': e.readyForDevCount += r.cnt; break;
      case 'backlog':
      case 'creating': e.backlogCount += r.cnt; break;
      default: e.cancelledCount += r.cnt;
    }
  }

  // epicStatus 由狀態分佈推導（DB 無獨立 epic 狀態欄位，聚合近似取代 yaml 舊有的 epic-* 手動標記行）
  const result: EpicProgress[] = Array.from(epicMap.entries()).map(([epicId, e]) => {
    let epicStatus = 'backlog';
    if (e.totalStories > 0 && e.doneCount === e.totalStories) epicStatus = 'done';
    else if (e.inProgressCount > 0 || e.reviewCount > 0) epicStatus = 'in-progress';
    else if (e.readyForDevCount > 0) epicStatus = 'ready-for-dev';

    const completionPct = e.totalStories === 0 ? 0 : Math.round((e.doneCount / e.totalStories) * 100);

    return { epicId, ...e, epicStatus, completionPct };
  });

  // 按完成率高→低排序（對齊 yaml-service.getEpicProgress AC-6）
  result.sort((a, b) => b.completionPct - a.completionPct);

  return result;
}

// ── 複雜度分佈聚合 ── [tdb-2 BR-013: 取代 yaml-service.getComplexityDistribution]
export function getDbComplexityDistribution(epicId?: string): ComplexityDistribution {
  const dist: ComplexityDistribution = { XS: 0, S: 0, M: 0, L: 0, XL: 0, untagged: 0 };
  const db = getDb();
  if (!db) return dist;

  const where = epicId ? 'WHERE epic_id = @epicId' : '';
  interface ComplexityRow { complexity: string | null; cnt: number }
  let rows: ComplexityRow[];
  try {
    rows = db.prepare(
      `SELECT complexity, COUNT(*) as cnt FROM stories ${where} GROUP BY complexity`,
    ).all(epicId ? { epicId } : {}) as ComplexityRow[];
  } catch {
    return dist;
  }

  for (const r of rows) {
    switch (r.complexity) {
      case 'XS': dist.XS += r.cnt; break;
      case 'S': dist.S += r.cnt; break;
      case 'M': dist.M += r.cnt; break;
      case 'L': dist.L += r.cnt; break;
      case 'XL': dist.XL += r.cnt; break;
      default: dist.untagged += r.cnt;
    }
  }

  return dist;
}
