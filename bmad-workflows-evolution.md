# BMAD Workflows 進化史(create-story / dev-story / code-review)

> **版本**: 1.0.0
> **建立日期**: 2026-05-01
> **資料快照日**: 2026-05-01
> **核心原則**: Markdown step 分檔 + DB-first + Pipeline 整合

---

## 1. BMAD 體系定位

BMAD(**B**uilder, **M**aker, **A**rchitect, **D**eveloper)是一套 AI 協作開發框架,提供 17 個 agent 角色(`_bmad/_config/agent-manifest.csv`)+ 4 階段 workflow(分析/規劃/解決方案/實施)。

PCPT 專案使用 BMAD v6.0.0-alpha.21 安裝 + Epic BU 升級至 v6.2.2 概念(2026-04-03 完成)。

### 1.1 4 模組

| 模組 | 內容 |
|:----|:----|
| **bmm**(Business Module Manager)| 9 agents(analyst / architect / dev / pm / sm / tea / ux-designer / tech-writer / quick-flow-solo-dev)+ 4 階段 workflow |
| **bmb**(BMAD Builder)| Workflow / Agent / Module 創建工具(agent-builder / module-builder / workflow-builder)|
| **cis**(Creative Innovation Studio)| 6 創新角色(brainstorming-coach / creative-problem-solver / design-thinking-coach / innovation-strategist / presentation-master / storyteller)|
| **core** | bmad-master 主協調 + Party Mode 工作流 |

### 1.2 9 BMM Agents 角色

| Agent | Display Name | 圖示 | 職責 |
|:----|:----|:----|:----|
| analyst | Mary | 📊 | 商業分析 / 需求蒐集 |
| pm | John | 📋 | 產品策略 |
| architect | Winston | 🏗️ | 系統架構 |
| sm | Bob | 🏃 | Scrum Master |
| dev | Amelia | 💻 | 開發實作 |
| tea | Murat | 🧪 | Test Architect |
| tech-writer | Paige | 📚 | 技術文件 |
| ux-designer | Sally | 🎨 | UX 設計 |
| quick-flow-solo-dev | Barry | 🚀 | 微任務快速路徑 |

---

## 2. Phase 1-4 Workflow 全景

```
Phase 1: Analysis(分析)
  ├── research(domain / market / technical)
  └── create-product-brief

Phase 2: Plan(規劃)
  ├── create-prd
  └── ux-design

Phase 3: Solutioning(解決方案)
  ├── create-architecture
  ├── create-epics-and-stories
  └── check-implementation-readiness

Phase 4: Implementation(實施 — 本指南重點)
  ├── create-story  ← Story 創建
  ├── dev-story     ← Story 實作
  ├── code-review   ← Story 審查
  ├── sprint-planning / sprint-status / correct-course
  ├── retrospective / epic-closing-audit
  └── auto-pilot / document-project / testarch / bmad-quick-flow
```

工作流呼叫格式:`/bmad:module:type:name`(例如 `/bmad:bmm:workflows:dev-story`)

---

## 3. 三大核心 Workflow 演進歷程

### 3.1 演進總覽

```
v6.0.0-alpha(2026-01)初始
  ↓ instructions.xml 巨型單檔
  ↓
v6.0.0-alpha + TRS 優化(2026-02 ~ 2026-03)
  ├── TRS-0 ~ TRS-34: Token 86% 減量
  ├── code-review instructions.xml 923 → 471 行 (-49%)
  ├── code-review checklist.md 129 → 59 行 (-55%)
  ├── create-story checklist.md 358 → 62 行 (-83%)
  └── dev-story instructions.xml 480 → 436 行 (-15%)
  ↓
v6.0.0-alpha + Epic BU 升級(2026-04-03)
  ├── XML → Markdown step 分檔
  ├── code-review: 13 step + 三層平行 + SaaS 9 維
  ├── create-story: 8 step + DB-first + Skill 自動發現
  ├── dev-story: 13 step + Skill staleness + Migration Cascade
  └── 對應 v6.2.2 概念架構
  ↓
v6.0.0-alpha + Epic WFQ + ECC + CMI(2026-04-04)
  ├── Pipeline 配額管理(WFQ): 4 層防護
  ├── ECC Hook 強化: 5 hooks + RAG Pipeline + suggest-compact + MCP Health Check
  └── CMI: 對話生命週期 + 全量文檔 ETL + 11 層 RAG
```

---

## 4. create-story Workflow 進化

### 4.1 8 Step 結構(Markdown 分檔,Epic BU)

| Step | 用途 |
|:----|:----|
| step-00-db-first-query.md | DB-first 查詢(避免重複 Story)|
| step-01-target-story.md | 目標 Story 解析 |
| step-02-artifact-analysis.md | Artifact / 既有資源分析 |
| step-03-codebase-analysis.md | Codebase 結構掃描 |
| step-04-architecture-analysis.md | 架構分析 |
| step-05-web-research.md | Web 研究 |
| step-06-create-story-file.md | Story 檔案建立(DB-first 寫入)|
| step-07-finalize.md | 完成 + DB 同步 |

### 4.2 7 Depth Gates(D1-D7)

`/pcpt-create-story-depth-gate` Skill v1.4.0 提供第二層品質閘門,於 step-06 §9.5 執行:

| Gate | 驗證項 | BLOCK/WARN |
|:-:|:----|:----|
| **D1** | Skill Read 驗證(實際讀取對應 SKILL.md)| BLOCK |
| **D2** | ADR + IDD Cross-Ref(任一 IDD 違反 forbidden_changes → BLOCK)| BLOCK |
| **D3** | PRD Source 引用(M/L/XL 必有 SDD Spec)| BLOCK |
| **D4** | Chrome MCP Live(UI Story 必走 6 viewport × ruler / 跨 plan / 跨 module / 跨 tab)| WARN(可 `--accept-warn`)|
| **D5** | Iteration Pollution(file:line drift 偵測)| WARN |
| **D6** | Cross-Story Consistency(sibling file 依賴衝突)| BLOCK |
| **D7** | Self-Write Verification(field 長度 / 格式 / phase 數 / create_agent / sdd_spec non-NULL)| BLOCK |

### 4.3 ATDD AC 格式

每個 AC 必含 `[Verifies: BR-XXX]` 對應 SDD Spec Business Rule:

```
AC: 使用者點擊「升級」按鈕
  Given 使用者為 Free plan + 已使用 trial
  When 點擊升級按鈕
  Then 跳轉 /subscription/upgrade 頁面
  [Verifies: BR-PAY-002 — Free→Paid 升級必經 /subscription/upgrade]
```

### 4.4 SDD+ATDD+TDD 自動偵測

| 複雜度 | 動作 |
|:----:|:----|
| **M / L / XL** | 檢查 `docs/implementation-artifacts/specs/` → 無 Spec 自動跑 `/sdd-spec-generator` 產 `{id}-spec.md` |
| **S inline** | 無獨立 Spec,但 AC 必嵌 `[Verifies: BR-XXX]` |
| **Bug fix** | 無 Spec,但 AC 必含 `[Verifies: BR-XXX]` |

---

## 5. dev-story Workflow 進化

### 5.1 13 Step 結構(Markdown 分檔,Epic BU)

```
step-00-db-first-query.md           ← DB 查詢確認 ready-for-dev
step-01-load-story.md               ← 載入 Story + Required Skills
step-02-prepare-context.md          ← 準備上下文
step-03-implement.md                ← 程式碼實作(TDD RED-GREEN-REFACTOR)
step-04-tests.md                    ← 測試補齊
step-05-skill-staleness.md          ← Skill 過時偵測
step-06-migration-cascade.md        ← Migration 連鎖更新
step-07-kb-error-query.md           ← Knowledge Base 錯誤查詢
step-08-skill-sync-gates.md         ← 三層 Sync Gates
step-08-1-skill-sync-gate.md          ↑ skill-sync-gate.md
step-08-2-skill-idd-sync-gate.md      ↑ skill-idd-sync-gate.md
step-08-3-skill-tool-mandatory.md     ↑ skill-tool-invocation-mandatory.md
step-09-tasks-backfill.md           ← /tasks-backfill-verify 填回 file:line
step-10-communication.md            ← 完成通知 + 狀態 → review
```

### 5.2 SDD-TDD Bridge

從 Spec BR 直接驅動 TDD 命名規範:

```
BR-PAY-002 (Free→Paid 升級必經 /subscription/upgrade)
  ↓
TDD test: BR_PAY_002_FreePaid_Upgrade_Should_Redirect_To_SubscriptionUpgrade()
  ↓
RED:  寫測試 → 失敗
GREEN: 實作 → 通過
REFACTOR: 清理 → 通過
```

### 5.3 3-Round Debug Limit

測試修復 ≤ 3 輪;超過強制 context 壓縮 + 重啟 dev session。

### 5.4 Boy Scout 5-Min Rule

dev-story Step 9 之後,自動掃描周邊小型 debt:
- 5 分鐘內可修 → 直接修(計入本 Story file_list)
- > 5 分鐘 → 寫 tech_debt_items deferred

---

## 6. code-review Workflow 進化

### 6.1 13 Step 結構(Markdown 分檔,Epic BU)

```
step-01-load-discover.md            ← 載入 Story + 探索 codebase
step-01b-generate-trail.md          ← Review Trail path:line 生成(BU-06)
step-02-review-plan.md              ← 審查計畫 + 三層分派
step-03-triple-layer-dispatch.md    ← 三層平行調度(BU-01)
step-03a-blind-hunter.md              ↓ Layer A: 功能正確性盲測
step-03b-edge-case-hunter.md          ↓ Layer B: 邊界條件窮舉
step-03c-acceptance-auditor.md        ↓ Layer C: AC 符合性驗證
step-03d-triage-merge.md            ← Findings 合併 + 分類
step-04-present-autofix.md          ← 呈現 + 自動修復
step-04b-skill-staleness.md         ← Skill 過時偵測
step-05-production-gate.md          ← Production 品質閘門
step-05b-tasks-backfill.md          ← Tasks 回填驗證
step-06-report-archive.md           ← 報告 + 歸檔
```

### 6.2 三層平行 Review 架構(Epic BU 重點)

```
Story 進 review
  ↓
step-03 三層平行調度(BU-01,正交不重複):
  ├── Layer A: Blind Hunter(盲測,只看 code 不看 AC)
  │     - 功能正確性 / 邏輯破綻
  ├── Layer B: Edge Case Hunter(邊界窮舉,5 維)
  │     - Scalability / DataConsistency / MigrationIntegrity
  │     - ErrorHandling / SkillFORBIDDEN
  └── Layer C: Acceptance Auditor(AC 符合性)
        - 對齊 [Verifies: BR-XXX] 逐條驗證
  ↓
step-03d Triage Merge:
  - dedup 重複 finding
  - 嚴重度分級(C/H/M/L)
  - 排序 blast-radius
```

### 6.3 SaaS 9 維 Production Readiness(Epic BU)

step-05 Production Gate 驗證 9 維:

| 維 | 內容 |
|:-:|:----|
| 1 | Security(secrets / OWASP / RBAC)|
| 2 | Scalability(N+1 / cache / 水平擴展)|
| 3 | Observability(log / metrics / tracing)|
| 4 | Data Consistency(transaction / FK / 唯一約束)|
| 5 | Error Handling(try-catch / fallback / retry)|
| 6 | Test Coverage(80%+ + edge cases)|
| 7 | Migration Integrity(Up/Down 對稱 / 資料保留)|
| 8 | Compliance(GDPR / 個資法 / WCAG AA / EAA 2025)|
| 9 | Performance(基線比對 + < 300ms p95)|

### 6.4 Auto-Fix 流程

```
Findings → 分級
  ↓
CRITICAL → 立即自動修復
HIGH     → 自動修復(不問 user)
MEDIUM   → 試修 ≥ 5 min,失敗則 deferred
LOW      → Boy Scout 5-Min Rule;超出則 ACCEPTED(需 +90d/+365d review_date)
```

### 6.5 CR Post-Fix Audit Phase A-D

step-06 之前必跑:

| Phase | 動作 |
|:-:|:----|
| **A** | Tech Debt Self-Challenge — 對 DEFERRED/ACCEPTED 跑 5-min try-fix(memory feedback_cr_must_try_fix_before_defer.md)|
| **B** | Document sync check(CR Report / sprint-status.yaml / Reviews README / tracking file)|
| **C** | Skill Sync Gate confirmation(Rules #12 已執行)|
| **D** | Rule Violation logging(Phase 4 keyword scan)|

### 6.6 IDD Detection Gate(Phase B 內)

對每個 DEFERRED/ACCEPTED/WONT_FIX 跑 Q1-Q4(見 `idd-framework.md` §4.2):
- Q1 Business → IDD-COM
- Q2 Strategy → IDD-STR
- Q3 Regulatory → IDD-REG
- Q4 User Feedback → IDD-USR

任一 Yes → 必轉 IDD,不可留 debt。

---

## 7. Pipeline 自動化整合(Epic WFQ)

### 7.1 Pipeline 3-Slot Concurrency

```
Backlog Story
  ↓
[Slot 1] create-story (Opus) → ready-for-dev
[Slot 2] dev-story    (Sonnet) → review
[Slot 3] code-review  (Opus) → done
  ↓
3 slots 並行,12s 間隔 / 8 min watchdog
```

### 7.2 4 層 Token 安全閥

```
L1 Pre-batch: 啟動前檢查全 batch 預估 token < 90% quota
L2 Pre-story: 每 Story 啟動前再檢查
L3 Phase Gate: create→dev→review 各 phase 進入前檢查
L4 事後偵測: Stop hook 累積實際消耗,>90% 自動停止
```

### 7.3 Pipeline 6 層守護

| Layer | 機制 |
|:-:|:----|
| L1 | Pre-batch token check |
| L2 | Pre-story token check |
| L3 | Phase Gate |
| L4 | 事後偵測 |
| **L5** | Pipeline Heartbeat(Stop hook 寫 timestamp,8 min 無更新 → kill)|
| **L6** | 429 / Model Purity(每 30s 掃 stderr,偵測 quota / model degrade → 立即 kill)|

### 7.4 Model Purity Rule

**禁止** Opus → Sonnet 自動降級(會嚴重污染 code-review 品質)。Layer 6 偵測到降級立即 kill,DB status 不前進,等配額恢復重跑。

---

## 8. 9 Lifecycle Invariants 整合(I1-I9)

每次 Workflow 階段轉換時驗證 9 條不變式(見 `rules-deep-dive.md` §5)。違反 → BLOCK。

---

## 9. Skill 整合機制

### 9.1 Required Skills 自動發現(create-story)

```
create-story step-03 / step-04:
  ├── 解析 Story 領域關鍵字
  ├── 對照 .claude/skills/skills_list.md
  ├── 匹配 Domain Profile(同 Domain 連帶)
  └── 寫入 Story.required_skills(JSON array)

dev-story step-01:
  ├── 讀 Story.required_skills
  ├── 載入對應 SKILL.md(主動 Read)
  └── 執行依 Skill SOP / FORBIDDEN
```

### 9.2 Skill Validator(Epic BU bu-03)

step-04b 在 dev-story 與 code-review 內掃描:
- Skill version drift
- watches glob 命中變更檔
- ≥3 STALE 自動升 MEDIUM debt

---

## 10. Quick Dev Solo Workflow(Epic BU bu-04)

`Barry`(quick-flow-solo-dev)專屬路徑,適用 XS / S 微任務:

```
Story 標 quick-dev:
  ├── 跳過 SDD Spec
  ├── AC 簡化(2-3 條)
  ├── 跳過 Skill 自動發現(只載 1 個)
  └── 直接進 step-oneshot:
        - 寫 code
        - 寫 test
        - 自我驗證(self-check)
        - DB 寫入 done
```

零 overhead,5-10 min 內完成微任務。

---

## 11. 自助驗證指令

```powershell
# 列出 41 step files
Get-ChildItem _bmad\bmm\workflows\4-implementation\*\steps\*.md | Measure-Object

# 列出 9 BMM agents
Get-ChildItem _bmad\bmm\agents\*.md | Where-Object { $_.Name -ne 'README.md' }

# 列出 17 全 agents(含 cis / bmb / core)
$csv = Import-Csv _bmad\_config\agent-manifest.csv
$csv.Count    # 應 17

# 確認 Epic BU 升級狀態
Test-Path _bmad\bmm\workflows\4-implementation\code-review\steps\step-03-triple-layer-dispatch.md
# 應 True(三層平行)
Test-Path _bmad\bmm\workflows\4-implementation\code-review\saas-standards.md
# 應 True(SaaS 9 維)
```

---

## 12. Related Reading

- `rules-deep-dive.md` §5 — Story Lifecycle Invariants I1-I9
- `rules-deep-dive.md` §7 — Sync Gates 三層架構
- `skills-deep-dive.md` §7 — Skill Sync Gate 細節
- `idd-framework.md` §4 — code-review IDD Detection Gate
- `hooks-events-deep-dive.md` — Pipeline hooks(heartbeat / auto-exit / permission)
- `BMAD架構演進與優化策略.md` §3.5 — Epic BU 升級成果
- `Claude智能中控自動化排程/pipeline-audit-token-safety.md` — Pipeline 配額管理

---

## 13. 版本歷史

| 版本 | 日期 | 變更 |
|:----|:----|:----|
| 1.0.0 | 2026-05-01 | 初版建立。Phase 1-4 全景 + 9 BMM agents + create-story 8 step + 7 Depth Gates / dev-story 13 step + Skill Sync 三層 / code-review 13 step + 三層平行 + SaaS 9 維 + Phase A-D Audit + IDD Detection / Pipeline 3-slot + 6 層守護 / Quick Dev solo |
