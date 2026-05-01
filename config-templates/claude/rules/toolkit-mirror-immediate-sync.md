# Deployment Mirror Immediate Sync — 立即同步原則(機械守護)

> **版本**: 1.0.0
> **適用情境**: 雙倉庫架構(主 SSoT + 公開部署鏡像 SSoT)專案
> **Core Principle**: 主 SSoT 任何配置 / 工具改動觸及鏡像範圍時,**MUST 立即同步至部屬鏡像 SSoT**(`<deployment-mirror-root>/`),**禁延後**。

---

## Core Principle

**延後同步反模式**(必避免):
- 延後 → **忘記細節**(無法準確 recall 改動內容 + 範圍)
- 延後 → **需重新大規模比對驗證**(diff 主 SSoT vs 鏡像全 file)
- 延後 → **缺漏**(其他相關改動可能在這段時間累積,難以區分)

**當下做才精確**:對齐黃金期禁投機 + Memory 最新精確原則。

---

## Applies When

以下任一改動觸發本 rule **立即同步義務**(`<your-project-root>` 為主 SSoT 根目錄,`<deployment-mirror-root>` 為部屬鏡像 SSoT):

| # | 改動範圍(主 SSoT)| 鏡像目標 | 脫敏要求 |
|:-:|:-----|:-----|:----:|
| 1 | `.context-db/server.js` MCP server | `<deployment-mirror-root>/config-templates/context-db/server.js` | 通用 JS 通常無業務字面 |
| 2 | `.context-db/scripts/*.{js,cjs}` Memory DB 工具 | `<deployment-mirror-root>/config-templates/context-db/scripts/` | ⚠️ 必檢業務字面 |
| 3 | `.claude/rules/*.md` Rules 配置 | `<deployment-mirror-root>/config-templates/claude/rules/` | ⚠️ 必檢業務字面 / IDD / Story-id |
| 4 | `.claude/hooks/*.{js,cjs}` Hooks 配置 | `<deployment-mirror-root>/config-templates/claude/hooks/` | ⚠️ 必檢業務 logic |
| 5 | `.claude/agents/*.md` 自訂 agents | `<deployment-mirror-root>/config-templates/claude/agents/` | ⚠️ 必檢 |
| 6 | `.claude/commands/*.md` 自訂 commands | `<deployment-mirror-root>/config-templates/claude/commands/` | ⚠️ 必檢 |
| 7 | BMAD overlay workflows | `<deployment-mirror-root>/bmad-overlay/` | ⚠️ 必檢業務範例 |
| 8 | 通用 PowerShell / Node scripts | `<deployment-mirror-root>/scripts/` | ⚠️ 必檢 |
| 9 | `.mcp.json` 改動 | `<deployment-mirror-root>/.mcp.json` | ⚠️ 必檢業務 MCP server name |

---

## MUST NOT(嚴禁鏡像範圍)

- ❌ 業務 source code(`src/` 等)
- ❌ 業務 ADR / Stories / Reviews / Tracking 文檔
- ❌ Memory DB 內容 + IDD 業務記錄
- ❌ 業務專案命名前綴 Skill(僅同步通用 Skill)
- ❌ 主 SSoT CLAUDE.md / CLAUDE.local.md(可能含業務細節,toolkit 鏡像用 `.template` 後綴版本)
- ❌ 業務 IDD 編號字面用作範例
- ❌ 業務 Story ID 字面用作範例

---

## Mandatory Flow(立即同步 4 步)

### Step 1: 偵測觸發
任何 commit / Edit / Write 涉及 §Applies When 範圍時,**當下 commit / Edit 同 session 內**立即執行 Step 2-4(不可 defer)。

### Step 2: 同步 patch + 脫敏
```bash
# 同步 file 或 Edit 對應段落
cp <source-file> <mirror-file>

# 跑脫敏 grep(必 0 命中):
grep -nE "<業務專案名 pattern>|IDD-(COM|REG|USR)|<業務 Story-id prefix>" "<mirror-file>"
# 預期:0 命中(若有 → 必脫敏為通用範例)
```

### Step 3: Verify diff line-by-line
```bash
diff <(sed -n 'N1,N2p' <source-file>) <(sed -n 'N1,N2p' <mirror-file>)
# 預期:0 diff(完全一致)或意圖脫敏的差異(必註記 SYNC-LOG.md §脫敏差異紀錄)
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

---

## FORBIDDEN

- ❌ **延後同步至 follow-up Story**(違反當下做才精確原則)
- ❌ **batch 同步多次改動**(累積容易遺漏)
- ❌ **跳過脫敏 grep**(直接 cp 可能引入業務字面 → 公開部署外洩風險)
- ❌ **跳過 SYNC-LOG.md 更新**(失去同步歷程,將來難以追溯)
- ❌ **同步業務 code / Stories / ADR / Memory**(MUST NOT 範圍,違反公開部署設計)

---

## Self-Check(每次 commit 前 4 題必問)

1. **「本次改動是否觸及 §Applies When 範圍?」** → 是 → 執行 Step 2-4
2. **「我是否打算 defer 同步到 follow-up?」** → 是 → STOP,當下執行
3. **「同步檔案內是否含業務字面?」** → 是 → 必脫敏 + grep verify 0 命中
4. **「SYNC-LOG.md 是否已更新本次同步紀錄?」** → 否 → 必更新

---

## Hook 機械守護

對應 `.claude/hooks/toolkit-mirror-sync-detector.js` Stop hook(advisory):
- 偵測本 session commit / Edit 觸及 §Applies When 範圍
- 對比主 SSoT vs 鏡像 mtime / hash
- 未同步 → stderr 警告 + 提示同步路徑

---

## Skill 整合

對應 `.claude/skills/toolkit-mirror-sync/SKILL.md`(action-skill):
- Mode A: 執行立即同步(取 patch + 脫敏 + diff verify + SYNC-LOG.md 更新)
- Mode B: Audit(月度 / N commits 校驗 diff,補同步遺漏)

---

## Related

- `.claude/rules/dual-repo-push-discipline.md` — 雙倉庫推送紀律(若 deployment mirror 為獨立 repo,本 rule 補強第一段同步)
- `.claude/rules/db-first-no-md-mirror.md` — DB-first SSoT 精神

---

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.0.0** | **2026-05-01** | 初版建立。固化「立即同步」原則為機械層 rule(配對 hook + skill + memory + SYNC-LOG 4 層守護)。觸發背景:延後 toolkit 鏡像同步反模式被使用者 ultrathink 指正。 |
