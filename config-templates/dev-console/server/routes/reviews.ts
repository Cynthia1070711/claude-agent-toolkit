import { Router, Request, Response } from 'express';
import {
  listReviewReports,
  getReviewReport,
  listReviewFindings,
  updateFindingFixStatus,
  updateReportReview,
  getReviewStats,
} from '../services/reviewService.js';

const router = Router();

// GET /api/reviews/stats — 統計總覽
router.get('/stats', (req: Request, res: Response) => {
  try {
    const { plan_id } = req.query;
    const stats = getReviewStats(plan_id as string | undefined);
    res.json(stats);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/reviews/reports — 報告列表
router.get('/reports', (req: Request, res: Response) => {
  try {
    const { plan_id, module_code, engine, status, page, pageSize } = req.query;
    const result = listReviewReports({
      plan_id: plan_id as string,
      module_code: module_code as string,
      engine: engine as string,
      status: status as string,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
    });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/reviews/reports/:reportId — 單一報告
router.get('/reports/:reportId', (req: Request, res: Response) => {
  try {
    const report = getReviewReport(req.params.reportId as string);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    res.json(report);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/reviews/reports/:reportId/review — 人工審查標記
router.patch('/reports/:reportId/review', (req: Request, res: Response) => {
  try {
    const result = updateReportReview(req.params.reportId as string, req.body);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/reviews/findings — 發現列表
router.get('/findings', (req: Request, res: Response) => {
  try {
    const { report_id, module_code, severity, fix_status, search, page, pageSize } = req.query;
    const result = listReviewFindings({
      report_id: report_id as string,
      module_code: module_code as string,
      severity: severity as string,
      fix_status: fix_status as string,
      search: search as string,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
    });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/reviews/findings/:findingId — 更新修復狀態
router.patch('/findings/:findingId', (req: Request, res: Response) => {
  try {
    const result = updateFindingFixStatus(req.params.findingId as string, req.body);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
