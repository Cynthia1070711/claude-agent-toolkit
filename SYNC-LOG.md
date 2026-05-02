# Toolkit 鏡像同步紀錄(SYNC-LOG)

> **檔案性質**: PCPT-MVP 主 SSoT → `1.專案部屬必讀/` toolkit 內容鏡像 SSoT 同步歷程
> **規範**: 對齊 `CLAUDE.md` §0 雙倉庫架構認知 + §0.2 進化路徑(蒸餾流)
> **更新原則**: **PCPT-MVP 主 SSoT 任何改動 → 立即同步至 `1.專案部屬必讀/`**(避免延後忘記細節 / 重新大規模比對驗證)

---

## 同步流向

```
[PhyCool-PCPT-MVP] 主 SSoT(完整含業務字面)
    ↓ 立即同步(脫敏 phycool / PhyCool 字面)
[PCPT-MVP] /claude token減量策略研究分析/1.專案部屬必讀/(toolkit 內容鏡像 SSoT)
    ↓ 不定期同步(再次 verify 脫敏)
[claude-agent-toolkit] /deployment/(對外公開可部屬,獨立 repo)
```

**本 SYNC-LOG 涵蓋第一段同步**(PCPT-MVP → `1.專案部屬必讀/`)。第二段(`1.專案部屬必讀/` → toolkit repo)走 `td-mcp-cmi-12-toolkit-sync` 等 follow-up Story + release branch + gh PR(對齊 `.claude/rules/dual-repo-push-discipline.md`)。

---

## 同步紀錄(時間倒序)

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

**Verify**: 3 file × 脫敏 grep `phycool|PhyCool|IDD-COM-005|IDD-REG-005|IDD-USR|eft-trial|eft-account|eft-batch|qgr-|mqv-|dla-` → 全 0 hits ✅

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
- ❌ `src/PhyCool.Platform/**` 業務 code
- ❌ `docs/{technical-decisions,implementation-artifacts,project-planning-artifacts}/` 業務 ADR/Stories/Reviews
- ❌ `memory/` Auto-Memory + IDD(業務 IDD)
- ❌ `phycool-*` Skill 字面(對齊 toolkit SANITIZATION-POLICY V-8 phycool 字面 0 命中)

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
