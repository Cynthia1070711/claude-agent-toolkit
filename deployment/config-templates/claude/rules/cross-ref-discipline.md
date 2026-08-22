---
paths:
  - ".claude/hooks/**/*.js"
  - ".claude/rules/**/*.md"
  - ".claude/skills/**/SKILL.md"
  - ".claude/skills/**/references/**/*.md"
  - ".claude/agents/**/*.md"
  - ".claude/commands/**/*.md"
  - ".claude/settings.json"
  - ".claude/settings.local.json"
  - ".mcp.json"
  - "CLAUDE.md"
  - "CLAUDE.local.md"
---

# Cross-Ref Discipline — 跨檔引用查詢強制 (SUPREME)

> **嚴重等級**: SUPREME(對齊 Constitutional Standard / single-engine-mode / parallel-batch-conflict-isolation;原 dual-repo-push-discipline 已 retired 2026-05-16,整合至 single-engine-mode §FROZEN Future-Unfreeze SOP)
> **建立**: 2026-05-16 14:44
> **觸發背景**: 2026-05-16 環境優化 session 對 PHASE1/2/3 深度比對發現:3 條已刪 rules 仍有 20+ 處殘留引用、`.claude/hooks/toolkit-mirror-sync-detector.js` 僵屍檔(對應 FROZEN target,不在 settings.json 註冊),用戶 ultrathink 要求建立永久守護機制。

---

## 1. Purpose

任何對 `.claude/hooks/.rules/.skills/.agents/.commands/` 或 `.claude/settings.json` / `.mcp.json` / `CLAUDE.md` / `CLAUDE.local.md` 的 **新增 / 更新 / 刪除** 動作,**MUST 先**透過 GitNexus + Grep 對應 cross-reference 進行影響掃描,**避免**以下 4 類問題:

1. **僵屍檔(Zombie file)** — 檔案存在但功能已 FROZEN / 未在 settings.json 註冊
2. **殘留 ref(Dangling reference)** — 文件 / Skill / hook 引用已刪除的目標
3. **參照遺失(Broken link)** — Edit/Rename 後其他檔對舊路徑/舊名稱仍引用
4. **功能異常(Cascade failure)** — Hook 刪除後對應 rule 仍 grep 該 hook、Skill 刪除後 phycool-system-platform 仍列入索引等

---

## 2. Applies When

任何以下動作前必走 §3 Mandatory Pre-Action Flow:

| 動作類型 | 觸發條件 |
|---------|---------|
| **新增** | Write 工具寫入 `.claude/hooks/X.js` / `.claude/rules/X.md` / `.claude/skills/X/SKILL.md` 等 |
| **更新** | Edit 工具修改既有 `.claude/**` 配置檔案 |
| **刪除** | Bash `rm` / `Remove-Item` / git rm 對 `.claude/**` |
| **重新命名** | mv / Rename-Item / `git mv` 對 `.claude/**` |
| **frontmatter 變更** | paths / name / version / description 變更(影響其他檔的 reference) |

---

## 3. Mandatory Pre-Action Flow

### Step 1: GitNexus 跨檔引用查詢

```
針對「將要動到的目標檔的關鍵 symbol / 名稱」執行:
  mcp__gitnexus__impact({target: "<檔名 or symbol>", direction: "upstream"})
  → 取得 blast radius (HIGH/CRITICAL 警告)
```

適用場景:
- Hook 檔修改 → 查該 hook 的呼叫關係
- Skill / Rule 重新命名 → 查所有引用該名稱的位置
- Settings.json hook 路徑變更 → 查所有 settings 內部引用

### Step 2: Grep 全範圍跨檔引用掃描

```
針對 file basename (不含副檔名) 在 repo 全範圍 grep:
  Grep pattern="<basename>" output_mode="files_with_matches"
  Grep pattern="<basename>" output_mode="content" -n  # 取得 line numbers
```

範圍包含:
- `.claude/**`(rules / skills / hooks / agents / commands / settings)
- `docs/**`(specs / ADR / tracking / reviews)
- `scripts/**`(.cjs / .js / .ps1)
- `CLAUDE.md` / `CLAUDE.local.md` / `MEMORY.md`
- `.mcp.json` / settings.json

### Step 3: 分類 reference

對 grep 結果,分類處置策略:

| 類型 | 範例 | 處置 |
|------|------|------|
| **ACTIVE config** | `.claude/rules/X.md` 引用 `auto-skill-detection.md` | **必修** — surgical edit replace ref |
| **ACTIVE hook/skill** | `.claude/skills/X/SKILL.md` 引用 `Y.md` | **必修** — Skill tool 走 saas-to-skill Mode B |
| **ACTIVE settings** | `.claude/settings.json` 引用 hook | **必修** — settings.json bypass(per settings-json-edit-policy) |
| **歷史不可變** | `docs/tracking/archived/` / `audit/*` / CR reports | **不動** — 歷史紀錄保留 |
| **歷史敘述** | `phycool-*` SKILL.md Version History 提到舊名 | **Boy Scout** — 順手清,不專項 effort |

### Step 4: 影響清單併入本次變更 scope

將 §3.3 標 ACTIVE 的所有 references **一併納入本次變更 scope**,**不可**:
- 只動目標檔留下 orphan refs
- 分次處理跨檔影響(造成中間態 broken)

---

## 4. Mandatory Post-Action Flow

### Step 1: Settings.json hook 註冊驗證(若動到 .claude/hooks/)

```javascript
// 新增 / 修改 hook 後必檢
const settings = JSON.parse(fs.readFileSync('.claude/settings.json', 'utf8'));
const allHookPaths = [];
for (const event of Object.values(settings.hooks)) {
  for (const group of event) {
    for (const hook of (group.hooks || [])) {
      const m = (hook.command || '').match(/node\s+(\.claude\/hooks\/[^\s"']+\.js)/);
      if (m) allHookPaths.push(m[1]);
    }
  }
}
// 若新增 hook 未在 allHookPaths → 僵屍 hook 警告
// 若 settings 引用的 hook 不存在 → broken reference 警告
```

### Step 2: GitNexus detect_changes 驗證

```
變更後 commit 前:
  mcp__gitnexus__detect_changes()
  → 確認變更只影響預期 symbols + execution flows
```

### Step 3: skills_list.md / 索引檔同步(若動到 skill)

`.claude/skills/skills_list.md` 含 keyword matching index,Skill 新增 / 重新命名 / 刪除時 **MUST 同步**。

---

## 5. FORBIDDEN

### F1 - 跳過 Pre-Action Cross-Ref(嚴重等級 SUPREME)

❌ 對 `.claude/**` 進行 Edit / Write / Remove 但**不先**跑 Step 1 + Step 2

### F2 - 留下 orphan reference

❌ 刪除 file 但留下其他 ACTIVE config 仍引用該 file

### F3 - 留下僵屍 hook

❌ 刪除 hook 在 settings.json 的註冊,但保留 hook .js 檔(reverse: 留 .js 但無註冊也算)

### F4 - Skill rename 不更新 skills_list.md

❌ Rename `.claude/skills/X/` → `.claude/skills/Y/` 但 skills_list.md 未同步

### F5 - frontmatter `paths:` 變更不檢查 instructions-loaded.log

❌ rules paths 大改後不對照 `.claude/audit/instructions-loaded.log` 驗證真實載入行為(已有此 hook 觀察,2026-05-16 deployed)

### F6 - 對歷史不可變範圍 surgical edit

❌ 為了「清理 orphan refs」去動 `docs/tracking/archived/` / `audit/*` / CR reports(歷史保留)

### F7 - GitNexus index 過期不執行 analyze

❌ GitNexus 工具警告 stale 仍不跑 `npx gitnexus analyze`,直接信任過期結果

---

## 6. Self-Check(每次 .claude/** 變更前 6 題必自問)

1. **「我打算動的檔案 basename 是什麼?在 repo 內 grep 過嗎?」**
2. **「Grep 結果分類了嗎?ACTIVE / 歷史不可變 分開了嗎?」**
3. **「ACTIVE refs 都納入本次變更 scope 了嗎?」**
4. **「若動 hook,settings.json 註冊有同步嗎?反之亦然?」**
5. **「若動 skill,skills_list.md 索引有同步嗎?」**
6. **「GitNexus index 是否 stale?要不要先 npx gitnexus analyze?」**

任一答案 No / 不確定 → **STOP**,先處理。

---

## 7. Cross-Ref Tools(實作工具集)

### 7.1 MCP 工具(主要)

| Tool | 用途 |
|------|------|
| `mcp__gitnexus__impact` | symbol upstream impact 分析(blast radius) |
| `mcp__gitnexus__query` | natural language execution flow query |
| `mcp__gitnexus__context` | 360° symbol view(callers/callees) |
| `mcp__gitnexus__detect_changes` | commit 前變更驗證 |

### 7.2 Built-in tools

| Tool | 用途 |
|------|------|
| `Grep` | regex / glob 全範圍跨檔搜尋 |
| `Glob` | file pattern enumerate |
| `Read` | 確認 ref 上下文 |

### 7.3 機械守護

| Hook | 用途 |
|------|------|
| `.claude/hooks/cross-ref-precheck.js` | PreToolUse(Edit\|Write)— advisory 注入 references list + cross-ref 提示 |
| `.claude/hooks/skill-change-detector.js` | FileChanged(SKILL.md)— 偵測 Skill 變更輸出影響報告 |
| `.claude/hooks/cc-config-guard.js` | PostToolUse(Edit\|Write)— 注入 cc-config-author skill 規範提示 |

---

## 8. Incident Records

### 2026-05-16 — 本規則觸發建立

**事件背景**: 14:14 對話視窗 ultrathink session 對 cc-config-author + hooks-mechanization 兩 skill + PHASE1/2/3 進行真實狀態比對,發現:

1. **3 條已刪 rules 仍有 20+ 處殘留 ref**:
   - `auto-skill-detection` / `parallel-worker-identity` / `toolkit-mirror-immediate-sync` 已從 `.claude/rules/` 刪除(git status D)
   - 但 `.claude/rules/skill-creation-discipline.md` L195 L249 / `.claude/rules/pipeline-handshake-protocol.md` L5 L221 / `.claude/rules/capability-integration-mandate.md` L30 L31 L173 L185 / `.claude/skills/skills_list.md` L147 仍引用
   - 對應 ACTIVE config 殘留 9 處 + 歷史不可變 範圍 30+ 處

2. **僵屍 hook**:
   - `.claude/hooks/toolkit-mirror-sync-detector.js` 物理存在但**不在 settings.json 註冊**
   - 引用 `.claude/rules/toolkit-mirror-immediate-sync.md`(已刪)
   - 對齊 `toolkit-mirror-sync/SKILL.md`(FROZEN target)

3. **PHASE1/2/3 多項與真實狀態不符**:
   - PHASE1 假設「31 條 rules 全 always-on」← 實際 22/31 已 paths-scoped
   - PHASE2 推薦 10 個新 hook,**8 個與既有機制重疊**
   - PHASE3 推薦建 5 個 BMAD subagents,**未看到既有 10 個 native subagents**

**User ultrathink interrupt**: 「建立hooks:若有新增/更新/刪除動作的行為,一律都要先使用GitNexus + Grep 跨檔引用查詢所對應關聯,必須一併納入分析影響與更新,避免發生(殭屍 hook、殘留 ref、參照遺失、功能異常等相關問題)」

**處理**:
- 本 rule v1.0.0 建立(SUPREME)
- `.claude/hooks/cross-ref-precheck.js` 建立(PreToolUse advisory)
- 對應殘留 ref 修補列入本 session P0 scope

### 歷史相關事件(本規則防範對象)

- **2026-05-05 single-engine-mode FROZEN**:停止三引擎同步,但部分 rules 仍引用 `.gemini/.agent` paths
- **2026-04-28 Session 55**:Skill update 直接 Edit 跳過 `Skill(saas-to-skill)` 字面調用
- **2026-04-16 td-hook-test-enhancement**:直接 Edit 3 SKILL.md 跳過 Mode B
- **2026-04-14 db-first-no-md-mirror 觸發事件**:create-story 生 .md 鏡像,雙 source drift
- **2026-04-11 V2-01 DB schema 假設違規**:Schema-First Mandate 觸發
- **2026-04-09 ADR-GOVERNANCE-001 根因 #8**:Scale-Stale Reciprocity(Skill 規模膨脹)

---

## 9. Related Rules

- `.claude/rules/constitutional-standard.md` SUPREME §Code Verification Mandate(本 rule 為「.claude config 範疇 verification」延伸)
- `.claude/rules/skill-sync-gate.md` — Skill ↔ Code 同步軸(本 rule 為跨檔引用軸,正交補強)
- `.claude/rules/skill-idd-sync-gate.md` — IDD `forbidden_changes` 保護
- `.claude/rules/skill-tool-invocation-mandatory.md` — Skill tool 字面調用(本 rule cross-ref 前驅)
- `.claude/rules/skill-creation-discipline.md` — Skill cap + retire(本 rule 補強 retire 時 cross-ref 清理)
- `.claude/rules/capability-integration-mandate.md` — MCP/Schema/Hook 整合(本 rule 補充 hook 退役後 ref 清理)
- `.claude/rules/single-engine-mode.md` — Single-Engine Mode SSoT(FROZEN ref 清理對齊)
- `.claude/rules/gitnexus-discipline.md` — GitNexus 工具使用(本 rule cross-ref tool 主力)

---

## 10. Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.0.0** | **2026-05-16 14:44** | 初版建立。觸發:14:14 對話視窗 ultrathink session 發現 9 處 ACTIVE 殘留 ref + 僵屍 hook,User ultrathink interrupt 要求建立永久守護。SUPREME 等級。paths-scoped 至 `.claude/hooks/.rules/.skills/.agents/.commands/` + `settings.json` + `.mcp.json` + `CLAUDE.md` / `CLAUDE.local.md`。Pre-Action Flow(4 步)+ Post-Action Flow(3 步)+ FORBIDDEN(7 條)+ Self-Check(6 題)+ Tools(MCP + Built-in + Hook 機械守護)+ Incident Records(本 session + 6 條歷史相關)+ Related Rules(8 條)。 |
