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

> **版本**: 1.0.0
> **適用情境**: Memory DB / MCP capability 與 BMAD workflow 雙軸對齊規範
> **嚴重等級**: SUPREME(對齊 `constitutional-standard.md` / `dual-repo-push-discipline.md` 同等級)

---

## 1. Why This Rule

既有 sync-gate 規範通常聚焦「Skill ↔ Code 軸」(Migration / Service / Controller 等),**容易遺漏「MCP capability ↔ workflow consumption 軸」**:

- **Latent Capability Trap**: graph capability(symbol_dependencies + RELATION_WEIGHTS + 8K+ symbols embedding)已 ready 70%,但 BMAD workflow grep 0 命中調用
- **Builder's Paradox**: Infrastructure-first(`.context-db`)與 Workflow-first(BMAD)兩個 sub-system 無 force 機制 = 永久脫鉤
- **Silent Capability Addition**: schema 加表不走 migration trace → 失去 timestamp 追溯
- **Sync Gate Blind Spot**: 0 個既有 sync-gate 覆蓋本軸 → 新加 capability 無人引導 BMAD 整合

→ 本規則補強此盲點,強制 5 步整合流程。

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
- 純文件 / 文檔改(走 `deployment-doc-freshness.md`)
- Skill SKILL.md 改(走 `skill-sync-gate.md`)
- Code 改但無 capability 變化(走 `skill-sync-gate.md`)

---

## 3. Mandatory 5 步(任一缺 = 違反)

```
觸發 § 2 任一條件
    ↓
Step 1: SKILL 同步
    └─ 對應 context-memory SKILL.md 加 tool/schema/Layer 變更
    └─ 必加 use case + when to use 對照表(對比近似工具)
    └─ 走 Skill(skill="saas-to-skill") Mode B 升版(對齊 skill-tool-invocation-mandatory.md)
    ↓
Step 2: BMAD 整合
    └─ create-story / dev-story / code-review 至少 1 step 加 use case
    └─ 範例(可加 §0.5 / §3.1 / §X 等獨立 sub-section,不破壞既有流程)
    ↓
Step 3: Pipeline / Hook 注入(分 entry path,對應路徑必覆蓋)
    ├─ Path A — Pipeline 模式(claude -p 主進程,含 batch / orchestrator / checkpoint):
    │  ├─ pre-prompt-rag.js UserPromptSubmit Hook Layer N+ 動態注入(主進程自動覆蓋)
    │  └─ 通用 enforcePrompt 字面提示輔助(增強 Claude 自律,非取代 Hook)
    ├─ Path B — SubagentStart 模式(Agent tool spawn):
    │  └─ .claude/hooks/subagent-context-inject.js SubagentStart Hook 注入
    └─ 規則: 兩 path 各自獨立。若新 capability 涉某 path,該 path 注入必覆蓋;
       若同時涉 A+B(主流情境),二者皆需覆蓋。F1 違規豁免見 §4。
    ↓
Step 4: 部屬範本
    └─ deployment 對應 mcp-ecosystem.md 加對外整合範本
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
  - **F1 例外條款**: Step 3 分 Path A(Pipeline)/ Path B(SubagentStart),依 capability 真實 entry path 決定覆蓋範圍。Path A 由 `pre-prompt-rag.js` Layer N 自動注入(主進程觸發),enforcePrompt 文字提示為輔。Path B 由 `subagent-context-inject.js` 自動注入。若 capability 只涉單一 path 該 path 覆蓋即 PASS;若涉兩 path 二者皆需覆蓋。
- ❌ **F2**: schema 加表 / 欄不走 migration → **失去 timestamp trace + 重蹈 Silent Capability Addition**
- ❌ **F3**: 「**下次有人會用**」式合理化 → Builder's Paradox 重現
- ❌ **F4**: Hook 注入新 Layer 但不暴露對應主動 query MCP tool → **Latent Capability Trap**(Agent 被動消費,不知主動 API)
- ❌ **F5**: 5 步整合用「TODO」/「示意」/「之後補」式 placeholder → 對齊 `constitutional-standard.md §Depth-First Verification`
- ❌ **F6**: SKILL 同步直接 `Edit SKILL.md` 繞過 `Skill(skill="saas-to-skill")` Mode B → 對齊 `skill-tool-invocation-mandatory.md` F1
- ❌ **F7**: 跑 `audit-capability-reachability.cjs` 結果不修補就 commit → 違反 audit 精神
- ❌ **F8**: 加 capability 但不入 Memory DB(`add_context category=infrastructure-evolution`)→ **失去學習複利,新對話 Agent 不知有新能力**

---

## 5. Audit 工具

### `scripts/audit-capability-reachability.cjs`

**功能**: 對 server.js / init-db.js / pre-prompt-rag.js 各 capability,自動 grep `.claude/skills/**/SKILL.md` + `_bmad/bmm/workflows/4-implementation/**/*.md` + deployment-mirror docs + `.claude/hooks/*.js` + `scripts/*.{ps1,cjs,js}`

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

---

## 6. 與既有 sync-gate 邊界

| 規範 | 軸 | 觸發 |
|:---|:---|:---|
| `skill-sync-gate.md` | **Skill ↔ Code** | Migration / Model / Service / Controller / Route / Component |
| `skill-idd-sync-gate.md` | **IDD ↔ forbidden_changes** | IDD 建立 / Skill 改 / Code 觸 IDD related_files |
| `skill-tool-invocation-mandatory.md` | **Skill tool 字面調用** | Edit SKILL.md / 三引擎同步 / version bump |
| `deployment-doc-freshness.md` | **部屬指南新鮮度** | hooks / skills / rules / init-db / agents / commands / .mcp.json / bmad-overlay |
| **本規則** | **Capability ↔ Consumption** | server.js MCP / init-db.js schema / pre-prompt-rag.js Layer / .mcp.json / embedder algo / migrations |

→ **互補不重疊**(本規則填補既有規範系統性盲點)

## 6.5 Sync-Gate Execution Order

當同一改動同時觸發多條 SUPREME sync-gate(如 `init-db.js` 加表 + 對應 SKILL.md 升 v + deployment doc 同步 + toolkit 鏡像)時,依序執行避免並發競爭與 stale 鏡像:

```
1. skill-tool-invocation-mandatory.md  ← 入口層(字面 Skill tool 調用前提)
2. 本規則 capability-integration-mandate.md  ← Capability ↔ Consumption 5 步整合
3. skill-sync-gate.md                  ← Skill ↔ Code 通用同步
4. skill-idd-sync-gate.md              ← IDD forbidden_changes 保護
5. deployment-doc-freshness.md         ← 部屬指南新鮮度
6. toolkit-mirror-immediate-sync.md    ← Toolkit 鏡像(必最後,確保前 5 步成果都同步出去)
```

**排序原則**:從「規範自身入口層」→「業務內容軸」→「外圍部屬層」逐層執行,避免提早 commit toolkit 鏡像時上游內容仍 stale。對齊 `skill-idd-sync-gate.md` 既有 Step 8.1 → 8.2 範本。

---

## 7. Self-Check(每次觸發 §2 必自問 5 題)

1. **「我是否新增 / 改 server.js MCP tool 或 init-db.js schema 或 pre-prompt-rag.js Layer?」**
   - 是 → 走完 §3 5 步
2. **「我是否打算延後 SKILL 同步 / BMAD 整合 / 部屬範本到 backlog?」**
   - 是 → STOP,當下完成(對齊 toolkit-mirror-immediate-sync 立即原則 + F-S5 投機紅線)
3. **「Skill 同步是否走 `Skill(skill="saas-to-skill")` Mode B?」**
   - 否 → STOP,改走字面 Skill tool 調用
4. **「schema 變更是否走 migration?」**
   - 否 → STOP,建 .sql up + down
5. **「我是否已寫 Memory DB add_context category=infrastructure-evolution 公告?」**
   - 否 → STOP,寫入

---

## 8. Hook 機制(advisory / 後續可升 BLOCK)

未來可建 `.claude/hooks/capability-integration-detector.js` Stop hook(計畫):

```javascript
// Stop hook 偵測本 session git diff 是否觸及 §2 任一條件
// 若觸及 → 跑 audit-capability-reachability.cjs
// 若 reachability_score < 0.5 → stderr 警告 + 建議走 5 步
// 不 BLOCK(advisory),純提醒
```

**未來升級路徑**:
- v1.0 advisory:純警告
- v1.1 grey-launch:ENV flag 啟用 stderr 警告
- v2.0 BLOCK:升 PR-Gate Job blocking

---

## 9. Related

- `skill-creation-discipline.md`(SUPREME 兄弟規範)
- `skill-sync-gate.md`(既有 Skill ↔ Code 軸)
- `constitutional-standard.md`(SUPREME 同等級)
- `audit-capability-reachability.cjs`(audit 工具)

---

## 10. Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.0.0** | **2026-05-02** | **初版建立**。觸發事件: 規範體系系統性盲點補強(0 個既有 sync-gate 覆蓋 Capability ↔ Consumption 軸)。Mandatory 5 步 + 8 條 FORBIDDEN + Self-Check 5 題 + Sync-Gate Execution Order(§6.5)+ F1 例外條款(Path A/B 分流) + audit-capability-reachability.cjs 工具支援。 |
