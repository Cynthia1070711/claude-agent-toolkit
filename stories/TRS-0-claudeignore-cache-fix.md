# TRS-0: 止血 — .claudeignore 建立與狀態解耦

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-0 |
| **狀態** | done |
| **複雜度** | S |
| **優先級** | P0 |
| **執行時間** | 2026-02-24 19:55 |
| **依賴** | 無（首個止血措施） |
| **後續** | TRS-1 |

---

## 目標

消除每次新對話的**快取殺手 (Cache Killers)**，恢復 Prompt Caching KV 張量重用率至 92% 目標值。

---

## 問題描述

1. **§10 動態狀態嵌入**：專案 CLAUDE.md §10 硬編碼了 Sprint 狀態（Active Story、Epic 列表等）。任何 Story 狀態變更 → CLAUDE.md 雜湊改變 → 整個前綴的 KV 快取失效。
2. **Last Updated 時間戳**：全域 CLAUDE.md 第 5 行 `Last Updated: 2026-01-31`，任何修改都會破壞快取前綴。
3. **缺乏 .claudeignore**：模型可能讀取 node_modules、*.Designer.cs、package-lock.json 等大型無效檔案，浪費數千 tokens。

---

## 驗收標準

- [x] `.claudeignore` 存在且封鎖：node_modules, dist, build, *.log, .env, lock files, .vs, .git, 大型生成檔, 非專案資料夾
- [x] 專案 CLAUDE.md §10 不含任何動態狀態（Epic 列表、Active Story 等），僅含路徑引用
- [x] 全域 CLAUDE.md header 不含 `Last Updated` 行
- [x] `constitutional-standard.md` 未被修改

---

## 執行步驟

1. 建立 `.claudeignore`
2. 編輯專案 `CLAUDE.md` §10：移除動態摘要，替換為路徑引用
3. 編輯全域 `~/.claude/CLAUDE.md`：移除 `Last Updated` 行

---

## 實際執行結果

### 修改檔案清單

| 操作 | 檔案路徑 |
|------|---------|
| 新建 | `.claudeignore` |
| 編輯 | `CLAUDE.md`（專案）§10 |
| 編輯 | `~/.claude/CLAUDE.md` header |

### 驗收結果

- [x] `.claudeignore` 已建立，包含所有必要排除項
- [x] §10 改為：路徑引用 `docs/project-context.md` + `sprint-status.yaml`
- [x] 全域 CLAUDE.md 已移除 `Last Updated: 2026-01-31`
- [x] `constitutional-standard.md` 未修改（已驗證）
