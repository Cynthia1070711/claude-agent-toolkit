// ============================================================
// emergenceApi.test.ts — ecc-emergence-governance CR 回歸測試
// CR F1: putInstinctLike 必須把後端 new_confidence 映射為 confidence
//        (原 `as Promise<{ok,confidence}>` 型別斷言不改 runtime → confidence=undefined → 進度條 NaN%)
// ============================================================
import { describe, it, expect, vi, afterEach } from 'vitest';

// apiClient 提供 API_BASE + apiFetch(putInstinctLike 用原生 fetch,此處只需穩定 API_BASE)
vi.mock('../apiClient.js', () => ({
  API_BASE: '/api',
  apiFetch: vi.fn(),
}));

import { putInstinctLike, postInstinctReject } from '../emergenceApi.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('emergenceApi — putInstinctLike(CR F1 wire-format 回歸)', () => {
  it('應把後端 { ok, id, new_confidence } 映射為 { ok, confidence }(非 undefined)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, id: 'inst_x', new_confidence: 0.9 }),
    }));

    const result = await putInstinctLike('inst_x');

    expect(result.ok).toBe(true);
    // 關鍵斷言:原 bug 下此值為 undefined(讀錯欄位)→ 卡片進度條 Math.round(undefined*100)=NaN
    expect(result.confidence).toBe(0.9);
    expect(result.confidence).not.toBeUndefined();
  });

  it('non-ok 回應時應 throw 帶後端 error 訊息', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ error: 'like cmd 執行失敗' }),
    }));

    await expect(putInstinctLike('inst_x')).rejects.toThrow('like cmd 執行失敗');
  });
});

describe('emergenceApi — postInstinctReject', () => {
  it('應以 POST + {reason} body 呼叫並回傳 ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await postInstinctReject('inst_x', '與既有 hook 重複');

    expect(result.ok).toBe(true);
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ reason: '與既有 hook 重複' });
  });
});

// ── ecc-emergence-ui-v2 新增 wrappers(CR Bug E 補測) ───────────────
import {
  putInstinctDislike, putInstinctRestore, putSkillPause, deleteGeneratedSkill,
} from '../emergenceApi.js';

describe('emergenceApi — putInstinctDislike(ecc-emergence-ui-v2 AC4)', () => {
  it('PUT /dislike 成功回傳 { ok, confidence }', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, id: 'inst_x', confidence: 0.7 }),
    }));
    const result = await putInstinctDislike('inst_x');
    expect(result.ok).toBe(true);
    expect(result.confidence).toBe(0.7);
  });

  it('non-ok 回應時 throw 帶後端 error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 500, statusText: 'Internal Server Error',
      json: async () => ({ error: 'dislike cmd 執行失敗' }),
    }));
    await expect(putInstinctDislike('inst_x')).rejects.toThrow('dislike cmd 執行失敗');
  });
});

describe('emergenceApi — putInstinctRestore(ecc-emergence-ui-v2 AC5)', () => {
  it('PUT /restore 成功回傳 ok:true', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, id: 'inst_x', restored_at: '2026-05-28T15:00:00+08:00' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await putInstinctRestore('inst_x');
    expect(result.ok).toBe(true);
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe('PUT');
  });
});

describe('emergenceApi — putSkillPause(ecc-emergence-ui-v2 AC6)', () => {
  it('PUT /pause 成功回傳 ok:true', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, id: 1, status: 'paused' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await putSkillPause(1);
    expect(result.ok).toBe(true);
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe('PUT');
  });
});

describe('emergenceApi — deleteGeneratedSkill(ecc-emergence-ui-v2 AC6)', () => {
  it('DELETE /generated-skills/:id 成功回傳 ok:true', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, id: 1, status: 'deleted' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await deleteGeneratedSkill(1);
    expect(result.ok).toBe(true);
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe('DELETE');
  });

  it('non-ok 回應時 throw error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 500, statusText: 'Internal Server Error',
      json: async () => ({ error: 'delete cmd 執行失敗' }),
    }));
    await expect(deleteGeneratedSkill(1)).rejects.toThrow('delete cmd 執行失敗');
  });
});
