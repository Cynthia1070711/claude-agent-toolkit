export interface InstinctCard {
  id: string;
  trigger: string;
  action: string;
  confidence: number;
  verifier_status: 'approved' | 'needs-more-evidence' | 'rejected' | null;
  verifier_reason: string | null;
  adoption_score: number;
  domain: string | null;
  scope: string;
  evidence_jsonb: string | null;
  source: string | null;
  source_session_id: string | null;
  created_at: string;
  last_seen: string;
  decay_at: string | null;
  project_type: string | null;
  business: string | null;
  description_zh: string | null;
  user_note: string | null;
  machine_star: number;
  rejected_count?: number;
}

// ── 4 池 Pool Types (ecc-emergence-ui-v2) ────────────────────
export type PoolKey = 'skill' | 'candidate' | 'observe' | 'rejected';

export interface PoolState {
  collapsed: Record<PoolKey, boolean>;
  counts: Record<PoolKey, number>;
}

// ── GeneratedSkill (技能池) ──────────────────────────────────
export interface GeneratedSkill {
  id: number;
  instinct_cluster_id: string;
  skill_path: string;
  status: 'active' | 'paused' | 'deleted';
  generated_at: string;
  improvement_pct: number | null;
  before_freq: number | null;
  after_freq: number | null;
}

// ── EffectMetric (技能效果量測) ──────────────────────────────
export interface EffectMetric {
  id: number;
  skill_id: number;
  before_freq: number;
  after_freq: number;
  improvement_pct: number;
  measured_at: string;
}

// ── RejectedInstinct (否決池) ────────────────────────────────
export interface RejectedInstinct {
  id: number;
  trigger: string;
  action: string;
  reject_reason: string | null;
  reject_count: number;
  rejected_at: string;
  restored_at: string | null;
  confidence: number | null;
  machine_star: number | null;
  adoption_score: number | null;
}

export interface Layer12Observation {
  cap: number;
  used: number;
  pct: number;
  projectType: string | null;
  injected: Array<{ score: number; trigger: string; action: string }>;
}

export interface TrendsView {
  ranking: InstinctCard[];
  decaying: InstinctCard[];
  timeline: InstinctCard[];
}

// ── 演化候選類型(AC6 · Story C) ──────────────────────────
export interface EvolveMember {
  id: string;
  trigger: string;
  action: string;
  confidence: number;
  adoption_score: number;
  rejected_count: number;
}

export interface EvolveCandidate {
  type: 'skill' | 'agent-hook';
  domain: string;
  business: string;
  project_type: string;
  member_ids: string[];
  members: EvolveMember[];
  avg_confidence: number;
  avg_adoption_score: number;
  rejected_total: number;
  redundant?: boolean;
  covered_by?: string[];
  suggested_action: string;
}

export interface SkillCapStatus {
  phycoolCount: number;
  phycoolCap: number;
  generalCount: number;
  generalCap: number;
  totalCount: number;
  totalCap: number;
}

export interface EvolveCandidatesResponse {
  candidates: EvolveCandidate[];
  total: number;
  skillCapStatus: SkillCapStatus;
  generatedAt: string;
}

export interface EmergenceFunnel {
  observations: { total: number; processed: number; processedPct: number };
  instincts: { total: number; approved: number; needsEvidence: number; rejected: number };
  rejected: { total: number };
  conversionRate: { obsToInstinct: number; approvedPct: number };
}
