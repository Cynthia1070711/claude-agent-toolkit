---
name: branch-merge
description: |
  Story 分支合併回主線工具。支援模糊分支名匹配、自動 stash 處理、衝突解決輔助。
  觸發關鍵字：merge, 合併分支, git merge, 分支合併, merge branch, 合併 story
version: 1.0.2
updated: 2026-07-28
disable-model-invocation: true
triggers:
  - branch-merge
  - branch merge
  - merge to main
  - story branch
author: CC-OPUS
created: 2026-02-28
last-synced-epic: epic-tdb
last-synced-date: 2026-07-28
---

# Branch Merge — Story 分支合併工具

> **Version**: 1.0.0
> **建立日期**: 2026-02-28
> **用途**: 將 Story 開發分支合併回當前分支（通常是 main），處理常見的 stash/衝突情境

---

## 執行流程

使用者輸入 `git merge <name>` 或 `合併 <name>` 時，依照以下步驟執行：

### Step 1：分支名解析

使用者可能提供簡短名稱（如 `d7`），需模糊匹配實際分支。

```bash
# 1. 先嘗試精確匹配
git rev-parse --verify <name> 2>/dev/null

# 2. 失敗則搜尋包含該名稱的分支
git branch -a | grep -i <name>
```

**匹配優先級**：
1. 精確匹配 → 直接使用
2. `story/<name>` → 最常見的 Story 分支命名
3. 多個匹配 → 列出候選清單，請使用者選擇

### Step 2：Pre-merge 檢查

```bash
# 確認當前分支
git branch --show-current

# 檢查工作區是否乾淨
git status --porcelain
```

**工作區不乾淨時**：
- 詢問使用者選擇處理方式：
  - **Stash 後 merge** → `git stash` → merge → `git stash pop`
  - **先 commit 再 merge** → 引導使用者 commit
  - **丟棄本地變更** → `git checkout -- .`（需確認）

### Step 3：執行 Merge

```bash
git merge <resolved-branch-name>
```

**結果處理**：
- **Fast-forward** → 直接完成，報告合併的 commits
- **Merge commit** → 報告合併結果
- **Conflict** → 進入 Step 4

### Step 4：Stash Pop（若 Step 2 使用了 stash）

```bash
git stash pop
```

**衝突處理**：
1. 讀取衝突檔案內容（`grep -n "<<<<<<< " <file>`）
2. 分析衝突區塊，通常是時間戳或自動生成內容的差異
3. 自動解決簡單衝突（如時間戳：保留較新的）
4. 複雜衝突：展示衝突內容，請使用者決定
5. 解決後：`git add <file>` 標記完成
6. 清理 stash：`git stash drop`

### Step 5：Post-merge 驗證

```bash
# 確認合併狀態
git status

# 顯示合併結果摘要
git log --oneline -5
```

---

## 常見衝突類型與自動解決策略

| 衝突類型 | 判斷方式 | 自動解決策略 |
|----------|----------|-------------|
| 自動生成時間戳 | `<!-- Generated: ... -->` | 保留較新的時間戳 |
| sprint-status.yaml | 狀態欄位差異 | **[frozen 2026-07-28 tdb-2]** 已凍結為唯讀歷史快照,不再有 workflow 寫入 → 未來不會再出現此類衝突;唯一預期差異來源是本列本身歷史規則的移除 diff |
| README.md 自動生成區塊 | `<!-- Auto-generated -->` 標頭 | 保留 merge 來源 |
| 程式碼邏輯衝突 | 非上述類型 | **不自動解決**，展示給使用者決定 |

---

## 禁止事項

- ❌ 未經使用者確認就丟棄本地變更
- ❌ 使用 `git merge --no-commit` 後忘記 commit
- ❌ 衝突未完全解決就標記為已完成
- ❌ 自動解決程式碼邏輯衝突（只能自動解決生成內容衝突）

---

## 輸出格式

```
## 分支合併結果

- **來源分支**: story/d7
- **目標分支**: main
- **合併方式**: Fast-forward
- **變更檔案**: 4 files changed
- **衝突**: 無 / 已解決（描述）
- **Stash**: 已恢復 / 無需處理
```

---

## 注意事項

- 合併完成後 **不自動刪除來源分支**，除非使用者明確要求
- 合併完成後 **不自動 push**，除非使用者明確要求
- 若使用者的本地有未追蹤檔案（untracked），不影響 merge，無需特別處理
- Stash pop 衝突時，stash 不會自動 drop，需手動 `git stash drop` 確認清理

---

## 除錯參考

> 相關除錯知識請查閱 `docs/knowledge-base/` 目錄。
