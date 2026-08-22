# Integration & Routing (party-to-pipeline v5.1.0 L3)

> §6 Capability Integration Awareness + §7 Model Routing Matrix mini + §11 與既有規範整合。

---

## §6 Capability Integration Awareness

> 對齊 `.claude/rules/capability-integration-mandate.md` §3 5 步 + F1 例外。

### 6.1 本 Skill 在 Capability Integration 5 步中的定位

| Step | Capability | 工具 / 機制 |
|:---:|:---|:---|
| 1 | **SKILL 同步** | `Skill(skill="saas-to-skill")` Mode B |
| 2 | **BMAD 整合** | dev-story §0.5 God Node Awareness Pre-Check |
| 3 | **Pipeline 注入** | worker scripts 透過 protocol-template.md 注入 ACK 規範 + `Build-StoryPromptContext`(v5.14.0 起,bwu-1)注入 **19 個標籤行 / 20 個欄位值**(`priority` 與 `complexity` 共用同一行,故標籤行數比欄位數少 1;`task_track` 之值來自 worker 的 `-Track` 參數而非 `$Story` 物件):`story_id`/`title`/`epic_id`/`priority`/`complexity`/`status`/`task_track`/`dependencies`/`user_story`/`background`/`acceptance_criteria`/`tasks`/`dev_notes`/`required_skills`/`file_list`/`implementation_approach`/`testing_strategy`/`definition_of_done`/`sdd_spec`/`pipeline_notes`(非 Story 全文 — `domain`/`risk_assessment`/`rollback_plan`/`monitoring_plan` 等其餘 stories 表欄位不在注入範圍,worker 需自行 `search_stories` 查詢) |
| 4 | **部屬範本** | 配置變更即時鏡像至 `1.專案部屬必讀/` |
| 5 | **Schema 公告** | `add_context(category='infrastructure-evolution')` |

### 6.2 FORBIDDEN

- ❌ Party Mode 結束跳過 Skill Impact Report 直接 commit
- ❌ 忽略子視窗 `[NEEDS-APPROVAL: ...]` 回報
- ❌ Phase 4 委派前未確認 phaseModelMapping SSoT 已更新

---

## §7 Model Routing Matrix mini

> 對齊 ADR-GOVERNANCE-001 + `scripts/pipeline-config.json phaseModelMapping` SSoT (BR-MR-01)。

### 7.1 phaseModelMapping 摘要表

| Phase | model_id | effort | 用途 |
|:---:|:---|:---:|:---|
| `create-story` | 現行 Opus 分層(SSoT:`pipeline-config.json` → `phaseModelMapping.create-story.model_id`) | max | Party Mode 收斂 + AC/架構深度(2026-06-08 使用者裁定 opus max) |
| `dev-story` | `claude-sonnet-5[1m]` | max | 2026-07-19 使用者裁定:dev 全階段改 sonnet-5(supersede 2026-06-11 opus;routine dev 效率優先,effort max 自動注入 ultrathink) |
| `dev-story-complex` | `claude-sonnet-5[1m]` | max | Migration / 複雜 schema 卡(2026-07-19 改 sonnet-5,不再自動升 opus;effort=max 仍注入 ultrathink) |
| `code-review` | 現行 Opus 分層(SSoT:`pipeline-config.json` → `phaseModelMapping.code-review.model_id`) | max | CR 深度 + production quality |
| `dev-story-fix-Rn` | `claude-sonnet-5[1m]` | max | retry 同 dev(2026-07-19 改 sonnet-5 + max) |
| `subagent` | `claude-haiku-4-5-20251001` | default | 輕量探索 |

> **model_id 欄位標示慣例(2026-07-25 v5.9.0 起漸進採用,Party Mode 冪等性分析裁示)**:`create-story` / `code-review` 剛歷經 Claude Code CLI Opus 分層更名(opus-4.8→opus-5),改採「角色語言 + SSoT 指標」取代字面版本字串——避免下次 Anthropic 再更名時本表又要逐一同步改。`dev-story` 系列 / `subagent` 尚未遇過同類更名事件,暫留字面值;待其 tier 未來更名時比照轉換,不做非必要的預防性改動。**唯一權威現值一律以 `scripts/pipeline-config.json` 為準,本表僅為衍生摘要,如有落差以 SSoT 為準**。

> **2026-07-19 v5.8.0 對齊**:本表同步 SSoT 現值 — **dev 全階段(dev-story / dev-story-complex / dev-story-fix-Rn)→ `claude-sonnet-5[1m]` + max**(2026-07-19 使用者裁定,supersede 2026-06-08/11 opus-dev 裁定;複雜卡不再自動升 opus,effort=max 仍注入 ultrathink)。model_alias=`sonnet` 對應既有 `modelPricing.sonnet`(3/15);dev estimated_cost_usd 保守留 opus-scaled 不動 budgetPerPhase headroom。`claude-sonnet-5[1m]` 經 CLI 2.1.211 實測 contextWindow=1M。
>
> **2026-07-25 v5.9.0 對齊**:Claude Code CLI `/model` picker 現行「Opus」分層已更名(Opus 4.8 → Opus 5,非現行預設)—— **create-story / code-review 改用現行 Opus 分層 + max**(model_alias 仍 `opus`,對應既有 `modelPricing.opus` 費率不變,同價位升級,現值見上表 SSoT 指標)。現行 Opus 分層經 CLI 2.1.219 實測 contextWindow=1M。Mode C 通用任務 presets 同步:`opus-5`(新現行預設)/ `sonnet-5` / `fable-5`;legacy `opus-4.8` / `sonnet-4.6`,見 `generalTask.presets` + [general-task-mode.md](general-task-mode.md) §4。

### 7.2 v4.0.0 整合機制

`shared-utils.ps1::Read-PhaseModel` 從 `pipeline-config.json` 讀取 SSoT,worker scripts 用此函數解析 model_id + effort。retry attempt > 0 自動升 effort=max。

---

## §11 與既有規範整合

| 規範 | 整合方式 |
|:----|:--------|
| `.claude/rules/skill-tool-invocation-mandatory.md` SUPREME | worker-review.ps1 強制 Skill Sync 走 `Skill(skill="saas-to-skill")` Mode B |
| `.claude/rules/skill-sync-gate.md` | dev-story / code-review 階段強制 |
| `.claude/rules/skill-idd-sync-gate.md` | code-review 階段檢查 IDD forbidden_changes |
| ~~`.claude/rules/toolkit-mirror-immediate-sync.md`~~ | **retired 2026-05-05** per single-engine-mode (toolkit sync FROZEN) |
| ~~`.claude/rules/dual-repo-push-discipline.md`~~ | **retired 2026-05-16**(整合至 single-engine-mode.md §FROZEN Future-Unfreeze SOP)|
| `.claude/rules/constitutional-standard.md` | Code Verification + Backend Contract + External Source Citation Mandate |
| `.claude/rules/pipeline-handshake-protocol.md` | (v4.0.0 新建) ACK handshake 規範 + evidence shape spec |
| `.claude/rules/capability-integration-mandate.md` SUPREME | MCP/Schema/Hook 新增 5 步整合強制 |
| `.claude/rules/skill-creation-discipline.md` SUPREME | Skill 規模 cap (75 → 80) + 新建必檢 3 題 |
| `.claude/rules/subagent-blocked-tools.md` | 子代理 3-Tier Boundary (Always Do / Ask First / Never Do) |
| `.claude/rules/verification-protocol.md` | 跨檔變更驗證 5 步 |
| `.claude/rules/db-first-no-md-mirror.md` | Story 結構化資料 DB-first SSoT |
| `.claude/rules/parallel-batch-conflict-isolation.md` (v5.0.0) | 5 軸 Conflict Matrix + 4-Layer Defense |
| ~~`.claude/rules/parallel-worker-identity.md`~~ [RETIRED → `parallel-batch-conflict-isolation.md` + `scripts/shared-utils.ps1`] | 4-Tuple Identity Quad-Confirm |
| `.claude/rules/encoding-discipline.md` (v5.0.0) | PS 5.1 繁中 UTF-8 防雷 |
| `.claude/rules/mcp-payload-discipline.md` (v5.0.0) | MCP write 紀律 + Invoke-PhycoolMcpSafe |
