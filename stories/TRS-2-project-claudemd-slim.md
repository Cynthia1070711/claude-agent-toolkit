# TRS-2: 專案 CLAUDE.md 瘦身

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-2 |
| **狀態** | done |
| **複雜度** | L |
| **優先級** | P0 |
| **執行時間** | 2026-02-24 19:57 |
| **依賴** | TRS-1（全域已瘦身，避免重複保留） |
| **後續** | TRS-3 |

---

## 目標

將專案 `CLAUDE.md` 從 742 行壓縮至 ~120 行，移除與全域重複的章節、冗長的事故背景敘述、詳細的 workflow 步驟。

---

## 問題描述

專案 CLAUDE.md 每次新對話 100% 載入，742 行消耗 ~8,000 tokens（靜態成本最大來源）。

**主要浪費源**：
- §0.1/§0.2：與全域 CLAUDE.md 完全重複的 Timestamp 和 Reporting 規則
- §0.3：Constitutional Standard 已由 `rules/constitutional-standard.md` 自動載入
- §1.1-§1.6：6 個 Trigger 定義過於冗長（含完整事故背景敘述）
- §1.7：BMAD Skills 自動化描述過度詳盡（45 行）
- §4/§5：BMAD 架構樹和 Workflow 命令表（Claude 已從 BMAD 模組自動取得）
- §6：Task Execution Protocol 全部步驟（與 workflow 內部邏輯重複）
- §8/§9/§11-§13：UI/E2E/Hygiene/BDD（僅在特定場景需要，不應 always-on）

---

## 驗收標準

- [x] 專案 CLAUDE.md 總行數 ≤ 130 行
- [x] 保留：Skill 索引表、核心禁止事項、Canonical Source、Test Accounts、Document Locations、Workflow Completion Checklists
- [x] 移除：所有事故背景敘述（日期 + 根因 + 解決方案敘事）
- [x] 合併：6 個 Trigger 定義為 1 個精簡段落
- [x] §10 已在 TRS-0 處理（路徑引用）
- [x] 新對話可正確觸發 Skill 載入
- [x] constitutional-standard.md 未被修改

---

## 執行步驟

1. 完全重寫專案 `CLAUDE.md`
2. 保留 7 個核心區塊：Triggers、Skill 索引、Test Accounts、Document Locations、Workflow Checklists、Project Status、BMAD Commands
3. 每個區塊精簡至最小必要資訊

---

## 實際執行結果

### 瘦身前後對照

| 指標 | 瘦身前 | 瘦身後 | 減幅 |
|------|:------:|:------:|:----:|
| 行數 | 742 | 117 | **-84%** |
| Token | ~8,000 | ~1,200 | **-85%** |

### 新結構（7 個區塊）

```
§1 Triggers — E2E/UI/Workflow/CR/Commit/文檔 觸發條件（精簡版）
§2 Skill 索引 — 16 個 MyProject Skill + 禁止事項 + Canonical Source
§3 Test Accounts — 5 個測試帳號
§4 Document Locations — 9 個關鍵路徑
§5 Workflow Completion Checklists — dev-story/code-review/create-story
§6 Project Status — 路徑引用（TRS-0 產物）
§7 BMAD Workflow Commands — 2 行精簡
```

### 修改檔案

| 操作 | 檔案路徑 |
|------|---------|
| 重寫 | `CLAUDE.md`（專案） |

### 驗收結果

- [x] 117 行 ≤ 130 行
- [x] 7 個核心區塊全部保留
- [x] 所有事故背景敘述已移除
- [x] 6 個 Trigger 已合併為 §1 精簡段落
- [x] §6 Project Status 為路徑引用（TRS-0 產物，指向 `project-context.md` + `sprint-status.yaml`）
- [x] Skill 索引表完整保留於 §2，觸發關鍵字可正確匹配載入
- [x] `constitutional-standard.md` 未修改（11 行，內容完整）
