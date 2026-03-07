# 🟢 Story TRS-37: Tech Debt Registry 死數據歸檔（Token 最大單點黑洞修復）

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-37-REGISTRY-YAML-DEAD-DATA-ARCHIVE |
| **Epic** | Epic TRS - Token 減量策略 (Token Reduction Strategy) |
| **優先級** | P0 |
| **類型** | Architecture / Optimization |
| **複雜度** | S (1-2 SP) |
| **狀態** | done |
| **來源** | Party Mode 討論 2026-03-01（全專案 token 消耗掃描分析） |
| **依賴** | 無 |
| **建立日期** | 2026-03-01 |
| **Create Agent** | Claude Opus 4.6 (CC-OPUS) |
| **Create完成時間** | 2026-03-01 10:26 |

---

## Story

As a 多引擎 AI Agent 開發者,
I want 將 registry.yaml 中已終結的 entries（resolved + wont_fix，佔 84%）歸檔至 registry-archive.yaml，僅保留 pending entries,
so that registry.yaml 從 980 行降至 ~140 行，code-review workflow 讀取成本大幅降低，消除當前專案中 token 消耗最大的單點黑洞。

---

## Background

### 現況問題

全專案 token 消耗熱力圖掃描發現：

| 檔案 | 行數 | CR 讀取次數 | 每次 CR 消耗 | Sprint 總消耗 (8 Stories) |
|------|------|-----------|-------------|-------------------------|
| **registry.yaml** | **980** | **2-3 次** | **~2,940 行** | **~23,120 行** |
| sprint-status.yaml | 239 | 1 次 | ~239 行 | ~5,712 行 |

**registry.yaml 的 token 消耗是 sprint-status 的 4 倍**，是 TRS-35 優化目標的 4 倍。

### 為什麼不需要全讀？

Code-review workflow 讀取 registry.yaml 的目的：
1. **Step 1**：計數 `status: pending` 項目數量（Production Gate 閾值 ≤ 15）
2. **Step 4**：確認新 deferred 項目不與現有重複
3. **Step 5**：再次計數確認最終數量

三個步驟都只需要 **entry-id + status + story-key**，不需要完整的 description/context/impact 等欄位。

### 已有的 Sidecar 架構基礎

TRS-34 已建立 sidecar 機制：每個 Story 的技術債詳細資料存在 `tech-debt/{story-key}.debt.md`。
registry.yaml 本應只是「索引」，但目前每個 entry 仍包含 5-8 行詳細描述，導致檔案膨脹至 980 行。

---

## 驗收標準 (Acceptance Criteria)

### AC-1: Registry Index 建立
- [ ] 建立 `registry-index.yaml`（或重構 registry.yaml 為輕量版）
- [ ] 每個 entry 只保留：entry-id、status、story-key、domain、severity
- [ ] 目標行數：~50-80 行（現有 ~41 entries × 1-2 行/entry）

### AC-2: 詳細資料遷移至 Sidecar
- [ ] 現有 registry.yaml 中的 description/context/impact 遷移至對應 sidecar 檔案
- [ ] 已有 sidecar 的 entry 驗證資料一致性
- [ ] 無 sidecar 的 entry 建立對應檔案

### AC-3: Workflow Instructions 更新
- [ ] code-review instructions.xml Step 1：改為 Grep registry-index 計數 pending
- [ ] code-review instructions.xml Step 4：改為 Grep registry-index 查重複
- [ ] code-review instructions.xml Step 5：改為 Grep registry-index 最終計數
- [ ] example-debt-registry SKILL.md：更新存取規則

### AC-4: 資料完整性驗證
- [ ] 遷移後 entry 總數一致（pending/deferred/resolved/won't-fix 計數不變）
- [ ] 所有 sidecar 檔案可從 index 正確定位
- [ ] check-hygiene.ps1 擴展：registry-index 與 sidecar 一致性檢查

---

## Token 減量預估

| 場景 | 現在 | 優化後 | 節省 |
|------|------|--------|------|
| CR Step 1 計數 | 980 行 Read | ~1 行 Grep | 99.9% |
| CR Step 4 查重複 | 980 行 Read | ~1 行 Grep | 99.9% |
| CR Step 5 最終計數 | 980 行 Read | ~1 行 Grep | 99.9% |
| **單次 CR 合計** | **~2,940 行** | **~3 行** | **99.9%** |
| **Sprint 8 Stories** | **~23,520 行** | **~24 行** | **99.9%** |

---

## 目標檔案結構

```
docs/implementation-artifacts/tech-debt/
├── registry-index.yaml              ← 輕量索引 ~50-80 行
├── {story-key}.debt.md              ← 已有 sidecar（詳細描述）
└── registry.yaml                    ← 廢棄或保留為 archive 參考
```

### registry-index.yaml 範例

```yaml
# registry-index.yaml — Tech Debt 輕量索引
# 規則：每行一個 entry，只含查詢必要欄位
# 更新：code-review workflow 完成時 sed 追加/更新

entries:
  # entry-id: [status, story-key, domain, severity]
  PEND-QGR-S6-001: [pending, qgr-s6, security, M]
  PEND-QGR-M10-001: [pending, qgr-m10, css, L]
  DEF-QGR-D7-001: [deferred, qgr-d7, pdf, M]
  WF-QGR-E7-001: [won't-fix, qgr-e7, editor, L]
  # ...

summary:
  total: 41
  pending: 13
  deferred: 5
  resolved: 23
```

---

## Change Log

| 日期 | Agent | 動作 |
|------|-------|------|
| 2026-03-01 10:26 | CC-OPUS | 建立 Story（Party Mode 全專案掃描產出，Token 最大單點黑洞） |
| 2026-03-01 11:11 | CC-OPUS | 執行完成 — registry.yaml 980→174 行，52 entries 歸檔至 registry-archive.yaml |
