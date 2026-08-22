// ============================================================
// GET /api/dashboard — 聚合 storyStats + memoryStats + recentActivity
// DVS-05 AC-1
// [tdb-2 BR-013] storyStats 資料源改 stories 表(DB-first)— sprint-status.yaml 已凍結 2026-07-28,
// story.total 現等於 SELECT COUNT(*) FROM stories(改前為 yaml 條目數,兩者不等 — 數字變大屬預期修正)。
// ============================================================
import { Router, Request, Response } from 'express';
import { getDbStoryStats } from '../services/db-story-service.js';
import { getStats } from '../services/memoryService.js';
import { getEmbeddingStats } from '../services/documentService.js';
import { getDb } from '../db.js';

// 最近活動查詢（合併 session 記錄 + workflow 執行，時間倒序）
function getRecentActivity() {
  const db = getDb();
  if (!db) return [];
  try {
    // Session 記錄
    const sessions = db
      .prepare(
        `SELECT id, timestamp, title, content, category
         FROM context_entries
         WHERE category = 'session'
         ORDER BY timestamp DESC
         LIMIT 10`,
      )
      .all() as { id: number; timestamp: string; title: string; content: string; category: string }[];

    // Workflow 執行記錄
    let workflows: { id: number; timestamp: string; title: string; content: string; category: string }[] = [];
    try {
      const wfRows = db
        .prepare(
          `SELECT id, started_at, workflow_type, status, agent_id, story_id,
                  input_tokens, output_tokens, duration_ms, error_message
           FROM workflow_executions
           ORDER BY started_at DESC
           LIMIT 10`,
        )
        .all() as { id: number; started_at: string; workflow_type: string; status: string; agent_id: string | null; story_id: string | null; input_tokens: number; output_tokens: number; duration_ms: number | null; error_message: string | null }[];

      workflows = wfRows.map(w => ({
        id: w.id + 100000, // offset to avoid ID collision with context_entries
        timestamp: w.started_at,
        title: `${w.workflow_type} — ${w.status}${w.story_id ? ` (${w.story_id})` : ''}`,
        content: [
          w.agent_id && `Agent: ${w.agent_id}`,
          `Tokens: ${w.input_tokens} in / ${w.output_tokens} out`,
          w.duration_ms && `Duration: ${w.duration_ms}ms`,
          w.error_message && `Error: ${w.error_message}`,
        ].filter(Boolean).join(' | '),
        category: 'workflow',
      }));
    } catch { /* workflow_executions table may not exist yet */ }

    // 合併 + 按時間排序
    const merged = [...sessions, ...workflows]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 15);

    return merged;
  } catch {
    return [];
  }
}

const router = Router();

// ── GET /api/dashboard ──
router.get('/dashboard', async (_req: Request, res: Response) => {
  // 並行取得三個資料源（任一失敗不影響其他）
  const [storyResult, memoryResult, activityResult, embeddingResult] = await Promise.allSettled([
    Promise.resolve((() => {
      try {
        return getDbStoryStats();
      } catch {
        return { total: 0, backlog: 0, readyForDev: 0, inProgress: 0, review: 0, done: 0, cancelled: 0, other: 0 };
      }
    })()),
    Promise.resolve((() => {
      try {
        return getStats();
      } catch {
        return null;
      }
    })()),
    Promise.resolve(getRecentActivity()),
    Promise.resolve((() => {
      try {
        return getEmbeddingStats();
      } catch {
        return null;
      }
    })()),
  ]);

  const storyStats = storyResult.status === 'fulfilled' ? storyResult.value : {
    total: 0, backlog: 0, readyForDev: 0, inProgress: 0, review: 0, done: 0, cancelled: 0, other: 0,
  };
  const memoryStats = memoryResult.status === 'fulfilled' ? memoryResult.value : null;
  const recentActivity = activityResult.status === 'fulfilled' ? activityResult.value : [];
  const embeddingStats = embeddingResult.status === 'fulfilled' ? embeddingResult.value : null;

  res.json({ storyStats, memoryStats, recentActivity, embeddingStats });
});

export default router;
