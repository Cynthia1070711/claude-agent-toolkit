---
name: ecc-instincts
description: >
  Use when implementing/dispatching ecc-07~12 L2 atomic instinct dispatchers, or
  governing 軌道 α evolve 推薦層 (候選偵測/否決治理/精確度閘). Instinct registry
  mapping 10 instincts to SUPREME rule + monitor state file + responsible ecc Story.
  對齊 ecc-haiku-dispatch IInstinctDispatcher contract + IDD-STR-001. 觸發: ecc
  instinct, instinct registry, ecc-07, ecc-08, ecc-09, ecc-11, ecc-12, L2 instinct,
  evolve candidate, SUPREME rule mechanization.
version: 1.4.0
updated: 2026-06-09
created: 2026-05-24
last-synced-epic: epic-ecc-v2
last-synced-date: 2026-06-09
author: CC-OPUS
disable-model-invocation: false
user-invocable: true
shell: powershell
watches:
  - glob: ".claude/skills/ecc-instincts/scripts/*.ps1"
    domain: governance
  - glob: ".context-db/ecc-state/*.json"
    domain: governance
triggers:
  - ecc instinct
  - instinct registry
  - L2 instinct
  - SUPREME rule mechanization
  - ecc-07
  - ecc-08
  - ecc-09
  - ecc-11
  - ecc-12
  - instinct definition
---

# ECC L2 Atomic Instinct Registry

> **本 Skill 為 instinct REGISTRY(註冊表 + 契約容器)**,非 dispatcher 實作。
> 10 個 L2 atomic instincts 的 SUPREME rule mapping + monitor state file + 負責 ecc Story 的 single source of truth。
>
> **Scaffold 狀態(v1.0.0)**: 本 SKILL.md 提供 registry + contract 範式。**各 instinct 的 dispatcher script 由對應 ecc-07~12 dev-story TDD 實作**(本 scaffold 不含 dispatcher 程式碼,避免搶 dev-story 工作 + 對齊 TDD test-first)。
>
> **Dispatch 基礎建設見** [`ecc-haiku-dispatch`](../ecc-haiku-dispatch/SKILL.md)(IInstinctDispatcher contract + Haiku Agent wrapper + Mock/Real 雙模)。本 Skill **不重複** dispatch infrastructure,只定義「有哪些 instinct + 各對應什麼」。

## When to Use

- **ecc-07/08/09/11/12 dev-story 實作前** — Read 本 registry 確認 instinct ↔ SUPREME rule mapping + state file path + 既有對齊狀態(避免重複建既有 hooks)
- **新增 L2 instinct** — 對齊本 registry 表格 + ecc-haiku-dispatch contract
- **查 10 instincts 的 SUPREME rule 對應** — 本 registry 為 single source

## 10 Instincts × SUPREME Rule Mapping(Registry SSoT)

> 對齊 `ADR-ECC-LEARNING-001 v1.2.0 §Instinct↔SUPREME Mapping Table`(10 instincts × 10 SUPREME rules · 1-to-1)+ `ecc-haiku-dispatch contracts/instinct-dispatch.schema.json` enum。

| # | Instinct | SUPREME Rule | State File | 負責 Story | Phase |
|:-:|:---------|:-------------|:-----------|:----------:|:-----:|
| 1 | `skill_invocation` | `skill-tool-invocation-mandatory.md` v1.2.0 | `skill-invocation-state.json` | ecc-07 | 1 |
| 2 | `hook_dispatch` | `hooks-creation-discipline.md` | `hook-dispatch-state.json` | ecc-08 | 1 |
| 3 | `cross_ref` | `cross-ref-discipline.md` | `cross-ref-state.json` | ecc-08 | 1 |
| 4 | `depth_first` | `constitutional-depth-first.md` | `depth-first-state.json` | ecc-09 | 1 |
| 5 | `governance` | `skill-idd-sync-gate.md` + `skill-creation-discipline.md` | `governance-state.json` | ecc-09 | 2 |
| 6 | `parallel_isolation` | `parallel-batch-conflict-isolation.md` | `parallel-isolation-state.json` | ecc-09 | 2 |
| 7 | `capability_integration` | `capability-integration-mandate.md` | `capability-integration-state.json` | ecc-11 | 2 |
| 8 | `pipeline_handshake` | `pipeline-handshake-protocol.md` | `pipeline-handshake-state.json` | ecc-11 | 2 |
| 9 | `mcp_payload` | `mcp-payload-discipline.md` | `mcp-payload-state.json` | ecc-12 | 2 |
| 10 | `encoding_discipline` | `encoding-discipline.md` + `phycool-windows-ps-encoding` | `encoding-state.json` | ecc-12 | 2 |

**State file 根目錄**: `.context-db/ecc-state/`(✅ 10 state templates + `dispatch_log.json` 已由 `ecc-haiku-dispatch v1.2.0` P2.1b 預建 · 2026-05-23T15:03 initialized)
**Dispatcher infra**: `ecc-10`(✅ done · `ecc-haiku-dispatch v1.3.1` Mock+Real+Gemini tri-mode)

> **🔀 兩軌道區分(v1.2.0 釐清 · 對齊 ADR v1.4.0 D5 + v1.5.0 D6)**:本 registry 屬**軌道 β**(10 條 SUPREME rule dispatcher · state 寫 `.context-db/ecc-state/*.json`)。另有**軌道 α**(動態湧現 `instincts` 表 · 機器從行為自產 instinct + confidence/decay)。**兩軌正交**:軌道 α 的 `instincts` 表 schema 已於 **2026-05-26 凍結**(D6 · 14 欄 + D5 三欄 project_type/business/adoption_score · 跨視窗採納分數 0~5)· 軌道 β 不碰該表。**2026-05-28 經 Memory id=4447 純 additive 解凍 +3 UI 欄**(`description_zh`/`user_note`/`user_star_rating` · ecc-emergence-ui-core · `instincts_rejected` 並 +`reject_count`/`norm_key` · 不動湧現/verify/Layer12 核心邏輯)。本 registry dev 時**勿混淆兩軌**。

## 雙軌架構(Phase 1 hooks 觀測 vs Phase 2 dispatcher · 誠實記載 path drift)

> **設計 internal inconsistency 揭露**(對齊 constitutional-depth-first §Audit Anti-Pattern + 防虛構):ecc-07~12 stories file_list 的 dispatcher path 存在雙軌,**dev-story 階段需 reconcile**。

| 軌道 | Path 形式 | 適用 instinct | 既有對齊狀態 |
|:----|:----------|:------------|:------------|
| **Track 1 · Hook 觀測層** | `.claude/hooks/*.js` PreToolUse/PostToolUse | Phase 1(skill_invocation / hook_dispatch / cross_ref / depth_first) | **ecc-07 = 100% 既有對齊**(`skill-invocation-state-tracker.js` + `skill-tool-invocation-guard.js v2.0.0` · 2026-05-17 deployed · Memory id=4309 P0.8 audit) |
| **Track 2 · Dispatcher script** | `.claude/skills/ecc-instincts/scripts/*.ps1` | Phase 2(capability_integration / pipeline_handshake / mcp_payload / encoding_discipline) | ecc-11/12 file_list NEW · 待 dev-story TDD |

**Contract Path Drift**(ecc-07 dev_notes 已揭露):
- 既有 audit state: `.claude/audit/skill-invocation-state.json`(ephemeral · 15-min TTL · enforcement)
- contract 預期: `.context-db/ecc-state/skill-invocation-state.json`(permanent evidence · ADR §D4 evaluation gate)
- → **dual-layer 並存**(語義不同 · non-conflict)

**dev-story reconcile 指引**: ecc-07/08(Phase 1)優先「承認既有 hook 對齊 + 補 permanent evidence log」(非從零);ecc-11/12(Phase 2)走 Track 2 dispatcher script 新建。

## Dispatcher Contract 範式(引用 ecc-haiku-dispatch · 不重複定義)

每個 dispatcher 對齊 `ecc-haiku-dispatch/contracts/instinct-dispatch.schema.json`:

- **Input**: `instinct_name` + `payload`(trigger_context + rule_reference + file_path?)+ `timestamp`(UTC+8)
- **Output**: `status`(success/failure/partial)+ `result`(action_taken + side_effects)+ `state_diff`(state_file + before + after)+ `evidence`(rule_applied + evidence_paths)

**State file schema 範式**(對齊既有 `skill-invocation-state.json` ground-truth):
```json
{
  "schema_version": "1.0.0",
  "instinct_name": "<instinct>",
  "rule_applied": "<SUPREME rule + version>",
  "initialized_at": "<UTC+8>",
  "last_dispatch": "<UTC+8>",
  "dispatch_count": 0, "success_count": 0, "failure_count": 0, "partial_count": 0,
  "history": { "timestamp": "<UTC+8>", "status": "<status>", "action_taken": "<desc>" }
}
```

## ecc Story 對應表(dev-story scope 指引)

| Story | Instincts | Complexity | dev-story 真實 scope |
|:-----:|:----------|:----------:|:---------------------|
| ecc-07 | skill_invocation | M | Phase 1 既有 hook 對齊(承認)+ Phase 2-4 dispatcher API + permanent evidence + tests |
| ecc-08 | hook_dispatch + cross_ref | M | Phase 1 觀測 + dispatcher + tests(查既有 `cross-ref-precheck.js` 對齊) |
| ecc-09 | depth_first + governance + parallel_isolation | L | 3 instincts(Phase 1+2 mixed)+ dispatcher + tests |
| ecc-11 | capability_integration + pipeline_handshake | M | Track 2 dispatcher scripts NEW + SKILL.md 包裝(Mode A 加 scripts 引用)+ tests |
| ecc-12 | mcp_payload + encoding_discipline | M | Track 2 dispatcher scripts NEW + SKILL.md 包裝(共用)+ tests |

## Iron Laws(3 條 · 對齊 ecc-haiku-dispatch + IDD-STR-001 critical)

### Iron Law #1: REGISTRY FIRST · 查既有對齊再實作

任何 instinct dispatcher 實作前**必先**:
1. Read 本 registry 表確認 instinct ↔ SUPREME rule + state file path
2. Glob 既有 `.claude/hooks/*.js` 查是否既有觀測層對齊(對齊 `skill-creation-discipline §3 Q1` + 防 ecc-07 P0.8 redundant build 重演)
3. 既有對齊 → 「承認 + 補 dispatcher API」非「從零」

### Iron Law #2: CONTRACT ALIGNMENT · 對齊 ecc-haiku-dispatch

dispatcher input/output **必對齊** `ecc-haiku-dispatch/contracts/instinct-dispatch.schema.json`,**不自創** schema(對齊 ecc-haiku-dispatch Iron Law #1 contract first)。

### Iron Law #3: IDD-STR-001 4 FORBIDDEN 嚴守

對齊 `IDD-STR-001` critical:禁 Phase 3 multi-agent 編排 · 禁 HyperAgents 整合 · 禁 Opus 主要承載 dispatch(走 Haiku)· 禁立即 production 化(evidence-based gate)。

## FORBIDDEN

- ❌ **從零實作既有 hook 已對齊的 instinct 觀測層**(ecc-07 P0.8 redundant build 教訓)
  Common Rationalization: 「stub 說 NEW,我就從零建」
  Red Flag: 新建 hook 與既有 `skill-invocation-state-tracker.js` / `skill-tool-invocation-guard.js` 功能重疊
- ❌ **dispatcher 自創 input/output schema 不對齊 ecc-haiku-dispatch contract**
  Common Rationalization: 「我的 instinct 比較特別」
  Red Flag: dispatcher output 缺 state_diff / evidence field
- ❌ **本 scaffold 階段直接寫 dispatcher script 實作**(搶 dev-story TDD 工作)
  Common Rationalization: 「順手寫完比較快」
  Red Flag: scripts/*.ps1 在無對應 Story dev-story 啟動下被建立
- ❌ **state file 寫 UTC `toISOString()`**(違反 constitutional §Timestamp)
  Red Flag: state file timestamp 無 `+08:00`

## Pressure Test(Discipline freedom level · 必做)

**Combined Scenario(3 軸)**: 「ecc-08 dev-story + token 緊縮 + ecc-07 已 done 路徑依賴」
- 時間壓力 → 跳 registry 查既有,直接從零建 hook_dispatch + cross_ref hook
- 路徑依賴 → 複製 ecc-07 範式但漏查既有 `cross-ref-precheck.js` 對齊
- 合理化 →「stub file_list 寫 NEW 我就建 NEW」
→ 即使三軸全壓 **必 STOP** · 走 Iron Law #1(registry first + Glob 既有)+ ecc-07 P0.8 教訓

| Forbidden | Common Rationalization | Red Flag |
|:----------|:----------------------|:---------|
| 從零建既有對齊 instinct | 「stub 說 NEW」 | 新 hook 與既有功能重疊 grep 證實 |
| 自創 schema | 「instinct 特別」 | output 缺 state_diff/evidence |
| scaffold 寫實作 | 「順手快」 | scripts/*.ps1 無 Story 啟動下建立 |

## ecc-09/11/12 既有對齊結論(2026-05-24 ground-truth audit · v1.1.0 · **v1.2.0 FINALIZED 2026-05-26**)

> **🔒 v1.2.0 定案(2026-05-26 Party Mode · 使用者放行 A 案 · ADR-ECC-LEARNING-001 v1.5.0 §D6)**: ecc-11/12 經 Whole-Task Pre-Audit 確認**正式重分類為 evidence-only**(不再是「audit 建議」而是 **CEO 裁決定案**)。理由:四 instinct(capability_integration 60% / pipeline_handshake 70% / mcp_payload 75% / encoding_discipline 95%)觀測層既有對齊充足 + 屬軌道 β(寫 `.context-db/ecc-state/*.json` · 與軌道 α `instincts` 表正交)+ 開源倉 ECC-main 無現成 dispatcher 架構。**真 gap = G2 Haiku real-mode eval**(defer §D4 evidence-based gate · Stage β 後)。
>
> ⚠️ **dev-story 注意**: ecc-11/12 Story 雖 status=ready-for-dev 且原 scope 寫「build NEW dispatcher.ps1」,但 ADR v1.5.0 §D6 已以 **evidence-only 收斂**(不逐建 · 避殭屍機制)。任何 ecc-11/12 dev 必先讀本結論 + ADR v1.5.0,**禁從零建 dispatcher.ps1**(= 重複既有 60-95% 守護的殭屍機制 · 違反業界不重複造輪 + Kill Switch)。

> **核心結論**: 剩餘 7 instincts 的 dispatch 已由 `IInstinctDispatcher.psm1` generic `Invoke-InstinctDispatch` 涵蓋(已 ground-truth 驗證 depth_first dispatch + permanent state write)· 觀測/enforcement 由既有 SUPREME rule + hook/script 涵蓋(**5/7 對齊度 ≥ 85%**)· **不逐建 dispatcher.ps1**(避殭屍機制重複 · 對齊 systematic-debugging Iron Law #3 + Stage-β Kill Switch)。

| Instinct | 既有機械守護(file evidence)| 對齊% | 真實增量決策 |
|:---------|:--------------------------------|:-----:|:------------|
| depth_first | `constitutional-depth-first.md`(rule · 3-Layer Flow + 6 FORBIDDEN) | 85% | dispatch by psm1 · evidence-only |
| governance | `skill-idd-sync-gate.md` + `skill-sync-check.cjs` + `skill-change-detector.js` hook | 90% | dispatch by psm1 · evidence-only |
| parallel_isolation | `parallel-batch-conflict-isolation.md` + `shared-utils.ps1` T5.7 hot-row | 85% | dispatch by psm1 · evidence-only |
| capability_integration | `capability-integration-mandate.md`(paths-scoped)· verify script defer | 60% | paths-scoped 涵蓋大部 · verify-capability-integration.cjs **defer** |
| pipeline_handshake | `pipeline-handshake-protocol.md` + party-to-pipeline `orchestrator.ps1` IPC | 70% | paths-scoped(party-to-pipeline)涵蓋 · evidence-only |
| mcp_payload | `mcp-payload-discipline.md` + `Invoke-PhycoolMcpSafe`(shared-utils.ps1 T5.5) | 75% | 既有 Invoke-PhycoolMcpSafe 涵蓋 · T5.4 wrapper stub 為 known debt |
| encoding_discipline | `encoding-bom-guard.js` hook + `check-ps-encoding.cjs` + psm1 UTF-8 init | 95% | 最完整 · evidence-only |

**Over-build 風險規避**(對齊使用者「業界不重複造輪」+「不投機」):5/7 instinct 既有對齊 ≥ 85%,若新建專用 dispatcher/hook = 與既有守護功能重複的殭屍機制。`parallel_isolation`/`pipeline_handshake` 的 paths-scoped 是刻意 lazy-load 最佳化(降 always-on token),非「未涵蓋」。

**真 gap = Haiku real-mode dispatch 驗證(G2 20%)**:對齊 `IDD-STR-001 D4` evidence-based gate(Stage β 後評估)· 非 build 更多 mock dispatcher。建議 Stage β 完成後跑 1 個 Haiku real dispatch evaluation(success_rate/latency/token_cost)。

## 軌道 α L2→L3 Evolve 推薦層(v1.3.0 新增 · 2026-05-28 落地)

> **歷史定位**: 開源 ECC continuous-learning-v2 `/evolve` (cmd_evolve + _generate_evolved) 提供 L2 成熟 instinct 聚類演化為 L3 skill/hook 的雙門檻參考。PhyCool 在 2026-05-28 前**刻意未落地**(對齊 ADR-ECC-LEARNING-001 §D6 軌道 β evidence-only + `skill-tool-invocation-mandatory` SUPREME 禁自動寫檔)。
>
> **2026-05-28 ecc-emergence-evolve-hitl Story 完成 L2→L3 evolve 推薦層落地** — 採 **HITL(Human-in-the-Loop)範式**: 機器偵測成熟候選 → UI 卡片展示 → 使用者**手動字面調用** `Skill(skill="saas-to-skill")` Mode A / `Skill(skill="hooks-mechanization")` → 由人確認生成內容。**絕禁自動寫檔**(對齊 SUPREME 紀律)。

### 落地檔案(SSoT)

| 檔案 | 角色 |
|:----|:----|
| `.context-db/scripts/ecc-evolve-detect.cjs` | **純讀候選偵測**(readonly:true · 0 INSERT/UPDATE/DELETE · skill ≥ 2 / agent-hook ≥ 3 且 avg_conf ≥ 0.75 雙門檻)+ **P1 `checkRedundancy`**(2026-06-08 · 對照既有 rule/skill/hook 標 `redundant`/`covered_by` · 補開源 `/evolve` 零 verifier 短板)|
| `.context-db/scripts/ecc-consolidate-mvp.cjs` vSys | **P0 verifier 判準 (f) baseline 過濾**(2026-06-08 · 源頭擋 agent 內建能力/error-recovery 偽陽性 · 讓 verifier 能力假設追上 Opus-4.8)|
| `tools/dev-console/server/routes/emergence.ts` GET /evolve-candidates | 後端**純讀**偵測 endpoint(spawnSync ecc-evolve-detect.cjs · 503/500 guard · UTC+8 generatedAt)|
| `tools/dev-console/server/routes/emergence.ts` POST /evolve-candidates/reject | **候選否決治理 endpoint**(2026-06-09 · commit `cc40bfbb` · 批次否決成員 instinct → `upsert-instinct.js reject` → instincts_rejected + reject_count++ · `reject ≠ generate` 詳 F4 澄清)|
| `tools/dev-console/src/pages/Emergence.tsx` `EvolveSection` + `HITLModal` | 候選展示牆 + HITL 生成引導 Modal(字面 Skill tool 樣本 + 複製鈕)|
| `tools/dev-console/src/components/CandidateCardV2.tsx` | 候選卡 · `redundant` badge(P1)+ **🚫 否決 inline 理由輸入**(對齊 InstinctCardV2 範式 · 複用 `--reject` CSS)|
| `tools/dev-console/src/styles/emergence.css` `.emergence-evolve__` + `.emergence-hitl__` | BEM blocks(51 class definitions)|

### HITL 紀律 4 條(絕禁線 · 對齊 Memory id=4447 + SUPREME)

| 動作 | 允許? | 理由 |
|:----|:---:|:----|
| ecc-evolve-detect.cjs readonly 讀 instincts/instincts_rejected | ✅ | 純讀無風險(readonly: true flag)|
| GET /evolve-candidates 回傳 JSON + UI 卡片展示 | ✅ | 純展示無 mutation |
| HITLModal 顯示字面 `Skill(skill="...")` 調用樣本 + 複製鈕 | ✅ | 引導使用者**手動**調用(對齊 `skill-tool-invocation-mandatory` SUPREME 字面層)|
| **POST /evolve-candidates/reject 否決候選成員**(v1.4.0 · 2026-06-09)| ✅ | reject 治理 · **非 generate** · 不寫 skill/hook 檔 · 只標記既有 instinct rejected · HITL 負向完善(人類否定機器推薦)· 詳 §F4 generate/reject 邊界澄清 |
| **自動寫 `.claude/skills/{new}/SKILL.md`** | ❌ | **零容忍** · 違反 SUPREME |
| **後端 POST/PUT 寫檔 endpoint(auto-generate-skill 類)** | ❌ | **零容忍** · grep PR 必 0 命中 |
| **後端代使用者跑 saas-to-skill / hooks-mechanization Skill tool** | ❌ | 違反 SUPREME 字面層(機械化跳過確認)|

### 字面 Skill tool 調用樣本(HITLModal 內展示)

```
# skill 候選 (type='skill', count ≥ 2 同 domain approved instinct):
Skill(skill="saas-to-skill")
// Mode A Create — 候選摘要:
// domain: {domain} | business: {business}
// avg_confidence: {avg_conf*100}%
// members: {member_ids[0..3].join(', ')}
// rejected_total: {rejected_total}

# agent-hook 候選 (type='agent-hook', count ≥ 3 且 avg_confidence ≥ 0.75):
Skill(skill="hooks-mechanization")
// 7-step playbook — 候選摘要:同上
```

### Skill Cap 自檢提示(對齊 skill-creation-discipline §2 + §3)

`ecc-evolve-detect.cjs` 偵測候選時同時讀 `.claude/skills/` 統計 `phycoolCount` / `generalCount` / `totalCount`,UI HITLModal 渲染:

- **phycoolCount ≥ 95** (buffer ≤ 5) → 黃色警示「⚠ Skill Cap 接近上限」
- **phycoolCount ≥ 100** (buffer = 0) → 紅色阻斷「🚫 Skill Cap 已滿 · 必先 retire」
- 新建必檢 3 題提示(對齊 skill-creation-discipline §3 Q1/Q2/Q3)

### FORBIDDEN(三元素 · 對齊 saas-to-skill v3.3.0 面向 8)

❌ **F1: 為使用者代調用 Skill tool 取代 HITLModal 展示**
   Common Rationalization:「使用者每次都會手動跑 Skill tool 太煩,我幫他自動跑」
   Red Flag: `tools/dev-console/server/routes/emergence.ts` 出現 spawnSync 跑 `claude --skill saas-to-skill` 或類似自動執行 Skill 邏輯;HITLModal 變 0 展示直接觸發 generate API

❌ **F2: 新建 auto-generate-skill.cjs / auto-write-skill.js 自動寫檔腳本**
   Common Rationalization:「ecc-evolve-detect.cjs 既然偵測得到,順手寫個 generate-skill 不就完整?」
   Red Flag: `.context-db/scripts/` 出現 `auto-generate-*.cjs` / `auto-write-*.js` 檔案;grep `Write\|writeFileSync\|fs\.writeFile` 整個 ecc-evolve-detect-* 命中

❌ **F3: ecc-evolve-detect.cjs 拿掉 readonly:true flag 改寫入候選快取表**
   Common Rationalization:「偵測結果重算太慢,加 evolve_candidates_cache 表預存」
   Red Flag: `ecc-evolve-detect.cjs` 出現 `new Database(DB_PATH)`(無 readonly:true)或 `INSERT/UPDATE` SQL;DB schema 新增 `evolve_candidates*` 表

❌ **F4: HITLModal 開檔/呼叫 generate 類 mutation endpoint**
   Common Rationalization:「使用者點生成按鈕後系統不做任何事使用者體驗差,加一個 POST /evolve/generate 至少 log 候選」
   Red Flag: `Emergence.tsx` HITLModal 元件出現**生成/生成-log 類** mutation;`emergence.ts` 新增 evolve **generate / auto-write / generate-log** mutation endpoint

> **⚖️ generate vs reject 邊界澄清(v1.4.0 · 2026-06-09)**: F4 禁的是 **generate 類 mutation**(自動生成 skill/hook 或 log 候選繞過 HITL 人類確認)。**候選否決 `POST /evolve-candidates/reject` 不屬 F4** —— 三點區別:(a) `reject ≠ generate`(否決是負向治理,非正向產出);(b) **不寫任何 skill/hook 檔**(只標記既有成員 instinct rejected · 走既有 `upsert-instinct.js reject` → instincts_rejected + reject_count++);(c) 是 HITL 的**負向完善**(原僅能「生成」,現能「否決」· 人類對候選有雙向控制 · 否決 = 人類否定機器推薦,**強化**而非違反 HITL)。SUPREME 紅線「絕禁自動**生成** skill/hook 繞過人類」完整保留;reject 治理是其正交補集。深層價值:閉環 P1 redundant 偵測(偵測 redundant → 一鍵否決 → 成員落否決池 → 下次 evolve 因 reject_count 升高降權)。commit `cc40bfbb`。

### 兩軌道區分(v1.3.0 釐清強化 · v1.4.0 reject 治理補註)

| 軌道 | 既有 SUPREME rule dispatcher(本 registry · §10 表)| evolve 推薦層(本章 · 新落地)|
|:----|:------|:------|
| **覆蓋對象** | 軌道 β:10 條 SUPREME rule × dispatcher 觀測/enforcement | 軌道 α:`instincts` 表動態湧現 instinct 聚類為新 skill/hook |
| **State 寫入** | `.context-db/ecc-state/*.json`(permanent evidence)| 偵測純讀(ecc-evolve-detect.cjs readonly)+ 展示;**否決治理 reject 寫 instincts_rejected**(v1.4.0 · 非 generate · 既有 instinct 層 reject 批次版)· **零自動生成 skill/hook**|
| **觸發路徑** | Haiku/Gemini dispatcher · ecc-haiku-dispatch infra | 使用者手動點 /emergence 頁 → Modal → 複製 → 主對話手動 Skill tool 調用 |
| **自動化程度** | 高(每次 SUPREME rule 觸發即 dispatch)| **零自動**(機器偵測推薦 · 生成必手動 Skill tool · HITL 紀律)|

兩軌正交不互通:軌道 β 的 ecc-haiku-dispatch contract 不涵蓋 evolve 候選生成;軌道 α evolve 推薦層不寫 ecc-state JSON。

## Cross-Reference

- **Dispatch infra**: `.claude/skills/ecc-haiku-dispatch/SKILL.md` v1.3.1(IInstinctDispatcher + cheap-model wrapper + Mock/Real/Gemini tri-mode · D2 pivot Haiku→Gemini-backed)
- **Contract schema**: `.claude/skills/ecc-haiku-dispatch/contracts/instinct-dispatch.schema.json` v1.0 stable
- **ADR**: `docs/technical-decisions/ADR-ECC-LEARNING-001-epic-ecc-v2-ceo-signoff.md` v1.8.0(§D2 amendment Haiku→Gemini-backed dispatch + §D5 採納分數 + §D6 schema 凍結 + ecc-11/12 evidence-only)
- **IDD**: `IDD-STR-001` critical(intentional_decisions table)
- **10 SUPREME rules**: 見 §Mapping 表(全 10 條 `.claude/rules/*.md` 已 verify 真實存在 2026-05-24)
- **既有觀測 hooks**: `.claude/hooks/skill-invocation-state-tracker.js` + `skill-tool-invocation-guard.js` v2.0.0(2026-05-17 deployed)
- **Stories**: ecc-07/08/09/10/11/12(全 done · 2026-05-27 Party Mode 復驗 · ecc-10 G2 eval gate PASS 後 done · 校正原標 ready-for-dev)
- **軌道 α evolve 推薦層 Stories**: ecc-emergence-ui-core(done · cr_score=92 · 2026-05-28)→ ecc-emergence-governance(done · cr_score=89 · 2026-05-28)→ ecc-emergence-evolve-hitl(done · 2026-05-28 · L2→L3 evolve 首次落地)
- **HITL 紀律 SUPREME rules**: `skill-tool-invocation-mandatory.md` v1.2.0 + `skill-creation-discipline.md`(Cap 100/60/160 + 新建必檢 3 題)
- **Memory decision source**: `context_entries id=4447`(Party Mode 設計收斂 2026-05-27 23:12 · 3-Story 序列定案 + HITL evolve 5 條使用者決策)
- **湧現迴路 evolve 精確度閘 + 候選否決**(2026-06-08~09 · 後台軌主視窗親自 · 補開源範式短板): P0 verifier baseline(`ecc-consolidate-mvp.cjs` 判準 f)+ P1 redundant 偵測(`ecc-evolve-detect.cjs checkRedundancy`)commit `5a078e6e`;候選否決治理(`POST /evolve-candidates/reject` · CandidateCardV2 inline reject)commit `cc40bfbb`。架構 SSoT: `claude token減量策略研究分析/開發環境檢索架構全景/README.md` §Layer 12 evolve 精確度閘

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.4.0** | **2026-06-09** | **候選否決治理 + F4 generate/reject 邊界精化 + P0/P1 精確度閘同步**(後台軌 ECC 湧現迴路優化 · 主視窗親自 · skill-builder Mode B · 8 面向)。(1) 軌道 α 落地表加 `POST /evolve-candidates/reject` 否決 endpoint + `ecc-consolidate-mvp.cjs` P0 verifier baseline + `ecc-evolve-detect.cjs` P1 `checkRedundancy` + CandidateCardV2 reject input(commit `5a078e6e` + `cc40bfbb`);(2) HITL 紀律 4 條加 ✅ reject row;(3) **F4 精化「限 generate 類」+ generate/reject 邊界澄清**(reject ≠ generate · 不寫 skill/hook 檔 · HITL 負向完善 · SUPREME 紅線完整保留);(4) 兩軌道區分 L261「0 寫入純展示」→「偵測純讀 + 否決治理 reject 寫 instincts_rejected · 零自動生成」;(5) Cross-Reference 加 evolve 精確度閘 + 候選否決 commit + README §Layer 12。**深度合規論證**:候選否決補開源 ECC 候選層「偵測 redundant 但無治理動作」缺口 · reject 是 HITL 雙向控制的負向完善 · 不違反「絕禁自動生成繞過 HITL」SUPREME。**8 面向**:#1 F4 三元素精化(generate/reject 區分)/ #2 候選否決 user story(使用者問「怎麼丟否決池」)/ #3 reject vs generate 對照 / #4-5 N/A / #6 cross-ref README §Layer 12(ecc-haiku-dispatch 不變)/ #7 本行 + v1.3.0→v1.4.0 + updated 2026-06-09 / #8 F4 三元素齊。觸發:使用者「候選池技能卡為何無否決按鈕 + 相關聯 SKILL 更新」。 |
| **1.3.0** | **2026-05-28** | **軌道 α L2→L3 Evolve 推薦層落地**(ecc-emergence-evolve-hitl Story done · saas-to-skill Mode B · 8 面向全範圍驗證)。新增 §軌道 α L2→L3 Evolve 推薦層章節:(1) 落地 SSoT 4 檔案表(`ecc-evolve-detect.cjs` 純讀偵測 + emergence.ts GET endpoint + Emergence.tsx EvolveSection/HITLModal + emergence.css BEM blocks);(2) HITL 紀律 4 條絕禁線(允許純讀展示 + 字面 Skill tool 樣本 · 絕禁自動寫檔 + auto-generate-skill 類腳本 + 後端代調 Skill tool);(3) 字面 Skill tool 調用樣本(skill type → saas-to-skill Mode A · agent-hook type → hooks-mechanization 7-step);(4) Skill Cap 自檢提示(對齊 skill-creation-discipline §2 Cap 100/60/160 + §3 新建必檢 3 題);(5) FORBIDDEN F1-F4 三元素 Loophole Closure(F1 代調 Skill tool / F2 auto-generate-skill 腳本 / F3 拿掉 readonly flag / F4 HITLModal mutation endpoint);(6) 兩軌道區分強化(軌道 β SUPREME rule dispatcher vs 軌道 α evolve 推薦層 · 正交不互通)。Cross-Reference 新增軌道 α evolve 3-Story 序列(ui-core→governance→evolve-hitl)+ HITL SUPREME rules + Memory id=4447 decision source。**8 面向驗證**:#1 FORBIDDEN F1-F4 三元素 / #2 HITL user story 落地 / #3 BAD/GOOD 展示 vs auto-write 對照 / #4 references N/A / #5 troubleshooting N/A / #6 cross-ref 加 evolve-hitl Story / #7 本行 + frontmatter v1.2.2→v1.3.0 + last-synced-date 2026-05-28 / #8 三元素全齊。觸發:ecc-emergence-evolve-hitl Story CR Skill Sync Check 識別本 SKILL 需補錄(對齊 BR-ECC-EVL-07 AC7 · 自舉條款不適用 · ecc-instincts 非 pipeline 自身行為 Skill)。 |
| **1.2.2** | **2026-05-27** | **Cross-ref patch sync**(智能開發環境賦能軌 Party Mode 落地驗證 · saas-to-skill Mode B · 8 面向 #6)。ecc-haiku-dispatch 版本引用 v1.3.0→**v1.3.1**(L71 Dispatcher infra + L190 Cross-Reference)— 對齊 ecc-haiku-dispatch commit `06046064` 升版(token_cost over-claim 誠實校正)。**深掘揭露**:Grep 全 `.claude` 確認僅此 2 行 drift,`skills_list.md:111` 已是 v1.3.1 無需改;語意層 v1.3.0「tri-mode + D2 pivot」描述在 v1.3.1 仍正確,本次純版本號一致性維護。8 面向:1-5/8 N/A(schema/FORBIDDEN/code-pattern 不變)· 6 cross-ref(本次主軸)· 7 本行。故 patch bump。 |
| **1.2.1** | **2026-05-27** | **Cross-ref drift 校正**(Party Mode 復驗 Pre-Audit finding #4 · saas-to-skill Mode B · 8 面向 #6 揭露多處一併修)。(1) Cross-Reference ADR v1.5.0→**v1.8.0**(+§D2 amendment Haiku→Gemini);(2) ecc-haiku-dispatch 版本引用 v1.2.0→**v1.3.0**(L71 Dispatcher infra + Cross-Reference · Gemini tri-mode);(3) Stories 狀態 ecc-07/08/09/11/12 ready-for-dev→**全 done** + ecc-10 done。schema/FORBIDDEN/code-pattern 不變(instinct schema 凍結 14+3 欄)故 patch bump。8 面向:1-5/8 N/A(無連動)· 6 cross-ref(本次主軸)· 7 本行。 |
| **1.2.0** | **2026-05-26** | **schema 凍結 + ecc-11/12 evidence-only 定案同步**(Party Mode session · ADR-ECC-LEARNING-001 v1.5.0 §D6 · saas-to-skill Mode B)。(1) §ecc-09/11/12 既有對齊結論加 v1.2.0 FINALIZED banner — ecc-11/12 從「audit 建議」升為 **CEO 裁決定案 evidence-only · 不逐建 dispatcher.ps1**(dev-story 禁從零建);(2) State file 根目錄加**兩軌道區分**(軌道 β 本 registry vs 軌道 α `instincts` 表 · 後者 schema 2026-05-26 凍結 + D5 三欄採納分數);(3) Cross-Reference ADR v1.2.0→v1.5.0。8 面向驗證:1 FORBIDDEN 不變 / 2 ecc-11/12 行為定案 / 3 N/A / 4 references 無 / 5 N/A / 6 cross-ref ecc-haiku-dispatch 同步 v1.2.1 / 7 本行 / 8 既有 FORBIDDEN 三元素不變。觸發:使用者放行 A 案(schema 凍結 + ecc-11/12 evidence-only)。 |
| **1.1.0** | **2026-05-24** | ecc-09/11/12 dev-story 收斂 — 加 §ecc-09/11/12 既有對齊結論(7 instincts ground-truth audit 矩陣 · sonnet subagent + 主視窗驗證)。generic psm1 dispatch 已涵蓋全 10 instincts(驗證 depth_first dispatch+permanent state)· 7 instincts 觀測 5/7 既有對齊 ≥ 85% · 不逐建 dispatcher.ps1(避殭屍機制 · systematic-debugging Iron Law #3 + Kill Switch)· 真 gap = Haiku real-mode(G2 20% · IDD-STR-001 D4 Stage β 後評估)。對齊使用者不投機 + 業界不重複造輪。 |
| **1.0.0** | **2026-05-24** | 初版 scaffold 建立(Stage β P1 Track D 解鎖前置)。對齊 ecc-11/12 file_list 「`.claude/skills/ecc-instincts/SKILL.md NEW · 走 Skill(skill-builder) Mode A」。**Registry 定位**(非 dispatcher 實作 · scripts 留 dev-story TDD)。10 instincts × SUPREME rule mapping(全 10 rule + 2 既有 hook ground-truth verify 真實存在)+ 雙軌架構誠實記載 path drift(Track 1 hooks 觀測 ecc-07 100% 既有對齊 vs Track 2 dispatcher script Phase 2)+ Contract 範式引用 ecc-haiku-dispatch(不重複)+ ecc Story 對應表 dev-story scope 指引 + 3 Iron Laws(registry first / contract alignment / IDD-STR-001 4 forbidden)+ Pressure Test(Discipline level)。觸發者:CC-OPUS Stage β 深度驗證 session · skill-builder 字面調用 · skill-creation-discipline §3 3 題 PASS(Q1 無 overlap · Q2 全新 registry domain · Q3 triggers vs ecc-haiku-dispatch < 30%)。 |
