---
name: ecc-haiku-dispatch
description: >
  ECC L2 atomic instinct Haiku Agent dispatcher infrastructure — Use when
  dispatching L2 atomic instincts via Haiku Agent (claude-haiku-4-5). Forces
  IInstinctDispatcher contract first (input: instinct_name + payload, output:
  result + state_diff) before ecc-07~12 dispatch. 對齊 IDD-STR-001 D2/D3/D4
  嚴守. 觸發: instinct dispatch, Haiku Agent, dispatcher contract, L2 atomic
  instinct, ECC dispatch, 啟動 instinct, IInstinctDispatcher, atomic dispatch.
version: 1.3.2
updated: 2026-05-27
created: 2026-05-23
last-synced-epic: epic-ecc-v2
last-synced-date: 2026-05-27
last-synced-story: ecc-10-gemini-backed-dispatch-d2-amendment
author: CC-OPUS
disable-model-invocation: false
user-invocable: true
shell: powershell
watches:
  - glob: ".claude/skills/ecc-haiku-dispatch/scripts/*.ps1"
    domain: governance
  - glob: ".claude/skills/ecc-haiku-dispatch/contracts/*.json"
    domain: governance
  - glob: ".context-db/ecc-state/*.json"
    domain: governance
triggers:
  - instinct dispatch
  - Haiku Agent
  - dispatcher contract
  - L2 atomic instinct
  - ECC dispatch
  - 啟動 instinct
  - ECC Haiku
  - haiku-dispatcher
  - IInstinctDispatcher
  - atomic dispatch
---

# ECC Haiku Dispatcher Infrastructure

> ECC L2 atomic instincts dispatcher infrastructure。提供 `IInstinctDispatcher` contract,讓 10 個 L2 atomic instincts(對齊 ADR-ECC-LEARNING-001 v1.2.0 §D1 Phase 1+2)在獨立 Haiku Agent(`claude-haiku-4-5-20251001`)中執行,避免 Opus 主視窗 token 污染。
>
> **Contract First 範式**: ecc-07/08/09/11/12 instinct dispatch 實作必先讀本 Skill contract,確保 5 個 Story 對齊同一 input/output schema,避免實作後回頭改。

## When to Use

- **ecc-07/08/09/11/12 instinct dispatch dev-story 實作前** — 必先 Read `contracts/instinct-dispatch.schema.json` + `scripts/IInstinctDispatcher.psm1`
- **ecc-10 dispatcher infrastructure dev-story 階段** — 完整實作 contract + module + wrapper
- **Stage β evaluation gate (D4)** — 評估 Haiku Agent dispatch quality 時走 §Evaluation Gate 章節
- **任何 10 L2 atomic instincts 觸發場景**(skill_invocation / hook_dispatch / cross_ref / depth_first / governance / parallel_isolation / capability_integration / pipeline_handshake / mcp_payload / encoding_discipline)

## Iron Laws(3 條 · Capability Freedom Level)

### Iron Law #1: NO Instinct Dispatch WITHOUT Contract First

任何 ecc-07/08/09/11/12 instinct dispatch 實作 **必先**:
1. Read `.claude/skills/ecc-haiku-dispatch/contracts/instinct-dispatch.schema.json`(輸入 / 輸出 JSON schema)
2. Read `.claude/skills/ecc-haiku-dispatch/scripts/IInstinctDispatcher.psm1`(PowerShell module contract)
3. 確認 atomic action 對齊 contract input/output schema

→ **未做 = 違反 ADR-ECC-LEARNING-001 v1.2.0 §Story Coverage Audit Infrastructure「ecc-10 dispatcher interface contract 必先設計」**

### Iron Law #2: ONE Dispatch CALL AT A TIME(sequential · 不並行)

對齊 **IDD-STR-001 D3「不追 HyperAgents · 專注 ECC L2 atomic instincts(scope 收斂)」** + systematic-debugging Iron Law #2「ONE FIX AT A TIME」精神:
- 同 session 不允許並行 dispatch 多個 instinct
- Sequential dispatch · 每個 instinct 獨立 atomic call
- result + state_diff 寫回後才下一個 dispatch

### Iron Law #3: INDEPENDENT CHEAP-MODEL DISPATCH · NO OPUS DISPATCH

對齊 **IDD-STR-001 D2「獨立 agent · 避免 Opus 主視窗 token 污染」**(ADR-ECC-LEARNING-001 **v1.8.0 §D2 amendment**:獨立 Haiku → 獨立**便宜模型**(Gemini-backed),保留 off-Opus 核心 intent):
- dispatcher **預設走 Gemini-backed**(`gemini-dispatcher.cjs` · `PHYCOOL_DISPATCH_ENGINE=gemini`)— `claude -p` headless 新政策另計配額故改 Gemini(對齊軌道 α 湧現迴路已驗證的 Gemini REST 範式);Haiku engine 仍保留(`PHYCOOL_DISPATCH_ENGINE=haiku`)
- 主視窗(Opus 4.7)**不直接執行** instinct dispatch · 只觸發 dispatcher(獨立便宜模型 · off-Opus 不污染主視窗 token)
- Sonnet 4.6 不承載 dispatch(對齊 D2 獨立便宜模型精神 · **核心 intent 不變**,僅換底層引擎 Haiku→Gemini)

## IInstinctDispatcher Contract Schema

詳見 [`contracts/instinct-dispatch.schema.json`](contracts/instinct-dispatch.schema.json) 完整 JSON schema。

### Input

```typescript
interface InstinctDispatchInput {
  // 10 instincts (對齊 ADR-ECC-LEARNING-001 v1.2.0 §Instinct↔SUPREME Mapping)
  instinct_name:
    | 'skill_invocation' | 'hook_dispatch' | 'cross_ref' | 'depth_first'
    | 'governance' | 'parallel_isolation' | 'capability_integration'
    | 'pipeline_handshake' | 'mcp_payload' | 'encoding_discipline';
  payload: {
    trigger_context: string;          // 觸發情境描述
    file_path?: string;                // 涉及檔案路徑
    rule_reference: string;            // SUPREME rule (對齊 v1.2.0 Mapping Table)
    metadata?: Record<string, any>;    // 額外元資料
  };
  timestamp: string;                   // ISO 8601 UTC+8 (對齊 constitutional-standard)
}
```

### Output

```typescript
interface InstinctDispatchOutput {
  status: 'success' | 'failure' | 'partial';
  result: {
    action_taken: string;              // atomic action 描述
    side_effects: string[];            // monitor state files 寫入清單
  };
  state_diff: {
    state_file: string;                // .context-db/ecc-state/{instinct_name}-state.json
    before: Record<string, any>;
    after: Record<string, any>;
  };
  timestamp: string;                   // UTC+8
  evidence: {
    rule_applied: string;              // SUPREME rule name
    evidence_paths: string[];          // file:line refs / Memory id / commit hash
  };
}
```

## PowerShell Module Usage

```powershell
# 載入 IInstinctDispatcher module
Import-Module .claude/skills/ecc-haiku-dispatch/scripts/IInstinctDispatcher.psm1

# Dispatch 範例:skill_invocation atomic
$result = Invoke-InstinctDispatch -InstinctName 'skill_invocation' -Payload @{
    trigger_context = 'Edit .claude/skills/start-servers/SKILL.md'
    file_path = '.claude/skills/start-servers/SKILL.md'
    rule_reference = 'skill-tool-invocation-mandatory v1.2.0'
}

# Result schema 對齊 InstinctDispatchOutput
$result.status                        # 'success' / 'failure' / 'partial'
$result.state_diff.state_file         # .context-db/ecc-state/skill-invocation-state.json
```

## Haiku Agent 啟動範式

```powershell
# 啟動 Haiku Agent 子視窗 dispatch
& .claude/skills/ecc-haiku-dispatch/scripts/haiku-dispatcher.ps1 `
    -InstinctName 'skill_invocation' `
    -PayloadFile .context-db/ecc-state/dispatch-input.json
```

`haiku-dispatcher.ps1` 內部:
1. Read payload from JSON file
2. claude `--model claude-haiku-4-5-20251001 --append-system-prompt` 注入 contract spec
3. Haiku Agent 執行 atomic dispatch
4. 寫回 result + state_diff 至 dispatch-output.json
5. Main window read output + verify

## Dispatch Engine 範式 v2.1(tri-mode · ADR v1.8.0 §D2 amendment)

`Invoke-InstinctDispatch` 依 `PHYCOOL_DISPATCH_ENGINE` env 路由三引擎(預設 mock · 向後相容 `PHYCOOL_HAIKU_REAL=1` → haiku):

| engine | 機制 | 憑證 | 用途 |
|:--|:--|:--|:--|
| **gemini**(預設 real)| `gemini-dispatcher.cjs`(Node + Gemini REST · responseMimeType JSON)| `GEMINI_DISPATCH_API_KEYS`(**獨立 env** · 隔離湧現配額 · 最好獨立 Google project)| **D2 amendment 後預設** — 無 `-p` 配額問題 + 便宜 + off-Opus |
| **haiku** | `haiku-dispatcher.ps1` → `claude --model claude-haiku-4-5-20251001 -p` | Claude Code 登入 | 保留(⚠️ `-p` 新政策另計配額,非預設) |
| **mock** | in-process 罐頭 output | 無 | 0 token 測試 / 向後相容 |

```powershell
# Gemini-backed dispatch(D2 amendment 後預設 · 對齊軌道 α 湧現 Gemini 範式)
$env:GEMINI_DISPATCH_API_KEYS = [Environment]::GetEnvironmentVariable('GEMINI_DISPATCH_API_KEYS','User')
$env:PHYCOOL_DISPATCH_ENGINE = 'gemini'
Import-Module .claude/skills/ecc-haiku-dispatch/scripts/IInstinctDispatcher.psm1 -Force
$r = Invoke-InstinctDispatch -InstinctName 'skill_invocation' -Payload @{ trigger_context='...'; rule_reference='skill-tool-invocation-mandatory v1.2.0' }
# → gemini-dispatcher.cjs 輸出 InstinctDispatchOutput · 自動寫 state + dispatch_log(mode=gemini + latency_ms)
```

> SECURITY:key 一律讀 env(`GEMINI_DISPATCH_API_KEYS` 優先 · fallback `GEMINI_API_KEYS`),絕不寫版控。

## Stage β Evaluation Gate(D4)

對齊 **ADR-ECC-LEARNING-001 v1.2.0 §D4 evidence-based gate** · Stage β 完成至少 1 個 Epic 完整 dev-story / code-review cycle 後評估:

| 評估維度 | 目標 | Evidence Source |
|:----|:----|:----|
| success rate | ≥ 90% | dispatch_log.json 統計 |
| token cost | ≤ 50% Opus 4.7 main window 同任務 | dispatch_log.json `token_count`(2026-05-27 instrumented · gemini usageMetadata · **gemini baseline avg 493 tokens / 6 samples** · 「≤50% Opus」比較需 Opus baseline 另計) |
| latency | ≤ 5x main window | timing logs |
| accuracy | ≥ 95% rule alignment | Memory writeback verify |

**✅ G2 eval 實測(2026-05-26 · Gemini-backed dispatch · 6 instinct)**:success_rate **100%(6/6)** ≥ 90% ✅ · avg_latency **4942ms**(skill_invocation 2024 / cross_ref 5091 / depth_first 1493 / governance 3103 / mcp_payload 16363 / encoding_discipline 1579 ms)≤ 5x main window ✅ · token cost **2026-05-27 已 instrument**(usageMetadata.totalTokenCount → dispatch_log token_count · eval 報 avg;舊 6 筆無此欄 N/A · 「≤50% Opus」比較需 Opus baseline 另計 → **gemini baseline 實測 avg 493 tokens(6 samples · 2026-05-27 智能開發環境賦能軌)**;「≤50% Opus」比較仍需 Opus baseline 另計(gemini absolute ≠ Opus 比較),token informational 不 gate · 原「≪50% Opus ✅」為未實測 over-claim 已校正)· 全 6 instinct 回合法 InstinctDispatchOutput 契約 ✅。**G2「唯一真 gap」已關閉**(對齊 ADR v1.8.0 §D2 amendment · dispatch_log.json mode=gemini entries)。

未通過 → IDD-STR-001 D4 re-evaluation_trigger 觸發。

## Phase 2.1 Implementation Plan(v1.1.0 contract freeze)

> **Stage**: P2.1a(contract freeze + plan)done · P2.1b(real impl)pending
> **觸發**: Stage-β Party Mode Action ④ Pre-Audit(2026-05-23)對齊度 38%(灰色地帶)決議「升級而非從零」(per `pre-audit-mandate.md` Step 6)

### Pre-Audit 對齊矩陣(2026-05-23)

| 維度 | v1.0.0 既有 | Phase 2.1 目標 | 對齊度 |
|:----|:----|:----|:----:|
| JSON Schema Input/Output | ✅ 完整定義 | freeze v1.0 stable | **100%** |
| `Invoke-InstinctDispatch` stub | ✅ validation + INSTINCT_SUPREME_MAP 完整 | 移除 stub → real Haiku Agent 啟動 + result 寫回 | **30%** |
| `haiku-dispatcher.ps1` wrapper | ✅ 基本 wrapper(`claude --model haiku`) | integration 接 wrapper output 寫 state | **50%** |
| `.context-db/ecc-state/` directory | ❌ 0 files | 10 instinct state file templates(JSON skeleton) | **0%** |
| `dispatch_log.json` append-only log | ❌ 不存 | Stage β D4 evaluation 統計來源 | **0%** |
| E2E integration test | ❌ 不存 | 至少 1 instinct 真實走通 + schema assert | **0%** |
| SKILL.md doc | ✅ Iron Laws + Pressure Test 完整 | + 本 §Phase 2.1 Plan 章節(本次 v1.1.0) | **70%** |
| **總對齊度** | — | — | **~38%** |

### P2.1a Scope(v1.1.0 本次完成)

- ✅ JSON Schema/Contract **freeze at v1.0** stable(P2.1b 不改 schema,任何 schema change 必走 major bump v1.1.0 → v2.0.0 + ADR + cross-ref impact)
- ✅ SKILL.md v1.1.0 升版 + 補本 §Phase 2.1 Implementation Plan
- ✅ Pre-Audit 對齊矩陣公開供 P2.1b resume reference
- ✅ P2.1b 推進路徑 decompose 為 6 分項清單

### P2.1b Scope(下 session 推進,6 分項依序)

| # | 分項 | 預估規模 | Keystone? |
|:-:|:----|:--:|:--:|
| 1 | **real impl `Invoke-InstinctDispatch`** — 移除 stub,call `haiku-dispatcher.ps1` 取 output 寫 state | M | ✅ keystone(unblock 其他) |
| 2 | **`.context-db/ecc-state/` directory init** — 建目錄 + 10 instinct state file JSON templates | S | — |
| 3 | **`dispatch_log.json` append-only log** — 每次 dispatch 追加 row 供 D4 統計 success_rate/latency/token_cost | S | — |
| 4 | **wrapper output parsing** — `haiku-dispatcher.ps1` output → `InstinctDispatchOutput` contract format 對齊 | M | — |
| 5 | **integration test** — 至少 1 instinct(推薦 `skill_invocation`,本 session 已有 evidence)真實走通 E2E + assert output schema | M | — |
| 6 | **10 instinct × `INSTINCT_SUPREME_MAP` round-trip verify table** | S | — |

### Schema/Contract Freeze 宣告

`contracts/instinct-dispatch.schema.json` **v1.0 stable**(P2.1b 階段不變),對齊 **Iron Law #1 contract first** 範式。

任何 schema change 必走:
1. SKILL.md major version bump(v1.x.x → v2.0.0)
2. ADR 記錄 breaking change
3. `cross-ref-discipline.md` §3 Pre-Action Flow(impact 全範圍 grep)

### 下 session Resume Checkpoint

新 session cold-start kickoff:
1. 走 `pre-audit-mandate.md` 6 步 — Read 本 SKILL.md v1.1.0 §Phase 2.1 Plan 為起點(Step 1)
2. Glob `.claude/skills/ecc-haiku-dispatch/**`(Step 2)
3. Read 本 SKILL.md + IInstinctDispatcher.psm1 + instinct-dispatch.schema.json(Step 3)
4. 對齊矩陣 confirm(本表已提供)(Step 4)
5. 走 P2.1b 6 分項依序,real impl(分項 1)為 keystone(Step 5 升級而非從零,P2.1a contract 已凍結)
6. 走 saas-to-skill v3.3.0 Mode B 升 v1.1.0 → v1.2.0,8 面向驗證

## FORBIDDEN(5 條 · 對齊 Audit Anti-Pattern 警戒)

- ❌ **Edit / Write any instinct dispatch script without Read contract first**
  Common Rationalization: 「我知道 instinct 是什麼,直接寫 dispatch logic 不用看 contract」
  Red Flag: instinct dispatch script 寫入,但 `contracts/instinct-dispatch.schema.json` 未在本 session Read

- ❌ **Concurrent dispatch(≥ 2 instincts simultaneously)**
  Common Rationalization: 「並行加快」
  Red Flag: 同 session 多個 `Invoke-InstinctDispatch` call 無 await sequential

- ❌ **Opus 4.7 OR Sonnet 4.6 主視窗直接執行 instinct dispatch**(必獨立便宜模型承載 · off-Opus)
  Common Rationalization: 「Opus 主視窗已在跑,順便執行 dispatch 較方便」
  Red Flag: dispatch 不走 `gemini-dispatcher.cjs`(Gemini-backed 預設)或 `claude --model claude-haiku-4-5-20251001`(haiku engine),而在 Opus/Sonnet 主視窗 inline 跑 dispatch 邏輯

- ❌ **dispatch 結果不寫 state_diff 至 .context-db/ecc-state/**
  Common Rationalization: 「結果直接回傳就好」
  Red Flag: dispatcher output 缺 `state_diff.state_file` field

- ❌ **跨 instinct dispatch 結果互相 dependency 在主視窗鏈接**(避免 Opus token 污染)
  Common Rationalization: 「我 main window 整合 result」
  Red Flag: dispatch 2 input 含 dispatch 1 output → 應 Haiku Agent 內部處理 OR 跨 dispatch 走 state file

## Pressure Test(Capability Freedom Level · 必做)

### Combined Pressure Scenario(3 軸交叉)

「Stage β P1 ecc-08 dev-story 階段 + token 緊縮 + 急著推進 Multi-Story batch」:
- 時間壓力 → 跳 contract 讀取直接寫 hook_dispatch + cross_ref dispatch logic
- 路徑依賴 → ecc-07 已 done「複製改一改」誤用同範式但漏對齊 contract
- 合理化動機 →「2 instincts 合併 1 dispatch call 更高效」

→ 即使三軸全壓 **必 STOP** · 走 Iron Law #1(contract first)+ Iron Law #2(one at a time)

### Rationalization Table(對齊 saas-to-skill v3.3.0 §5.4 面向 8)

| Forbidden | Common Rationalization(verbatim from feedback memory)| Red Flag |
|:----|:----|:----|
| 跳 contract 直接寫 dispatch | 「我知道 instinct 是什麼,直接寫」 | dispatch script edit but contract not read in session |
| 並行 dispatch ≥ 2 | 「並行加快」 | 同 session 多個 `Invoke-InstinctDispatch` unawaited |
| Opus 主視窗 dispatch | 「Opus 已在跑,順便 dispatch」 | claude command 缺 `--model haiku` |
| 結果不寫 state_diff | 「結果回傳就好」 | output schema 缺 `state_diff` field |
| 跨 instinct dependency 主視窗鏈接 | 「main 整合更方便」 | dispatch 2 input 含 dispatch 1 output |

### Red Flags(可偵測訊號)

- output 含「probably」/「likely」/「應該」→ 未驗證 contract alignment
- dispatch script 直接 propose code 不附 schema reference
- 3+ dispatch 失敗後 output 仍含「one more attempt」→ 必走 systematic-debugging Iron Law #3 質疑架構

## Cross-Reference

- **ADR**: `docs/technical-decisions/ADR-ECC-LEARNING-001-epic-ecc-v2-ceo-signoff.md` v1.8.0(§Instinct↔SUPREME Mapping + §Story Coverage Audit + §D5 採納分數 + §D6 schema 凍結 + ecc-11/12 evidence-only + **§D2 amendment Gemini-backed dispatch** + v1.7.0 驗證複核)
- **IDD**: `IDD-STR-001` critical(intentional_decisions table · D2+D3+D4 嚴守)
- **Stories**: ecc-10 **done**(dispatcher infra · gemini-dispatcher.cjs Gemini-backed)· **ecc-07/08/09/11/12 done**(evidence-only · 2026-05-26 Story 收斂 · 觀測層既有對齊 60-95% · 不逐建 dispatcher.ps1)· **G2 Haiku real eval 已關閉**(2026-05-26 Gemini-backed 6/6 100% · avg 4942ms · ADR v1.8.0 §D2)
- **Related Skills**: `phycool-context-memory` v2.8.0 + `hooks-mechanization` v1.0.0 + `phycool-mcp-discipline` v1.0.0 + `phycool-windows-ps-encoding` v1.0.0

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.3.2** | **2026-05-27** | **gemini token baseline 實測補完**(智能開發環境賦能軌 Party Mode · 使用者裁定 GEMINI_API_KEYS fallback · saas-to-skill Mode B)。承 v1.3.1 instrumented-pending-baseline → 跑 6 筆 gemini dispatch(`gemini-dispatcher.cjs:32` fallback · 外部 API 6 次)→ dispatch_log 6 筆帶 token_count(510/502/474/484/505/481)→ **eval token_cost 從 N/A → avg 493 tokens(6 samples)**。§D4 表 + L189 補 gemini baseline 數字。D4 gate 仍 **PASS**(success_rate 92.3% [12/13 · 新增 skill_invocation 1 failure 如實反映,非粉飾] · latency avg 3779ms)。**仍 deferred**:「≤50% Opus」比較需 Opus baseline(gemini absolute 493 ≠ Opus 比較)。8 面向:1-5/8 N/A · 6 skills_list 同步 ✅ · 7 本行 ✅。contract schema 不變故 patch。 |
| **1.3.1** | **2026-05-27** | **token_cost over-claim 誠實校正**(token_cost 缺陷補全 commit 08807477 後 · saas-to-skill Mode B)。§D4 原「token cost Gemini 免費層 ≪ 50% Opus ✅」為**未實測 over-claim** → 改 **instrumented-pending-baseline**(2026-05-27 已 instrument usageMetadata.totalTokenCount → dispatch_log token_count · eval 報 avg;舊 6 筆無此欄 N/A;「≤50% Opus」比較需 Opus baseline 另計,token informational 不 gate)+ L185 Evidence Source「token tracking」→「dispatch_log.json token_count」。success_rate/latency 數據不變 · contract schema 不變故 patch。8 面向:2 eval gate 行為誠實化 ✅ / 6 skills_list 同步 ✅ / 7 本行 ✅;餘 N/A。 |
| **1.3.0** | **2026-05-26** | **§D2 amendment Gemini-backed dispatch engine + G2 gap 關閉**(ADR-ECC-LEARNING-001 v1.8.0 · `Skill(saas-to-skill)` Mode B)。dispatch 引擎 `claude -p` Haiku → **Gemini-backed**(`-p` 新政策另計配額 + GT710 本地 LLM 不可靠 · 2026-05-24 對話 turn 31779 + party-to-pipeline 02-principles.md:149「no -p」)。同步:(1) Iron Law #3「HAIKU AGENT ONLY」→「INDEPENDENT CHEAP-MODEL (Gemini-backed default)」保留 off-Opus intent;(2) 新增 §Dispatch Engine tri-mode 範式(gemini-dispatcher.cjs + GEMINI_DISPATCH_API_KEYS 獨立 env + PHYCOOL_DISPATCH_ENGINE);(3) §D4 填 G2 eval 實測 success_rate 100%(6/6)/ avg_latency 4942ms → **G2 唯一真 gap 關閉**;(4) FORBIDDEN #3 Red Flag amend(gemini-dispatcher.cjs / --model haiku · 非 Opus inline);(5) Cross-ref ADR v1.5.0→v1.8.0 + Stories 收斂 done。實作:gemini-dispatcher.cjs(9/9 test)+ IInstinctDispatcher.psm1 tri-mode 路由。**contract schema 不變**(InstinctDispatchOutput 同)故非 major bump。8 面向:1 Iron Law #3+FORBIDDEN #3 ✅ / 2 Gemini 範式+D4 ✅ / 3 N/A / 4 N/A / 5 N/A / 6 ADR cross-ref ✅ / 7 本行 ✅ / 8 FORBIDDEN 三元素保留 ✅。 |
| **1.2.1** | **2026-05-26** | **Cross-Reference 同步 schema 凍結 + ecc-11/12 evidence-only**(Party Mode session · ADR-ECC-LEARNING-001 v1.5.0 §D6 · saas-to-skill Mode B)。(1) ADR 引用 v1.2.0→v1.5.0(補 §D5 採納分數 + §D6 schema 凍結);(2) Stories 狀態更新:ecc-10 done / ecc-07~09 ready-for-dev / **ecc-11/12 evidence-only**(不逐建 dispatcher.ps1 · 真 gap=G2 Haiku real eval)。8 面向驗證:1-5 N/A(無 FORBIDDEN/行為/pattern/references/troubleshooting 變更) / 6 cross-ref ecc-instincts v1.2.0 同步 / 7 本行 / 8 既有 FORBIDDEN 三元素不變。Contract schema 不變(仍 v1.0 stable · 非 schema change 故不觸發 major bump)。觸發:使用者放行 A 案 schema 凍結。 |
| **1.2.0** | **2026-05-23** | **Phase 2.1b 分項 1 keystone real impl 落地**(Stage-β Party Mode Final Single Plan C1)。**Mock + Real 雙模架構**(env var `PHYCOOL_HAIKU_REAL=1` 啟用 real subprocess · default mock 保持 v1.0/v1.1 stub 向後相容)。改造範圍:(1)IInstinctDispatcher.psm1 加 4 helper functions(Invoke-MockHaikuDispatch / Invoke-RealHaikuDispatch / Update-InstinctStateFile / Append-DispatchLog)· Invoke-InstinctDispatch 改為 conditional dispatch + 自動 state update + log append;(2)haiku-dispatcher.ps1 line 75-117 scaffold 改為 conditional branch · real mode spawn `claude --model claude-haiku-4-5-20251001 --dangerously-skip-permissions -p --append-system-prompt {contract}` subprocess · JSON output parse + markdown wrapper strip + fail-safe failure status;(3)Export-ModuleMember 加 4 new functions for testing + composition。真實 round-trip test PASS:mock dispatch · state_file update(dispatch_count=1 + partial_count=1 + history 1 entry) · dispatch_log append(mode=mock)。**Cost 透明**:default mock 0 token · real opt-in 估 50-200 token/dispatch(user 控制)。**對齊 P2.1b 分項 1+2+3+5**(real impl + state file + log + integration test 部分 covered by round-trip)。剩餘分項 4(wrapper output parsing)+ 6(10 instinct round-trip verify · 已由 verify-ecc-instinct-mapping.cjs cover)留下 session refine。Skill 路由:saas-to-skill v3.3.0 Mode B 5.3 步驟 4-6 + 8 面向驗證(1 不變 / 2 加 dual-mode / 3 mock vs real BAD/GOOD / 4 N/A / 5 troubleshooting 待加 / 6 cross-ref haiku-dispatcher.ps1 一致 / 7 更新 / 8 三元素 v1.0 已含)。 |
| **1.1.0** | **2026-05-23** | **Phase 2.1a contract freeze + plan**(Stage-β Party Mode Action ④ P1)。觸發:Pre-Audit(per `pre-audit-mandate.md` SUPREME)識別 v1.0.0 為「contract scaffold + stub impl」,對齊度 38%(灰色地帶)。決議走 Step 5 升級路徑而非 Step 6 從零。本次 v1.1.0 完成:(1)Schema/Contract freeze at v1.0 stable(P2.1b 不變,任何 schema change 必 major bump v2.0.0 + ADR + cross-ref impact);(2)新增 §Phase 2.1 Implementation Plan 章節(對齊矩陣 + P2.1a/P2.1b scope + 6 分項依序 + 下 session Resume Checkpoint);(3)last-synced-story 升 ecc-10-phase-2-1a。P2.1b 6 分項(real impl `Invoke-InstinctDispatch` 為 keystone + ecc-state directory + dispatch_log + wrapper output parsing + E2E test + 10 instinct round-trip)留下 session 推進。Skill 路由:saas-to-skill v3.3.0 Mode B 5.3 步驟 4-6 + 8 面向驗證 PASS(1 不變 / 2 加章節 / 3 N/A / 4 N/A / 5 N/A / 6 不變 / 7 更新 / 8 三元素 v1.0 已含)。 |
| 1.0.0 | 2026-05-23 | 初版建立。對齊 ecc-10 Story stub implementation_approach Phase 1 PRIORITY(Haiku Agent dispatcher interface contract first)。IInstinctDispatcher contract(input + output)+ JSON schema + PowerShell module(`IInstinctDispatcher.psm1`)+ Haiku Agent wrapper(`haiku-dispatcher.ps1`)+ Pressure Test(3 Iron Laws + Combined 3 軸 + Rationalization Table)。Self-Contained Capability Skill(Freedom Level 中高)。對齊 IDD-STR-001 4 forbidden_changes 嚴守(D2 獨立 Haiku · D3 不追 HyperAgents · 禁 Opus 承載 · 非 production 化)。對齊 skill-creation-discipline §3 新建必檢 3 題 PASS。觸發者: CC-OPUS Stage β P0.6 Coverage Rescue 後 ecc-10 dev-story workflow Phase 1 contract first 設計。 |
