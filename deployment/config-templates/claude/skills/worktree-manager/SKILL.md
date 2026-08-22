---
name: worktree-manager
description: Git Worktree 完整管理工具。建立、列出、清理、診斷 worktree。觸發關鍵字：worktree 建立, worktree 清理, worktree 清除, worktree cleanup, worktree create, worktree list, worktree 管理, 建立 worktree, 清理 worktrees
version: 1.1.1
updated: 2026-04-05
disable-model-invocation: true
triggers:
  - worktree-manager
  - worktree
  - worktree management
author: CC-OPUS
created: 2026-02-27
last-synced-epic: epic-sku
last-synced-date: 2026-04-05
---

# Worktree Manager

> **Version**: 1.1.0
> **建立日期**: 2026-02-27
> **用途**: 管理 `.claude/worktrees/` 下的 Git Worktree — 建立、列出、清理、診斷

## 操作一覽

| 操作 | 說明 |
|------|------|
| **create** | 建立新 worktree（不觸發 GitHub 認證） |
| **list** | 列出所有 worktree 狀態（含孤兒偵測） |
| **clean** | 清理指定 worktree |
| **clean-all** | 清理全部非主目錄 worktree |
| **diagnose** | 偵測已註冊 vs 實際資料夾不一致 |

---

## 操作：create

建立新的 worktree，使用手動方式避免觸發 GitHub 認證。

**參數**：`<name>` — worktree 名稱（建議用 Story ID，如 `ba-3`、`d3`）

**執行步驟**：

```bash
# 1. 建立 worktree（基於當前 HEAD，不觸發 remote fetch）
git worktree add .claude/worktrees/<name> -b story/<name> HEAD

# 2. 驗證建立成功
git worktree list
```

**建立後進入方式**：

```bash
# 方式 A：開新終端進入 worktree 目錄，啟動 Claude
cd .claude/worktrees/<name>
claude

# 方式 B：使用 Claude 內建（首次會觸發 GitHub 認證）
claude -w <name>
```

**批量建立**（多 Agent 並行場景）：

```bash
# 一次建立多個 worktree
git worktree add .claude/worktrees/ba-3 -b story/ba-3 HEAD
git worktree add .claude/worktrees/ba-6 -b story/ba-6 HEAD
git worktree add .claude/worktrees/ba-9 -b story/ba-9 HEAD
```

**注意事項**：
- 分支名 `story/<name>` 不可與已存在的分支重複
- 若分支已存在，改用：`git worktree add .claude/worktrees/<name> story/<name>`（不加 `-b`）
- Worktree 內有獨立 staging area，可自由 `git add` / `git commit`

---

## 操作：list

列出 worktree 並比對實際資料夾，標註孤兒。

```bash
# 1. 取得 git 已註冊的 worktree
git worktree list

# 2. 取得實際資料夾
ls .claude/worktrees/ 2>/dev/null

# 3. 比對：資料夾存在但 git 未註冊 = 孤兒（需 rm -rf）
# 4. 比對：git 已註冊但資料夾不存在 = 幽靈（需 git worktree prune）
```

**輸出格式**：

```
## Worktree 狀態

| 名稱 | Git 註冊 | 資料夾存在 | 分支 | 狀態 |
|------|:--------:|:----------:|------|------|
| bb1  | ✅ | ✅ | worktree-bb1 | 正常 |
| test1 | ❌ | ✅ | — | 孤兒 |

建議操作：test1 為孤兒，執行 `clean` 可安全移除。
```

---

## 操作：clean

清理指定名稱的 worktree。自動判斷正確的清理方式。

**執行邏輯**：

```
1. git worktree list → 確認是否已註冊
2. ls .claude/worktrees/<name> → 確認資料夾是否存在

情況 A：已註冊 + 資料夾存在 → git worktree remove .claude/worktrees/<name> --force
情況 B：未註冊 + 資料夾存在 → rm -rf .claude/worktrees/<name>
情況 C：已註冊 + 資料夾不存在 → git worktree prune
情況 D：兩者都不存在 → 提示「已經清理過了」
```

**完成後驗證**：
```bash
git worktree prune
git worktree list
ls .claude/worktrees/ 2>/dev/null
```

---

## 操作：clean-all

批量清理所有非主目錄 worktree。

**執行順序**（順序重要）：

```
1. git worktree list → 收集所有已註冊的 .claude/worktrees/* 路徑
2. 對每個已註冊 worktree 執行：git worktree remove <path> --force
3. ls .claude/worktrees/ → 檢查殘留孤兒資料夾
4. 對每個殘留資料夾執行：rm -rf .claude/worktrees/<name>
5. git worktree prune
6. git worktree list → 驗證只剩主目錄
```

**清理報告格式**：

```
## Worktree 清理報告

已移除：
- bb1（git worktree remove）
- test1（rm -rf，孤兒）
- test2（git worktree remove）

清理後狀態：僅剩主目錄 main
```

---

## 操作：diagnose

深度診斷 worktree 健康狀態。

```
檢查項目：
1. .claude/worktrees/ 是否在 .gitignore（應該在）
2. 是否有孤兒分支（worktree-* 分支但無對應 worktree）
3. 磁碟空間佔用（du -sh .claude/worktrees/*）
4. 各 worktree 是否有未 commit 的改動（git -C <path> status --porcelain）
```

---

## 注意事項

- `.claude/worktrees/` 已在 `.gitignore`，worktree 內容不會被 commit 到主 repo
- `git worktree remove` 會同時刪除資料夾和 git 註冊記錄
- `--force` 旗標：當 worktree 有未 commit 改動時必須使用
- 清理後殘留的 `worktree-*` 分支可用 `git branch -D worktree-<name>` 刪除
- Worktree 共享 `.git` 物件庫，不複製歷史記錄，但工作目錄檔案佔用獨立磁碟空間

---

## 參考文件

- 快速參考: `docs/專案部屬必讀/worktree-quick-reference.md`
- 完整 SOP: `docs/專案部屬必讀/開發前環境部署_v3.0.0.md` PART 8.5
- 策略報告: `docs/專案部屬必讀/multi-agent-parallel-execution-strategy.md`

---

## 除錯參考

> 相關除錯知識請查閱 `docs/knowledge-base/` 目錄。
