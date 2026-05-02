# Toolkit 鏡像同步紀錄(SYNC-LOG)

> **檔案性質**: PCPT-MVP 主 SSoT → `1.專案部屬必讀/` toolkit 內容鏡像 SSoT 同步歷程
> **規範**: 對齊 `CLAUDE.md` §0 雙倉庫架構認知 + §0.2 進化路徑(蒸餾流)
> **更新原則**: **PCPT-MVP 主 SSoT 任何改動 → 立即同步至 `1.專案部屬必讀/`**(避免延後忘記細節 / 重新大規模比對驗證)

---

## 同步流向

```
[<main-ssot-project>] 主 SSoT(完整含業務字面)
    ↓ 立即同步(脫敏 <project-token> / <project-token-Pascal> 字面)
[PCPT-MVP] /claude token減量策略研究分析/1.專案部屬必讀/(toolkit 內容鏡像 SSoT)
    ↓ 不定期同步(再次 verify 脫敏)
[claude-agent-toolkit] /deployment/(對外公開可部屬,獨立 repo)
```

**本 SYNC-LOG 涵蓋第一段同步**(PCPT-MVP → `1.專案部屬必讀/`)。第二段(`1.專案部屬必讀/` → toolkit repo)走 `td-mcp-cmi-12-toolkit-sync` 等 follow-up Story + release branch + gh PR(對齊 `.claude/rules/dual-repo-push-discipline.md`)。

---

## 同步紀錄(時間倒序)

### 2026-05-03 S60 — td-toolkit-mirror-godnode-update Phase 1-3.7 完成(12 mirror file + toolkit-mirror-sync v1.1 三引擎升版)

| 同步檔案 | 來源 | 變更摘要 |
|:-----|:-----|:-----|
| `config-templates/claude/hooks/pre-prompt-rag.js`(UPDATE)| `.claude/hooks/pre-prompt-rag.js` | Layer 10 god node 4-axis fusion 整合(DELTA=0.05 + RELATION_WEIGHTS SSoT 註解 + searchSymbolsByVector / searchFtsLikeFallback / expandDependencies / calculateSfinal 4 處 centrality_score 傳遞 + maxCentrality normalize + δ·centrality 加權)— 通用化「ADR-GOVERNANCE-001」→「Capability Integration ADR」 |
| `config-templates/claude/hooks/subagent-context-inject.js`(UPDATE)| `.claude/hooks/subagent-context-inject.js` | Phase 4.5 god node injection 整段(`let godNodes = []` 宣告 + storyId domain 推斷 12 token + namespace LIKE Top-3 query + parts.push god node section)— 通用化 mcp namespace `mcp__<project>-context__` + domainHints 範例改 generic SaaS 命名 + ADR 編號 → Capability Integration ADR |
| `config-templates/context-db/server.js`(UPDATE)| `.context-db/server.js` | search_god_nodes handler 完整段(tool definition line 508-533 + case dispatcher + handleSearchGodNodes 實作 89 行)— 通用化 description 業務 namespace 範例 `<Project>.Web.Services.Payment` placeholder + stderr prefix `[pcpt-context]` |
| `config-templates/context-db/scripts/init-db.js`(UPDATE)| `.context-db/scripts/init-db.js` | symbol_index 加 `centrality_score REAL NOT NULL DEFAULT 0.0` 欄位 + `idx_symbol_index_centrality DESC` index — 通用化 ADR 編號 → Capability Integration ADR |
| `bmad-overlay/4-implementation/create-story/steps/step-03-codebase-analysis.md`(UPDATE)| `_bmad/.../create-story/steps/step-03-codebase-analysis.md` | §3.0 God Node Priority Scan 整段插入(在 §2 Identify + §3 Scan 之間)— mcp tool namespace `mcp__pcpt-context__search_god_nodes` 對齊 mirror 命名 + domainHints 範例「依本專案實際業務 module 調整」註解 |
| `bmad-overlay/4-implementation/dev-story/steps/step-05-implement-task.md`(UPDATE)| `_bmad/.../dev-story/steps/step-05-implement-task.md` | §0.5 God Node Awareness Pre-Check 整段插入(在 CRITICAL line + §1 Review Current Task 之間)— 同上通用化 mcp 命名 + Fallback 邏輯 |
| `bmad-overlay/4-implementation/code-review/steps/step-04-present-autofix.md`(UPDATE)| `_bmad/.../code-review/steps/step-04-present-autofix.md` | Phase 0.5 God Node BlastRadius Auto-Lookup 整段插入(在 Phase 0 REF + 「For EACH non-FIXED」之間)+ Priority Score 公式加 `← Phase 0.5 god node MCP 自動補值` 註解 + P95/P75/P50 對照表(centrality_score → BlastRadius)— 通用化 ADR 編號 + F-S9 投機紅線 → 通用「投機紅線守護」 |
| `scripts/audit-capability-reachability.cjs`(NEW)| `scripts/audit-capability-reachability.cjs` | 通用化版 audit 工具(reachability_score 公式 + 4 sub-system grep + JSON/MD/console 三模式 + --strict / --tool / --skip-schema / --skip-layer)— REPO_ROOT 兩層上對齊 deployer project root + 部署註解 |
| `scripts/audit-skill-overlap.cjs`(NEW)| `scripts/audit-skill-overlap.cjs` | 通用化版 Skill 重疊偵測(Phase 1 90d 0-trigger retire + Phase 2 triggers Jaccard + Phase 3 description keyword overlap + checkNew 3 題)— DB_PATH placeholder `context-memory.db` + PROJECT_SKILL_PREFIX `pcpt-` 占位符 + STOPWORDS `<project-token>` 替換為 `pcpt` 占位 |
| `config-templates/claude/skills/toolkit-mirror-sync/SKILL.md` v1.0→v1.1(UPDATE)| `.claude/skills/toolkit-mirror-sync/SKILL.md` v1.1.0 | §1 觸發情境 9→11 範圍擴展(加 #10 部屬指南文檔本身 + #11 SYNC-LOG.md append-only 不觸發再次 sync 語意)+ frontmatter version + watches glob 加 `<deployment-mirror-root>/**/*.md` + Version History v1.1.0 row — 通用化 placeholder 維持 |
| `.toolkit-publish-exclude.txt`(UPDATE)| (toolkit-only,無上游)| 加 `SYNC-LOG.md` exclude 條目(防 mirror 同步紀錄推送公開 toolkit repo;主 SSoT 路徑 reference 不可避免) |
| **新建** `.gemini/skills/toolkit-mirror-sync/SKILL.md` v1.1.0(主 SSoT 三引擎補完)| `.claude/skills/toolkit-mirror-sync/SKILL.md` v1.1.0 | Phase 1 ultrathink 揭示 v1.0 只在 .claude/ 存在,新建 .gemini 三引擎同步補完 — md5 identical 對齊 .claude(屬主 SSoT 範圍,不在 mirror) |
| **新建** `.agent/skills/toolkit-mirror-sync/SKILL.md` v1.1.0(主 SSoT 三引擎補完)| `.claude/skills/toolkit-mirror-sync/SKILL.md` v1.1.0 | 同上,新建 .agent 三引擎同步補完 — md5 identical(屬主 SSoT 範圍,不在 mirror) |

**Verify**:
- ✅ 我新加範圍 10 mirror file 各自脫敏 grep `<project-token>|<project-token-Pascal>|IDD-(COM|REG|USR)|<business-story-prefix>` **0 命中**(BR-MIR-008 PASS)
- ✅ baseline 既有 7 hits(server.js 3 + init-db.js 1 + step-04 3,IDD framework 範例字面)— 對齊 Story dev_notes Q3 scope creep 防線,**不在本 Story 範圍**(留另批 baseline-sanitization Story 處理)
- ✅ `node scripts/verify-deployment-docs.cjs` 5-phase **ALL PASS, 1 WARN**(Rules count 24 NOT in [18,22] 屬 deployment-doc-freshness 範圍 out-of-scope)
- ✅ Phase 1 V-8 `<project-token>/<project-token-Pascal>` 字面 **0 命中**(BR-MIR-009 PASS)
- ✅ toolkit-mirror-sync v1.1.0 三引擎 md5 identical PASS(`C17022537E93BDDCF20461B8F63120E2`,Phase 3.7.5)
- ✅ Phase 3.7 透過 **`Skill(skill="saas-to-skill")` 字面 Skill tool 調用**啟動 Mode B(skill-tool-invocation-mandatory.md v1.0 強制要求,對齊 2026-04-28 Session 55 lesson)

**Memory DB cross-reference**:
- `context_entries`(待寫入)— td-toolkit-mirror-godnode-update Phase 1-3.7 完成
- 上游觸發:`context_entries id=3994`(ADR-GOVERNANCE-001 P0-2 minimal viable)+ Phase 1 ultrathink 7 維度比對揭示 7 mirror file 全 0 命中 god node + toolkit-mirror-sync skill 三引擎缺漏

**Self-Dogfood**: 本 entry 自身對齊 toolkit-mirror-immediate-sync.md 立即同步原則(同 session 內完成 Phase 1-4.4)+ skill-tool-invocation-mandatory.md 字面 Skill tool 調用(Phase 3.7 走 Mode B)+ toolkit-mirror-sync v1.1 §1 #11 自身 append-only 範式(本 entry 即是 sync 動作 commit log)。

---

### 2026-05-03 — V-8 baseline sanitization(td-toolkit-baseline-sanitization 完成,解 P0-2 partial FAIL)

| 同步檔案 | 來源 | 變更摘要 |
|:-----|:-----|:-----|
| `mcp-ecosystem.md`(UPDATE 4 hits) | (toolkit-only,無 PCPT 上游 source) | L132/L147/L158/L194 `<project-token>` / `<project-token-Pascal>` 字面通用化:`mcp__<project>-context__search_god_nodes` / `<Project>.Web.Services.Payment` / `<project>-context-memory v2.8` / `context-memory.db` placeholder |
| `SYNC-LOG.md`(UPDATE 5 hits + APPEND new entry)| (toolkit-only,無 PCPT 上游 source) | L12-13/L62/L105/L108 既存 entries(2026-05-01 S59 + 2026-05-02 P0-2)字面通用化 `[<main-ssot-project>]` / `<project-token>` / `<Project>.Platform` / `<project-token>-*` Skill / grep pattern 對齊 line 34 新 entry placeholder 範式;歷史 semantic 完整保留(日期 / 動作 / Memory cross-ref 無更動) |

**Verify**:
- ✅ `node scripts/verify-deployment-docs.cjs` Phase 1 V-8 真正 **0 命中 ALL PASS**(從 partial FAIL → ALL PASS)
- ✅ git diff line-by-line 比對:9 hits 字面替換完成(mcp-ecosystem.md 4 + SYNC-LOG.md 5),歷史 entries semantic preserved
- ✅ 5-Phase 結果:Phase 1-2/4-5 ALL PASS;Phase 3 Rules count 24 NOT in [18,22] WARN 屬 out-of-scope(本 Story 不處理,留 deployment-doc-freshness follow-up)

**Phase 3 V-8 規則調整評估結論**: **不加 file-level/line-level allowlist**(AC3+AC4 評估義務 satisfied)。
- 分支 A 純文字通用化已 100% 解決 9 hits,**無 hit 必須保留 meta-reference**
- KISS 原則:fix data, not rule;allowlist 引入過寬風險(誤判真實業務字面為 meta-reference)
- V-8 regex `/<project-token>|<project-token-Pascal>/g`(品牌字面)維持原樣(`scripts/verify-deployment-docs.cjs:57`)

**Memory DB cross-reference**:
- `context_entries`(待寫入)— td-toolkit-baseline-sanitization 完成 + Phase 3 評估結論
- 解上游 baseline:`context_entries id=3994`(ADR-GOVERNANCE-001 P0-2 minimal viable + V-8 partial FAIL defer 紀錄)+ `context_entries id=4002`(create-story Reactive Skill Sync 範式 + Self-Contained 模式)
- 觸發 Story:`td-toolkit-baseline-sanitization`(epic-governance / S / P1-3,實際 ~30 min)

**Self-Dogfood**: 本 entry 自身 semantic 完整保留(2026-05-01/02 既存 entries 字面通用化但日期/動作/cross-ref 無更動)— 對齊 AC6「git diff line-by-line semantic 不變」要求。

---

### 2026-05-02 — ADR-GOVERNANCE-001 + Capability Integration Mandate + Skill Creation Discipline 立即同步(P0-2 minimal viable)

| 同步檔案 | 來源 | 變更摘要 |
|:-----|:-----|:-----|
| `config-templates/claude/rules/capability-integration-mandate.md` v1.0 (NEW) | 主 SSoT 對應 rules/ | SUPREME 規範新建。MCP/Schema/Hook 5 步整合(SKILL 同步 → BMAD 整合 → Pipeline/Hook 注入分 Path A/B → 部屬範本 → Schema 公告) + 8 條 FORBIDDEN(F1 例外條款)+ Self-Check 5 題 + §6.5 Sync-Gate Execution Order(6 條 SUPREME 並發排序) — 鏡像版通用化(刪業務專案命名前綴 / 業務 IDD 編號 / 業務 Story ID 字面範例) |
| `config-templates/claude/rules/skill-creation-discipline.md` v1.0 (NEW) | 主 SSoT 對應 rules/ | SUPREME 規範新建。Skill 規模 cap + 新建必檢 3 題 + 90d 0 觸發 retire + audit-skill-overlap.cjs 工具 — 鏡像版通用化(Cap 規則改「以項目實況設定」+ baseline 數字 generic 化) |
| `config-templates/context-db/scripts/compute-centrality.cjs` (NEW) | 主 SSoT 對應 scripts/ | Symbol centrality 計算腳本(0.6×weighted_in + 0.4×weighted_out)+ Math.min/max 用 reduce() 防 V8 spread overflow + 21 vitest tests + 200K scores stress test — 鏡像版通用化(DB 檔名 → `context-memory.db`,DB_PATH 註解標明部署時依專案 DB 命名修改) |

**Verify**:
- 3 file × 脫敏 grep `<project-token>|<project-token-Pascal>|IDD-(COM|REG|USR)|<business-story-prefix>` → **全 0 hits ✅**(經 grep 驗證,使用通用脫敏 pattern 表達)

**Memory DB cross-reference**:
- `context_entries id=3978` ADR-GOVERNANCE-001 主紀錄
- `context_entries id=3981` capability-integration-mandate v1.0 SUPREME
- `context_entries id=3982` skill-creation-discipline v1.0 SUPREME
- `context_entries id=3983` (infrastructure-evolution) symbol_index.centrality_score 啟用

**P0-2 Scope 限縮 + Defer 透明化**(對齊「禁止投機」原則):
- ✅ 本次同步 minimal viable:2 SUPREME rules + 1 audit script(脫敏 + 通用化完成)
- ⏸️ **DEFER P1 Story** `td-toolkit-mirror-godnode-update`(規劃中):mirror 端的 hooks(pre-prompt-rag.js Layer N / subagent-context-inject.js god node Phase)+ context-db/server.js search_god_nodes + init-db.js centrality_score schema + bmad-overlay 3 step (step-03/04/05) god node 整合段落 — 涉逐行通用化(避業務範例 + 數字 placeholder),工程量 ~5 hr,本對話 token 預算內無法乾淨完成,留至 P1 follow-up Story 處理(本 SYNC-LOG 紀錄為 deferred 透明化,避免投機聲稱「全部完成」)

**對應 commit**:
- 主 SSoT commit: `3d6ee8a7` (ADR-GOVERNANCE-001 ~24 files)
- 字錯防護 commit(另一 agent): `dacbd5be` (CR done + 簡繁字錯防護 + check-traditional-chinese.cjs)

**Self-Dogfood**: 本 SYNC-LOG 紀錄本身即是 capability-integration-mandate.md §3 Step 5 的「Memory DB add_context category=infrastructure-evolution 公告」實踐(透過此 SYNC-LOG entry + Memory id=3983 雙渠道公告)。

---

### 2026-05-01 S59(Part 2)— 立即同步原則 4 層機械守護(rule + memory + hook + skill)+ SYNC-LOG 自舉

| 同步檔案 | 來源 | 變更摘要 |
|:-----|:-----|:-----|
| `config-templates/claude/rules/toolkit-mirror-immediate-sync.md` v1.0 | `.claude/rules/toolkit-mirror-immediate-sync.md` v1.0 | 立即同步行為準則(Core Principle + Applies When 9 範圍 + MUST NOT + Mandatory Flow 4 步 + FORBIDDEN + Self-Check 4 題 + Hook/Skill 整合)— 鏡像版通用化(主 SSoT 字面 → `<deployment-mirror-root>` placeholder)|
| `config-templates/claude/hooks/toolkit-mirror-sync-detector.js` | `.claude/hooks/toolkit-mirror-sync-detector.js` | Stop hook(advisory)偵測未同步鏡像 + stderr 警告 + 部署提示 — 鏡像版 TOOLKIT_MIRROR_ROOT 改為 `deployment-mirror` placeholder + SANITIZATION_PATTERN 通用化 |
| `config-templates/claude/skills/toolkit-mirror-sync/SKILL.md` v1.0 | `.claude/skills/toolkit-mirror-sync/SKILL.md` v1.0 | action-skill(Mode A 立即同步 + Mode B 月度 Audit)+ 部署提示 5 步 |

**Verify**: 3 file × 脫敏 grep `<project-token>|<project-token-Pascal>|IDD-(COM|REG|USR)|<business-story-prefix>` → 全 0 hits ✅

**Memory DB cross-reference**:
- `context_entries id=3969`(toolkit-sync 立即同步原則固化 + 4 層守護建立)
- `memory/toolkit_immediate_sync_mandate.md`(Core Rule 固化)
- `MEMORY.md` Core Rules 加 SUPREME bullet(2026-05-01 S59 SUPREME)

**Self-Dogfood**:本次同步原則建立後,**立即** mirror 自身建立的 rule + hook + skill,作為「立即同步原則」第一個實例驗證(避免延後 → 自我違反原則)。CLAUDE.md §1 Triggers 加 Toolkit Mirror 立即同步 trigger,確保未來新對話視窗看到 trigger 即觸發守護。

---

### 2026-05-01 S59 — CMI-12 search_stories 完整 46 欄位修復

| 同步檔案 | 來源 | 變更摘要 |
|:-----|:-----|:-----|
| `config-templates/context-db/server.js:2295-2351` | `.context-db/server.js:2295-2351` | search_stories 精確查詢 + include_details=true → 回傳完整 46 欄位無 _preview;列表查詢保留 _preview 防多筆 token 爆炸 |
| `mcp-ecosystem.md` §5.1 | 新增章節 | CMI-12 行為描述 + 修復前後對比 |
| `memory-system-deep-dive.md` line 178 | 修改 | search_stories 描述加 CMI-12 行為註記 |

**Memory DB cross-reference**:
- `context_entries id=3968`(CMI-12 release notes)
- `context_entries id=3967`(違憲事故 lesson — DB-first SSoT 順序倒置)
- 觸發 Story:`eft-trial-fingerprint-abuse-prevention`(Wave 6 第三階,cold-start handoff 場景發現)
- Follow-up Story:`td-mcp-cmi-12-toolkit-sync`(P1/S backlog,toolkit repo push 階段)

**驗證**:
- ✅ MCP server 重啟實測 `search_stories({story_id, include_details: true})` 回傳 64.2KB 完整(對比修復前 ~2-3KB)
- ✅ 對齊 `db-first-no-md-mirror.md` + `context-memory.md` Conversation Start Ritual SSoT 精神

---

## 同步原則(重要)

### MUST(必同步)

1. **任何 `.context-db/scripts/` Memory DB 工具改動** → 立即同步 `1.專案部屬必讀/config-templates/context-db/`
2. **任何 `.claude/{rules,hooks}/` 配置改動** → 立即評估是否同步 `1.專案部屬必讀/config-templates/claude/`
3. **任何 `_bmad/bmm/workflows/` BMAD overlay 改動** → 立即評估是否同步 `1.專案部屬必讀/bmad-overlay/`
4. **任何架構設計變更影響 deployment 文檔** → 立即同步 `1.專案部屬必讀/*.md`

### MUST NOT(嚴禁鏡像)

按 `CLAUDE.md` §0.5 FORBIDDEN:
- ❌ `src/<Project>.Platform/**` 業務 code
- ❌ `docs/{technical-decisions,implementation-artifacts,project-planning-artifacts}/` 業務 ADR/Stories/Reviews
- ❌ `memory/` Auto-Memory + IDD(業務 IDD)
- ❌ `<project-token>-*` Skill 字面(對齊 toolkit SANITIZATION-POLICY V-8 <project-token> 字面 0 命中)

### 立即同步原則(本 SYNC-LOG 觸發背景)

> 2026-05-01 違憲事故反思:延後 toolkit 同步 → 容易忘記細節 / 需重新大規模比對驗證 / 缺漏。**當下做才精確**(黃金期禁投機 + Memory 最新)。

---

## 待同步追蹤(P1 follow-up — `td-mcp-cmi-12-toolkit-sync`)

第二段 toolkit repo 推送(`1.專案部屬必讀/` → `claude-agent-toolkit` repo `deployment/`)走獨立 Story:

- ⬜ `claude-agent-toolkit/deployment/config-templates/context-db/server.js` 同步
- ⬜ `claude-agent-toolkit/deployment/mcp-ecosystem.md` 同步(若 toolkit repo 含此檔)
- ⬜ `claude-agent-toolkit/deployment/memory-system-deep-dive.md` 同步
- ⬜ `verify-deployment-docs.cjs` 5-phase ALL PASS
- ⬜ release branch + gh PR

---

## 歷史同步紀錄(歸檔)

> 本 SYNC-LOG 建立於 2026-05-01,2026-05-01 之前的 PCPT-MVP → `1.專案部屬必讀/` 同步歷程未集中追蹤,已散落於各 commit messages / Memory DB context_entries。建議未來同步時持續累積本 SYNC-LOG。

---

## 維護責任

- **每次 commit PCPT-MVP 主 SSoT 改動**(影響 `1.專案部屬必讀/` 鏡像範圍時)→ 同 commit 一併更新本 SYNC-LOG
- **每次 toolkit repo push** → 在「待同步追蹤」section 移除對應條目並轉到「歷史同步紀錄」
- **monthly review** → 校驗 PCPT-MVP 主 SSoT vs `1.專案部屬必讀/` diff,補同步遺漏
