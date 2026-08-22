# Worktree 並行開發 — Quick Reference Card

> 一頁速查：同引擎多開（如 5×CC-OPUS 並行推進 Sprint）的完整操作指南

---

## 建立 Worktree

```powershell
# 方法 1: Claude Code 內建（首次觸發 GitHub 認證）
claude -w <story-name>

# 方法 2: 手動建立（不觸發認證）
git worktree add .claude/worktrees/<name> -b story/<name> HEAD
cd .claude/worktrees/<name>
claude
```

## 重新進入

```powershell
cd .claude/worktrees/<name>
claude              # 新對話
claude --resume     # 接續上次
```

## 查看 / 清理

```powershell
git worktree list                                    # 列出所有
git worktree remove .claude/worktrees/<name>         # 刪除單個
git worktree remove .claude/worktrees/<name> --force # 強制刪除（有未 commit 改動）
```

## 完成後 Merge

```powershell
cd <project-root>                  # 回到主目錄
git merge story/<name-1>           # 逐一 merge
git merge story/<name-2>           # 衝突時見下方 SOP
# ...
```

---

## Merge 衝突速查

| 衝突檔案 | 解法 |
|---------|------|
| `Program.cs`（DI 註冊） | 兩邊都保留 |
| `ApplicationDbContext.cs`（DbSet） | 兩邊都保留 |
| `sprint-status.yaml`（不同 key） | 兩邊都保留 |
| `sprint-status.yaml`（同一 key） | 取最新值 |
| `appsettings.json`（新 section） | 兩邊都保留 |
| `*ModelSnapshot.cs`（EF） | 重新生成: 接受任一版本 → `dotnet ef migrations add MergeResolve` |
| `registry.yaml`（tech-debt） | 兩邊都保留（entry ID 唯一，無邏輯衝突） |
| UI 共用元件 | 需人工判斷 |

**解衝突步驟**:
```powershell
# 1. 開啟衝突檔，找 <<<<<<< / ======= / >>>>>>>
# 2. 依上表策略處理
# 3. git add <file> && git commit -m "merge: resolve conflict"
```

---

## 策略選擇

| 情境 | 策略 |
|------|------|
| 同引擎多開（5×CC） | **Worktree**（必須） |
| 跨引擎（CC+GC+AG+RD） | Total Commit + File Lock |
| 單 Agent | 自由 commit |

---

## 注意事項

- `.claude/worktrees/` 已加入 `.gitignore`，不會被 commit
- Worktree 內可自由 `git add` / `git commit`（獨立 staging area）
- `/exit` 無改動 → 自動清理；有改動 → 提示保留或刪除
- 首次 `claude -w` 會觸發 GitHub 認證（一次性），後續重新進入不觸發

---

> **詳細 SOP**: `開發前環境部署_v3.0.0.md` PART 8.5
> **策略報告**: `multi-agent-parallel-execution-strategy.md`
