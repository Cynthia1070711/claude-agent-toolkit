// ============================================================
// godNodesApi.ts — God Node Treemap API wrapper
// Story: td-devconsole-godnode-and-mem-dashboard (Phase 2.8)
// ============================================================
import { apiFetch } from './apiClient.js';

export interface GodNode {
  id: number;
  symbol_name: string;
  full_name: string;
  namespace: string;
  file_path: string;
  absolute_path: string;
  symbol_type: string;
  start_line: number;
  end_line: number;
  signature: string | null;
  centrality_score: number;
}

export interface GodNodeListResponse {
  total: number;
  filter: {
    limit: number;
    namespace: string | null;
    include_generated: boolean;
    excluded_namespaces: string[];
  };
  god_nodes: GodNode[];
}

export interface NamespaceStat {
  namespace: string;
  count: number;
  avg: number;
  max: number;
}

export interface GodNodeDistribution {
  total: number;
  non_zero_count: number;
  non_zero_pct: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p50: number;
  p75: number;
  p95: number;
  p99: number;
  include_generated: boolean;
  last_computed: string | null;
  by_namespace: NamespaceStat[];
  // CR F-M10 fix: distinct namespace total (UI shows "12 of N total" when LIMIT 30 truncates)
  by_namespace_total?: number;
}

export async function fetchGodNodes(opts: {
  limit?: number;
  namespace?: string;
  include_generated?: boolean;
} = {}): Promise<GodNodeListResponse> {
  const params = new URLSearchParams();
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts.namespace) params.set('namespace', opts.namespace);
  if (opts.include_generated) params.set('include_generated', 'true');
  const q = params.toString();
  return apiFetch<GodNodeListResponse>(`/godnodes${q ? `?${q}` : ''}`);
}

export async function fetchGodNodeDistribution(include_generated = false): Promise<GodNodeDistribution> {
  const params = include_generated ? '?include_generated=true' : '';
  return apiFetch<GodNodeDistribution>(`/godnodes/distribution${params}`);
}

/** 將 namespace 字串雜湊為 hue (0-360),確保同 namespace 必同色;
 *  saturation/lightness 固定 60%/50% 對齊 WCAG AA contrast deterministic */
export function hslByCluster(namespace: string): string {
  let hash = 0;
  for (let i = 0; i < namespace.length; i++) {
    hash = namespace.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 50%)`;
}

/** 從 god_nodes 取 distinct top-level namespace cluster(取前 3 段)
 *  e.g. "PhyCool.Web.Services.BackOffice" → "PhyCool.Web.Services" */
export function extractCluster(namespace: string): string {
  const parts = namespace.split('.');
  return parts.length <= 3 ? namespace : parts.slice(0, 3).join('.');
}
