---
name: 'step-04-architecture-analysis'
description: 'Architecture analysis for developer guardrails: extract all constraints the developer MUST follow'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/create-story'
thisStepFile: '{workflow_path}/steps/step-04-architecture-analysis.md'
nextStepFile: '{workflow_path}/steps/step-05-web-research.md'
---

# Step 4: Architecture Analysis

**Goal:** Extract everything the developer MUST follow from architecture documentation.

---

## AVAILABLE STATE

- `{architecture_content}` — from Step 2 (discover_inputs)
- `{codebase_analysis}` — from Step 3

---

## EXECUTION SEQUENCE

> **CRITICAL:** 🏗️ ARCHITECTURE INTELLIGENCE — Extract everything the developer MUST follow!

### 1. Load Architecture Document

**If architecture file is a single file:** Load complete `{architecture_content}`

**If architecture is sharded to folder:** Load architecture index and scan all architecture files

### 2. Critical Architecture Extraction

For each architecture section, determine if relevant to this story:

**CRITICAL ARCHITECTURE EXTRACTION:**
- **Technical Stack:** Languages, frameworks, libraries with versions
- **Code Structure:** Folder organization, naming conventions, file patterns
- **API Patterns:** Service structure, endpoint patterns, data contracts
- **Database Schemas:** Tables, relationships, constraints relevant to story
- **Security Requirements:** Authentication patterns, authorization rules
- **Performance Requirements:** Caching strategies, optimization patterns
- **Testing Standards:** Testing frameworks, coverage expectations, test patterns
- **Deployment Patterns:** Environment configurations, build processes
- **Integration Patterns:** External service integrations, data flows

Extract any story-specific requirements that the developer MUST follow.

Identify any architectural decisions that override previous patterns.

---

### 3. PhyCool Architecture Invariants (Mandatory — Always Check)

不論 story 類型，下列 5 項 PhyCool 架構決策均需比對，確認 story 是否觸碰其邊界，並在 `Dev Notes` 中加入對應的 REQUIRED / FORBIDDEN 約束：

**ADR 1 — BackOffice Namespace Isolation (ADR-URL-001)**:
- Admin Service / Controller 必須在 `BackOffice` namespace
- Admin 路由必須使用 `/mgmt/` prefix
- 若 story 新增 Admin 功能 → `Dev Notes` 加：`Admin Service 必須放 BackOffice namespace；路由必須 /mgmt/ prefix`

**ADR 2 — Zustand State Management**:
- 全域狀態唯一走 Zustand stores，禁止 `useState` 複製 Zustand state
- 禁止 `useCallback` deps 包含 Zustand state
- 若 story 涉及 React component 狀態 → `Dev Notes` 加：`新狀態先查 Zustand store 是否已有；禁止 useState 複製`

**ADR 3 — Canvas Diff Sync**:
- 禁止新 Base64 image 寫入 `CanvasJson`（改用 AssetReference）
- `CanvasJson` 限制 < 500KB，必須走 Diff Sync 而非全量傳輸
- 若 story 涉及 canvas / editor → `Dev Notes` 加：`Canvas 資料必走 Diff Sync；禁止 Base64 inline；CanvasJson < 500KB`

**ADR 4 — EF Core Parameterized Queries**:
- 禁止 raw SQL 字串拼接，一律 EF Core LINQ 或 parameterized `FromSqlRaw`
- 若 story 涉及 DB 查詢 → `Dev Notes` 加：`所有 DB 查詢走 EF Core；禁止 string concat SQL`

**ADR 5 — CSS Variables Only**:
- 禁止 CSS / TSX 中硬編碼 Hex 顏色，一律使用 `var(--color-*)` Design Tokens
- 若 story 涉及 UI / 樣式 → `Dev Notes` 加：`禁止 hardcoded Hex；使用 CSS Variables（var(--color-*)）`

**觸碰任何一項 → 必須在 Story `Dev Notes` 段落加明確約束，不可僅心知肚明。**

---

## SUCCESS METRICS

- Architecture document(s) fully loaded and analyzed
- All story-relevant constraints extracted
- Technical stack, naming conventions, and patterns documented
- Story-specific architectural requirements identified

## FAILURE MODES

- Loading architecture index but not drilling into relevant sections
- Missing story-specific architectural constraints
- Not identifying patterns that override previous conventions

---

**NEXT:** Load `step-05-web-research.md`
