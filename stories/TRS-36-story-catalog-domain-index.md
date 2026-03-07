# 🚫 Story TRS-36: Story Catalog 三層索引架構 (Phase 2 — Domain Index + 驗證機制) — CANCELLED

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-36-STORY-CATALOG-DOMAIN-INDEX |
| **Epic** | Epic TRS - Token 減量策略 (Token Reduction Strategy) |
| **優先級** | P1 |
| **類型** | Architecture / Optimization |
| **複雜度** | M (3-5 SP) |
| **狀態** | cancelled |
| **來源** | Party Mode 討論 2026-03-01（CC-OPUS + Winston/Mary/Amelia/Wendy） |
| **依賴** | TRS-35（Phase 1: sprint-status Index + Detail 分離） |
| **建立日期** | 2026-03-01 |
| **Create Agent** | Claude Opus 4.6 (CC-OPUS) |
| **Create完成時間** | 2026-03-01 09:47 |

---

## Story

As a 多引擎 AI Agent 開發者,
I want 建立完整的三層索引架構（Catalog → Domain Index → Story Detail），讓 Agent 可透過分層搜尋逐步縮小範圍,
so that 領域搜尋（如「找所有 PDF 相關 Story」）從讀取多個完整檔案（~42,000 tokens）降至 Grep 兩個索引（~60 tokens），並建立自動同步驗證機制確保索引一致性。

---

## Background

### 前置作業 (TRS-35 Phase 1)
TRS-35 建立了 `story-catalog.yaml`（Layer 0），將 sprint-status.yaml 拆分為輕量索引 + Epic 分拆的 detail 檔。Phase 1 攔截 80% 的日常查詢。

### Phase 2 目標
在 Phase 1 基礎上擴展：
1. **Layer 1: Domain Index** — 按技術領域建立反向索引，支援「找某領域所有 Story」
2. **技術債整合** — 將 tech-debt registry 的搜尋整合至索引系統
3. **同步驗證** — check-hygiene 腳本驗證 catalog/index 與 story 檔案的一致性
4. **Workflow 自動維護** — create-story 自動提取 domain tags 寫入索引

### 架構設計（Party Mode 決議）

```
┌─────────────────────────────────────────────────────┐
│              查詢入口 (Agent Workflow)                 │
└──────────────────┬──────────────────────────────────┘
                   │
         ┌─────────▼──────────┐
         │  Layer 0: Catalog   │  ~80 行，攔截 80% 查詢
         │  (story-catalog)    │  Grep: ~30 tokens
         └─────────┬──────────┘
                   │ 需要領域搜尋？
         ┌─────────▼──────────┐
         │  Layer 1: Domain    │  ~40 行，攔截 15% 查詢
         │  (domain-index)     │  Grep: ~30 tokens
         └─────────┬──────────┘
                   │ 需要完整 AC / 實作細節？
         ┌─────────▼──────────┐
         │  Layer 2: Detail    │  100-300 行/檔
         │  (story files)      │  Read: ~6,000 tokens
         └────────────────────┘
```

**設計哲學**：L1/L2/L3 Cache 分層快取模式 — 越上層越便宜、命中率越高，只有 ~5% 的查詢需穿透到 Layer 2。

---

## 驗收標準 (Acceptance Criteria)

### AC-1: Domain Index 建立
- [ ] 建立 `docs/implementation-artifacts/domain-index.yaml`
- [ ] 按技術領域分類：pdf, auth, editor, payment, admin, business-api, testing, token-optimization 等
- [ ] 每個 domain 列出對應的 story-id 列表（反向索引）
- [ ] 包含 tech-debt section：pending 項目 + deferred-from 來源追溯

### AC-2: Domain Tags 自動提取
- [ ] `create-story` workflow 建立 Story 時，自動從 AC 和 Background 提取 domain tags
- [ ] 將 tags 同時寫入 `story-catalog.yaml`（Layer 0 的 tag 欄位）和 `domain-index.yaml`（Layer 1）
- [ ] 定義標準 domain 分類表（避免同義詞重複，如 auth/identity/authentication）

### AC-3: 同步驗證腳本
- [ ] 擴展 `check-hygiene.ps1`，新增 catalog/index 一致性檢查
- [ ] 驗證項目：story-catalog 中的 story-id 都有對應 story 檔案存在
- [ ] 驗證項目：story 檔案的 status 與 catalog 中一致
- [ ] 驗證項目：domain-index 中的 story-id 都在 catalog 中存在
- [ ] 輸出不一致項目清單，供 Agent 或人工修正

### AC-4: Workflow Instructions 整合
- [ ] `dev-story` / `code-review` 完成時，同步更新 catalog status
- [ ] `create-story` 完成時，同步新增 catalog entry + domain-index entry
- [ ] 在 CLAUDE.md 新增 Layer 1 的存取規則

### AC-5: 查詢 SOP 文檔
- [ ] 建立分層查詢 SOP，供所有 Agent 引擎（Claude/Gemini/Rovo Dev/Antigravity）遵循
- [ ] 定義何時用 Layer 0、何時穿透到 Layer 1、何時才讀 Layer 2
- [ ] 寫入各引擎的全域配置文件

---

## Token 減量預估（Phase 1 + Phase 2 合計）

| 場景 | 現在 | Phase 1 Only | Phase 1+2 | 節省 |
|------|------|-------------|-----------|------|
| 查單一 Story 狀態 | ~7,100 | ~30 | ~30 | 99.6% |
| 找某領域所有 Story | ~42,000 | ~7,000 (仍需讀多檔) | ~60 | **99.9%** |
| 找下一個可開發 Story | ~13,100 | ~80 | ~80 | 99.4% |
| 查技術債全貌 | ~20,000+ | ~5,000 | ~100 | **99.5%** |
| 批次搜尋（跨領域） | ~100,000+ | ~30,000 | ~120 | **99.9%** |

---

## 風險與緩解

| 風險 | 嚴重度 | 緩解方案 |
|------|--------|---------|
| catalog 與 story 檔案不同步 | 高 | AC-3 check-hygiene 自動驗證 |
| domain-index 漏標新 Story | 中 | AC-2 create-story 自動提取 |
| Agent 無視分層規則直接讀 Detail | 低 | Pit of Success：即使讀全檔，catalog 只 80 行 |
| 多 Agent 同時更新 catalog | 低 | TRS-32 file-lock 機制已就位 |

---

## Change Log

| 日期 | Agent | 動作 |
|------|-------|------|
| 2026-03-01 09:47 | CC-OPUS | 建立 Story（Party Mode 討論產出：Phase 2 獨立 Story） |
| 2026-03-01 10:54 | CC-OPUS | 取消：零 workflow 需要領域搜尋，Grep 已可達成，三層架構為假想問題 |
