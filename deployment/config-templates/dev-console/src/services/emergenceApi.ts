// ============================================================
// emergenceApi.ts — ECC 湧現迴路 API wrapper
// Epic-ECC-V2 Story A: /emergence 頁核心
// ============================================================
import { apiFetch, API_BASE } from './apiClient.js';
import type { InstinctCard, EmergenceFunnel, Layer12Observation } from '../types/emergence.js';

export async function fetchPipeline(): Promise<EmergenceFunnel> {
  return apiFetch<EmergenceFunnel>('/emergence/pipeline');
}

export async function fetchInstincts(): Promise<InstinctCard[]> {
  return apiFetch<InstinctCard[]>('/emergence/instincts');
}

// PUT 走原生 fetch — 共用 apiClient.apiFetch 為 GET-only(不傳 options),
// 對齊 reviewsApi.ts:52/62 既有 mutation 範式(CR F1 修復:原 apiFetch 第 2 參數被靜默忽略 → 退化成 GET → 404)
export async function putInstinctNote(id: string, userNote: string | null): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/emergence/instincts/${encodeURIComponent(id)}/note`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_note: userNote }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean }>;
}

export async function putInstinctLike(id: string): Promise<{ ok: boolean; confidence: number }> {
  const res = await fetch(`${API_BASE}/emergence/instincts/${encodeURIComponent(id)}/like`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error || `HTTP ${res.status}`);
  }
  // CR F1 修復:後端(upsert-instinct.js cmdLike)回傳 { ok, id, new_confidence },欄位為 new_confidence。
  // 原 `as Promise<{ok,confidence}>` 僅型別斷言不改 runtime → result.confidence 實為 undefined
  // → handleLike 樂觀更新 confidence=undefined → 進度條 Math.round(undefined*100)=NaN%(違反 AC2)。
  // 在 wrapper 層映射 new_confidence → confidence,保持 component/type 契約不變。
  const data = (await res.json()) as { ok: boolean; new_confidence: number };
  return { ok: data.ok, confidence: data.new_confidence };
}

export async function postInstinctReject(id: string, reason: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/emergence/instincts/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean }>;
}

export async function fetchEvolveCandidates(): Promise<import('../types/emergence.js').EvolveCandidatesResponse> {
  return apiFetch<import('../types/emergence.js').EvolveCandidatesResponse>('/emergence/evolve-candidates');
}

// 候選否決 — 批次否決成員 instinct(閉環 P1 redundant 偵測)。POST 走原生 fetch(對齊 postInstinctReject 範式)
export async function postCandidateReject(
  memberIds: string[],
  reason: string,
): Promise<{ ok: boolean; rejected: number; rejected_ids: string[]; failed: { id: string; detail: string }[] }> {
  const res = await fetch(`${API_BASE}/emergence/evolve-candidates/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ member_ids: memberIds, reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean; rejected: number; rejected_ids: string[]; failed: { id: string; detail: string }[] }>;
}

// ── ecc-emergence-ui-v2 新增 API wrappers ────────────────────

export async function putInstinctDislike(id: string): Promise<{ ok: boolean; confidence: number }> {
  const res = await fetch(`${API_BASE}/emergence/instincts/${encodeURIComponent(id)}/dislike`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error || `HTTP ${res.status}`);
  }
  // 後端回傳 { ok, id, confidence } — 直接映射(對齊 CR F1b 範式)
  return res.json() as Promise<{ ok: boolean; confidence: number }>;
}

export async function putInstinctRestore(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/emergence/instincts/${encodeURIComponent(id)}/restore`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean }>;
}

export async function fetchRejectedInstincts(): Promise<import('../types/emergence.js').RejectedInstinct[]> {
  return apiFetch<import('../types/emergence.js').RejectedInstinct[]>('/emergence/rejected');
}

export async function fetchGeneratedSkills(): Promise<import('../types/emergence.js').GeneratedSkill[]> {
  return apiFetch<import('../types/emergence.js').GeneratedSkill[]>('/emergence/generated-skills');
}

export async function putSkillPause(id: number): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/emergence/generated-skills/${id}/pause`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean }>;
}

export async function deleteGeneratedSkill(id: number): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/emergence/generated-skills/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean }>;
}

export async function fetchLayer12(projectType?: string): Promise<Layer12Observation> {
  const url = projectType
    ? `${API_BASE}/emergence/layer12?projectType=${encodeURIComponent(projectType)}`
    : `${API_BASE}/emergence/layer12`;
  return apiFetch<Layer12Observation>(url.replace(API_BASE, ''));
}
