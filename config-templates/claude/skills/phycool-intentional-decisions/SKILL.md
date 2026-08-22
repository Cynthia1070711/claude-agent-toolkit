---
name: phycool-intentional-decisions
version: 2.0.0
updated: 2026-05-16
last-synced-epic: env-cleanup
author: CC-OPUS
domain: devops
description: >
  Intentional Decision Debt (IDD) management — Business/Strategy/Regulatory/User
  決策驅動的「故意不修」4 層標註系統 (Code/ADR/DB/Memory)。
  與 tech debt 互斥(不入 tech_debt_items),走獨立 intentional_decisions 表
  lifecycle。4 sub-types: IDD-COM/STR/REG/USR。
triggers:
  - "intentional decision"
  - "故意不修"
  - "商業決策"
  - "策略決策"
  - "business decision debt"
  - "policy debt"
  - "strategic decision"
  - "regulatory debt"
  - "compliance debt"
  - "user-decided"
  - "idd"
  - "by design"
  - "design decision"
  - "forbidden change"
  - "free plan editor"
  - "no refund policy"
  - "intentional annotation"
watches:
  - glob: ".context-db/phycool.db"
    domain: devops
  - glob: "docs/technical-decisions/ADR-IDD-*.md"
    domain: devops
  - glob: ".claude/hooks/pre-prompt-rag.js"
    domain: devops
---

# Phycool Intentional Decisions (IDD) Skill v2.0

> **Purpose**: 管理因商業、策略、規範、使用者決策而「故意不修」的決策型 debt。
> 與 tech debt 本質不同 — tech debt 是「忘記 / 沒時間修」,IDD 是「有意識地不修」。
>
> **核心原則**: 任何 Intentional Decision 必須經過 4 層標註 (Code + ADR + DB + Memory),
> 讓任何新對話、新開發者、三引擎任一個都能從多個通道發現「這是故意的」。
>
> **2026-05-16 v2.0 Progressive Disclosure 重構**: 原 1474 行 monolithic SKILL.md 拆為核心 ≤300 行 + 6 個 references/*.md 子檔。完整深度內容請按需 Read 對應 reference。

---

## 1. Overview

### 1.1 What is IDD?

**Intentional Decision Debt (IDD)** 是一種獨立的「debt」分類,描述:

> 因 **Business / Strategy / Regulatory / User** 決策而故意保留、不進行技術修復的程式碼行為或系統特徵。

### 1.2 IDD vs Tech Debt(互斥原則)

| 面向 | **Tech Debt** | **Intentional Decision Debt (IDD)** |
|------|---------------|-------------------------------------|
| **本質** | 忘記 / 沒時間修 | 故意不修(有決策) |
| **驅動** | Engineering constraint | Business / Strategy / Legal / User |
| **Signoff** | Dev lead 可決定 | PO / Legal 必須 signoff |
| **Re-evaluation** | 時間觸發(90/365d) | 事件觸發(trigger event) |
| **記錄位置** | `tech_debt_items` 表 | `intentional_decisions` 表 |
| **ADR 要求** | ❌ 不需要 | ✅ 必須 |
| **Code 標註** | ❌ 無 | ✅ `[Intentional: IDD-XXX]` |
| **MCP 查詢** | `search_debt` | `search_intentional_decisions` |

**嚴格互斥**: 同一事項不可同時為 Tech Debt 與 IDD。若混淆,先判斷驅動方(Engineering vs Business),歸類到正確表。

### 1.3 When to use IDD instead of WON'T FIX / ACCEPTED?

```
發現「不修」的情境
  ↓
Q1: 有 Business/Strategy/Legal/User 決策驅動嗎?
  ├ 是 → IDD (走 ADR 流程)
  └ 否 → Q2
          ↓
Q2: 通過 5-Minute Rule 檢查?
  ├ 是 → MUST FIX NOW
  └ 否 → Q3: 純風格 / 零實際風險? → 是 → WON'T FIX(極少數) / 否 → ACCEPTED(with review_date)
```

### 1.4 4 Sub-Types(brief — 完整定義見 [references/sub-types-and-seed-migration.md](references/sub-types-and-seed-migration.md))

| Sub-Type | 驅動 | Lifecycle | 範例(實例見 references) |
|----------|------|-----------|-----------|
| **IDD-COM** (Commercial) | PO/Business 定價/方案/轉換漏斗 | 季度 | COM-001 Free editor 全開放 / COM-002 無退款 / COM-004 PdfJob 不強刪 |
| **IDD-STR** (Strategy) | PO/CTO 產品定位/架構 | 季度以上 | STR-001 批次列印非編輯器 / STR-002 `/mgmt/` 集中化 |
| **IDD-REG** (Regulatory) | Legal/法規 | 法規變更觸發 | REG-001 個資 180d / REG-002 電子發票 / REG-005 Trial Abuse fingerprint |
| **IDD-USR** (User) | End User/UX 研究 | 使用者行為變化 | USR-001 測試帳號 A1-A5 / USR-002 右側 Panel 預設 |

**Seed Status (dla-08 done 2026-04-11)**: 10 active IDDs(4 critical: COM-001/002, REG-001/002)+ ADR 10/10 + Code annotation 424 occurrences / 119 files。

---

## 2. 4-Layer Annotation System(brief — 完整見 [references/4-layer-annotation-system.md](references/4-layer-annotation-system.md))

> **Why 4 layers?** 單一通道會失敗。四層確保新對話/新開發者從**任一**通道都能發現「這是故意的」。

| Layer | 位置 | 角色 |
|-------|------|------|
| **Layer 1: Code** | inline `[Intentional: IDD-XXX]` + block annotation | Source of Truth(最接近真相)|
| **Layer 2: ADR** | `docs/technical-decisions/ADR-IDD-{TYPE}-{NNN}.md` | Decision Record(完整推理)|
| **Layer 3: DB** | `intentional_decisions` 表 + FTS5 | 結構化查詢(MCP `search_intentional_decisions`)|
| **Layer 4: Memory** | `MEMORY.md` + `memory/intentional_*.md`(僅 critical) | Fast Access(新對話 cold-start)|

**Required Code Annotation Fields**: `id` + `type` + `reason` + `decision-by` + `see ADR` + `forbidden-changes`(strongly recommended)

完整 annotation 範例 + ADR 必填區塊 + DB schema + Memory 格式 → [references/4-layer-annotation-system.md](references/4-layer-annotation-system.md)

---

## 3. DB / MCP / CLI / ADR Template(brief — 完整見 [references/db-mcp-cli-adr.md](references/db-mcp-cli-adr.md))

### 3.1 MCP Tools(4 個)

| Tool | 用途 |
|------|------|
| `search_intentional_decisions` | FTS5 query + filter (type/status/criticality/file/skill/module) |
| `get_intentional_decision` | 單筆完整內容 |
| `add_intentional_decision` | 寫入 + 自動同步 context_entries (Layer 4) |
| `verify_intentional_annotations` | 健康度 audit(orphaned/mismatched) |

### 3.2 CLI(`upsert-intentional.js`)

```bash
# 建立 / 查詢 / 驗證 / Retire / Supersede
node .context-db/scripts/upsert-intentional.js --inline '<json>'
node .context-db/scripts/upsert-intentional.js --query --file <path>
node .context-db/scripts/upsert-intentional.js --verify [--scope changed]
node .context-db/scripts/upsert-intentional.js --retire IDD-COM-001
node .context-db/scripts/upsert-intentional.js --supersede IDD-COM-001 --by IDD-COM-005
```

### 3.3 DLA-09 Scanner Tools(三層掃描器)

```bash
node .context-db/scripts/scan-skill-idd-references.js   # Layer 1 phycool-*
node .context-db/scripts/scan-code-idd-references.js    # Layer 2 src/
node .context-db/scripts/scan-doc-idd-references.js     # Layer 3 docs/
node .context-db/scripts/build-idd-cross-reference.js   # 合併 → idd-cross-reference.json
node .context-db/scripts/skill-idd-sync-check.js --full-audit
```

### 3.4 ADR 必填區塊

`docs/technical-decisions/ADR-IDD-{TYPE}-{NNN}-{kebab-title}.md` 含: Classification / Context / Decision / Why Not "Technical Fix" / Code Impact / Re-evaluation Trigger / Alternatives / Forbidden Changes / Related Skills / Related Docs

DB schema(intentional_decisions 表 + triggers + FTS5)+ MCP tool 完整 I/O + CLI error codes → [references/db-mcp-cli-adr.md](references/db-mcp-cli-adr.md)

---

## 4. Code Annotation Multi-Language(brief — 完整見 [references/code-annotation-formats.md](references/code-annotation-formats.md))

支援 TypeScript / JavaScript(單行 + Block)/ C# XML / Python docstring / SQL / Markdown 各語言格式。範例:

```typescript
// [Intentional: IDD-COM-001] Free plan 不阻擋 UI, PDF 層 gate
// See: docs/technical-decisions/ADR-IDD-COM-001.md
```

```csharp
/// <intentional id="IDD-COM-002" type="Commercial">
///   <reason>無退款 policy, Admin only 處理</reason>
///   <forbidden-changes>請勿加入 public refund endpoint</forbidden-changes>
/// </intentional>
```

完整 5 語言格式範例 → [references/code-annotation-formats.md](references/code-annotation-formats.md)

---

## 5. Three-Layer Integration + Workflow + Hook(brief — 完整見 [references/integration-workflow-hook.md](references/integration-workflow-hook.md))

### 5.1 Three-Layer Integration

IDD 必須穿透 Skills(規範層)+ Docs(證據層)+ phycool-system-platform(導航層)三層。每個 IDD 必設:
- `related_skills`(JSON array, phycool-*)
- `related_docs`(額外文件路徑)
- `platform_modules`(19 modules 之一,Editor/Member/Payment/etc.)

### 5.2 Workflow Integration

| Workflow | IDD Gate |
|----------|---------|
| `create-story` Step 3 | search_intentional_decisions(file_path IN file_list)→ Dev Notes 警告 |
| `dev-story` Step 5 §0.6 | **Pre-Edit Awareness Gate**: MCP query + critical IDD advisory HALT(td-bmad-search-idd-pre-edit-dev-story, 2026-05-03) |
| `dev-story` Step 8 | Boy Scout Sweep 排除 IDD 標註區塊 |
| `code-review` Step 3.5 | **IDD Detection Gate**: Q1-Q4 判定 → 不可標 WON'T FIX,MUST 建 IDD |
| Stop Hook | 提交前掃 commit diff,verify annotations |

### 5.3 UserPromptSubmit Hook Layer 10

`pre-prompt-rag.js` 自動注入 active IDDs 至每 prompt。受 `detectCodeIntent()` intent gating 控制(intent=discussion 時 skip,~1.5k tokens / prompt 節省)。

完整 workflow 步驟 + Hook injection logic + budget control + DevConsole 整合 → [references/integration-workflow-hook.md](references/integration-workflow-hook.md)

---

## 6. Lifecycle / Migration / Production Gate / Troubleshooting

完整內容見 [references/lifecycle-migration-troubleshooting.md](references/lifecycle-migration-troubleshooting.md):
- §11 Re-evaluation Lifecycle(event-triggered + quarterly audit + supersession + retirement)
- §12 Migration Playbook(從現有 MEMORY.md 盤點 → IDD 候選清單 → 執行步驟)
- §13 Production Gate(IDD-related gates + tasks-backfill-verify 整合)
- §16 Known Issues & Troubleshooting(annotation 不同步 / Skill name collision / Layer 10 預算溢出 / memory 路徑 / dev-story §0.6 行為)

---

## 7. FORBIDDEN(不可做的事)

### 7.1 Classification Violations
- ❌ 同時將同一事項分類為 Tech Debt 與 IDD
- ❌ 將 IDD 寫入 `tech_debt_items` 表
- ❌ 跳過 ADR 直接 add_intentional_decision(`adr_path` 必填)

### 7.2 Annotation Violations
- ❌ Code 引用 `[Intentional: IDD-XXX]` 但 DB 無此 IDD(orphaned)
- ❌ Code 修改後 `code_locations` 未更新(stale)
- ❌ `criticality='critical'` 但未寫 MEMORY.md
- ❌ ADR 缺 Forbidden Changes 段落

### 7.3 Lifecycle Violations
- ❌ 直接 DELETE `intentional_decisions` 記錄(只能 retire / supersede)
- ❌ Retire 後不更新 code 標註(留 stale `[Intentional:]`)
- ❌ Supersede 但不指向新 IDD(`superseded_by` 必填)

### 7.4 Scope Violations
- ❌ 跨 IDD 共享 `idd_id`(必 UNIQUE)
- ❌ 在 Story workflow 標 WON'T FIX / DEFERRED 但實為 IDD(必走 Q1-Q4 判定)
- ❌ Skill SKILL.md 包含 IDD-related 內容但 IDD `related_skills` 未列(同步缺漏)
- ❌ IDD `platform_modules` 列了模組但 phycool-system-platform 對應 module 未加 IDD 章節

---

## 8. Relationship with Other Skills

| Skill | 關係 |
|-------|------|
| **phycool-debt-registry** | 互斥分類 — IDD 不入 tech_debt_items;phycool-debt-registry CR Step 3.5 觸發 Q1-Q4 → 若 yes → 轉本 Skill 建 IDD |
| **phycool-context-memory** | Layer 4 寫入 — `criticality='critical'` IDD 寫 `memory/intentional_xxx.md` + MEMORY.md;`pre-prompt-rag.js` 自動載入 |
| **phycool-sdd-spec-generator** | ADR 產出輔助 — Spec 提及「故意不修」段落 → 建議產出 ADR-IDD 草稿 |
| **phycool-system-platform** | 三層整合導航 — Module-level IDD 章節必須同步到 references/{Module}/ |

---

## 9. Quick Reference (Cheatsheet)

### 9.1 何時建 IDD?(decision tree)

```
不修一個 issue?
  ├ Business / 商業 → IDD-COM
  ├ Strategy / 策略 → IDD-STR
  ├ Regulatory / 法規 → IDD-REG
  ├ User / 使用者 → IDD-USR
  └ Engineering / 技術 → tech debt(走 phycool-debt-registry)
```

### 9.2 4 Layer Checklist(建立 IDD 時)

```
☐ Layer 1 Code: 加 [Intentional: IDD-XXX] 標註 + scanner 驗證 0 orphaned
☐ Layer 2 ADR:  建 docs/technical-decisions/ADR-IDD-{TYPE}-{NNN}-{title}.md 含必填 10 區塊
☐ Layer 3 DB:   add_intentional_decision({...含 related_skills/docs/platform_modules})
☐ Layer 4 Mem:  IF criticality='critical' → 寫 memory/intentional_xxx.md + MEMORY.md entry
☐ Skill Sync:   related_skills 中所有 SKILL.md 加 [Intentional: IDD-XXX] 標註
☐ Platform:     platform_modules 中所有 module 的 references/*.md 加 IDD 章節
```

### 9.3 Quick Commands

```bash
# 查 IDD
mcp__phycool-context__search_intentional_decisions({query, file_path?, idd_type?})

# 建 IDD
node .context-db/scripts/upsert-intentional.js --inline '<json>'

# Verify
node .context-db/scripts/upsert-intentional.js --verify --scope changed
mcp__phycool-context__verify_intentional_annotations({scope: 'changed'})

# CR Detection Gate(Q1-Q4)
# 對 DEFERRED/ACCEPTED/WON'T FIX 逐筆問 Q1-Q4,若任一 Yes → MUST 建 IDD
```

完整 quick reference + decision trees + commands → 本檔保留 §9 + 細節見 references/

---

## References

| Reference 子檔 | 涵蓋章節 | 行數 |
|----------------|---------|------|
| [sub-types-and-seed-migration.md](references/sub-types-and-seed-migration.md) | §1.4 4 Sub-Types 詳細定義 + §1.5 dla-08 Seed Migration 狀態 | ~85 |
| [4-layer-annotation-system.md](references/4-layer-annotation-system.md) | §2 Code/ADR/DB/Memory 四層完整 spec + ADR 範例 + DB schema + FTS5 + triggers | ~260 |
| [db-mcp-cli-adr.md](references/db-mcp-cli-adr.md) | §3 DB Schema 詳解 + §4 4 MCP Tools 完整 I/O + §5 CLI + DLA-09 Scanner + §6 ADR Template | ~265 |
| [code-annotation-formats.md](references/code-annotation-formats.md) | §7 TypeScript / C# / Python / SQL / Markdown 標註格式 | ~75 |
| [integration-workflow-hook.md](references/integration-workflow-hook.md) | §8 Three-Layer + §9 Workflow Integration(create-story / dev-story §0.6 / CR §3.5 / Stop Hook)+ §10 UserPromptSubmit Hook Layer 10 | ~340 |
| [lifecycle-migration-troubleshooting.md](references/lifecycle-migration-troubleshooting.md) | §11 Re-evaluation + §12 Migration + §13 Production Gate + §16 Troubleshooting | ~265 |

---

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **2.0.0** | **2026-05-16** | **Progressive Disclosure 重構**(對齊 cc-config-author SKILL_BODY_HARD 500 行)。原 1474 行 monolithic 拆為核心 SKILL.md(~280 行)+ 6 references/*.md 子檔(總 1291 行)。重構透過 P2-B saas-to-skill Mode B SOP + 8-aspect validation。內容**零淨減**,只是 Progressive Disclosure 重組。Token 收益: per-Skill invocation 從 ~45k → ~8k(SKILL.md core)+ 按需 references(每檔 ~3-10k)。觸發:2026-05-16 ultrathink env-optimization session P2 pilot,作為剩 17 個 SKILL > 500 行的 epic-skill-modularization 範本。 |
| 1.4.0 | 2026-05-03 | dev-story Step 5 §0.6 IDD Pre-Edit Awareness Gate 上線(td-bmad-search-idd-pre-edit-dev-story) |
| 1.3.0 | 2026-04-24 | IDD-COM-004 PdfJob 不強刪 — code_locations 11 處(eft-trash-30day-auto-delete CR R2 narrowing) |
| 1.2.x | 2026-04-12 | dla-08b code annotation 標註 167 occurrences / 80 files + CS1570 XML doc 修復 + 10 naked 改為 block-style |
| 1.0-1.1 | 2026-04-09 ~ 2026-04-11 | dla-08 Phase 3 首批 10 seed IDDs 寫入(4 critical + 6 normal)+ ADR 10/10 + DLA-09 三層 scanner tools |
