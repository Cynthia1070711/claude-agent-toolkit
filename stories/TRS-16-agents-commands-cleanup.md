# TRS-16: Agents & Commands 清理

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-16 |
| **狀態** | done |
| **複雜度** | S |
| **優先級** | P1 |
| **執行時間** | 2026-02-25 00:31 |
| **依賴** | TRS-4（Skills 已清理，本 Story 補完 agents/ 與 commands/ 的遺漏） |

---

## 目標

刪除 `.claude/agents/` 和 `.claude/commands/` 中與 MyProject 技術棧無關的檔案，補完 TRS-4 的盲點。

---

## 問題描述

TRS-4 僅清理了 `.claude/skills/`，但同層的 `agents/` 和 `commands/` 仍殘留不相關項目：

| 目錄 | 問題檔案數 | 原因 |
|------|:--------:|------|
| `.claude/agents/` | 3 | Go (2)、PostgreSQL (1) — MyProject 用 C#/SQL Server |
| `.claude/commands/` | 9 | Go (3)、continuous-learning 依賴已刪除 (4)、被 BMAD 覆蓋 (2) |

---

## 刪除清單

### Agents（3 個）

| 檔案 | 原因 |
|------|------|
| `go-build-resolver.md` | Go 語言，MyProject 不使用 |
| `go-reviewer.md` | Go 語言，MyProject 不使用 |
| `database-reviewer.md` | PostgreSQL 專用，MyProject 使用 SQL Server |

### Commands（9 個）

| 檔案 | 原因 |
|------|------|
| `go-build.md` | Go 語言 |
| `go-review.md` | Go 語言 |
| `go-test.md` | Go 語言 |
| `evolve.md` | 依賴 `continuous-learning-v2`（TRS-4 已刪除） |
| `instinct-export.md` | 依賴 `continuous-learning-v2`（TRS-4 已刪除） |
| `instinct-import.md` | 依賴 `continuous-learning-v2`（TRS-4 已刪除） |
| `instinct-status.md` | 依賴 `continuous-learning-v2`（TRS-4 已刪除） |
| `learn.md` | 依賴 `continuous-learning-v2`，寫入 `~/.claude/skills/learned/` |
| `eval.md` | 通用 eval 框架，被 BMAD testarch 系列完全覆蓋 |
| `orchestrate.md` | 通用 agent 編排，被 BMAD auto-pilot/dev-story 完全覆蓋 |

### Commands（額外 1 個）

| 檔案 | 原因 |
|------|------|
| `setup-pm.md` | 依賴不存在的 `scripts/setup-package-manager.js`，已刪除 |

---

## 保留清單

### Agents（9 個）

```
architect, build-error-resolver, code-reviewer, doc-updater,
e2e-runner, planner, refactor-cleaner, security-reviewer, tdd-guide
```

### Commands（9 個 + bmad/）

```
build-fix, checkpoint, code-review, e2e, plan,
refactor-clean, skill-create, tdd, test-coverage,
update-codemaps, update-docs, verify, README
+ bmad/ (全部保留)
```

---

## 驗收標準

- [x] 刪除 3 個 `.claude/agents/` 檔案（go-build-resolver, go-reviewer, database-reviewer）
- [x] 刪除 11 個 `.claude/commands/` 檔案（go-build, go-review, go-test, evolve, instinct-*, learn, eval, orchestrate, setup-pm）
- [x] `/context` Skills 區塊不再顯示 Go/PostgreSQL 相關項目
- [x] 保留項目功能正常（9 agents + 13 commands + bmad/）

---

## 瘦身前後對照

| 指標 | 瘦身前 | 瘦身後 | 減幅 |
|------|:------:|:------:|:----:|
| Agents | 12 | 9 | **-25%** |
| Commands (top-level) | 25 | 13 | **-48%** |
| Custom agents token | 680 | ~500 | **-26%** |
| 移除的 Go/PostgreSQL/廢棄 token | ~400 | 0 | **-100%** |
