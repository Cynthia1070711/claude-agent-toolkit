# TRS-31: 多 Agent 並行執行策略報告

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-31 |
| **狀態** | done |
| **複雜度** | S |
| **優先級** | P1 |
| **建立時間** | 2026-02-27 21:18 |
| **最後更新** | 2026-02-27 21:18 |
| **依賴** | 無 |
| **類型** | E 類（多引擎協作） |
| **建立者** | CC-OPUS（Party Mode） |

## 描述

Party Mode 討論中，Winston (Architect)、Amelia (Dev)、Bob (SM) 三位角色針對多 Agent 並行開發的三個核心問題進行深入分析：

1. Commit 是否消耗 Token
2. 多 Agent 同時 Commit 的風險
3. 同時讀寫同一檔案的解法

產出三層解決架構：Worktree 隔離 + File Lock 機制 + Total Commit 模式。

## 驗收條件

- [x] AC-1: 策略報告完成，涵蓋三層架構（Worktree + File Lock + Total Commit）
- [x] AC-2: 報告放置於 `docs/專案部屬必讀/multi-agent-parallel-execution-strategy.md`
- [x] AC-3: 場景 × 策略對應表明確定義（同引擎多開 vs 跨引擎 vs 混合）
- [x] AC-4: 與推進樹狀圖的衝突分析完成（Hot File 矩陣 + Worktree 行為模擬）
- [x] AC-5: 後續 TRS Story（TRS-32、TRS-33）已規劃

## 交付物

| 檔案 | 路徑 |
|------|------|
| 策略報告 | `docs/專案部屬必讀/multi-agent-parallel-execution-strategy.md` |
| TRS-32 Story | `claude token減量策略研究分析/stories/TRS-32-file-lock-mechanism.md` |
| TRS-33 Story | `claude token減量策略研究分析/stories/TRS-33-worktree-parallel-sop.md` |
| 部署必讀 README 更新 | `docs/專案部屬必讀/README.md` |

## Change Log

```
[CC-OPUS] 2026-02-27T21:18:00+08:00 Party Mode 討論完成，策略報告建立
```
