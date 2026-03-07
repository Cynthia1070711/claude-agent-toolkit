# TRS-3: .claude/rules/ 精簡重組

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-3 |
| **狀態** | done |
| **複雜度** | M |
| **優先級** | P0 |
| **執行時間** | 2026-02-24 19:58 |
| **依賴** | TRS-2（專案 CLAUDE.md 已移除對 rules 的重複引用） |
| **後續** | TRS-4 |

---

## 目標

移除 3 個與 MyProject 完全無關的 rules 檔案，精簡其餘 4 個檔案的語言範例和通用 agent 引用。`.claude/rules/` 是 Always-On，每次新對話 100% 載入。

---

## 問題描述

9 個 rules 檔案共 397 行（~3,000 tokens），其中：

| 檔案 | 問題 | 判定 |
|------|------|------|
| `agents.md`（50 行） | 描述 planner/architect/tdd-guide 等通用 Claude Code agents，與 BMAD 完全不同體系 | 刪除 |
| `hooks.md`（47 行） | 描述 tmux reminder、Zed editor review 等 macOS/bash hooks，MyProject 在 Windows | 刪除 |
| `patterns.md`（56 行） | TypeScript ApiResponse、useDebounce、Repository Pattern，MyProject 後端是 C# | 刪除 |
| `coding-style.md`（71 行） | 核心原則有用，但含 zod/TS 範例 | 精簡 |
| `performance.md`（48 行） | 模型選擇有用，但 ultrathink/Plan Mode 為通用指南 | 精簡 |
| `security.md`（37 行） | 安全清單有用，但含 TypeScript 範例 | 精簡 |
| `testing.md`（31 行） | TDD 有用，但引用不存在的 tdd-guide/e2e-runner agents | 精簡 |
| `git-workflow.md`（46 行） | Commit 格式有用，但 PR 流程與 BMAD 重疊 | 精簡 |
| `constitutional-standard.md`（11 行） | 憲章級 | 絕不動 |

---

## 驗收標準

- [x] 刪除：`agents.md`, `hooks.md`, `patterns.md`
- [x] 精簡：`coding-style.md` ≤ 10 行, `performance.md` ≤ 10 行, `security.md` ≤ 10 行, `testing.md` ≤ 10 行, `git-workflow.md` ≤ 10 行
- [x] `constitutional-standard.md` 完全未修改
- [x] 最終 rules/ 目錄包含 6 個檔案

---

## 執行步驟

1. 刪除 3 個無關檔案
2. 精簡 5 個保留檔案（移除語言範例、通用 agent 引用）
3. 驗證 constitutional-standard.md 未動

---

## 實際執行結果

### 瘦身前後對照

| 指標 | 瘦身前 | 瘦身後 | 減幅 |
|------|:------:|:------:|:----:|
| 檔案數 | 9 | 6 | -33% |
| 總行數 | 397 | ~37 | **-91%** |
| Token | ~3,000 | ~300 | **-90%** |

### 各檔案變化明細

| 檔案 | 前 | 後 | 動作 |
|------|:--:|:--:|------|
| `agents.md` | 50 行 | — | 刪除 |
| `hooks.md` | 47 行 | — | 刪除 |
| `patterns.md` | 56 行 | — | 刪除 |
| `coding-style.md` | 71 行 | 6 行 | 精簡 |
| `performance.md` | 48 行 | 4 行 | 精簡 |
| `security.md` | 37 行 | 8 行 | 精簡 |
| `testing.md` | 31 行 | 4 行 | 精簡 |
| `git-workflow.md` | 46 行 | 4 行 | 精簡 |
| `constitutional-standard.md` | 11 行 | 11 行 | 未動 |

### 修改檔案

| 操作 | 檔案路徑 |
|------|---------|
| 刪除 | `.claude/rules/agents.md` |
| 刪除 | `.claude/rules/hooks.md` |
| 刪除 | `.claude/rules/patterns.md` |
| 精簡 | `.claude/rules/coding-style.md` |
| 精簡 | `.claude/rules/performance.md` |
| 精簡 | `.claude/rules/security.md` |
| 精簡 | `.claude/rules/testing.md` |
| 精簡 | `.claude/rules/git-workflow.md` |

### 驗收結果

- [x] 3 個無關檔案已刪除
- [x] 5 個保留檔案均 ≤ 10 行
- [x] `constitutional-standard.md` 內容完全未修改（已讀取驗證）
- [x] rules/ 目錄共 6 個檔案
