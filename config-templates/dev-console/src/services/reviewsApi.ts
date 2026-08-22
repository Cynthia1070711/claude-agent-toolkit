import type {
  ReviewReportListResult,
  ReviewFindingListResult,
  ReviewReportsQuery,
  ReviewFindingsQuery,
  ReviewReport,
} from '../types/reviews';

const API_BASE = 'http://localhost:3001/api/reviews';

function buildQuery(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  return sp.toString();
}

export async function fetchReviewStats(planId?: string) {
  const q = planId ? `?plan_id=${planId}` : '';
  const res = await fetch(`${API_BASE}/stats${q}`);
  if (!res.ok) throw new Error(`Stats fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchReviewReports(query: ReviewReportsQuery): Promise<ReviewReportListResult> {
  const q = buildQuery(query as Record<string, unknown>);
  const res = await fetch(`${API_BASE}/reports?${q}`);
  if (!res.ok) throw new Error(`Reports fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchReviewReport(reportId: string): Promise<ReviewReport> {
  const res = await fetch(`${API_BASE}/reports/${encodeURIComponent(reportId)}`);
  if (!res.ok) throw new Error(`Report fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchReviewFindings(query: ReviewFindingsQuery): Promise<ReviewFindingListResult> {
  const q = buildQuery(query as Record<string, unknown>);
  const res = await fetch(`${API_BASE}/findings?${q}`);
  if (!res.ok) throw new Error(`Findings fetch failed: ${res.status}`);
  return res.json();
}

export async function updateFindingStatus(findingId: string, updates: {
  fix_status?: string;
  fix_story_id?: string;
  fix_notes?: string;
  fixed_by?: string;
}) {
  const res = await fetch(`${API_BASE}/findings/${encodeURIComponent(findingId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Update failed: ${res.status}`);
  return res.json();
}

export async function markReportReviewed(reportId: string, notes?: string) {
  const res = await fetch(`${API_BASE}/reports/${encodeURIComponent(reportId)}/review`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewed_by: 'Alan', review_notes: notes }),
  });
  if (!res.ok) throw new Error(`Review mark failed: ${res.status}`);
  return res.json();
}
