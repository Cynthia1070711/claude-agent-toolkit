# 8 Dimension × 7 Position Checklist

> 通用範本。Step 1 audit baseline + Step 3 7 位置 sync 兩端使用。
> 具體應用對應(PRD § / Skill / Story id / DB)見 [pcpt-editor-application.md](pcpt-editor-application.md)。

---

## 8 維度比對(Step 1)

### D1: production code(參考基線不動)
- 主目錄:各專案不同(由 application context 提供)
- Read 不改,取 file:line evidence
- **gitnexus 加速**(v1.1.0):`mcp__gitnexus__context({name})` 取 callers/callees/execution flows + `mcp__gitnexus__query({query})` 基於 concept 找執行流程 + `mcp__gitnexus__impact({target, direction:"upstream"})` 取 blast radius

### D2: Skill
- `.claude/skills/{relevant-skill}/SKILL.md` + references
- 跨切面 Skill(設計系統 / state 管理 / floating UI / 設計 Token 等)
- **gitnexus 加速**(v1.1.0):`mcp__gitnexus__query({query: "{concept}"})` 找 Skill 規範的 concept 在 code 中的 execution flow,驗證 Skill 與 code 一致性

### D3: 需求功能文檔(PRD)
- `docs/.../functional-specs/` 對應 §
- 對應表見 application reference

### D4: 商業策略 IDD
- `mcp__phycool-context__search_intentional_decisions`
- ADR:`docs/technical-decisions/ADR-*`
- IDD-COM / STR / REG / USR 四 sub-types

### D5: 技術文檔 / Spec / UIUX
- SDD Spec:`docs/implementation-artifacts/specs/epic-*/*-spec.md`
- Preflight Contract / 規範
- UIUX 規格:`平台UIUX排版範例/.../*.md`

### D6: Memory + Story
- `mcp__phycool-context__search_context({query, include_content:true})`
- `mcp__phycool-context__search_stories({story_id})`
- `mcp__phycool-context__search_tech({query})`

### D7: DB schema
- `.claude/skills/phycool-context-memory/references/db-schema.md`
- Migration / Models
- **gitnexus 加速**(v1.1.0):`mcp__gitnexus__shape_check` 驗 schema 對齊(若 application 有 graph index)

### D8: OOP / 模組化 / 解耦
- State management SSoT(如 Zustand / Redux / Context)
- Hook 邊界 / Service-Repo-Controller 分層 / DDD 聚合邊界
- **gitnexus 加速**(v1.1.0):`mcp__gitnexus__impact({target, direction:"downstream"})` 揭示符號 blast radius → 確認解耦邊界 + 改 hook/抽 service 前先 verify(HIGH 或 CRITICAL risk MUST warn)

### D9: 跨文檔 SSoT 一致性(v2.0.0)
- **術語**:`mcp__phycool-context__search_glossary` — 同一概念跨 PRD/SDD/Skill 是否同名(避免歧義)
- **常數 / Magic Number**:散落各文檔的數值是否漂移(如前後端 spec >30 天漂移 / `PREVIEW_PAGE_LIMIT` 類常數)
- **狀態機**:生命週期狀態轉換(如帳號 停用→刪除 / RBAC 拒絕優先判定)跨文檔一致
- **cross-cutting**:同一規範被多模組引用,改 A 同步 B(對齊 `.claude/rules/cross-ref-discipline.md`)
- 這是「**資訊同步一致**」的核心落點 — 同一事實散落多文檔的隱性 drift,最易致 Phase D 偏移

---

## 9 文檔委派矩陣同步更新(Step 3)

> **v2.0.0**:原「7 位置」升級為「**9 文檔委派矩陣**」。核心修法 —— 每個承載設計規範的文檔**明確委派對應 skill/workflow**(非裸 Edit/add_*),且分「**校正既有 vs 缺漏新生成**」雙模式。對應 SKILL.md §3 步驟三。

### 委派矩陣總表

| # | 設計規範文檔 | 委派 skill/workflow | 校正既有模式 | 缺漏新生成模式 |
|:-:|:--|:--|:--|:--|
| 1 | **Skill** | `saas-to-skill`(phycool-*)/ `skill-builder`(通用)| Mode B Update | Mode A Create |
| 2 | **需求 PRD** | `create-prd` / `phycool-doc-sync` | Edit functional-specs § + 升級註記 | `bmad:bmm:workflows:create-prd` |
| 3 | **IDD + ADR-IDD** | **`phycool-intentional-decisions`(完整 4 層)** | update 既有 IDD + 4 層同步 | 建 ADR-IDD + add_intentional_decision + Skill/Platform Sync |
| 4 | **SDD 技術 Spec** | **`sdd-spec-generator`**(⚠️ disable-model-invocation,需使用者手動)| Edit 既有 spec | 使用者 `/sdd-spec-generator` 生成標準英文 SDD |
| 5 | **一般 ADR** | `create-architecture` / 手寫慣例 | Edit + Superseded 標記 | 建 ADR-{NNN}(Nygard/MADR 4 區塊)|
| 6 | **API + Error Code** | `phycool-business-api` / `phycool-error-handling` | Edit OpenAPI / error-codes.md | 新 contract + E-{MODULE}{SEQ} |
| 7 | **AC / ATDD** | **`testarch-atdd`** | Edit AC G/W/T + BR mapping | 生成 ATDD 場景 + trace matrix |
| 8 | **UIUX 規格** | `phycool-design-system` / `ui-ux-pro-max`(Step 2 已含)| Edit 規格 § + 版本 bump | 設計稿 / token / a11y |
| 9 | **DB schema** | Schema-First Mandate / `phycool-sqlserver` | Migration add column + PRAGMA | 新表 + Models Entity |

> **+ Memory + Story**(Step 4 DB-first)+ **OOP/解耦**(D8 cross-cutting)為 cross-cutting 同步軸。各文檔操作細節見下方 Position(保留原操作步驟)。

### Position 1: Skill 升版

```
✅ Skill(skill="saas-to-skill") Mode B Update(SUPREME 字面調用)
   - Read 當前 Skill 全文
   - Read 變更後 code/PRD 取 evidence
   - Edit SKILL.md 受影響段落(file:line)
   - frontmatter: version bump + updated + last-synced-epic + last-synced-date
   - 8 面向 validation PASS
   - Cross-Skill 引用 grep 一致
```

### Position 2: 需求 PRD

```
✅ Edit docs/.../functional-specs/*.md
   - 加 § cross-ref(指向 Skill / Spec / Story / Contract)
   - 更新 § 章節對齊定案
```

### Position 3: 商業策略 IDD + ADR-IDD

```
✅ Skill(skill="phycool-intentional-decisions") 完整 4 層(非只 DB)
   - Layer 1 Code: [Intentional: IDD-XXX](Phase D 實作時)
   - Layer 2 ADR: 建 ADR-IDD-{TYPE}-{NNN}(10 必填區塊)
   - Layer 3 DB: add_intentional_decision(4 sub-types COM/STR/REG/USR + forbidden_changes)
   - Layer 4 Memory: criticality=critical 才寫 memory/*.md + MEMORY.md
   - Skill Sync: related_skills SKILL.md 加標註
   - Platform Sync: platform_modules 對應 references 加章節
```
> ❌ 禁只做 Layer 3 DB(add_intentional_decision)漏走完整 4 層(2026-05-30 incident:IDD-STR-RBAC-001 只做 DB 漏 ADR-IDD,使用者糾正)

### Position 4: 技術 Spec(SDD)/ 一般 ADR / AC ATDD / API / UIUX

```
✅ SDD → sdd-spec-generator(⚠️ disable-model-invocation,需使用者手動 /sdd-spec-generator)
   校正既有: Edit docs/.../specs/epic-*/*-spec.md(BR-XXX / File Refs / Phase / Test Strategy)
   缺漏新生成: 使用者觸發生成標準英文 SDD 模板

✅ 一般 ADR → create-architecture / 手寫(Context / Decision / Consequences / Alternatives, Nygard/MADR)

✅ AC ATDD → testarch-atdd(Given/When/Then + BR mapping + trace matrix AC→Test→Code)

✅ API + ErrorCode → business-api / error-handling(OpenAPI contract / E-{MODULE}{SEQ})

✅ Preflight Contract / UIUX 規格 → Edit + 版本 bump + § 章節對齊
```
> ❌ 禁直接 Edit SDD 跳過 sdd-spec-generator(格式/品質門檻)/ 禁 IDD 的 ADR 與一般架構 ADR 混淆(前者走 phycool-intentional-decisions)

### Position 5: Memory + Story

```
✅ mcp__phycool-context__add_context(category=decision/pattern/architecture)
✅ mcp__phycool-context__add_tech(category=success/bugfix/pattern)
✅ Story 偵測分流(v2.1.0,缺陷 2):search_stories 先查當前模組
   - 查無 → upsert-story.js 新建
   - 查有未完成(backlog / ready-for-dev stale)→ 主視窗 inline `bmad create-story` 補全接合(禁 raw upsert 覆蓋半成品 / 禁丟子視窗冷啟動,F16;scope 限當前模組)
✅ node .context-db/scripts/upsert-story.js(新建 or 純欄位微調)
   - 禁產 .md 鏡像(DB-first)
   - source_file = context-db://stories/{story_id}
```

### Position 6: DB schema(若涉)

```
✅ Read .claude/skills/phycool-context-memory/references/db-schema.md
✅ PRAGMA verify(SQLite)
✅ Migration *.cs add column / IF NOT EXISTS
✅ Models *.cs Entity update
✅ Update db-schema.md cheatsheet
✅ mcp__gitnexus__shape_check 驗 schema 對齊(v1.1.0)
```

### Position 7: OOP / 模組化 / 解耦

```
✅ Skill FORBIDDEN 新增(若違反 SSoT)
✅ Story dev_notes 對齊
✅ 跨 Skill SSoT cross-ref
✅ Hook 邊界 update(若 hook 抽出/合併)
✅ Service / Repo / Controller 分層 review
✅ mcp__gitnexus__impact({direction:"downstream"}) 揭示 blast radius → 確認解耦改動 risk(v1.1.0,HIGH 或 CRITICAL MUST warn 使用者)
```

---

## Cross-Validate 跨文檔同 term 一致性(D9 執行 · Step 1 與 Step 3 兩端必跑)

對齊 `.claude/rules/constitutional-depth-first.md` §Audit Anti-Patterns L1 + SKILL.md D9:

| Term | D2 Skill | D3 PRD | D4 IDD | D5 Spec | D6 Memory | D7 DB | D8 OOP |
|:--|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| {key term 1} | ? | ? | ? | ? | ? | ? | ? |
| {key term 2} | ? | ? | ? | ? | ? | ? | ? |

每個跨切面 term 在各維度中皆 verify,任一不一致 = drift 警告 → 修正後再進 Step 4。**D9 擴充**:除術語,常數 Magic Number / 狀態機 / cross-cutting 同此表逐項 cross-validate。
