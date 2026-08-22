// ============================================================
// useSilentRetryError.test.ts — BR051 穩定物件參照 + 基本行為（tdb-1-track-plan-roadmap 抽出）
// ============================================================
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useSilentRetryError } from '../useSilentRetryError';

describe('useSilentRetryError', () => {
  it('BR051_UseSilentRetryError_ReturnsStableReference: 連續兩次 render 無 state 變化回傳同一物件參照', () => {
    const { result, rerender } = renderHook(() => useSilentRetryError());
    const r1 = result.current;
    rerender();
    const r2 = result.current;
    expect(r1).toBe(r2);
  });

  it('首次失敗立即顯示 error（不等 threshold 次）', () => {
    const { result } = renderHook(() => useSilentRetryError(3));
    act(() => result.current.reportFailure('第一次失敗'));
    expect(result.current.error).toBe('第一次失敗');
  });

  it('非首次失敗需累積至 threshold 才顯示 error', () => {
    const { result } = renderHook(() => useSilentRetryError(3));
    act(() => result.current.reportFailure('first'));
    act(() => result.current.reportSuccess());
    expect(result.current.error).toBeNull();

    act(() => result.current.reportFailure('fail-1'));
    expect(result.current.error).toBeNull();
    act(() => result.current.reportFailure('fail-2'));
    expect(result.current.error).toBeNull();
    act(() => result.current.reportFailure('fail-3'));
    expect(result.current.error).toBe('fail-3');
  });

  it('reportSuccess 重置 error 與失敗計數', () => {
    const { result } = renderHook(() => useSilentRetryError(3));
    act(() => result.current.reportFailure('boom'));
    expect(result.current.error).toBe('boom');
    act(() => result.current.reportSuccess());
    expect(result.current.error).toBeNull();
  });
});
