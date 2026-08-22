// ============================================================
// intentionalApi.ts — IDD API Client
// DLA-07: 呼叫 /api/intentional 端點
// ============================================================
const BASE = '/api/intentional';

export interface IddEntry {
  idd_id: string;
  idd_type: 'COM' | 'STR' | 'REG' | 'USR';
  title: string;
  decision: string;
  reason: string;
  criticality: 'critical' | 'normal' | 'low';
  status: 'active' | 'retired' | 'superseded';
  signoff_by: string;
  signoff_date: string;
  forbidden_changes: string | null;
  related_skills: string | null;
  platform_modules: string | null;
  adr_path: string;
  code_locations: string | null;
  last_verified_at: string | null;
  updated_at: string;
}

export interface IddListResult {
  items: IddEntry[];
  stats: { idd_type: string; criticality: string; count: number }[];
  total: number;
}

export async function fetchIntentionalDecisions(params: {
  idd_type?: string;
  criticality?: string;
  status?: string;
  search?: string;
}): Promise<IddListResult> {
  const qs = new URLSearchParams();
  if (params.idd_type) qs.set('idd_type', params.idd_type);
  if (params.criticality) qs.set('criticality', params.criticality);
  if (params.status) qs.set('status', params.status);
  if (params.search) qs.set('search', params.search);

  const res = await fetch(`${BASE}?${qs.toString()}`);
  if (!res.ok) throw new Error(`IDD API error: ${res.status}`);
  return res.json() as Promise<IddListResult>;
}

export async function fetchIntentionalDecision(idd_id: string): Promise<IddEntry> {
  const res = await fetch(`${BASE}/${encodeURIComponent(idd_id)}`);
  if (!res.ok) throw new Error(`IDD not found: ${idd_id}`);
  return res.json() as Promise<IddEntry>;
}
