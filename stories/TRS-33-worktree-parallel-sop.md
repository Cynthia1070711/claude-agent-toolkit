# 🟢 TRS-33: Worktree 並行 SOP + 部署整合

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-33 |
| **狀態** | done |
| **複雜度** | S |
| **優先級** | P1 |
| **建立時間** | 2026-02-27 21:18 |
| **最後更新** | 2026-02-27 22:46 |
| **依賴** | TRS-31 ✅ |
| **類型** | E 類（多引擎協作） |
| **建立者** | CC-OPUS（Party Mode） |
| **DEV Agent** | Claude Opus 4.6 |
| **DEV完成時間** | 2026-02-27 22:37 |

## 描述

將 Party Mode 討論中確認可行的 Git Worktree 並行開發流程，整合至部署手冊和 AGENTS.md，形成可複用的 SOP。

適用場景：同引擎多開（5×CC-OPUS 並行推進 Sprint）。

## 驗收條件

- [x] AC-1: 部署手冊 `開發前環境部署_v3.0.0.md` 新增 Worktree 並行開發章節
- [x] AC-2: `AGENTS.md` §18 (SOP) 新增 Worktree 並行模式說明
- [x] AC-3: Worktree 使用 Quick Reference Card（一頁速查）
- [x] AC-4: Merge 衝突解法 SOP（Hot File 衝突範例 + 解法步驟）
- [x] AC-5: `.claude/worktrees/` 加入 `.gitignore`（確認已包含）
- [x] AC-6: 部署必讀 README.md 更新資料夾結構 + 新增文件索引
- [x] AC-7: `multi-engine-collaboration-strategy.md` §5.5 新增陷阱 #7（多 Agent 並行寫入同一檔案）

## 任務拆解

### Task 1: 部署手冊更新
- [x] `開發前環境部署_v3.0.0.md` 新增 PART 8.5：Worktree 並行開發
- [x] 涵蓋：建立 / 進入 / commit / merge / 清理 完整流程（§8.5.2~8.5.6）
- [x] 含 5 Agent 並行場景的完整操作指令（§8.5.3）

### Task 2: SOP 文件更新
- [x] `AGENTS.md` §18.2 新增 Worktree Parallel Mode
- [x] `multi-engine-collaboration-strategy.md` §5.5 陷阱 #7 + #8（已預先完成）
- [x] `AGENTS.md` §18.3 pitfalls #7-#8 同步新增

### Task 3: Quick Reference Card
- [x] 建立一頁式 Worktree 速查指南
- [x] 放置於 `docs/專案部屬必讀/worktree-quick-reference.md`

### Task 4: Merge 衝突 SOP
- [x] 定義 Program.cs / DbContext / sprint-status.yaml 的標準解衝突步驟（PART 8.5.7）
- [x] 明確「兩邊都保留」vs「需要人工判斷」的場景區分

### Task 5: 部署整合
- [x] `.gitignore` 新增 `.claude/worktrees/`
- [x] 部署必讀 README.md 更新資料夾結構 + 新增文件索引

## 技術備註

- `claude -w <name>` 首次使用會觸發 GitHub 認證（一次性）
- 替代方案：`git worktree add .claude/worktrees/<name> -b story/<name> HEAD` 不觸發認證
- Worktree 退出時無改動自動刪除，有改動會提示保留或刪除
- 重新進入已存在的 Worktree：`cd .claude/worktrees/<name> && claude`（不觸發認證）

## Dev Agent Record

### Implementation Plan
純文件更新 Story，無程式碼變更。5 個 Task 對應 7 個 AC，其中 AC-7 在 TRS-31 Party Mode 討論時已預先完成（§5.5 陷阱 #7 + #8）。

### Completion Notes
- 部署手冊 v3.0.0→v3.1.0，新增 PART 8.5（8 個子章節）
- AGENTS.md v5.0→v5.1，§18.2 Worktree Parallel Mode + §18.3 pitfalls #7-#8
- Quick Reference Card 一頁速查（含 Merge 衝突速查表）
- Merge 衝突 SOP 整合於 PART 8.5.7 + Quick Reference Card
- `.gitignore` 新增 `.claude/worktrees/`
- 部署必讀 README.md v1.2.0→v1.3.0

## File List

| 檔案 | 變更類型 |
|------|---------|
| `docs/專案部屬必讀/開發前環境部署_v3.0.0.md` | 修改（新增 PART 8.5 + 版本更新） |
| `AGENTS.md` | 修改（§18.2 + §18.3 + 版本更新） |
| `docs/專案部屬必讀/worktree-quick-reference.md` | 新增 |
| `.gitignore` | 修改（新增 `.claude/worktrees/`） |
| `docs/專案部屬必讀/README.md` | 修改（資料夾結構 + 版本更新） |
| `claude token減量策略研究分析/stories/TRS-33-worktree-parallel-sop.md` | 修改（狀態更新） |
| `docs/implementation-artifacts/sprint-status.yaml` | 修改（狀態更新） |
| `docs/tracking/active/trs-33-worktree-parallel-sop.track.md` | 新增 |

## Change Log

```
[CC-OPUS] 2026-02-27T21:18:00+08:00 Story 建立
[CC-OPUS] 2026-02-27T22:37:00+08:00 dev-story 完成，所有 5 Task / 7 AC 已完成，狀態 → review
[CC-OPUS] 2026-02-27T22:46:00+08:00 code-review 完成 (Score:82→92), H1 EF Migration 指令修正, 狀態 → done
```
