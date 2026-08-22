---
paths:
  - ".claude/hooks/**"
  - ".claude/skills/**/SKILL.md"
  - ".claude/rules/**"
  - ".claude/agents/**"
  - ".claude/commands/**"
  - ".context-db/scripts/init-db.js"
  - ".mcp.json"
  - "scripts/check-*.cjs"
  - ".github/workflows/pr-gate.yml"
  - "_bmad/bmm/workflows/4-implementation/**"
---

# Deployment Doc Freshness Gate — 部屬指南文件新鮮度守護

> **版本**: 1.1.0
> **建立日期**: 2026-05-01(1.1.0 更新 2026-07-27)
> **觸發事件**: Skills/Rules/Hooks/Schema 任一變更時提示檢查部屬指南是否需更新

---

## 1. Purpose

`claude token減量策略研究分析/1.專案部屬必讀/` 收錄部屬指南(13 篇 .md + 配置 templates + scripts + bmad-overlay)。當底層機制(Hooks / Skills / Rules / Memory DB schema)變更時,**指南若未同步即發生 stale**(2026-04 ~ 2026-05 已多次驗證)。

本規則建立**機械強制**檢查機制,在 dev-story / code-review / Skill 變更時提示同步。

---

## 1.5 Scope 界定 — `1.專案部屬必讀/` 已為 frozen baseline(2026-07-27 校正)

> 本 rule 建於 2026-05-01。其後 **2026-05-05** `single-engine-mode.md` Core Decision #4 裁定「`1.專案部屬必讀/` Toolkit 鏡像 sync 機制停用」,**2026-05-09** commit `b749b128` 將該目錄整批 untrack(`git ls-files "claude token減量策略研究分析/1.專案部屬必讀/"` 回 **0**)。本 rule 未同步該裁定,導致 §3 流程要求 CR Phase B 去「強制更新」一批已不在版控、且 natural decay 屬預期行為的檔案。

**現行判定**:

| 標的 | Phase B 處置 |
|:-----|:-----------|
| `1.專案部屬必讀/config-templates/**`(`.claude/` 配置鏡像) | **N/A — 不同步**。屬 `single-engine-mode.md` Core Decision #3「natural decay 是預期行為」範圍,與 `.gemini/.agent` frozen baseline 同性質。強行同步等同重啟已退役的鏡像 sync 機制(該 rule FORBIDDEN #4/#6 精神)。 |
| `1.專案部屬必讀/*.md`(deep-dive 文檔本體) | 仍適用 §3 流程,但因整目錄未在版控,更新**不產生版控效果**;若確有同步需求,應先評估是否重新納管。 |

因此 `deployment-doc-stale: true` 命中 §2 觸發條件時,CR Phase B 的合規結案方式包含「**N/A(frozen baseline)+ 附 `git ls-files` 佐證**」,不限於「強制更新」。

---

## 2. Applies When

以下任一情境觸發本規則檢查:

| # | 觸發條件 | 偵測信號 |
|:-:|:----|:----|
| 1 | `.claude/hooks/*.js` 新增 / 修改 / 刪除 | file_list 含 `.claude/hooks/` |
| 2 | `.claude/skills/**/SKILL.md` 變更 | FileChanged hook(matcher: SKILL.md)|
| 3 | `.claude/rules/*.md` 新增 / 修改 / 刪除 | file_list 含 `.claude/rules/` |
| 4 | `.context-db/scripts/init-db.js` 變更(schema)| file_list 含 `init-db.js` |
| 5 | `.claude/agents/*.md` 變更 | file_list 含 `.claude/agents/` |
| 6 | `.claude/commands/*.md` 變更 | file_list 含 `.claude/commands/` |
| 7 | `.mcp.json` 變更 | file_list 含 `.mcp.json` |
| 8 | `_bmad/bmm/workflows/4-implementation/**` 變更 | file_list 含 `bmad-overlay` |
| 9 | `scripts/check-*.cjs` 新增 | file_list 含 hygiene script |
| 10 | `.github/workflows/pr-gate.yml` 變更 | file_list 含 PR Gate config |

---

## 3. Mandatory Check Flow

### 3.1 dev-story Step 8(Pre-Archive)

```
1. Scan file_list → 對照 §2 觸發條件
2. 任一命中 → 進入 Freshness Check
3. Freshness Check:
   ├── Read 1.專案部屬必讀/README.md(主索引)
   ├── 確認新增 / 修改 / 刪除項目是否反映於索引
   ├── Read 對應 deep-dive .md(skills / rules / hooks / memory / mcp / bmad / commands)
   └── 確認 deep-dive 內容是否需更新
4. 若需更新:
   ├── 標記 Story tracking file 含 deployment-doc-stale: true
   └── 提示 reviewer 在 code-review Phase B 處理
5. 若不需更新:
   └── 標記 deployment-doc-stale: false
```

### 3.2 code-review Phase B(Document Sync Check)

```
1. 讀 Story tracking file deployment-doc-stale 欄位
2. 若 true:
   ├── 強制更新 1.專案部屬必讀/ 對應 deep-dive
   ├── 校正數字(13/14 hooks / 73/74 skills / 18/19 rules / 23 MCP tools 等)
   ├── 更新 README.md 索引(若新增 / 刪除)
   └── 寫入 CR Report Phase B Section
3. 若 false:
   └── 跳過(no-op)
4. 自動化驗證:
   └── 執行 scripts/verify-deployment-docs.cjs(advisory)
```

---

## 4. Verification Tools

### 4.1 `scripts/verify-deployment-docs.cjs`(advisory)

CI / 手動執行的自動化驗證腳本(計畫):

```javascript
// scripts/verify-deployment-docs.cjs
// 功能:
//   1. 解析 1.專案部屬必讀/*.md 內所有 markdown link 確認可達
//   2. grep 7 類脫敏 pattern 確認 0 命中
//   3. 比對聲稱數字 vs 實際:
//      - "14 hooks" / "13 hooks" → 比 (Get-ChildItem .claude/hooks/*.js -Exclude *.test.js).Count
//      - "74 Skills" / "73 Skills" → 比 (Get-ChildItem .claude/skills -Directory).Count
//      - "19 Rules" → 比 (Get-ChildItem .claude/rules/*.md).Count
//      - "23 MCP tools" → 比 server.js 中宣告的 tool 數
//      - "30+ tables" → 比 init-db.js 中 CREATE TABLE 數
//   4. 發現 drift → exit 1 + 列清單
//   5. 全 pass → exit 0
```

### 4.2 PR-Gate Job 7(advisory)

加入 `.github/workflows/pr-gate.yml`(計畫):

```yaml
deployment-doc-drift:
  name: 'Deployment Doc Drift (Advisory)'
  runs-on: ubuntu-latest
  needs: detect-changes
  if: |
    contains(github.event.pull_request.changed_files, '.claude/') ||
    contains(github.event.pull_request.changed_files, '.context-db/scripts/init-db.js')
  steps:
    - uses: actions/checkout@v4
    - run: node scripts/verify-deployment-docs.cjs
      continue-on-error: true   # advisory 不 BLOCK
```

---

## 5. FORBIDDEN

- ❌ Skill / Hook / Rule 數量改變但不更新部屬指南數字
- ❌ 新增 .claude/hooks/*.js 但不寫入 hooks-events-deep-dive.md
- ❌ 新增 IDD-{TYPE}-NNN 但不更新 idd-framework.md §5(現存 IDD 範例)
- ❌ 新增 MCP server 但不更新 mcp-ecosystem.md §3
- ❌ Edit `init-db.js` 加表但不更新 memory-system-deep-dive.md §3
- ❌ Skill version bump 但 SKILL.md 內 `version` field 與部屬指南數字不一致

---

## 6. 自動偵測 Hook(Phase 5+ 計畫)

未來可建 `.claude/hooks/deployment-doc-freshness.js`(Stop hook,advisory):

```javascript
// 概念:
// Stop hook 後,若本次 git diff 命中 §2 任一觸發條件:
//   stderr 提示「請檢查 1.專案部屬必讀/<對應 deep-dive>.md」
//   不 BLOCK(exit 0),純提醒
```

---

## 7. Self-Check Questions(每次 dev-story 結束前必自問)

1. 「我是否新增 / 修改 / 刪除了 .claude/hooks/.skills/.rules/.commands/.agents 中任一檔?」
2. 「我是否變更了 init-db.js / .mcp.json / pr-gate.yml?」
3. 「我是否在 1.專案部屬必讀/README.md 反映了上述變更?」
4. 「我是否更新了對應 deep-dive .md(skills / rules / hooks / memory / mcp / bmad / commands)?」

任一為 No 且涉變更 → 視為 deployment-doc-stale: true。

---

## 8. Related Rules

- `.claude/rules/skill-sync-gate.md` — Skill 變更同步(本規則的「兄弟 gate」)
- `.claude/rules/skill-idd-sync-gate.md` — IDD forbidden_changes 保護
- `.claude/rules/cr-debt-doc-audit.md` — CR Phase B 既有文檔同步檢查
- `1.專案部屬必讀/SANITIZATION-POLICY.md` §6 — 7 條 grep 終審

---

## 9. Version History

| 版本 | 日期 | 變更 |
|:----|:----|:----|
| **1.1.0** | **2026-07-27** | **新增 §1.5 Scope 界定 — `1.專案部屬必讀/` 已為 frozen baseline**。觸發:`td-devenv-guard-psenc-doc-convergence` code-review Phase B 執行時發現本 rule §3.2 要求「強制更新 `1.專案部屬必讀/` 對應 deep-dive」,但該目錄已於 **2026-05-05** `single-engine-mode.md` Core Decision #4(Toolkit 鏡像 sync 機制停用)+ **2026-05-09** commit `b749b128`(整批 untrack,`git ls-files` 實測回 0)成為 frozen 物理 baseline,natural decay 屬預期行為。本 rule 建於 2026-05-01,早於該裁定且未同步,形成「規則要求做一件已被上層裁定停止的事」。§1.5 明列 `config-templates/**` 判 N/A、deep-dive `.md` 更新不產生版控效果,並開放「N/A(frozen baseline)+ `git ls-files` 佐證」為合規結案方式。**未改**任何觸發條件或既有流程步驟。走 `Skill(skill="cc-config-author")`。 |
| 1.0.0 | 2026-05-01 | 初版建立。觸發 §2 10 條條件 + dev-story Step 8 / code-review Phase B 雙檢查點 + verify-deployment-docs.cjs 計畫 + PR-Gate Job 7 advisory + 6 條 FORBIDDEN + 4 條 Self-Check |
