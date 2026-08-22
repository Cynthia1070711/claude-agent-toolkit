---
name: phycool-debt-registry
description: "Tech debt management framework v3.3 — 6 分類 × 5 嚴重度 × 4 處理決策 + R3-Rescue Sweep Protocol。 含 5-Minute Rule、Boy Scout Rule、Stale Detection (4 機制)、Priority Score 公式、 5 層 triage、ACCEPTED 第 4 分類、Pre-Production Principle、v2 audit 12 delta 公式、 Zombie/Orphan/Phantom 三類 systemic flags 偵測。與 phycool-intentional-decisions 互斥 (IDD 走獨立表)。"
version: 4.1.0
updated: 2026-08-03
last_synced_epic: epic-bwu
last_synced_date: 2026-08-03
last_synced_story: bwu-12-test-baseline-red-reckoning
watches:
  - glob: ".context-db/scripts/upsert-debt.js"
  - glob: ".context-db/scripts/init-db.js"
  - glob: "_bmad/bmm/workflows/4-implementation/code-review/**/*.md"
  - glob: ".claude/rules/cr-debt-doc-audit.md"
triggers:
  - tech debt
  - technical debt
  - debt-registry
  - upsert-debt
  - 5-min rule
  - 5-minute rule
  - boy scout rule
  - priority score
  - stale detection
  - WONT_FIX
  - ACCEPTED
  - DEFERRED
  - tech_debt_items
  - severity critical high medium low info
  - R3-rescue
  - zombie debt
  - orphan debt
  - phantom debt
author: CC-OPUS
created: 2026-04-01
---

# Phycool Debt Registry — Tech Debt Management Framework v3.3

> **Purpose**: 統一管理 PhyCool 平台所有技術債(Tech Debt),提供分類、優先順序、處理決策、自動化偵測、生命週期管理。
>
> **與 IDD 互斥**: Tech Debt 與 Intentional Decision Debt 是**互斥** debt 類型 — 詳見 `phycool-intentional-decisions`。同一事項不可同時為 Tech Debt 與 IDD。

> **2026-05-16 v4.0.0 Progressive Disclosure 重構**: 原 1241 行 monolithic 拆為核心 ≤300 行 + 6 references/*.md。完整內容按需 Read 對應子檔。

---

## Framework 總覽(brief — 完整見 references/)

| 章節組 | 一句話定位 | 完整 spec |
|--------|------------|---------|
| **§1-§4 Framework + Classification + Categories + Severity** | Overview + 4 處理決策(FIX/DEFERRED/ACCEPTED/WON'T FIX)+ 6 Categories + 5 Severity Levels | [references/framework-classification.md](references/framework-classification.md) |
| **§5 Priority Score 公式** | v3.0 Priority Score = Severity × BusinessImpact × Confidence ÷ FixCost(完整公式 + 例子 + R3-Rescue Sweep Protocol)| [references/priority-score-formula.md](references/priority-score-formula.md) |
| **§6-§9 5-Min + Boy Scout + Stale + Triage** | 5-Minute Rule(quick fix inline)+ Boy Scout Rule(dev-story sweep)+ Stale Detection 4 機制 + 5-Layer Automation Triage | [references/rules-and-automation.md](references/rules-and-automation.md) |
| **§10-§12 DB + CLI + MCP** | `tech_debt_items` 表 schema + `upsert-debt.js` CLI + `search_debt` MCP Tool | [references/db-cli-mcp.md](references/db-cli-mcp.md) |
| **§13-§17 Gate + Workflow + Issues + Cross-Ref + Sync** | Production Gate 分級 + Workflow Integration(dev-story/code-review)+ Known Issues + Cross-Ref IDD + Skill Sync Gate | [references/gate-workflow-integration.md](references/gate-workflow-integration.md) |
| **§19 Migration v2.1.1 → v3.0** | v3.0 升級遷移計畫(歷史保留,2026-04)| [references/migration-v2-to-v3.md](references/migration-v2-to-v3.md) |

---

## §18 FORBIDDEN(v3.0 擴充)

❌ **INFO 級 drift 視為 "不計 Score" 留 Step 6 一次 merge 但實際未執行欄位 update**
   Common Rationalization: "INFO 不影響 score,留給最後階段一次處理"
   Red Flag: tasks/dev_notes/file_list 三內容欄位無 CR 修復痕跡(如 `+CR F#`)— 詳見 .claude/rules/cr-debt-doc-audit.md A5

❌ **以「估算成本」替代「實際試修」判斷 DEFERRED/ACCEPTED**
   Common Rationalization: "預估需要 20 行 / 多個 test / 系統性問題"
   Red Flag: 未實際寫 1 行修復 code 就分類為 DEFERRED/ACCEPTED
   (2026-04-16 eft-imagepanel-gallery-unified 事故根因)

❌ **FixCost M/L/XL 不 spike 實測**
   Common Rationalization: "1+ 年前已放棄 / 基礎設施不存在"
   Red Flag: 引用過時 folklore 但未 glob 驗證周邊基礎設施

❌ **將 tech debt 寫入 `intentional_decisions` 表**
   Red Flag: 用 add_intentional_decision 寫純技術 / engineering driven 的延後修
   (應走 `phycool-intentional-decisions`,只有 Business/Strategy/Legal/User 決策才走 IDD)

❌ **Pre-production 階段 BusinessImpact 用 DevExp=1 壓低 Score 作為 ACCEPT 唯一理由**
   Red Flag: localhost dev 階段 ACCEPT 但無 `pre_production_rationale` 顯式論證

❌ **FixCost ≤ S=2 但 ACCEPT/DEFER**(除非 IDD-USR 明確論證)
   Red Flag: 5 行內可修但分類為 ACCEPTED/DEFERRED 不修(5-Minute Rule 違反)

❌ **以單次成功觀察標記「能力類」debt(MCP 連線 / 工具層可達性)為 `fixed`**
   Common Rationalization: "這次重試連上了,能力已恢復,可以結案"
   Red Flag: `search_tech({tech_stack, outcome:'success'})` 少於 2 筆、或全部落在同一天,卻已呼叫 `upsert-debt.js --resolve`
   (門檻 = ≥2 次、時間戳分屬**不同日期**的直接調用成功獨立觀察;SSoT `.claude/rules/tasks-backfill.md` §Chrome MCP 能力判準 (b)。該族 debt 在此門檻建立前已三次以單次成功結案並三次復發 —— 單次觀察無法區分「已修復」與「這次剛好通了」。詳見 [references/framework-classification.md](references/framework-classification.md) §2.1)

❌ **debt description 列舉多個具名組成,只修其中一部分卻把整筆標 `fixed`**
   Common Rationalization: "主要那幾項都修好了,剩下那個是次要的 / 不在本卡施工面"
   Red Flag: `resolved_in_story` 已寫入,但該 debt description 內某個具名組成(如「4 支 .cjs 被 glob 誤收」)以實測仍可重現,且全庫查無承接它的新 debt
   (未修的組成必須在同一動作內另立具名 debt,`affected_files` 列出具體檔案路徑 —— 否則它同時失去「open debt」與「造冊」兩層可見性)

❌ **直接 DELETE `tech_debt_items` 記錄** — 應走 status: FIXED / DEFERRED / ACCEPTED / WON'T FIX(保留歷史)

❌ **跳過 Phase A 4 題自我挑戰直接寫 CR Report**
   Red Flag: CR Step 4 直接走 Step 5 report 跳過 .claude/rules/cr-debt-doc-audit.md Phase A
   (A1 殘留? + A2 試修? + A3 註記? + A4 cr_* 欄位? + A5 三內容欄位?)

❌ **WON'T FIX 用於非純風格 / 非零實際風險的 issue** — 應極少數使用

---

## Cross-Reference with IDD

當 CR 階段發現「不修」項目,先走 IDD Q1-Q4 判定:

```
Q1: Business 決策? → IDD-COM
Q2: Strategy 方向? → IDD-STR
Q3: 法規 / 合規? → IDD-REG
Q4: User feedback? → IDD-USR
任一 Yes → 走 phycool-intentional-decisions(本 Skill 不適用)
全 No → 繼續本 Skill 5-Min / Priority Score / 4 處理決策
```

詳見 `.claude/skills/phycool-intentional-decisions/SKILL.md` + [references/gate-workflow-integration.md](references/gate-workflow-integration.md) §16。

---

## Quick Commands

```bash
# 寫入 / 更新 debt
node .context-db/scripts/upsert-debt.js --inline '<json>'

# 查詢
mcp__phycool-context__search_debt({story_id, severity, status, target_story})

# Close / DEFER
node .context-db/scripts/upsert-debt.js --close <id> --status FIXED
node .context-db/scripts/upsert-debt.js --update <id> --status DEFERRED --target-story <story>

# Stale Detection 掃描
node .context-db/scripts/scan-stale-debt.js
```

---

## Quick Reference — Priority Score 心智模型

```
Priority Score = Severity × BusinessImpact × Confidence ÷ FixCost

  Severity:   critical=5 / high=4 / medium=3 / low=2 / info=1
  BusinessImpact: 1-5 (DevExp=1 / UserImpact=3 / RevenueImpact=5)
  Confidence: 1-5 (理論=1 / 已 spike=3 / 已重現=5)
  FixCost:    XS=1 / S=2 / M=5 / L=10 / XL=20+

Score ≥ 50 → MUST FIX NOW
Score 20-50 → 5-Min Rule 評估
Score 10-20 → DEFER 或 ACCEPT
Score < 10 → ACCEPT(with review_date)
```

完整公式 + R3-Rescue + 例子 → [references/priority-score-formula.md](references/priority-score-formula.md)

---

## References

| Reference | 涵蓋章節 | 行數 |
|-----------|---------|------|
| [framework-classification.md](references/framework-classification.md) | §1 Overview + §2 4 處理決策 + §3 6 Categories + §4 5 Severity Levels | ~191 |
| [priority-score-formula.md](references/priority-score-formula.md) | §5 Priority Score 公式 + R3-Rescue Sweep Protocol + 12 delta 公式 | ~234 |
| [rules-and-automation.md](references/rules-and-automation.md) | §6 5-Min Rule + §7 Boy Scout Rule + §8 Stale Detection 4 機制 + §9 5-Layer Triage | ~227 |
| [db-cli-mcp.md](references/db-cli-mcp.md) | §10 DB Schema + §11 CLI Commands + §12 MCP Tools | ~189 |
| [gate-workflow-integration.md](references/gate-workflow-integration.md) | §13 Production Gate + §14 Workflow Integration + §15 Known Issues + §16 IDD Cross-Ref + §17 Skill Sync Gate | ~237 |
| [migration-v2-to-v3.md](references/migration-v2-to-v3.md) | §19 Migration Plan v2.1.1 → v3.0(歷史) | ~97 |
| (existing) [user-stories.md](references/user-stories.md) | Given-When-Then acceptance scenarios | — |
| (existing) [lifecycle.md](references/lifecycle.md) | Feature status matrix | — |

---

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **4.1.0** | **2026-08-03** | **`bwu-12-test-baseline-red-reckoning` code-review Skill Sync(走字面 `Skill(skill="saas-to-skill")` Mode B)**。該卡把「能力類 debt 標 `fixed` 需 ≥2 次不同日期獨立觀察」這條**對 `fixed` 狀態轉換的前置條件**寫進 `.claude/rules/tasks-backfill.md` §Chrome MCP 能力判準 (b) 與 `step-05b-tasks-backfill.md`,但本 Skill(debt 生命週期 SSoT)全庫 grep「獨立觀察 / 不同日期 / 能力類」**零命中** —— 任何人查本 Skill 決定「這筆能不能標 fixed」都學不到該門檻。dev-story 自身 Step 2 已記 `skill-staleness(phycool-debt-registry)`,收尾卻寫「0 命中 → no affected Skills」(其 grep 用的是實作符號 `Emergence.tsx`/`PoolSection`/`check-test-baseline`,而非本卡引入的**概念**),自我矛盾;依 `skill-sync-gate.md`「⬜ 未同步 = MUST FIX,不可延後」於 CR 補上。本次:①§18 FORBIDDEN 新增 2 條(三元素格式,面向 8)—— 單次觀察標 fixed / 部分修復整筆結案;②`references/framework-classification.md` §2.1 FIXED 補「能力類 debt 額外條件」+「部分修復禁止整筆結案」兩段(後者來自本 CR 實證:`TD-CONTEXTDB-VITEST-FULL-SUITE-RED-11` 被標 fixed,而其具名組成「4 支 `.cjs` 被 glob 誤收」實測仍完整重現);③frontmatter version/updated/last_synced_* 同步。面向 4 references 已同步、面向 6 cross-skill 實查 `chrome-connect-real-browser` 已載判準 (a) 逐字等價無衝突。 |
| **4.0.0** | **2026-05-16** | **Progressive Disclosure 重構**(P2-Wave-1)— 原 1241 行 monolithic 拆為核心 ~270 行 + 6 references/*.md(1175 行)+ 既有 references 保留。觸發:env-cleanup P2 Skill Modularization。saas-to-skill Mode B + 8-aspect validation pass。 |
| 3.5.x | 2026-04 ~ 2026-05 | v3.3 Framework + R3-Rescue Sweep Protocol + Zombie/Orphan/Phantom 三類 systemic flags 偵測 |
| 3.0.0 | 2026-04-09 | Framework v3.0 — 6 分類 × 5 嚴重度 + Priority Score 公式 + 5-Min/Boy Scout/Stale Detection/5-Layer Triage + Pre-Production Principle |
| 2.x.x | 2026-03 ~ 2026-04 | v2.1.1 baseline(完整 migration plan 見 references/migration-v2-to-v3.md)|
