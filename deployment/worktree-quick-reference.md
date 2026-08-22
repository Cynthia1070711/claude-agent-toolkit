# Worktree 並行開發 — Quick Reference Card

> **版本**: 3.0.0
> **建立日期**: 2026-08-07 11:45:00
> **更新日期**: 2026-08-08 11:15:00

一頁速查：同引擎多開（如 5 個視窗並行推進 Sprint）的完整操作指南。
機制說明見 `開發環境架構清單/08-橫切機制.md` §5 與 `06-工作流-Pipeline與跨軌.md` §6.3.5。

---

## 建立 Worktree

```powershell
# 方法 1: Claude Code 內建（首次觸發 GitHub 認證）
claude -w <story-name>

# 方法 2: 手動建立（不觸發認證）
git worktree add .claude/worktrees/<name> -b story/<name> HEAD
cd .claude/worktrees/<name>
claude

# 方法 3: Pipeline 派發時自動建立（推薦，中控會負責清理）
#   .claude/skills/party-to-pipeline/scripts/dispatch-general.ps1 -Worktree
```

建立成本約 200–500 ms + 磁碟空間；未變更時自動移除。

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
```

---

## Merge 衝突速查

| 衝突檔案 | 解法 |
|---------|------|
| DI 註冊入口（`Program.cs` 等） | 兩邊都保留 |
| DbContext 的 `DbSet` 宣告 | 兩邊都保留 |
| 設定檔新增 section | 兩邊都保留 |
| EF `*ModelSnapshot.cs` | 重新生成：接受任一版本 → `dotnet ef migrations add MergeResolve` |
| Migration 檔（不同時間戳） | 兩邊都保留，依時間戳順序套用 |
| 文檔／tracking 檔 | 兩邊都保留（多為追加型內容） |
| UI 共用元件 | 需人工判斷 |

> **Story 狀態不會有 merge 衝突** —— 本環境的 Story 狀態存於 Context Memory DB
> （`stories` / `track_plan` 表），不是 YAML 檔。技術債同理（`tech_debt_items` 表）。
> 兩個 worktree 同時改同一張卡時，衝突發生在 DB 層，由
> `parallel-batch-conflict-isolation.md` 的 hot-row 偵測攔截，而非 git merge。

**解衝突步驟**：

```powershell
# 1. 開啟衝突檔，找 <<<<<<< / ======= / >>>>>>>
# 2. 依上表策略處理
# 3. git add <file> && git commit -m "merge: resolve conflict"
```

---

## 策略選擇

| 情境 | 策略 |
|------|------|
| 同引擎多開（多個 Claude Code 視窗） | **Worktree**（必須） |
| 同一 worktree 內多視窗 | 檔案鎖（`scripts/file-lock-*.ps1`，PreToolUse/PostToolUse hook 自動掛載） |
| 單一 Agent | 自由 commit |

> 跨引擎並行（Gemini / Antigravity / Rovo Dev）已隨三引擎同步機制於 2026-05-05 停用，
> `.claude/` 為唯一 SSoT。見 `.claude/rules/single-engine-mode.md`。

---

## 注意事項

- `.claude/worktrees/` 已列於 `.gitignore`，不會被 commit
- Worktree 內可自由 `git add` / `git commit`（獨立 staging area）
- `/exit` 無改動 → 自動清理；有改動 → 提示保留或刪除
- 首次 `claude -w` 會觸發 GitHub 認證（一次性），後續重新進入不觸發
- **誰派發誰負責關閉** —— Pipeline 派發的 worktree 由中控 `close-worker.ps1` 收尾，
  不要在 worker 視窗內自行 `git worktree remove`

---

> **詳細 SOP**: `開發前環境部署.md` PART 8.5
> **並行衝突隔離**: `config-templates/claude/rules/parallel-batch-conflict-isolation.md`
> **Pipeline 整合**: `config-templates/claude/skills/party-to-pipeline/`
