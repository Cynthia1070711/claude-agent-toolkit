// ============================================================
// workflows.ts — Workflow API 路由 (Express Router)
// dvs-06: GET /api/workflows/executions|stats|trend|model-distribution
// ============================================================
import { Router, Request, Response } from 'express';
import * as workflowService from '../services/workflowService.js';

const router = Router();

// ── GET /api/workflows/executions ────────────────────────────
// BR-001/002: 分頁列表，pageSize 上限 50
router.get('/executions', (req: Request, res: Response) => {
  const { page, pageSize, status, workflow_type, story_id } = req.query;
  try {
    const result = workflowService.getWorkflowExecutions({
      page: page !== undefined ? Number(page) : undefined,
      pageSize: pageSize !== undefined ? Number(pageSize) : undefined,
      status: status ? String(status) : undefined,
      workflow_type: workflow_type ? String(workflow_type) : undefined,
      story_id: story_id ? String(story_id) : undefined,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /api/workflows/stats ──────────────────────────────────
// BR-003/004: 聚合統計，successRate 排除 running
// from/to: YYYY-MM-DD 台灣日區間（預設本月全部）；格式錯誤或顛倒由 service 正規化
router.get('/stats', (req: Request, res: Response) => {
  const { status, from, to } = req.query;
  try {
    const result = workflowService.getWorkflowStats({
      status: status ? String(status) : undefined,
      from: from ? String(from) : undefined,
      to: to ? String(to) : undefined,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /api/workflows/trend ──────────────────────────────────
// BR-005: 按日聚合，days 預設 7，上限 90
router.get('/trend', (req: Request, res: Response) => {
  const { days } = req.query;
  try {
    const result = workflowService.getWorkflowTrend({
      days: days !== undefined ? Number(days) : undefined,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /api/workflows/model-distribution ─────────────────────
// BR-006: 各模型 workflow 數量與 token 佔比
router.get('/model-distribution', (_req: Request, res: Response) => {
  try {
    const result = workflowService.getModelDistribution();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
