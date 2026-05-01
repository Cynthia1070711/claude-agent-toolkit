---
name: toolkit-mirror-sync
description: 主 SSoT 配置 / 工具改動立即同步至部屬鏡像 SSoT(`<deployment-mirror-root>/`)action-skill。對齐 toolkit-mirror-immediate-sync.md 立即同步原則 + SYNC-LOG.md 紀錄機制。Mode A 執行同步 + Mode B 月度 Audit 校驗。觸發詞:toolkit 同步 / mirror sync / 部屬鏡像同步 / SYNC-LOG / immediate-sync。
version: 1.0.0
updated: 2026-05-01
watches:
  - glob: ".context-db/**/*.{js,cjs,mjs}"
  - glob: ".claude/{rules,hooks,agents,commands}/*.md"
  - glob: ".claude/hooks/*.{js,cjs,mjs}"
  - glob: "_bmad/bmm/workflows/4-implementation/**/*.{md,xml}"
  - glob: "scripts/*.{ps1,cjs,js}"
triggers:
  - toolkit 同步
  - mirror sync
  - 部屬鏡像同步
  - SYNC-LOG
  - immediate-sync
author: CC-OPUS
created: 2026-05-01
---

# Toolkit Mirror Sync — 主 SSoT → 部屬鏡像 SSoT 立即同步 Skill

主 SSoT 配置 / 工具改動立即同步至部屬鏡像 SSoT(`<deployment-mirror-root>/`)的 action-skill。對齐 `.claude/rules/toolkit-mirror-immediate-sync.md` v1.0 立即同步原則。

---

## §1 觸發情境

任何以下改動觸發 → **當下 commit / Edit 同 session 內**執行本 Skill Mode A:

| # | 改動範圍(主 SSoT)| 鏡像目標 |
|:-:|:-----|:-----|
| 1 | `.context-db/server.js` MCP server | `<deployment-mirror-root>/config-templates/context-db/server.js` |
| 2 | `.context-db/scripts/*.{js,cjs}` Memory DB 工具 | `<deployment-mirror-root>/config-templates/context-db/scripts/` |
| 3 | `.claude/rules/*.md` Rules 配置 | `<deployment-mirror-root>/config-templates/claude/rules/` |
| 4 | `.claude/hooks/*.{js,cjs}` Hooks 配置 | `<deployment-mirror-root>/config-templates/claude/hooks/` |
| 5 | `.claude/agents/*.md` 自訂 agents | `<deployment-mirror-root>/config-templates/claude/agents/` |
| 6 | `.claude/commands/*.md` 自訂 commands | `<deployment-mirror-root>/config-templates/claude/commands/` |
| 7 | BMAD overlay workflows | `<deployment-mirror-root>/bmad-overlay/4-implementation/` |
| 8 | 通用 PowerShell / Node scripts | `<deployment-mirror-root>/scripts/` |
| 9 | `.mcp.json` 改動 | `<deployment-mirror-root>/.mcp.json` |

---

## §2 Mode A — 執行立即同步(預設)

### Step 1: 偵測觸發 + 取 source diff

```bash
git diff HEAD --name-only | grep -E "^\.context-db|^\.claude/(rules|hooks|agents|commands)|^_bmad/bmm/workflows/4-implementation|^scripts/|^\.mcp\.json"
```

### Step 2: Apply patch 到鏡像 + 脫敏 grep

```bash
# 對每個 source file:
cp <source-file> <mirror-file>

# 跑脫敏 grep(必 0 命中):
grep -nE "<業務專案名 pattern>|IDD-(COM|REG|USR)|<業務 Story-id prefix>" "<mirror-path>"
# 預期:0 命中(若有 → 必脫敏為通用範例)
```

### Step 3: Verify diff line-by-line

```bash
diff <(sed -n 'N1,N2p' source.file) <(sed -n 'N1,N2p' mirror.file)
# 預期:0 diff(完全一致)或意圖脫敏差異(必註記 SYNC-LOG.md §脫敏差異紀錄)
```

### Step 4: 更新 SYNC-LOG.md

```markdown
## 同步紀錄
### YYYY-MM-DD — <change summary>
| 同步檔案 | 來源 | 變更摘要 |
|:----|:----|:----|
| `<deployment-mirror-root>/...` | `<source>` | <概要> |
**Verify**: diff 0 | 脫敏 0 命中
```

### Step 5: Memory DB 寫入 sync record(若專案使用 Memory DB)

```
add_context({
  agent_id: "<agent-id>",
  category: "decision",
  title: "[Toolkit Sync] <change> 立即同步 <deployment-mirror-root>/ 完成 (YYYY-MM-DD)",
  content: "...",
  tags: ["toolkit-sync", "immediate-sync", "<change-tag>"]
})
```

---

## §3 Mode B — Audit 校驗(月度 / N commits)

### Step 1: 全範圍 diff scan

```bash
diff -r .context-db/scripts/ "<deployment-mirror-root>/config-templates/context-db/scripts/"
diff -r .claude/rules/ "<deployment-mirror-root>/config-templates/claude/rules/"
# ... 對每個 SYNC_RANGE 跑 diff
```

### Step 2: 列補同步遺漏

每個 file diff 不為 0 → 列為待補同步,對齐 §2 Mode A 流程處理。

### Step 3: 報告

```markdown
## Toolkit Mirror Audit Report (YYYY-MM-DD)
| Range | Source 改動 | 鏡像同步? | Action |
|:-----|:----:|:----:|:-----|
| .context-db/server.js | ✅ | ✅ | 對齐 |
| .claude/rules/ | ✅ 5 file | ⚠️ 2 file 未同步 | 待補同步 |
```

---

## §4 FORBIDDEN

- ❌ 延後同步至 follow-up Story(違反「當下做才精確」原則)
- ❌ batch 同步多次改動(累積容易遺漏)
- ❌ 跳過脫敏 grep(公開部署 → 業務字面外洩風險)
- ❌ 跳過 SYNC-LOG.md 更新(失去同步歷程追溯)
- ❌ 同步業務 code / Stories / ADR / Memory(對齐 CLAUDE.md FORBIDDEN)

---

## §5 部署提示

1. **複製本 Skill** 至 `.claude/skills/toolkit-mirror-sync/SKILL.md`
2. **修改 `<deployment-mirror-root>`** 為您專案的部屬鏡像 root path(範例: `deployment-mirror`)
3. **修改脫敏 grep pattern** 為您專案的業務字面 pattern(專案名 / IDD 編號 / Story-id 前綴)
4. **建立 SYNC-LOG.md** 在 `<deployment-mirror-root>/SYNC-LOG.md`,結構含同步流向 / 時間倒序紀錄 / MUST 規範 / 立即同步原則 / 待同步追蹤 / 歷史紀錄 / 維護責任
5. **(可選)安裝 Stop Hook** `.claude/hooks/toolkit-mirror-sync-detector.js` 機械偵測 advisory

---

## §6 Related

- `.claude/rules/toolkit-mirror-immediate-sync.md` v1.0 — 立即同步行為準則
- `.claude/rules/dual-repo-push-discipline.md` — 雙倉庫推送紀律(若 deployment mirror 為獨立 repo)
- `.claude/hooks/toolkit-mirror-sync-detector.js` — 機械偵測 hook(advisory)
- `<deployment-mirror-root>/SYNC-LOG.md` — 同步紀錄機制

---

## §7 Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| 1.0.0 | 2026-05-01 | 初版建立。固化「立即同步」原則為 4 層機械守護(rule + memory + hook + skill)的 action-skill 層。觸發背景:延後 toolkit 鏡像同步反模式被使用者 ultrathink 指正。 |
