---
paths:
  - ".context-db/server.js"
  - ".context-db/scripts/init-db.js"
  - ".context-db/scripts/embedder*.js"
  - ".context-db/scripts/semantic*.js"
  - ".context-db/scripts/fusion*.js"
  - ".context-db/migrations/*.sql"
  - ".claude/hooks/pre-prompt-rag.js"
  - ".claude/hooks/subagent-context-inject.js"
  - ".mcp.json"
---

# Capability Integration Mandate — MCP/Schema/Hook 新增 5 步整合強制(SUPREME)

> **建立**: 2026-05-02 02:48 +08:00
> **觸發**: ADR-GOVERNANCE-001 + Tianji-Pavilion v1.1.0 首應用揭示「PCPT 既有 9 sync-gate 規範體系全部聚焦 Skill↔Code 軸,**0 個覆蓋 MCP capability ↔ workflow consumption 軸**」
> **嚴重等級**: SUPREME(對齊 `constitutional-standard.md` / `single-engine-mode.md` 同等級;原 `dual-repo-push-discipline.md` 已 retired 2026-05-16,整合至 single-engine-mode §FROZEN Future-Unfreeze SOP)

---

## 1. Why This Rule

PhyCool 既有 9 sync-gate 規範:
- `skill-sync-gate.md` — Skill ↔ Code 同步(Migration / Model / Service / Controller / Route / Component)
- `skill-idd-sync-gate.md` — IDD forbidden_changes 保護
- `skill-tool-invocation-mandatory.md` — Skill tool 字面調用
- `deployment-doc-freshness.md` — 部屬指南新鮮度(10 條觸發)
- ~~`dual-repo-push-discipline.md`~~ — **retired 2026-05-16**,整合至 `single-engine-mode.md` §FROZEN Future-Unfreeze SOP
- ~~`toolkit-mirror-immediate-sync.md`~~ — **FROZEN 2026-05-05**(toolkit 鏡像同步機制停用,per `single-engine-mode.md`)
- ~~`auto-skill-detection.md`~~ — **retired 2026-05-05**(違反官方 progressive disclosure,Domain Profile 邏輯保留於 `skill-creation-discipline.md` §8)
- `constitutional-standard.md` — Code Verification + Backend Contract + Depth-First + External Source Citation
- `verification-protocol.md` — 跨檔變更驗證

**全部聚焦「Skill ↔ Code 軸」,0 個覆蓋「MCP capability ↔ workflow / pipeline / skill 整合軸」**。

**事件**: 2026-05-02 4 維 subagent 深讀揭示 `symbol_dependencies` graph + `expandDependencies` 2-hop + `RELATION_WEIGHTS` 量化邊 + 8063 symbols 100% embedding 已 ready,但:
- BMAD workflow grep `search_symbols|get_symbol_context|trace_context` = **0 命中**
- `phycool-context-memory` SKILL.md §3 標題「19 AI Tools」← 實際 server.js 23+ tools(SKILL stale)
- `.context-db/migrations/` 只有 1 對 SQL,35 tables 無 timestamp trace

→ **規範缺位 → Latent Capability Trap + Silent Capability Addition + Builder's Paradox 三重反模式**

本規則補強此盲點。

---

## 2. Applies When

任一觸發即適用本規則 5 步整合強制:

| # | 觸發條件 | 偵測信號 |
|:-:|:----|:----|
| 1 | `.context-db/server.js` MCP tool **新增 / 簽名改 / 移除** | git diff path=.context-db/server.js 含 `tools:` 陣列變更 |
| 2 | `.context-db/scripts/init-db.js` schema **新表 / 新欄位 / 新 index** | git diff 含 `CREATE TABLE` / `ALTER TABLE` / `CREATE INDEX` |
| 3 | `.claude/hooks/pre-prompt-rag.js` Layer **變更 / 新增 / 注入邏輯改** | git diff 含 `Layer\s+\d+` 或 `S_final` / `expandDependencies` / `RELATION_WEIGHTS` |
| 4 | `.mcp.json` **server / tool 變更** | git diff path=.mcp.json |
| 5 | `.context-db/scripts/{semantic,embedder,fusion}*.js` **演算法改** | git diff path matches |
| 6 | `.context-db/migrations/*.sql` **新建 migration** | git diff path matches |

**不適用**:
- 純文件 / 文檔改(走 deployment-doc-freshness.md)
- Skill SKILL.md 改(走 skill-sync-gate.md)
- Code 改但無 capability 變化(走 skill-sync-gate.md)

---

## 3. Mandatory 5 步(任一缺 = 違反)

```
觸發 § 2 任一條件
    ↓
Step 1: SKILL 同步
    └─ phycool-context-memory SKILL.md §3 加 tool/schema/Layer 變更
    └─ 必加 use case + when to use 對照表(對比近似工具)
    └─ 走 Skill(skill="saas-to-skill") Mode B 升版(對齊 skill-tool-invocation-mandatory.md)
    ↓
Step 2: BMAD 整合
    └─ create-story / dev-story / code-review 至少 1 step 加 use case
    └─ 範例(可加 §0.5 / §3.1 / §X 等獨立 sub-section,不破壞既有流程)
    ↓
Step 3: Pipeline / Hook 注入(分 entry path,對應路徑必覆蓋)
    ├─ Path A — Pipeline 模式(claude -p 主進程,含 batch / orchestrator / checkpoint):
    │  ├─ pre-prompt-rag.js UserPromptSubmit Hook Layer 10+ 動態注入(主進程自動覆蓋)
    │  └─ scripts/story-pipeline.ps1 enforcePrompt 字面提示輔助(增強 Claude 自律,非取代 Hook)
    ├─ Path B — SubagentStart 模式(Agent tool spawn):
    │  └─ .claude/hooks/subagent-context-inject.js SubagentStart Hook Phase 4.5+ 注入
    └─ 規則: 兩 path 各自獨立。若新 capability 涉某 path,該 path 注入必覆蓋;
       若同時涉 A+B(主流情境),二者皆需覆蓋。F1 違規豁免見 §4。
    ↓
Step 4: 部屬範本
    └─ claude token減量策略研究分析/1.專案部屬必讀/mcp-ecosystem.md 加對外整合範本
    └─ 含 5 步整合 SOP + CLI/MCP 使用範例
    ↓
Step 5: Schema 公告事件
    └─ 走 .context-db/migrations/*.sql(up + down 雙向)留 timestamp trace
    └─ Memory DB add_context({category:'infrastructure-evolution', ...}) 公告
    └─ init-db.js 同步加欄位定義
```

任一步缺失 → **違反規則,CR Phase B 自動 BLOCK**。

---

## 4. FORBIDDEN(8 條,違反 = SUPREME 等級違規)

- ❌ **F1**: 加 MCP tool 但 5 步任一不執行 → 自動 violation(對齊 §3 流程)
  - **F1 例外條款**: Step 3 分 Path A(Pipeline)/ Path B(SubagentStart),依 capability 真實 entry path 決定覆蓋範圍。Path A 由 `pre-prompt-rag.js` Layer 10 自動注入(主進程觸發),enforcePrompt 文字提示為輔。Path B 由 `subagent-context-inject.js` Phase 4.5 自動注入。若 capability 只涉單一 path 該 path 覆蓋即 PASS;若涉兩 path 二者皆需覆蓋。判定文件:本對話 ADR-GOVERNANCE-001 §6.5。
- ❌ **F2**: schema 加表 / 欄不走 migration → **失去 timestamp trace + 重蹈 Silent Capability Addition**
- ❌ **F3**: 「**下次有人會用**」式合理化 → Builder's Paradox 重現,違反 Q4 主權盤點精神
- ❌ **F4**: Hook 注入新 Layer 但不暴露對應主動 query MCP tool → **Latent Capability Trap**(Agent 被動消費,不知主動 API)
- ❌ **F5**: 5 步整合用「TODO」/「示意」/「之後補」式 placeholder → 對齊 `constitutional-standard.md §Depth-First Verification`
- ❌ **F6**: SKILL 同步直接 `Edit SKILL.md` 繞過 `Skill(skill="saas-to-skill")` Mode B → 對齊 `skill-tool-invocation-mandatory.md` F1
- ❌ **F7**: 跑 `audit-capability-reachability.cjs` 結果不修補就 commit → 違反 audit 精神
- ❌ **F8**: 加 capability 但不入 Memory DB(`add_context category=infrastructure-evolution`)→ **失去學習複利,新對話 Agent 不知有新能力**

---

## 5. Audit 工具

### `scripts/audit-capability-reachability.cjs`

**功能**: 對 server.js / init-db.js / pre-prompt-rag.js 各 capability,自動 grep `.claude/skills/**/SKILL.md` + `_bmad/bmm/workflows/4-implementation/**/*.md` + `1.專案部屬必讀/**.md` + `.claude/hooks/*.js` + `scripts/*.{ps1,cjs,js}`

**reachability_score 公式**:
```
reachability_score = 
  (skill_hits > 0 ? 0.30 : 0) +
  (bmad_hits  > 0 ? 0.40 : 0) +
  (deploy_hits> 0 ? 0.20 : 0) +
  (infra_hits > 0 ? 0.10 : 0)
```

**Pass 條件**: `reachability_score ≥ 0.5`(對齊至少 BMAD + 1 sub-system 整合)

**Mode**:
- 預設 advisory(不 block PR)
- `--strict` → exit 1 if any latent
- `--json` 輸出機器可讀
- `--md` 輸出人類可讀報告

**呼叫範例**:
```bash
node scripts/audit-capability-reachability.cjs --json
node scripts/audit-capability-reachability.cjs --md > docs/audit-reports/2026-05-02-capability-baseline.md
node scripts/audit-capability-reachability.cjs --strict --tool search_god_nodes  # 單 tool 驗證
```

---

## 6. 與既有 sync-gate 邊界

| 規範 | 軸 | 觸發 |
|:---|:---|:---|
| `skill-sync-gate.md` | **Skill ↔ Code** | Migration / Model / Service / Controller / Route / Component |
| `skill-idd-sync-gate.md` | **IDD ↔ forbidden_changes** | IDD 建立 / Skill 改 / Code 觸 IDD related_files |
| `skill-tool-invocation-mandatory.md` | **Skill tool 字面調用** | Edit SKILL.md / 三引擎同步 / version bump |
| `deployment-doc-freshness.md` | **部屬指南新鮮度** | hooks / skills / rules / init-db / agents / commands / .mcp.json / bmad-overlay |
| **本規則** | **Capability ↔ Consumption** | server.js MCP / init-db.js schema / pre-prompt-rag.js Layer / .mcp.json / embedder algo / migrations |

→ **互補不重疊**(本規則填補既有 9 規範系統性盲點)

## 6.5 Sync-Gate Execution Order(2026-05-02 新增,A-3 finding rescue)

當同一改動同時觸發多條 SUPREME sync-gate(如 `init-db.js` 加表 + 對應 SKILL.md 升 v + `1.專案部屬必讀/` deep-dive 同步 + toolkit 鏡像)時,依序執行避免並發競爭與 stale 鏡像:

```
1. skill-tool-invocation-mandatory.md  ← 入口層(字面 Skill tool 調用前提)
2. 本規則 capability-integration-mandate.md  ← Capability ↔ Consumption 5 步整合
3. skill-sync-gate.md                  ← Skill ↔ Code 通用同步
4. skill-idd-sync-gate.md              ← IDD forbidden_changes 保護
5. deployment-doc-freshness.md         ← 部屬指南新鮮度
6. ~~toolkit-mirror-immediate-sync.md~~ ← **FROZEN 2026-05-05**(toolkit 鏡像同步停用,前 5 步完成即可,不需第 6 步)
```

**排序原則**:從「規範自身入口層」→「業務內容軸」→「外圍部屬層」逐層執行,避免提早 commit toolkit 鏡像時上游內容仍 stale。對齊 `skill-idd-sync-gate.md` 既有 Step 8.1 → 8.2 範本。

---

## 7. Self-Check(每次觸發 §2 必自問 5 題)

1. **「我是否新增 / 改 server.js MCP tool 或 init-db.js schema 或 pre-prompt-rag.js Layer?」**
   - 是 → 走完 §3 5 步
2. **「我是否打算延後 SKILL 同步 / BMAD 整合 / 部屬範本到 backlog?」**
   - 是 → STOP,當下完成(原 toolkit-mirror-immediate-sync 立即原則 FROZEN 2026-05-05,但「當下完成不延後」精神保留於 F-S5 投機紅線)
3. **「Skill 同步是否走 `Skill(skill="saas-to-skill")` Mode B?」**
   - 否 → STOP,改走字面 Skill tool 調用
4. **「schema 變更是否走 migration?」**
   - 否 → STOP,建 .sql up + down
5. **「我是否已寫 Memory DB add_context category=infrastructure-evolution 公告?」**
   - 否 → STOP,寫入

---

## 8. Hook 機制(advisory / 後續可升 BLOCK)

未來可建 `.claude/hooks/capability-integration-detector.js` Stop hook(計畫,P3 backlog):

```javascript
// Stop hook 偵測本 session git diff 是否觸及 §2 任一條件
// 若觸及 → 跑 audit-capability-reachability.cjs
// 若 reachability_score < 0.5 → stderr 警告 + 建議走 5 步
// 不 BLOCK(advisory),純提醒
```

**未來升級路徑**(對齊 td-rule-violation-workflow-precheck Phase 4 → Phase 5 模式):
- v1.0 advisory:純警告
- v1.1 grey-launch:ENV flag 啟用 stderr 警告
- v2.0 BLOCK:升 PR-Gate Job blocking

---

## 9. Incident Records

### 2026-05-02 — 本規則觸發建立(首例 capability ↔ consumption 規範)

**事件**: Tianji-Pavilion v1.0.0 首應用評估 graphify-6 + Yuxi-main,4 維 subagent 深讀(Memory DB MCP 第 4 維)揭示 PCPT 既有 graph capability 70% ready 但 BMAD workflow 0 命中調用。

**處理**:
- ✅ ADR-GOVERNANCE-001 撰寫(8 根因 8 解方)
- ✅ Tianji-Pavilion v1.0 → v1.1(Q4 自家盤點 + 第 8 項情境匹配 + F11 + Self-Iter Incident)
- ✅ 本規則建立(SUPREME 規範補強)
- ✅ skill-creation-discipline.md 並建(Skill 規模治理,對齊 Layer 7)
- ✅ audit-capability-reachability.cjs 實作 + tests
- ✅ god node Layer 3 啟用(走本規則 5 步 dogfood)

**Lesson**: 「規範本身也是 latent capability,首應用即驗證 + 修補」。Tianji-Pavilion 自我迭代條款 §1 觸發超前 5 次門檻。

---

## 10. Related

- `claude token減量策略研究分析/Tianji-Pavilion.md` v1.1.0(§1.2 Q4 + §3.2 第 8 項 + §7 F11 + §銜接 +1)
- `docs/technical-decisions/ADR-GOVERNANCE-001-...md`(主 ADR)
- `.claude/rules/skill-creation-discipline.md`(SUPREME 兄弟規範,Layer 7)
- `.claude/rules/skill-sync-gate.md`(既有 Skill ↔ Code 軸)
- `.claude/rules/constitutional-standard.md`(SUPREME 同等級)
- `scripts/audit-capability-reachability.cjs`(audit 工具)
- `claude token減量策略研究分析/知識圖譜/補全計畫.md`(完整 spec)

---

## 11. Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.0.0** | **2026-05-02 02:48** | **初版建立**。對齊 ADR-GOVERNANCE-001 + Tianji-Pavilion v1.1.0。觸發事件: 首應用 dogfood 揭示既有 9 sync-gate 規範體系系統性盲點(0 規範覆蓋 Capability ↔ Consumption 軸)。本規範補強此缺位。Mandatory 5 步 + 8 條 FORBIDDEN + Self-Check 5 題 + audit-capability-reachability.cjs 工具支援。 |
