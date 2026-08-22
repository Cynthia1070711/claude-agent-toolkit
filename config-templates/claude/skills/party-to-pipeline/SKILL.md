---
name: party-to-pipeline
description: >
  Use when 開子視窗執行任務 / Party Mode 討論轉 pipeline / Story stub 直接委派(Skip Mode)
  / 非 Story 通用任務(批次校正/文檔等)中控時。
  Mode C 通用任務主視窗直控:dispatch-general + worker-general 子視窗,不走 BMAD,
  model presets 見 pipeline-config.json,effort max;
  視窗永不自動關閉,關窗走 close-worker.ps1;V1-V5 審查 + pathspec commit。
  Mode A(Party 討論)/ B(stub 直派)三階段同走 dispatch -Phase 薄手直連(E2 預設);
  握手閉環 DB 版:reported→ack→gate→close-worker(E1 orchestrator 已 FROZEN)。
  worktree opt-in 並行隔離(-Worktree)。
  觸發詞: 子視窗, 通用任務, Mode C, dispatch-general, worktree, 主線副線, 握手閉環
version: 5.24.1
updated: 2026-08-03
triggers:
  - Party Mode
  - backlog framework
  - Skip Mode
  - Pipeline dogfood
  - stub 直接委派
  - orchestrator
  - ACK handshake
  - worker-create
  - worker-dev
  - worker-review
  - 主線副線
  - task_track
  - general task
  - 通用任務
  - Mode C
  - dispatch-general
  - worker-general
  - worktree
  - 並行隔離
  - requires_worktree
  - pipeline-guardian
  - ensure-guardian
  - guardian daemon
  - 守護常駐
  - 握手閉環
  - worker_runs
  - close-worker
  - ack_worker_run
author: CC-OPUS
created: 2026-03-11
last-synced-epic: epic-ccb
last-synced-date: 2026-08-03
watches:
  - glob: ".claude/skills/party-to-pipeline/scripts/*.ps1"
    domain: orchestrator
  - glob: ".claude/skills/party-to-pipeline/scripts/*.md"
    domain: orchestrator
  - glob: "scripts/pipeline-config.json"
    domain: orchestrator
  - glob: ".claude/rules/pipeline-handshake-protocol.md"
    domain: orchestrator
---

# Party-to-Pipeline — Self-Contained Orchestrator Skill

> **觸發**: 任何需要討論後建立 Story (Mode A) / 已有 backlog stub 直接委派 (Mode B) 的場景
> **目的**: Mode A 強制 Party Mode 多 Agent 收斂; Mode B 跳過討論直接委派 Pipeline
> **版本資訊**: 詳見 frontmatter `version` 與文末 Version History (避免雙版本號 drift)
> **中控行為紀律邊界**: 本 skill 管機制(scripts / 模式 / 參數 / IPC 契約);中控「何時判執行載體 / 派發序列決策 / GATE 證據判讀 / commit 波時機 / 凍結窗協調 / 異常決策樹」等行為判準見 `multi-track-orchestration` skill(SOP-1~7,Discipline 型),兩者互補不重複。

> **本檔為 L2 索引** (≤500 lines per saas-to-skill SOP)。詳細規範按需 Read references/:
> - [architecture-and-scripts.md](references/architecture-and-scripts.md) — Self-Contained 7 scripts + 流程圖 + 詳細規範 + 與其他 Skill 關係
> - **[ack-handshake.md](references/ack-handshake.md) — (v5.24.0 全面改寫)Handshake 閉環(DB 版):lifecycle 狀態機 + 全閉環流程圖 + 中控節點手冊(preflight/GATE/ack/gate/close-worker)+ revise 三通道 + 通知面矩陣 + E1 FROZEN 判定**
> - [main-side-track.md](references/main-side-track.md) — 主線 (SaaS) / 副線 (toolkit) 分流範式
> - [integration-and-routing.md](references/integration-and-routing.md) — Capability Integration + Model Routing + 既有規範整合
> - [orchestrator-awareness.md](references/orchestrator-awareness.md) — 5 軸環境感知 + 中控視角 + 狀態機 + Effort 機制 + 動態排程
> - **[main-controlled-mode.md](references/main-controlled-mode.md) — (v5.2.0 NEW) E2 主對話中控模式(新預設首要) + 三層任務語意(✅✅/✅/⬜) + review 後 3 情境分析(A/B/C) + 抽樣 3 項驗證 + worker Chrome 沙盒指示 + (v5.6.0)§4.5 worker 活動探測 30/10/10 停滯判別**
> - **[general-task-mode.md](references/general-task-mode.md) — (v5.3.0 NEW) Mode C 通用任務模式(非 Story · 主視窗直控無 orchestrator)+ dispatch-general/worker-general + G0-G5 中控迴圈 + V1-V5 審查 + model presets**
> - **[worktree-parallel-mode.md](references/worktree-parallel-mode.md) — (v5.5.0 NEW) worktree opt-in 並行隔離(ADR-AIOS-004 W2 · 非全面 W3)+ commit 異常三層(L1/L2/L3)+ main-pinned 鐵律 + dispatch -Worktree 雙根 + 三情境 + 強化優先序;預設 off,全面啟用待解凍 gate**

---

## 核心原則

1. **討論優先 / 直接委派 二擇一**。預設 Mode A (Party Mode 多 Agent 討論);Mode B 適用 stub 已建場景。
2. **主控端只做決策,不做深度分析**。完整 codebase scan、skills match、tasks 細化由子視窗負責。
3. **Party Mode 產出決策,Pipeline 產出完整 Story**。Mode B 從 stub 雛形直接展開到完整 Story。
4. **(v4.0.0) Self-Contained Orchestrator**: 本 Skill 自帶一組 self-contained scripts(核心 7:orchestrator + 3 worker + shared-utils + stop-report + protocol-template;後續擴充含 dispatch-general / smoke-test / guardian 常駐雙件 / dispatch 前置 / worker_runs 登記 / **close-worker.ps1(v5.18.0,whp-6,中控唯一程式化關窗途徑)** / **慢環敲門三件 console-knock.ps1 + knock-worker.ps1(v5.21.0,whp-12)+ knock-controller.ps1(v5.22.0,ccb-4)**),Pipeline 啟動由本 Skill 直接驅動。詳 [architecture-and-scripts.md](references/architecture-and-scripts.md)。
5. **(v5.24.0 全面改版,取代 v4.0.0 檔案式 ACK)Handshake 閉環(DB 版)**: 握手鏈以 `worker_runs.lifecycle` 為 SSoT — `dispatching → running ⇄ revising →(worker Stop hook)reported →(中控 ack_worker_run 簽收)awaiting-review →(中控 gate_worker_run 裁決 approved/revise/rejected)→ approved →(中控 close-worker.ps1 關窗,CAS 終態先於 taskkill)→ closed`。worker 完成通知走 `worker-notify-inject.js`(中控下次 prompt 注入);guardian 常駐觀測零 kill;revise 走 D2 快環 / 慢環敲門於**原視窗**續作。完整 SOP 見 [ack-handshake.md](references/ack-handshake.md)。舊檔案式 ACK(evidence/ack 三檔 + 倒數自關 + 三重 confirm)僅存 E1,已隨 E1 一併 🔒 FROZEN(2026-08-03)。
6. **(v4.0.0) 主線 / 副線分流**: DB stories.task_track ENUM('main','side'),worker scripts 內 switch 不同 prompt 範式。詳 [main-side-track.md](references/main-side-track.md)。
7. **雙模式選擇**: Mode A (Party Mode) for 新需求 / Bug / 架構討論;Mode B (Skip Mode) for stub 已建場景。
8. **Mode B 適用 4 條件**: (a) status=backlog (b) 4 核心欄位非 NULL (c) Memory 雛形 (若有) (d) 不需重新架構決策。任一缺失 → fallback Mode A。
9. **(v5.2.0) Phase 4 執行控制維度(與 Mode A/B 任務來源維度正交)**: **E2 Main-Controlled(主對話中控 · 預設首要)** = 主對話親自當中控,逐階段 `dispatch-general.ps1 -StoryId X -Phase {phase}` 薄手直連單 worker(v5.4.0;原 orchestrator -Skip 單階段殼退場,tracker 142/143 killed 實證其 ACK 關窗為死碼)+ 每階段驗證回填證據(任務開始/結束時間 + tasks + status)+ 階段間 commit clean tree + 三階段全完成抽樣 3 項 file:line 驗證 → commit。**E1 Orchestrator-Controlled(黑箱)已 🔒 FROZEN(2026-08-03)— 其檔案式 ACK 收尾鏈在 whp-2 後每階段必然 force-kill(orchestrator.ps1:325-329),牴觸「只通知不殺」硬裁定;批次需求改 E2 逐卡序列,詳 [ack-handshake.md §8](references/ack-handshake.md)**。**(2026-08-01 whp-2 現行行為 · 取代 v5.6.0/v5.12.0/v5.13.0 舊版設計)** 薄手(`dispatch-general.ps1`)終止條件為**有界確認即退出**(`dispatchConfirmSec` 預設 60s:見到 `claude.exe` 子行程,或逾時但 wrapper PID 存活即退出並印摘要)— 不再進入任何等待迴圈(舊版 signal-driven adaptive wait 已全數封存)。**薄手不等之後「中控自己該做什麼」見 [main-controlled-mode.md](references/main-controlled-mode.md) §4.6**(v5.23.0 新增三條等待紀律:① dispatch 後不空等,通知走 `worker-notify-inject.js` 於下次 prompt 注入 ② 序列依賴且無其他可推進項時,結束 turn 前**必掛** `Monitor` + `persistent`(v5.24.1 由例外升級 MUST),終止條件須同時涵蓋完成與異常 ③ 禁以 Bash `run_in_background` 開長迴圈等 worker)。**worker 停滯判別已全數移交 `pipeline-guardian.ps1` 常駐守護**執行(30/10/10 per-run 檔案活動探測,連續 2 輪零變動只寫 `health_flag='stalled-suspect'`,**guardian 零 kill**,中控三選一裁決:續等/喚醒/重派;詳見下方 #12 + [worker-lifecycle-judgment.md](../../rules/worker-lifecycle-judgment.md))。**worker 視窗生命週期**:4 支 worker 的 close watchdog(原「自關」機制)與自殺收尾已全數退場,**視窗永不自動關閉**,關窗僅限使用者手動(`whp-6` 落地前無任何程式化管道)。舊版三段技術演進歷史(30/10/10 檔案活動探測建立 / signal-driven adaptive wait / worker 自關 watchdog PPID-scoped 精確化)保留於 Version History,不再是現行行為。
10. **(v5.3.0) Mode C 通用任務(第三任務來源維度)**: 非 Story 一般任務(批次校正/文檔工程/環境配置/腳本雜項)走**主視窗直控** — dispatch-general.ps1 薄手直接對接 worker-general.ps1(無 orchestrator、無 ACK、不走 BMAD workflow),model presets(現行預設 + legacy 別名一律見 `pipeline-config.json generalTask.presets` SSoT,不剝 `[1m]`)+ effort max 固定 + ultrathink 注入,主視窗親自審查 V1-V5 + pathspec commit + 嚴格序列推進。SaaS production 功能 code 禁用(F14)。**v5.4.0 起同一薄手以 `-Phase` 服務 Story 三階段(1 腦 + 1 手 + 4 worker)**。**(2026-07-25)`pipeline-config.json` 為本 skill 唯一 model 版本權威來源 —— SKILL.md / references/ 一律用「角色語言」(現行 Opus/Sonnet/Fable 分層)指向 SSoT,不重述字面版本字串,避免每次 Anthropic 更名需逐檔同步。**詳 [general-task-mode.md](references/general-task-mode.md)。
11. **(v5.5.0) worktree opt-in 並行隔離(執行控制可選增強)**: 高衝突風險批次可 `dispatch-general.ps1 -Worktree` 啟用 git 物理隔離(**per-dispatch opt-in · 預設不帶 = 現行行為完全不變**)。commit 異常分三層 — **L1** worker index race(worktree 物理根治)/ **L2** 中控 merge race(序列化 + `--ff-only`,無銀彈)/ **L3** 語意衝突(任務切分,worktree 不解)。鐵律 **控制平面 main-pinned · 執行平面 worktree-local**。定位 opt-in 互補(`ADR-AIOS-004` W2,**非全面 W3**);scripts 層 PoC 已落地,正式全面啟用待解凍 gate(ECC + m0-4)。詳 [worktree-parallel-mode.md](references/worktree-parallel-mode.md)。
12. **(v5.15.0,2026-08-01 whp-2 起為子視窗自動關閉的唯一觀測層)集中式無狀態守護 `pipeline-guardian.ps1`**: 住在所有子視窗**外面**的常駐單例(唯一互斥機制 = 全生命週期持有 `logs/pipeline-guardian.lock` file handle,非 `guardian_pid` 存活性 CAS,防 PID 重用永久否決自癒)。雙節奏 tick(快 30s 存活偵測 + 首次通知 / 慢 600s 30/10/10 停滯偵測 + 逾期催辦)持續回答「視窗還在不在 / 回報有沒有人收 / 有沒有卡住」三問題並寫回 `worker_runs`。**鐵則:零行程終止原語、絕不關窗、絕不派發**(使用者硬裁定 ③)——只回報只提醒,kill 與關窗永遠是人的決策。`ensure-guardian.ps1` 每次 dispatch 呼叫即可(冪等,恆 exit 0,非關鍵路徑不擋派發;存活判定為**雙判準** —— pid 檔 + CommandLine 比對,pid 檔失效時再以行程掃描複驗並回寫,防 stale pid 檔把自癒退化成每次 dispatch 空轉 spawn)。判定邏輯(26 條 BR)全在純函式 `.context-db/scripts/guardian-tick.js`(**64 tests**)。**(v5.16.0)`Ensure-Guardian` 已接線** — `register-run.ps1 -Mode Register`(`whp-4-write-path-wiring`)於 INSERT `worker_runs` 列後呼叫,fail-open(非零 exit 不中止派發)。詳 [architecture-and-scripts.md](references/architecture-and-scripts.md)。

---

## Mode 雙模式選擇

### Phase 0: Mode Detection (主控端入口)

```
1. 解析使用者輸入是否提及 Story ID
   ├─ 有 Story ID → 查 DB:search_stories({story_id, include_details:true})
   │   ├─ status=backlog AND 4 條件全滿足 → Mode B 候選
   │   ├─ status=backlog 但欄位缺失 → fallback Mode A 補完
   │   └─ 其他 status (in-progress/review/done) → 不適用
   └─ 無 Story ID → 預設 Mode A
       └─ 例外: 任務屬「非 Story 通用任務」(批次校正/文檔/環境/腳本,不需 AC/Story 治理)
          → Mode C 主視窗直控(詳 references/general-task-mode.md §1 分界矩陣)
```

### 4 條件驗證 (Mode B 必滿足)

| # | 條件 | 驗證方式 |
|:-:|:----|:----|
| 1 | Story DB 已存在,status=backlog | `search_stories({story_id})` |
| 2 | ≥ 4 核心欄位非 NULL | user_story / background / priority / complexity |
| 3 | (若有) Memory 雛形 | `search_context({query, category:"backlog"})` |
| 4 | 不需要重新架構決策 | 使用者明示或前 Phase done 已含決策 |

### Mode 偵測 Quick Reference

| 場景 | 推薦 Mode | 原因 |
|------|:--------:|------|
| 新需求 / Bug 首次出現 | Mode A | 需要討論收斂 |
| Memory 雛形展開為 Story | Mode B | 雛形已含決策 |
| Phase N → N+1 推進 | Mode B | 整體 scope 已規劃 |
| CR follow-up Story | Mode B | 父 Story 已決策 |
| 架構重構討論 | Mode A | 多角度收斂 |
| dogfood Pipeline 自身 | Mode B | 驗收既有架構 |
| 非 Story 通用任務(批次校正/文檔/環境/腳本) | **Mode C** | 不需 Story 儀式;主視窗直控,詳 [general-task-mode.md](references/general-task-mode.md) |

---

## Phase 1-4 流程概述

```
主控端 (Opus 主對話視窗)
  │
  ├─ Phase 0: Mode Detection (上節)
  │
  ├═══ Mode A (Party Mode 預設) ═══════════════════
  │  Phase 1: /bmad:core:workflows:party-mode → 多 Agent 討論收斂
  │      允許: 讀 2-3 個關鍵檔案, AC 草案 G/W/T 大方向, 高層架構討論
  │      結束: *exit / end party / quit / 共識達成建 Story
  │  Phase 2: 建立 Story 框架 (DB upsert status=backlog + task_track)
  │  Phase 3: 使用者確認框架
  │
  ├═══ Mode B (Skip Mode) ════════════════════════
  │  (跳過 Phase 1-3 — stub 已建)
  │
  ├═══ Mode C (General Task · v5.3.0) ═════════════
  │  (非 Story 通用任務 — 不走 Phase 1-4 / 不走 BMAD workflow / 不用 orchestrator)
  │  主視窗直控:dispatch-general.ps1 (run_in_background) → worker-general.ps1 子視窗
  │  G0 規劃 → G1 派發 → G2 通知 → G3 審查 V1-V5 → G4 pathspec commit → G5 下一任務
  │  → 完整 SOP 見 [general-task-mode.md](references/general-task-mode.md)
  │
  └─ Phase 4 執行(E2 預設 · v5.4.0 薄手直連): 主視窗逐階段
      → dispatch-general.ps1 -StoryId {id} -Phase create-story|dev-story|code-review
      → 每階段間主視窗親自驗證 + commit(詳 [main-controlled-mode.md](references/main-controlled-mode.md))
      每階段握手閉環: preflight 五檢查 → dispatch → reported → ack → gate → close-worker → commit
      (詳 [ack-handshake.md](references/ack-handshake.md);
       E1 批次黑箱 orchestrator.ps1 已 🔒 FROZEN 2026-08-03 — 檔案式 ACK 必然 force-kill,
       批次需求改 E2 逐卡序列,詳 [ack-handshake.md §8](references/ack-handshake.md))
```

### Phase 2 必填欄位 (含 v4.0.0 task_track)

| 欄位 | 來源 | 說明 |
|------|------|------|
| `story_id` / `epic_id` / `title` | 討論中確定 | 基本識別 |
| `status` | **固定 `backlog`** | 觸發 pipeline create-story |
| `task_track` | **(v4.0.0) 必填** | `main` (SaaS 業務) / `side` (toolkit/環境) |
| `priority` / `complexity` / `story_type` | 討論中確定 | P0-P3 / S-XL / Feature/Enhancement/Bug Fix |
| `user_story` / `background` / `acceptance_criteria` / `dependencies` / `domain` | Party Mode 決策 | AC 草案,create-story 補完整 BR |

### Phase 2-4 禁止項

- ❌ 完整 codebase scan (Glob/Grep/Read 大量檔案) / Skills 比對 / Knowledge Base 掃描
- ❌ Tasks/Subtasks 細化 / 技術債 registry pull / 文檔影響偵測
- ❌ 完整 ATDD BR-XXX 映射(草案即可,create-story 補全)

---

## XS/S Fast Path

> 微任務 (XS/S,零爆炸半徑) 跳過 Party Mode + Pipeline,直接 `/bmad:bmm:workflows:quick-dev` oneshot。

| 條件 | 範例 |
|------|------|
| Config 修改 | appsettings.json / yaml 配置 |
| Typo 修正 | 文檔 / code 錯字 |
| 文檔更新 | README / SKILL.md / 追蹤文檔 |
| 單檔案無副作用 | 無跨元件 import/export 影響 |

---

## 適用 / 不適用場景

### Mode A (Party Mode)
- ✅ 功能需求討論 / Bug 分析 / 架構重構討論

### Mode B (Skip Mode)
- ✅ Memory 雛形展開為 Story / Phase N → N+1 推進 / CR follow-up Story / dogfood Pipeline 自身

### Mode C (General Task · v5.3.0)
- ✅ 批次校正 / 文檔工程 / 環境配置 / 腳本雜項(量大同質、不需 Story 儀式、需隔離 context + 中控品管)
- ❌ SaaS production 功能 code(F14,必走 Mode A/B)

### 其他
- ✅ XS/S 微任務 → Fast Path / 批次 Bug Fix → 動態排程 (詳 [orchestrator-awareness.md §動態排程](references/orchestrator-awareness.md))

### 不適用
- ❌ 已有完整 .md Story 的 Epic (使用原版 `claude-launcher`,非 -interactive 版)

---

## FORBIDDEN (v4.0.0)

| # | 禁止 | 原因 |
|:-:|:-----|:----|
| F1 | orchestrator.ps1 內部呼叫 claude-launcher-interactive | v4.0.0 self-contained,完全獨立 |
| F2 | 跳過 Stop hook IPC status 寫入,改用 DB-only 偽完成判斷 | 違反 ACK handshake,失去 evidence-based 驗證 |
| F3 | **(v5.24.0 改寫)** 中控跳過 `ack_worker_run` / `gate_worker_run` 握手鏈,以「DB status 已達標」即視為完成直接關窗或推進下一階段 | 失去 `reported → awaiting-review → approved` 證據鏈;close-worker C2 五項前置會拒、preflight `PREV_PHASE_CLOSED` 會 BLOCK(原條文「worker 跳過 wait ack」隨 Wait-AckFile 於 v5.4.0 移除而失效)|
| F4 | **(v5.24.0 改寫)** 以 `close-worker.ps1` 以外途徑程式化關窗(`Stop-WorkerSafe` / `taskkill` / `Stop-Process` 直呼)| `worker-kill-guard.js` 對 `lifecycle∈{running,revising}` hard-block;使用者硬裁定「只通知不殺」(原條文三重 confirm 隨 E1 FROZEN 轉歷史)|
| F5 | 子視窗 agent 主動寫 IPC status 檔或自行推進 `worker_runs.lifecycle` | Stop hook 專管(D2 命中亦不推進,rule F16);agent 介入會雙寫衝突 / 偽造 turn 結束 |
| F6 | 直接修改 IPC dir 內檔案 (子視窗) | IPC artifacts 由 wrapper / Stop hook 管理 |
| F7 | task_track 欄位 NULL 時假設 main (跳過 fallback) | DB-first SSoT,NULL 應視為 schema 不一致警告 |
| F8 | **(v5.24.0 改寫)** 重試 / 重派前不清前次 IPC 殘留,或未過 preflight `NON_TERMINAL_RUN` 檢查(`revising` 重派僅限 `-Resume` + 原視窗 4-Tuple 判死的 `REVISE_REVIVE` 窄後門)| 殘留 status 檔誤判 + 同 story 雙視窗並行 |
| F9 | settings.json Stop hook 順位錯位 (stop-report.ps1 不在第 2 位) | 順位影響 evidence 蒐集完整性 |
| F10 | 子視窗詢問 user 任何問題 (違反 YOLO) | user 不在子視窗 |
| F11 | 跳過 `/tasks-backfill-verify` (dev-story / code-review) | 中控 ack 驗證會 reject |
| F12 | code-review 階段跳過 Skill Sync Check + `Skill(skill="saas-to-skill")` Mode B | 違反 skill-tool-invocation-mandatory.md SUPREME |
| **F13** | **並行 dispatch 多個 orchestrator 子視窗時相鄰間隔 < 10 秒 (SPAWN_DELAY 違規)** | **Anthropic API bot detection 觸發 ban 風險** — 對齊 aios-scheduler SUPREME。詳 [orchestrator-awareness.md §SPAWN_DELAY](references/orchestrator-awareness.md). 2026-05-11 違規 id=4072 |
| **F14** | **(v5.3.0) Mode C 用於 SaaS production 功能 code(需 AC/測試/CR 的業務功能)** | **繞過 Story 治理** — 必走 Mode A/B + Story lifecycle。Mode C 限批次校正/文檔/環境/腳本(詳 [general-task-mode.md §1](references/general-task-mode.md)) |
| **F15** | **(v5.3.0) Mode C worker 執行 git commit/push;或主視窗 commit 不帶 pathspec** | 多軌並行 git index 污染(2026-06-03 實證)— 中控統一 `git commit -- <路徑>`;worker 側 F2 + 主視窗側 FC3 雙層禁令 |
| **F16** | **(v5.10.0) 敘述性內容(非可執行 usage 範例)直接硬編字面版本 model 字串(如「Opus 5」、`` `claude-opus-5[1m]` ``),未採「角色語言 + SSoT 指標」** | 下次 Anthropic 更名時需逐檔同步改寫,重蹈 v5.9.0 十檔手動修復成本(Party Mode 冪等性分析裁示)。唯一權威來源為 `pipeline-config.json`;新增/修改前跑 `node scripts/audit-model-string-drift.cjs` 自我檢查(advisory,不 BLOCK) |

---

## 常見錯誤與修正

| 錯誤 | 後果 | 修正 |
|------|------|------|
| 跳過 Party Mode 直接建 Story | 缺少多角度驗證 | Phase 1 強制 `/bmad:core:workflows:party-mode` |
| upsert 設 `status: ready-for-dev` | pipeline 跳過 create-story | 必須設 `status: backlog` |
| 主控端跑完整 create-story workflow | context 浪費 | 只建框架,深度分析交給子視窗 |
| AC 含完整 BR-XXX 映射 | 主控多花 context | 草案即可,create-story 補全 |
| 主控 Glob/Grep 大量搜尋 | context 膨脹 | 限 2-3 個關鍵檔案確認現狀 |
| **(v5.24.0)** 還派發 E1 `orchestrator.ps1`(或更舊 story-pipeline-interactive.ps1)| E1 檔案式 ACK 已 FROZEN — worker 不讀 ack 不自關,每階段必然 force-kill | 改 `dispatch-general.ps1 -StoryId X -Phase {phase}` 薄手直連(E2)|
| **(v4.0.0)** task_track 沒填 / 沒區分主副線 | worker 用錯 prompt 範式 | DB upsert 必填 task_track |

---

## Self-Check (主控端每次 Phase 4 dispatch 前必自問 5 題 · v5.24.0 改為 E2 版)

1. **Story DB 是否已 upsert + status 符合該 phase 前置 + task_track 已填?**(preflight `STORY_STATE` 亦會機械擋)
2. **`preflight-dispatch.ps1 -StoryId X -Phase Y` 是否 PASS?**(五檢查:STORY_STATE / NON_TERMINAL_RUN / PREV_PHASE_CLOSED / MIGRATION_WINDOW / UNREAD_MESSAGES)
3. **上一階段 run 是否已走完握手鏈至終態?**(`approved → closed`;禁「DB done 即推進」— IPC status 出現 + ack + gate + close 才算)
4. **phaseModelMapping SSoT (`scripts/pipeline-config.json`) 現值是否確認?**
5. **ctrl-channel 未讀留言是否已 `read_ctrl_messages` 簽收?**(preflight `UNREAD_MESSAGES` 只擋必讀話題,一般未讀仍應主動簽收)

> Mode C 通用任務另走 [general-task-mode.md §9](references/general-task-mode.md) dispatch 前 5 題;階段完成後的 GATE 證據項見 [main-controlled-mode.md §4](references/main-controlled-mode.md)。原 E1 版 5 題(含 handshake.enabled)隨 E1 FROZEN 退場,見 [ack-handshake.md §8](references/ack-handshake.md)。

---

## References

詳細規範按需 Read references/ 子檔(L3 progressive disclosure):

| 檔案 | 內容 | 行數 |
|:----|:----|:--:|
| [architecture-and-scripts.md](references/architecture-and-scripts.md) | Self-Contained 7 scripts 架構 + 流程圖 + Phase 4 完整參數 + §9 詳細規範 (環境變數 / IPC 結構 / R1-R8 對策) + 與其他 Skill 關係 | ~250 |
| [ack-handshake.md](references/ack-handshake.md) | **(2026-08-03 v5.24.0 全面改寫)Handshake 閉環(DB 版)** — lifecycle 狀態機 + 全閉環流程圖 + 中控節點手冊(preflight 五檢查 / GATE 六證據鏈 / ack / gate / close-worker / commit 波)+ revise 三通道(D1/D2/慢環)+ 通知面矩陣 + config 速查 + FORBIDDEN H1-H5 + E1 檔案式 ACK 🔒 FROZEN 判定 | ~155 |
| [main-side-track.md](references/main-side-track.md) | 主線 (SaaS) / 副線 (toolkit) prompt 範式分流 | ~30 |
| [integration-and-routing.md](references/integration-and-routing.md) | §6 Capability Integration 5 步 + §7 Model Routing Matrix + §11 12 SUPREME 規範整合 | ~80 |
| [orchestrator-awareness.md](references/orchestrator-awareness.md) | §12 5 軸環境感知 + §13 中控視角 SSoT + §14 動態決策狀態機 + §15 Effort 機制 + Phase 5 動態排程 + Skill 同步策略 | ~250 |
| [architecture-deep-dive.md](references/architecture-deep-dive.md) | **(2026-05-11 NEW)** 完整架構解剖 + Quad-Confirm 4 Layer + 18 已知缺陷/邊界 (D1-D18) + 嚴重度分級 + P0 修補路徑 + User 設計直覺對齊驗證 | ~330 |
| **[main-controlled-mode.md](references/main-controlled-mode.md)** | **(2026-05-28 NEW v5.2.0)** E2 主對話中控模式(預設首要)完整 SOP + E1/E2 對比 + 中控驗證證據項(對齊 lifecycle invariants I1-I9)+ **§4.5 worker 活動探測 30/10/10 停滯判別**(2026-08-01 whp-2 起由 `pipeline-guardian.ps1` 常駐守護執行,連續 2 輪零變動只標記 `stalled-suspect`,**guardian 零 kill**,中控續等/喚醒/重派三選一)+ 三層任務語意(✅✅/✅/⬜)+ review 後 3 情境分析(A/B/C)+ 最終抽樣 3 項 file:line + E1/E2 選擇矩陣 + worker Chrome 沙盒指示 + 解決 D3/D14(緩解)/D2 open 缺陷 + 本 session 實證(ecc-emergence A/B) | ~220 |
| **[general-task-mode.md](references/general-task-mode.md)** | **(2026-06-05 NEW v5.3.0)** Mode C 通用任務模式 — 主視窗直控(無 orchestrator/無 ACK/不走 BMAD)+ dispatch-general 薄手 + worker-general + G0-G5 中控迴圈 + V1-V5 審查 + model presets(不剝 [1m])+ effort max/ultrathink 三重注入 + IPC 變體契約 + 分界矩陣 + FC1-FC5 + **(2026-08-01 whp-2)§11 通訊情境全改寫**:視窗永不自動關閉,`Stop-WorkerSafe` 僅供 `whp-6` 未來使用,中控不得繞道呼叫 | ~290 |
| **[worktree-parallel-mode.md](references/worktree-parallel-mode.md)** | **(2026-06-10 NEW v5.5.0)** worktree opt-in 並行隔離 — 定位(ADR-AIOS-004 W2 opt-in 互補,非全面 W3)+ commit 異常三層(L1 worker index worktree 根治 / L2 中控 merge 序列化+ff-only / L3 語意不解)+ main-pinned 鐵律 + dispatch -Worktree 雙根用法 + 三情境(單軌多/雙軌 M1M2/三軌)+ 強化優先序 + 既有資產復用 + W1-W5 FORBIDDEN + 落地狀態/解凍 gate | ~150 |

---

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **5.24.1** | **2026-08-03** | **§4.6 ② Monitor 由「序列依賴時例外工具」升級為「序列依賴且無其他可推進項時,結束 turn 前必掛」(MUST)**。觸發:同日 22:18-22:34 bwu-12 dev 實證 —— worker 22:18:44 `reported`,通知鏈全數正確(guardian `notify_count=2` + `worker-notify-inject` 下個 prompt 送達、[待辦]確實注入),但中控 21:12 dispatch 後依①結束 turn 且未掛 Monitor(當時序列依賴成立:CR 完全依賴本卡、中控無其他工作),使用者離開 → `reported` 停等 16 分鐘,使用者觀感即「雙向握手協議斷訊」。查證結論:**機制零斷點(H4 紀律先查握手鏈成立),行為漏用②** —— v5.23.0 把②寫成「例外工具」的保守措辭,正好在本次場景讓中控合理化不掛。修正:`main-controlled-mode.md` §4.6 ② 改 MUST + 判準 + 實證段 + FORBIDDEN 補第 4 列(Loophole Closure 三元素);SKILL.md #9 與 `ack-handshake.md` §2 節點 4 / §5 等待紀律同步措辭。機制面互補另建 `ccb-5-pending-ack-controller-knock`(epic-ccb,P1/S,backlog):guardian 催辦(`notify_count ≥ ackEscalateAfterRounds`)時對 `controller_track` 已綁定的 idle 中控視窗敲門(100% 複用 ccb-4 `knock-controller.ps1` 原語鏈,design 須論證 guardian「絕不派發」鐵則語意邊界)。走 `Skill(skill="skill-builder")` Mode B。 |
| **5.24.0** | **2026-08-03** | **握手閉環 SOP 補全 + 舊機制殘留清除(使用者指示「將完整 SOP 範式補全更新到 party-to-pipeline,避免中控派發子視窗時又使用舊機制」)**。DB 比對確認 whp 13/13 done(含母卡)+ ccb 子卡 4/4 done + tdb 6/6 done,且生產 run `4815a818`(bwu-12 create)已完整走過 `dispatching → running → reported → ack(CC-OPUS)→ awaiting-review → approved → closed(close_source=ControllerAfterHandshake)` — **閉環機制全數落地,但本 skill 文檔面仍以 v4.0.0 檔案式 ACK 為現行敘述**,正是中控重複走回舊機制的根源。五處收斂:(1) **`references/ack-handshake.md` 整檔重寫 v2.0.0** — 由 16 步檔案式 ACK 改為 DB 閉環 SOP(§1 lifecycle 狀態機轉移表附 `worker-protocol-ops.js:169/:232+` 證據 + §2 全閉環流程圖 0-10 節點 + §3 中控節點手冊(preflight 五檢查 / dispatch 有界確認 / GATE 六證據鏈 / `ack_worker_run` / `gate_worker_run` 三分支 / `close-worker.ps1` 先寫後殺 / commit 波)+ §4 revise 三通道(D1 開工注入 / D2 快環 / 慢環敲門)+ §5 通知面矩陣(worker→中控 / 守護→中控 / 中控→worker / 中控⇄中控 四方向)+ §6 config 鍵速查 + §7 FORBIDDEN H1-H5 + §8 E1 FROZEN 判定)。(2) **E1 orchestrator.ps1 檔案式 ACK 判定 🔒 FROZEN** — 三點證據:worker 側 `Wait-AckFile`(v5.4.0)與自關(whp-2)相繼退場使 ack 檔無人讀、`Wait-WindowClosed` 必逾時走 `Stop-WorkerSafe` 強殺(`orchestrator.ps1:325-329`)牴觸使用者硬裁定②③、舊 ACK 復辟已被『雙向握手協議機制.md』§4.3 硬性否決;檔案保留不刪,禁止任何派發使用,批次改 E2 逐卡序列。(3) **SKILL.md 本體同步** — description / 核心原則 #5(閉環一句話版)#9(E1 FROZEN)#4(敲門三件補 knock-controller)/ Phase 4 流程 / FORBIDDEN F3・F4・F5・F8 改寫(舊條文語意已隨 Wait-AckFile 移除與 E1 FROZEN 失效)/ Self-Check 5 題改 E2 版(preflight 五檢查 + 握手鏈終態 + ctrl-channel 簽收)/ 常見錯誤表 / References 表。(4) **`main-controlled-mode.md` §3 逐階段 SOP 改寫為 10 節點閉環版**(補 ack/gate/close/revise 節點;原流程止於「GATE 檢查」,握手後半段只存在於 rules 而 E2 SOP 未載,亦為中控漏走 ack/close 的成因)+ §2/§8 E1 列 FROZEN + §10 D2 缺陷關閉。(5) **`architecture-and-scripts.md` 頂端定位 / 元件表 :47-:51 / 流程圖 / §9.5/§9.7/§9.8 / §10 關係表**與 **`orchestrator-awareness.md` 頂端**殘留「等中控 ACK,倒數 5 秒 graceful close」「ack.json → 倒數 5 秒 → close」等舊敘述全數標註 FROZEN 或改寫為現行行為;§10 順帶校正 claude-launcher-interactive(RETIRED 2026-07-28)與 toolkit-mirror-sync(RETIRED 2026-05)兩列 stale 狀態。配套 rule 同步(走 `Skill(skill="cc-config-author")`):`pipeline-handshake-protocol.md` §9 與 `worker-lifecycle-judgment.md` §1 的「E1 不受 whp-2 影響」誤導句改為 FROZEN 現況。走 `Skill(skill="skill-builder")` Mode B。 |
| **5.23.0** | **2026-08-03** | **`main-controlled-mode.md` 新增 §4.6「dispatch 後中控的等待紀律」(正常完成路徑 · 純行為紀律,零架構改動)**。補的是 `whp-2`(薄手等待迴圈全數移除,改有界確認即退出)與 `whp-8`(L2 通知掛 `UserPromptSubmit`)兩者交集處**沒寫的那句話** —— 「薄手不等之後,中控自己要做什麼」。§4.5 只涵蓋異常路徑(停滯/消失,guardian 負責),正常路徑一直是空白,中控遂在該空白處自行發明輪詢。三條紀律:① **dispatch 後不空等**(去做下一件事或結束 turn;通知走 `worker-notify-inject.js` 於下次 prompt 注入,該路徑本就完整,前提是中控會繼續活動 —— 而 E2 本就如此假設)② `Monitor` + `persistent` 為**序列依賴時的例外工具**,終止條件須同時涵蓋完成與異常(只監看成功信號時,worker 崩潰與仍在跑的外顯完全相同)③ **禁以 Bash `run_in_background` 開長迴圈等 worker**(2026-08-03 實測兩次皆被中止:一次可歸因於設定矛盾,**第二次設定已對齊仍被中止且原因未查明** —— 只記錄實測不做超出證據的推論)。另明訂 `Monitor` **只是通知捷徑非判定依據**(響了不可跳過 GATE 六證據鏈,沒響也不代表未完成),判定權威永遠是 `worker-lifecycle-judgment.md` §1 4-Tuple + IPC status。FORBIDDEN 三條含 Loophole Closure 三元素,其中第三條「因沒收到通知即判定架構有缺口並著手改機制」的觸發實例即本節來源:中控當日誤診為「worker→中控缺推送管道」並已著手設計 guardian 敲門新卡,經使用者反問「閉環不是已經完成了嗎」後查證 —— `ccb-4` 與 `bwu-12` 兩張卡握手鏈**皆完整走完** `dispatch → reported → ack → closed`(`close_source=ControllerAfterHandshake`),**架構零缺口,偏離的是中控行為**,差一步就為修正自己製造的問題而增加架構複雜度。SKILL.md core principle #9 補指向。走 `Skill(skill="skill-builder")` Mode B。 |
| **5.22.0** | **2026-08-03** | **`ccb-4-ctrl-notify-knock` 於 scripts/ 新增 `knock-controller.ps1`(敲門原語的第二個消費端)**。`whp-12` 把 `console-knock.ps1` 刻意設計成對收件端中立(參數只有 `-TargetPid` + `-Text`,零 domain 查詢),當時具名的理由就是「`ccb-4` 要消費同一份實作」—— 本次兌現:新增中控域包裝,原語**逐字不改**(`git diff --stat -- console-knock.ps1` 為空是該卡的驗收項)。兩個包裝的差異全在 domain 判準:目標取自 `controller_windows` registry(非 `worker_runs`);判活是 **2-Tuple**(`console_pid` 在活行程 map + `CommandLine` 與登記值相等)而非 worker 的 4-Tuple —— 後者 Tuple 3/4 檢查 `ipc_dir` 與 `worker-{suffix}.ps1`,兩者皆 worker 專屬 token,中控視窗不存在,故**不能**複用 `judgeLiveness()` 本體;敲門文字純 ASCII 因而不含 CJK 軌名(6 個 canonical 軌名皆 CJK,而原語在任何 Win32 呼叫前就拒絕 `> 0x7E`)。決策層 `.context-db/scripts/knock-controller-ops.js` 同 DD-1 分層(判活/查詢/文字組裝/寫入全在 Node 側),`.ps1` 只呼叫原語與轉述結果。零終止 / 零關窗 / 零焦點操作(`pipeline-handshake-protocol.md` F17 的同一條紀律,靜態斷言把關)。`references/architecture-and-scripts.md` 目錄樹 + 元件表 + 決策層旁註三處同步。**零改** orchestrator / dispatch-general / 4 支 worker / IPC 契約 —— 本次是純加法,pipeline 執行面完全不受影響。走 `Skill(skill="skill-builder")` Mode B。 |
| **5.21.0** | **2026-08-02** | **`whp-12-knock-console-inject` 慢環敲門落地(Task T5.2)—— revise 迴圈最後一個人工環節消除**。新增 2 支 scripts:`console-knock.ps1`(收件端中立原語,`-TargetPid` + `-Text` 兩參數 + self-respawn 隔離,`ccb-4` 可原樣複用)、`knock-worker.ps1`(worker 域包裝,決策委派新增的 `.context-db/scripts/knock-worker-ops.js`,同 `close-worker.ps1` 的 DD-1 分層)。補的是 §3.8 D2 快環覆蓋不到的那段:中控讀完報告才裁決 revise,指示寫好時 worker 早已 idle、`hookGraceSec` 早已逾時 —— 而所有 hook 都是被動事件回呼,idle session 沒有事件可觸發,故走 T1(TUI 輸入),是 D3「人親自打字」的程式化版本。**PoC 判定 viable**:P1 機制層 PASS(sentinel 恰 1 次 + 呼叫端 console 完好 + 2.3s)· P2a TUI 層 **3/3**(transcript user entry 逐字相符,4-5s)· P2b mid-turn **PASS-midturn-safe**(長 turn 完整跑完,敲門以獨立的下一筆 user entry 出現)。🔴 **一項非顯而易見的機制發現**:文字與送出鍵放進同一次 `WriteConsoleInput` 時,claude TUI 會把整串連同結尾 `\r` 判為一次貼上 —— 文字進得了輸入框但 **Enter 不生效**;必須分兩批寫入(`-SubmitDelayMs` 預設 250ms)。另記一項測試面陷阱:PoC harness 繼承 `CLAUDE_CODE_CHILD_SESSION` 會使 claude 完全不寫 transcript,讓「沒有 user entry」與「TUI 不接受注入」混為一談(首輪即因此誤判,harness 已將該情況獨立為 `INCONCLUSIVE-no-transcript`)。`smoke-test.ps1` 189→**225 case,15→16 group**(Group 16 全程隔離:temp DB + temp config 副本,不碰生產 DB、不覆寫版控 config —— 刻意不擴大 `TD-WHP11-SMOKE-INFRA-HYGIENE-LIVE-MUTATION`)。`pipeline-config.json` 新增 `workerProtocol.knockEnabled`(**有真消費端** `resolveKnockEnabled()`,對照 `TD-WHP2-AUTOCLOSE-FLAG-NO-CONSUMER` 的零消費端旗標)。`protocol-template.md` **零變更** —— 敲門文字與 D2 逐字同源,收件端不需第二套協議。走 `Skill(skill="skill-builder")` Mode B。 |
| **5.20.1** | **2026-08-02** | **`whp-11-d2-inline-revise` code-review 修復同步(9 項機制面收斂 + 測試補件)**。(1) **BR-006 落實**:D2 輪詢連線改 `{ readonly: true }`,`knocked_at` stamp 改走獨立短命可寫連線(原單一可寫連線同時 peek+stamp,與 BR-006「poll readonly + 另開 writable」相反,且 `BR006` 單元測試為永綠假斷言 — 三個獨立審查層一致抓獲;新增靜態模板鎖測試釘住連線形狀)。(2) **BR-012 對齊**:敲門文字補「則數 x{N} + 全部 msg_id 逗號列出」(原只帶第一則,與 protocol-template/§3.8 宣稱的「有幾則」漂移;spec §5 邊界表明文 one knock naming both msg_ids)。(3) **TOCTOU 收緊**:`stampKnocked` WHERE 補 `AND state='pending' AND knocked_at IS NULL`,全零 changes 時 fall through 為 miss(D1 於 peek↔stamp 空隙搶先送達時不再對已送達指示敲門)。(4) `resolveGraceSec` 嚴格 `typeof number`(`Number('')===0` 陷阱會把打錯的 config 靜默變成完全退場)。(5) config 讀取補 BOM strip + sleep 改剩餘預算制(graceSec 非 interval 倍數時不再過衝)。(6) fail 路徑補 node stderr 尾段/PS 例外明細 + log 換行摺疊(原 `2>$null` + 空 catch 只留 no output 無診斷價值)。(7) hit 路徑對 BMAD phase 補 `workflow_invoked='unknown'`(原證據鏈該 turn 缺鍵)。(8) preflight probe-fail BLOCK 訊息帶 error 明細;temp 檔清理 try/finally 化。(9) 陳舊 whp-4 CR F6 註解改寫為現行位序真相(官方 hooks 文件 2026-08-02 實查:timeout 單位=秒、hooks 平行執行、JSON 僅 exit 0 處理 — 1500=25min,300s clamp 有 5 倍餘裕)。`smoke-test.ps1` 188→**189 case**(AC1 fixture 改雙指示驗 count+全 id、AC5 補 handoff 證據斷言、suite-start stale smoke-% sweep、`Invoke-SmokePreflight` env 旗標 try/finally);vitest 80→**97**(TOCTOU/多則敲門/嚴格型別/rejected verdict/schema 13 欄 additive lock/靜態模板鎖)。全量複驗:189/189 + 97/97 + PSParser 0 錯 ×3 + check-ps-encoding exit 0。走 `Skill(skill="skill-builder")` Mode B。 |
| **5.20.0** | **2026-08-02** | **`whp-11-d2-inline-revise` Skill Sync(Task T13)— D2 送達通道落地 + Gap 1/Gap 2 兩處結構死牆修復**。`architecture-and-scripts.md` `stop-report.ps1` 元件列補「(whp-11,D2)」子句(比照既有 D1 記法):`$statusValue` 定案後、首次 `Write-IpcStatus` 前插入有界輪詢分支(委派 `worker-directive-poll.cjs` 四個純函式),命中即 `decision:"block"` 敲門同視窗續轉(不寫 status 檔、不推進 lifecycle,`Invoke-DbHeartbeat -SuppressLifecycleAdvance` 仍留心跳證據),`workerProtocol.hookGraceSec` 可調 `[0,300]`(`0`=完全退場)。同步 Gap 1(`gateWorkerRun` revise 分支同 transaction 重置 `gate_result='pending'`,使二輪交付可再裁 `approved` —— 此前永卡 `revise` 無法重新裁決)+ Gap 2(`preflight-dispatch.ps1` Check 2 對 `revising` + `-Resume` + 4-Tuple 判定原視窗已死開窄後門 `REVISE_REVIVE`,其餘一律仍 BLOCK)。`pipeline-window-control` 關窗前置條件表核對後確認**不受影響**(未描述 revise 迴圈機制,`gate_result==='approved'` 前置本身語意不變,僅其可達性提升)。`.claude/rules/pipeline-handshake-protocol.md` §3.8 為權威契約全文,本檔僅記機制骨架不重複。`smoke-test.ps1` 152→**188 case,14→15 group**(Group 15 新增 36 case 涵蓋 AC1-AC6/AC12;過程中發現並修復兩處既有 Group 8/13 測試 fixture 缺陷:`wrapper_pid` 用 smoke-test.ps1 自身 PID 而非真實 worker cmdline,被本機常駐 `pipeline-guardian.ps1` 判活失敗誤回收為 `abandoned`)。走 `Skill(skill="skill-builder")` Mode B。 |
| **5.19.0** | **2026-08-02** | **`whp-8-report-ack-notify` Skill Sync(Task T5.2)— L2 送達端落地 + `reported` 首次可達**。`stop-report.ps1` 於 `$runId` 區塊內新增獨立 CAS statement,把 `worker_runs.lifecycle` 從 `running`/`revising` 推進至 `reported`(`worker-lifecycle-advance.cjs`,`.context-db/scripts/` 下用 `.cjs` 非 `.js` — 該目錄 `package.json` 宣告 `"type":"module"`,一般 `.js` 會被當 ES module 解析,`require()` 拋錯;此為 dev 階段真實踩到、僅端到端 spawn 才捕捉到的缺陷,vitest 隔離單元測試測不出)。新增 `.claude/hooks/worker-notify-inject.js`(`UserPromptSubmit` 第 5 顆 hook,唯讀彙整六類待辦:待確認/待驗證/待關窗/需注意/流程異常/守護心跳,5 筆上限 + 800 字元封頂 + `systemMessage` L4 升級)。4 支 `worker-{create,dev,review,general}.ps1` 收尾段標題由純「[⚠ 勿關閉]」改為「[⚠ 待中控確認 · 勿關閉]」(啟動段不變),收尾警語補「/workers」指引。`pipeline-config.json` `workerProtocol` 新增 `guardianStaleMin`/`digestDetailCap`/`ackEscalateAfterRounds` 三鍵(create 階段 SDD Spec 誤判後者為既有鍵 — 實為 whp-7 spec 註記「Left to whp-8」被誤讀,repo-wide grep 確認新增前零命中;`guardian-tick.test.js` 對應 regression lock 同步更新)。`smoke-test.ps1` 74→**138 case,9→13 group**(Group 13 端到端驗證 CAS 推進 + CAS 冪等 + notify hook 唯讀保證,並意外發現 `register-run.ps1 -Mode Register` 觸發的 `Ensure-Guardian` 會啟動真實背景守護行程,驗證需考量與其 race)。AC12 端到端驗收經使用者確認後執行:真實 `dispatch-general.ps1 -Phase create-story` 派發 `tdb-5-stories-rerun-visibility`。走 `Skill(skill="skill-builder")` Mode B。 |
| **5.18.0** | **2026-08-01** | **`whp-6-directive-delivery-and-close` Skill Sync(Task 6.1)— D1 指示注入 + `-Resume` + `close-worker.ps1` 三項新能力落地**。`architecture-and-scripts.md`:scripts/ 目錄樹新增 `close-worker.ps1`(頂端 blockquote 移除已 stale 的「7 scripts」硬編數字,改不具體指名的措辭,避免每次新增腳本都要逐一改動計數)+ 元件表新增 `close-worker.ps1`(C1/C5/C6/C7/C8 自持,C2/C3/C4 委派 `close-worker-ops.js`)與 `read-worker-directives.js`(D1,4 支 worker-*.ps1 呼叫時機 + fail-open 語意)兩列,兩列皆指向 `pipeline-window-control`/`pipeline-subwindow` 取細節(本 Skill 只記機制骨架,不重複兩姊妹 Skill 內容)。`main-controlled-mode.md`:E1/E2 對比表下方新增 `-Resume` switch 說明(prior-session 查詢邏輯 + fail-open 條件 + `-DryRun -Resume` 唯讀預覽用法)。SKILL.md Core Principle #4 由具體「7 scripts」列舉改為「核心 7 + 後續擴充」措辭並點名 close-worker.ps1。走 `Skill(skill="skill-builder")` Mode B。 |
| **5.17.2** | **2026-08-01** | **code-review R2/R3 追加審查修復(whp-2-no-autoclose-liveness · 使用者要求兩輪追加審查)**。R3 發現 v5.17.1 對兩個 worker 系統提示樣板的漂移清掃**未清乾淨** —— 已修的是 §你是誰 / §Step 4 / §收尾顯示 / §FORBIDDEN / §CLOSE_MODE 對照表,但**啟動 ACK 序列**整段漏掃:`protocol-template.md:22` 與 `general-protocol-template.md:23` 仍要求 worker agent 覆誦「已讀懂本 protocol(子視窗角色 / YOLO / **close watchdog 收尾**)」,兩檔 `:28`/`:25` 另有「不必等 **watchdog timeout**」。此為每個 worker **開場第一行輸出**,漂移可見度高於 v5.17.1 已修的任何一處 —— 已改為「視窗永不自動關閉」/「不必等 IPC status 檔落地」。另修 `references/architecture-deep-dive.md:23`「⚠️ 自動關閉: ... 走 Stop-WorkerSafe force kill fallback (D1 缺陷)」—— 該行描述**現行實作**且已全數封存,改標退場 + 保留其上 2026-05-11 User 設計直覺引文為歷史脈絡。R2 另修 5 支 script 檔頭契約(`dispatch-general.ps1` 仍宣告已退場的 `Hybrid wait` 與 `exit 2 = timeout/lingering`,牴觸 BR-009;`worker-general.ps1` 仍宣告 `worker self-closes`;3 支 BMAD worker 檔頭以 v1.1.0 close watchdog 為最新變更)+ `$lingerGrace` 死變數封存 + `$watchdog` cleanup guard 實修(R1 曾列 ACCEPTED,依 `cr-debt-doc-audit.md` §A2.3「FixCost ≤ S=2 禁止 ACCEPT」改判實修)+ CTRL_CLOSE handler empty catch 補 stderr 留痕 + dispatch 摘要補「早期失敗使該 story 在手動關窗前被 preflight NON_TERMINAL_RUN 永久封鎖」告知。`smoke-test.ps1` 75→**77 cases**(T-WHP2-11 `$watchdog` 零可執行命中回歸鎖 / T-WHP2-12 檔頭契約鎖)+ T-WHP2-2 正則由 `Start-Countdown -Seconds` 放寬為 `Start-Countdown`(原綁死具名參數,位置參數形式復活會漏測)。4 支 worker 內嵌 C# 於 Windows PowerShell 5.1 離線實測編譯 4/4 PASS。走 `Skill(skill="skill-builder")` Mode B。 |
| **5.17.1** | **2026-08-01** | **code-review 修復同步(whp-2-no-autoclose-liveness CR)**。dev 階段 AC9 Skill Sync 只涵蓋 SKILL.md 主體 + 4 個 references,CR 三個獨立審查層(Blind/Edge/main-thread 對照)發現 `protocol-template.md`(BMAD 三階段 worker 系統提示樣板)與 `general-protocol-template.md`(Mode C worker 系統提示樣板)這兩個實際注入子視窗 system prompt 的檔案仍殘留現行行為錯誤陳述(「wrapper 會自動關閉視窗」/「視窗將在約五秒後自動關閉」/`CLOSE_MODE` 對照表缺 `never-auto (whp-2)` 列),會使**每一次**後續 BMAD 三階段與 Mode C 派發的 worker agent 對使用者說出與 v5.17.0 已落地行為矛盾的話。CR 已修正兩檔全部相關段落(§你是誰/§Step 4/§收尾顯示/§FORBIDDEN F4-F5/§CLOSE_MODE 對照表)。另同步修復 `dispatch-general.ps1` 一個真實 bug(worker 於 `claude.exe` 啟動前即 exit 1 時,`-NoExit` 使 wrapper 進程不會真正 `HasExited`,原邏輯誤判為 `spawned-pending-guardian` 並回報 exit 0,新增 `worker-reported-failed` outcome 分支修正 + `smoke-test.ps1` T-WHP2-10 回歸鎖)+ `Get-WmiObject`→`Get-CimInstance` 效能改善 + 3 支 worker `-Phase` 參數補 `ValidateSet` 防禦性驗證 + 4 支 worker P/Invoke here-string 分隔符改字面(`@'...'@`)防未來意外變數展開 + delegate 生命週期文件化註解。走 `Skill(skill="skill-builder")` Mode B。 |
| **5.17.0** | **2026-08-01** | **視窗永不自動關閉正式落地(whp-2-no-autoclose-liveness · AC9 Skill Sync)**。使用者硬裁定(2026-07-26)「取消 worker 子視窗自動關閉」+「所有機制只通知不殺」全面實作:4 支 `worker-*.ps1` 的 close watchdog + 自殺收尾、`dispatch-general.ps1` 的 signal-driven adaptive wait + `lingering→Stop-WorkerSafe` 備援、`Get-ActivityFingerprint`(repo-wide 指紋,SSoT G17 違規)五區塊全數封存為註解(BR-012,非物理刪除);新增 `workerProtocol.autoCloseEnabled`(緊急回退旗標,預設 false)+ worker 視窗標題常駐警語 `[⚠ 勿關閉]` + `CTRL_CLOSE_EVENT` handler(whp-1 R2 已驗證範式,印警語 + 寫 marker,fail-open)。薄手終止條件收斂為「有界確認即退出」(`dispatchConfirmSec`),exit code `2` 不再產生;30/10/10 停滯偵測全數移交 `pipeline-guardian.ps1` 常駐守護(whp-7 已落地,本卡起為唯一觀測層)。**Core Principle #9 精簡改寫**(移除已被取代的 v5.6.0/v5.12.0/v5.13.0 三段技術演進敘述,改為反映現行行為);#12 措辭更新確認為現行(非「取消後的觀測層」預告)。同步更新 4 個 references(main-controlled-mode.md §1/§4.5/流程圖、architecture-and-scripts.md 頂端定位、general-task-mode.md §2/§3/§4/§8/§11 全部情境流程改寫)+ `.claude/rules/worker-lifecycle-judgment.md`(4-Tuple liveness 定義 + guardian 執行者變更)+ `.claude/rules/pipeline-handshake-protocol.md` §9(close_mode 退場)。Version History 以上條目屬歷史敘述,依 `cross-ref-discipline.md` §3.3 不改寫。走 `Skill(skill="skill-builder")` Mode B。 |
| **5.16.3** | **2026-07-29** | **重派 attempt 自算 + rerun 標註配套(使用者「斷電/二次執行」改善裁定落地)**。(1) `dispatch-general.ps1` Register 組裝移除硬編 `-Attempt 1` —— 原寫法下同 (story, phase) 的二次派發(斷電/失敗後重派)必撞 `ux_worker_runs_key` UNIQUE 索引而於 Register abort(BC-03 錯誤路徑;同日 bwu-4 重派未撞純屬僥倖:首派死於 Register 之前未留列);(2) `register-run.ps1` payload 改條件式帶 attempt(`$PSBoundParameters.ContainsKey` 判顯式),省略時由 canonical writer `upsert-worker-run.js` 自算 `MAX(attempt)+1`(單點原子;顯式傳入仍優先供救援/測試),該 writer 測試補 3 個回歸案例(23/23);(3) 配套 `scripts/record-phase-timestamp.js` v2.2.0 重跑偵測:目標時間戳欄位已有值(= 該 phase 曾執行)時自動 append `[rerun]` 標記至 `pipeline_notes`(append-only;`--ts` backfill 除外),承接 agent 經三條既有注入路徑(bmad-slash-story-inject / Build-StoryPromptContext / workflow step-00 §1.5)天然收到;stories 時間戳維持「首次」語意不覆寫,逐次精確起訖以 `worker_runs` 為 SSoT。驗證:PSParser 0 錯 ×2 + upsert-worker-run 23/23 + smoke 58/58 + rerun 隔離 probe 三斷言(首次不誤標 / 重跑保留首值 + 逐次 append / backfill 不標)。UI 徽章顯示另建 `tdb-5-stories-rerun-visibility` 排程。BMAD升級軌中控主視窗直修,走 `Skill(skill="skill-builder")` Mode B。 |
| **5.16.2** | **2026-07-29** | **`dispatch-general.ps1` Register/Confirm 空字串引數 hotfix(bwu-4 canary 派發抓獲的 whp-4 escaped defect · BMAD升級軌中控主視窗直修)**。非 worktree 模式下 `-WorkRoot $WorktreePath` 為空字串,經外部 `powershell.exe` 呼叫時被 PS 5.1 丟棄(與 whp-4 CR F5 修復的 preflight argv 位移**同一失效類**,Register/Confirm 兩呼叫點漏套),binder 報 "Missing an argument for parameter 'WorkRoot'" → SS22.1 abort → **所有非 worktree 派發必炸**(worker 未 spawn,零殘留)。同類潛在路徑一併修:`-BaselineCommit`(git rev-parse 失敗時)與 Confirm `-CmdLine`(WMI 查詢失敗時會吞掉 `-WindowTitle`,且 Confirm 無 exit 檢查 → run 卡 dispatching)。修法:空值時省略引數,由 `register-run.ps1` 自身 param 預設值('')接手。此缺陷 smoke 測不到(T5.3-5/6 直呼 register-run 帶全參數,未經 dispatch 組裝層)、`-DryRun` 也測不到(於 Register 之前退出)—— 正是 whp-4 T1.3「真實 dispatch」誠實延後所指的未驗路徑,首次生產派發(bwu-4 dev,2026-07-29 16:09)即命中。驗證:PSParser 0 錯 + smoke-test 58/58 + DryRun PASS + bwu-4 dev 真實派發實跑。debt 雙錄:`TD-WHP4-DISPATCH-EMPTY-ARG-DROP-REGISTER-CONFIRM`(fixed)+ `TD-WHP4-DISPATCH-ASSEMBLY-LAYER-ZERO-COVERAGE`(open → whp 母卡)。走 `Skill(skill="skill-builder")` Mode B。 |
| **5.16.1** | **2026-07-29** | **`whp-4-write-path-wiring` code-review 修復同步(4 項機制面 + 測試補件)**。(1) **`stop-report.ps1` 心跳改以 JSON payload 檔傳遞** —— 原本把 PowerShell `ConvertTo-Json` 的輸出字串內插進產生出來的 JS 單引號字面值,JS 解析時又把 PowerShell 剛跳脫好的 `\\` 還原成 `\`,於是寫進 `worker_handoffs.evidence_json` 的內容**不是合法 JSON**(實測 `json_valid()=0`;Mode C `general` 的 `report_path` 恆為 Windows 絕對路徑,故每次派發必然踩到),而 evidence 內若出現單引號更會讓整個心跳腳本 `SyntaxError` 當 turn 全失。改為與 `register-run.ps1` 同一原則(BR-134:走 JSON 檔案路徑,禁 inline),並把 `-replace`(regex,替換側會展開 `$&`)換成 `String.Replace`(literal)。(2) **`evidence_incomplete` 補上 evidence DB 查詢失敗這條路徑** —— 原本只有 `phaseTargetStatus` config 讀取失敗會設 1,AC7 所指的「DB 查詢項失敗」完全未涵蓋,旗標在最該亮的時候恆為 0。(3) **IPC `status-{phase}.json` 提前於 DB 心跳之前寫出** —— whp-4 在該寫入前面加了約 600 ms 的 node/WMI 工作,一旦命中 `.claude/settings.json` 的 1500 ms hook timeout,被犧牲的正好是 dispatch hybrid wait 與 worker close watchdog 唯一賴以判斷的信號;`$statusValue` 在該點已定案,故前移零風險,收尾再以同樣的原子寫入補上 enriched evidence。(4) **`files_modified` 上限改讀 `workerProtocol.guardianScopeMaxFiles`**(原為 JS 樣板內兩處字面 2000),截斷旗標同步寫入 DB 側 evidence(原本只進 IPC 檔)。`smoke-test.ps1` 48→**58 cases**(Group 8 NEW,涵蓋 turn_count 累積 / `json_valid` / `gate_result` 不被覆寫 / `evidence_incomplete` 正反臂 / `workflow_invoked` 三態 / BC-07 gate)—— 前兩個缺陷正是因為 Group 7 只覆蓋 dispatch 側、Stop hook 側零自動化覆蓋才漏網。走 `Skill(skill="skill-builder")` Mode B。 |
| **5.16.0** | **2026-07-29** | **`whp-4-write-path-wiring` 落地 `worker_runs` 寫入端(四表建好一年多後首次非空)**。新增 2 支 scripts:`preflight-dispatch.ps1`(5 項前置檢查,STORY_STATE/NON_TERMINAL_RUN/PREV_PHASE_CLOSED/MIGRATION_WINDOW/UNREAD_MESSAGES,首個 BLOCK 即停)、`register-run.ps1`(`-Mode Register` INSERT `worker_runs` 列 + 呼叫 `Ensure-Guardian` fail-open,`-Mode Confirm` 回填 `wrapper_pid`/`cmd_line`/`window_title`)。`dispatch-general.ps1` 接上 `run_id` 生成(兼作 `--session-id`,BR-109 三方一鍵:DB row/session/transcript)+ 上述兩支 script 的呼叫點;4 支 `worker-{create,dev,review,general}.ps1` 的 `& claude` 呼叫列補 `--session-id`。`stop-report.ps1` 移除舊 dedup guard(改以 `$env:PIPELINE_RUN_ID` 是否有值決定是否走 DB 心跳路徑,故每 turn 皆執行完整 evidence 蒐集)+ 新增每 turn DB 心跳(`turn_count` 相對遞增 + `files_modified` json1 聯集去重)+ `worker_handoffs` UPSERT(`gate_result` 永不覆寫)+ 新純函式模組 `.context-db/scripts/workflow-invoked-detect.js`(判斷子視窗是否真跑了 BMAD workflow,23 tests)+ `claude_pid` 祖先鏈回填。`shared-utils.ps1::Update-Tracker` 加 DB 雙寫(`wrapper_pid`/`cmd_line`/`window_title`,以 `$env:PIPELINE_RUN_ID` 為 gate,DB 失敗不影響既有檔案寫入)。`reap-worker-runs.js` 對 `dispatching` 幽靈列加年齡規則(與 `guardian-tick.js` BR-G08 逐字同構),修復 `TD-WHP3-REAPER-DISPATCH-RACE-NO-GRACE-WINDOW`。`smoke-test.ps1` 35→**48 cases**(Group 7 NEW,涵蓋 session-id 綁定 + register-run 往返 + Update-Tracker DB 雙寫正反案例)。呼應 core principle #12 的 🔴 prospective reference(`Ensure-Guardian` 現已有生產 caller,見該條文修正)。誠實邊界:2026-07-27 稽核之 17-transcript workflow_invoked 紅綠母體(3 true/14 false)本次未重現(母體已增至 70+,原稽核 session 清單未存)。走 `Skill(skill="skill-builder")` Mode B。 |
| **5.15.2** | **2026-07-28** | **反向 cross-ref 補 1 處(`tdb-3-sop-skill` T5.3)**。頂端 blockquote 新增「中控行為紀律邊界」一行,指向新建 `multi-track-orchestration` skill(Discipline 型,SOP-1~7,蒸餾自 `00-多軌協作SOP固化與追蹤載體DB化設計報告.md` v1.1.0 §二)—— 本 skill 續管機制(scripts / 模式 / 參數 / IPC 契約),該 skill 管中控行為紀律(判準 / 序列 / 證據判讀 / 決策),雙向 cross-ref 互補不重複。frontmatter `last-synced-epic` `epic-whp` → `epic-tdb`(兌現 `tdb-3-sop-skill` create 階段 Depth Gate D1 WARN `--accept-warn` 承諾)。零機制面內容變更。走 `Skill(skill="skill-builder")` Mode B。 |
| **5.15.1** | **2026-07-28** | **`whp-7-guardian-daemon` code-review R1 同步(守護行為修正 3 處 + 測試數校正)**。(1) **`ensure-guardian.ps1` 存活判定升為雙判準** —— 原本只看 `logs/pipeline-guardian.pid`,而 pid 檔一旦與現實脫節(該目錄 gitignored 可能被清、或 WMI 一次暫時性查詢失敗),Ensure 會 spawn 一個註定搶不到 lock 的守護,那個守護 exit 前**不會**寫 pid 檔(它只在取得 lock 後才寫)但 Ensure 已先寫入其 PID → pid 檔永久指向死 PID,之後每次 dispatch 重複空轉 spawn,且 BR-G01 禁一切刪檔原語故無法清理,狀態不自行恢復 —— 直接侵蝕本 skill 招牌的「自癒」特性。新增 `Find-LiveGuardianPid` 以行程 CommandLine 掃描複驗(排除 `-Status` 唯讀查詢)並回寫 pid 檔。(2) **`pipeline-guardian.ps1` tick log 加 `DEGRADED` 標記 + `last_error` 欄** —— 原本無論該輪 tick 是否拋錯一律印 `ok`,而心跳 upsert 依 BR-G17 只在快 tick 執行,慢 tick 專屬錯誤在 DB 與 log 兩個問責面同時消失(一輪拋錯的慢 tick 與健康的慢 tick 字面完全相同)。(3) **`guardian-tick.js` 快 tick 內 loop B 改為先於 loop A** —— loop A 會把「已 reported 但視窗已消失」的列就地推進為 `abandoned`,而 loop B 候選鍵在 `lifecycle='reported'`,原順序下 BR-G09 的首次通知計數對這類列永不觸發,`whp-8` 催辦階梯再也接不到該筆未簽收回報。另修 BR-G22 路徑比對的大小寫敏感性(與 whp-3 CR 在 `judgeLiveness` 修掉的同型缺陷)、補 `-Status` 與 config 壞掉兩條原本零覆蓋的路徑測試。測試 54 → **64 全綠**,三條新回歸鎖經負向對照確認移除修復即 FAIL。走 `Skill(skill="skill-builder")` Mode B。 |
| **5.15.0** | **2026-07-28** | **新增集中式無狀態守護 `pipeline-guardian.ps1` + `ensure-guardian.ps1`(whp-7-guardian-daemon)**。取消 worker 子視窗自動關閉後,「視窗開著但沒人管」成為結構性缺口(733 筆歷史 tracker 33 筆 4.5% 永久停在 `running`)。新增 2 支 self-contained scripts(核心原則 #12 + `architecture-and-scripts.md` 元件表 + 目錄樹):`pipeline-guardian.ps1` 為住在所有子視窗外面的常駐單例(全生命週期持有 lock file handle 為唯一互斥機制,`-Once`/`-DryRun`/`-Status` 三旗標,雙節奏 tick),`ensure-guardian.ps1` 為每次 dispatch 可安全呼叫的冪等自癒 helper(恆 exit 0)。判定邏輯(BR-G01~G26 全 26 條)集中於新純函式模組 `.context-db/scripts/guardian-tick.js`(import `judgeLiveness` 等自 `reap-worker-runs.js`,禁重寫 4-Tuple;`.context-db/tests/guardian-tick.test.js` 54 tests 全綠)。**鐵則**:全數三檔零 kill/關窗/派發原語 —— 只回報只提醒(使用者硬裁定 ③)。**當前無生產 caller**,`Ensure-Guardian` 接線屬 `whp-4-write-path-wiring` 尚未落地項目,本次交付為可獨立呼叫、可獨立驗證(seed 列 + 假 proc map/mtime,不需真實 worker)的元件。走 `Skill(skill="skill-builder")` Mode B。 |
| **5.14.1** | **2026-07-28** | **`bwu-1` code-review R2 修正三處(注入面本體零變更)**。(1) `references/integration-and-routing.md:17` 欄位計數措辭歧義 —— v5.14.0 標「注入 19 欄」卻列出 20 個欄位名,讀者逐項清點必得 20 ≠ 19。實測(dot-source `shared-utils.ps1` 對 fixture 呼叫後逐行比對)確認正解為 **19 個標籤行 / 20 個欄位值**:`priority` 與 `complexity` 共用同一行故行數少 1;另補註 `task_track` 之值來自 worker `-Track` 參數而非 `$Story` 物件。此為本 Skill 自身 G-8 類「口徑漂移」,發生在 BR-017 校正該行的同一次修改中。(2) frontmatter `last-synced-epic` `backend-vision` → `epic-bwu` + `last-synced-date` `2026-07-16` → `2026-07-28` —— v5.14.0 只 bump 了 `version`/`updated`,漏更這兩欄;而 `bwu-1` create 階段 Depth Gate D1 WARN 的 `--accept-warn` 理由明文承諾「本卡 T4.1 確實要改它…dev 完成時自然消解」,未更新等同該承諾未兌現(對齊 `.claude/rules/depth-gate-warn-mandatory-resolution.md` §2.2 方式 B)。(3) 本次僅動文檔與 frontmatter,`scripts/shared-utils.ps1` 的 `Build-StoryPromptContext` / `Format-InjectField` **零變更**,v5.14.0 的 fixture 29/29 與 CR R2 獨立複驗 54/54 結論續存有效。走 `Skill(skill="skill-builder")` Mode B。 |
| **5.14.0** | **2026-07-28** | **`Build-StoryPromptContext` 注入面補 6 欄(bwu-1 P0-0)+ `integration-and-routing.md:17` 陳述校正**。`shared-utils.ps1` 的 `Build-StoryPromptContext` 新增 `Format-InjectField` helper + 六個標籤區塊(`file_list` / `implementation_approach` / `testing_strategy` / `definition_of_done` / `sdd_spec` / `pipeline_notes`,空值渲染字面 `(未填)`,`pipeline_notes` 附 READ-ONLY + protocol F5 告示),注入欄位由 13 → 19,純加法不動既有 13 欄(fixture 29/29 PASS,含 byte-identity 回歸守門)。`references/integration-and-routing.md` §6.1 Step 3 原陳述聲稱該函式會完整注入 Story 內容——此陳述在本次修改前後皆為錯誤(改前僅 13/47 欄,改後 19/47 欄,皆非完整內容),已校正為列舉實際 19 欄集合 + 明確排除清單。觸發:`bwu-1-inject-and-drift-repair` Story BR-017(dev-story T4.1,字面調用 `Skill(skill="skill-builder")` Mode B)。 |
| **5.13.0** | **2026-07-25** | **Worker 自關 watchdog 精確化(PPID-scoped)+ tracker append-only 稽核軌跡(attempt/controller_track)**。觸發:後台軌中控連續遭遇 code-review 子視窗於派工後極短時間內被中斷(2 次),查證排除:worker-review.ps1 邏輯本身(DB status/task file 檢查皆正確通過)、殘留殭屍進程(PID 事後查證皆真實消亡)、`Stop-WorkerSafe`(4-Tuple 驗證設計本就安全)。使用者要求分析「killer 機制是否會誤刪所有 worker PID」——查出 4 支 worker script(create/dev/review/general)共用的自關 watchdog 確有架構性風險:`Get-WmiObject Win32_Process` 對**全系統**進程做 CommandLine 子字串掃描(`Contains($IpcDirPath)`),比對到的**全部**進程一併 `taskkill /T /F`,無 tracker/story_id 交叉驗證,理論上與 `Stop-WorkerSafe`(shared-utils.ps1,4-Tuple 驗證後才對單一已知 PID 動手)安全等級不一致。**修法**:watchdog 過濾條件加 `ParentProcessId -eq $WorkerProcId -and Name -eq 'claude.exe'`(4 檔一致修改),父子行程關係為 OS 保證的精確事實,不可能跨 worker 誤判,IpcDir 子字串比對降為第二層防禦,零改動 `& claude ...` 啟動機制(不動 TUI 渲染行為,風險最小化)。**同步修復 `Update-Tracker`**(shared-utils.ps1)舊版以 `(story_id, phase)` 為 key **upsert 覆蓋**歷史紀錄的 bug(重派時新 pid 寫入但 `started_at` 錯誤繼承舊紀錄的時間戳,無法回答「這個 story+phase 被誰、派發了幾次」)— 改為 append-only(不同 pid = 不同派發,一律新增不刪除;同 pid 狀態轉換才就地更新),新增 `attempt`(第幾次派發,1=首次)+ `controller_track`(派發中控身份:前台軌/後台軌/azure佈署軌/unspecified,經新增 `dispatch-general.ps1 -ControllerTrack` 參數寫入 `$env:PHYCOOL_CONTROLLER_TRACK`,worker 進程繼承同一 env var 故其自身 `Update-Tracker` 呼叫免改參數即自動取得)。`Get-TrackerEntry` 對應改為取最後一筆(array 現為 append-only,故最新 = 最後)。**驗證**:6 檔案 PowerShell parser 語法全過;`Update-Tracker`/`Get-TrackerEntry`/`Get-ControllerTrackId` 獨立單元測試 13 項全 PASS(首次派發 attempt=1 / 同 pid 狀態轉換不產生重複列且 started_at 不被覆蓋 / 重派 attempt=2 且舊紀錄完整保留 / controller_track 正確反映派發者 / 未設定時 fallback=unspecified);`dispatch-general.ps1 -ControllerTrack` CLI 整合 DryRun 通過(banner 正確顯示 `Controller: 後台軌`)。**誠實邊界**:過程中發現 `dispatch-general.ps1` 已於同日更早由前台軌升級至 v5.12.0 signal-driven adaptive wait(無固定短 timeout,軟性期限後才啟動 30/10/10 探測且不自動 kill,硬上限達 2 小時)——這代表本次觸發修復的兩次「killed」中斷,在事發當下腳本自身邏輯已不可能造成如此快速的中斷,故**本次修復未證實、也不宣稱解決了原始「killed」事故的根因**(根因更可能在 dispatch 進程本身的背景任務生命週期層,屬 Claude Code CLI harness 範疇,非本 skill 程式碼可控);本次修復是獨立成立的架構安全性改善,價值不依賴於是否為原事故根因。走 `Skill(skill="skill-builder")` Mode B。 |
| **5.12.0** | **2026-07-25** | **`dispatch-general.ps1` v2.1.0 signal-driven adaptive wait(根治 E2 觀察者單點失效)**。Party Mode 四位專家(Winston/Amelia/Bob/Murat)追查根因:`pcpt-preview-modal-zoom-controls` dev-story 實際耗時 2283s 超過 `phaseTimeouts.dev-story.M`(2100s)固定 timeout,dispatch 的 hybrid-wait 迴圈先於 worker 完成而退出,退出後系統內無任何觀察者,worker 完成(status 檔寫入 + watchdog 自關)零信號回報主視窗——確認 Stop hook 只在 worker 自己 session 內寫本地檔案,無跨 process push 能力,「機械式通報中控」在舊架構裡不存在,唯一橋樑是 dispatch 自己的輪詢,而輪詢壽命綁死一個常數。修復(使用者裁定選項 3 + 整合舊架構 E1 優點):把「PID 存活」重新定為權威終止信號(借鏡 E1 `Wait-WindowClosed` quad-confirm 精神,但不重啟已證實失效的 ACK handshake),`phaseTimeouts` 降級為軟性期限,只用來啟動 `worker-lifecycle-judgment.md` §3.5 30/10/10 活動探測的機械化版本(新增 `Get-ActivityFingerprint`:git dirty 檔 mtime + IPC dir 指紋)。連續 2 輪(20min)零變動才回報 `outcome=stalled`,新增 `hard-ceiling`(3×timeout 或 7200s 取大)作最終安全閥;兩者皆**不自動 kill**,只回報供主視窗依 §5 Self-Check 人工裁決,對齊「未走 30/10/10 或未經人工裁決禁殺 worker」FORBIDDEN。移除 `outcome='timeout'` 硬編碼常數(舊碼:elapsed 超過即跳迴圈、exit 2),`OUTCOME`/`STATUS`/`STALE` 三行輸出讓主視窗一次看懂是否需要介入。同步更新 `worker-lifecycle-judgment.md`(§1 Core Principle 補機械化說明)。E1 orchestrator.ps1 批次黑箱路徑不受影響。 |
| **5.11.0** | **2026-07-25** | **全方位健檢(ultrathink 二次覆核 v5.10.0)新增 FORBIDDEN F16**:v5.10.0 落地的「敘述性內容用角色語言 + SSoT 指標」convention 先前只寫在 Core Principle #10 + Version History 敘事裡,沒有一條可被未來 agent 直接查到的 FORBIDDEN 規則——健檢發現此落差並補上 F16,附 `audit-model-string-drift.cjs` 自我檢查指引。本輪健檢覆核結果:(a) 重跑偵測腳本,狀態與 v5.10.0 完工時一致(11 處/2 未知,皆為 D3 歷史觀察,符合預期);(b) grep 確認 `main-controlled-mode.md`/`ack-handshake.md`/`main-side-track.md`/`orchestrator-awareness.md` 4 檔零殘留;(c) 確認 D3「修法」欄「切 Sonnet 跑 review」不帶版本號,腳本正確不誤判;(d) 確認 `audit-model-string-drift.cjs` 未被排入 architecture-and-scripts.md §2 元件矩陣屬合理(該表範疇僅涵蓋 `.claude/skills/party-to-pipeline/scripts/` 內 self-contained 腳本,新腳本與其姊妹 `audit-phase-model-mapping.cjs` 同置專案根 `scripts/`,兩者皆未被該表收錄,非本輪新增落差)。 |
| **5.10.0** | **2026-07-25** | **Party Mode 冪等性分析裁示落地(SSoT 宣告 + 角色語言 + 唯讀偵測腳本)**。緊接 v5.9.0 model rename 之後,使用者召開 Party Mode 討論「如何避免每次 Anthropic 改 model 名稱都要逐檔同步」,CEO(BMad Master)裁示 4 點:① `pipeline-config.json` 正式確立唯一版本字面值 SSoT(不新建 canonical block,現有架構已足);② 敘述性內容(非可執行範例)一律改用「角色語言」+ SSoT 指標,取代字面版本字串——Core Principle #10 model presets 列舉改指向 `generalTask.presets`;③ 新增獨立唯讀偵測腳本 `scripts/audit-model-string-drift.cjs`(掃 SKILL.md + references/*.md 是否有 Version-History 區塊外的殘留版本字面值,advisory 不 BLOCK,不修改 `audit-phase-model-mapping.cjs` 既有 commit gate);④ Version History / 缺陷歷史紀錄段落排除在外(規則無法安全辨識,永遠只能人工複核)。**未採用**做法 2 原提議的「SSoT-anchor 標記」語法(HTML comment 在 `.ps1` 不適用,且 usage 範例本就用 preset 別名而非字面 model_id,已天然耐用,不需額外標記)。references 同步:integration-and-routing.md §7.1(2 行 + 2 段 footnote)/ architecture-and-scripts.md 流程圖 3 行 / architecture-deep-dive.md §2 矩陣 3 行(D3 缺陷紀錄刻意不動,歷史觀察)。冪等性驗收標準(Murat 提案):唯讀偵測天然冪等;若未來衍生自動改寫,須先過「連續執行兩次、第二次 git diff 為空」門檻。CEO 判定 S 級,不需完整 Story 儀式。走 skill-builder Mode B。 |
| **5.9.0** | **2026-07-25** | **Model 名單再對齊 Claude Code CLI 現行 `/model` picker(Opus 4.8 → Opus 5 更名;Sonnet 5 / Fable 5 / Haiku 4.5 名稱不變)**。BMAD `create-story` / `code-review` phaseModelMapping model_id `claude-opus-4-8[1m]` → **`claude-opus-5[1m]`**(model_alias 仍 `opus`,`modelPricing.opus` 5/25 不變 — Opus 4.8→Opus 5 為同價位升級,per claude-api skill 2026-06-24 快取確認)。Mode C `generalTask.presets` 新增 `opus-5`(新現行預設)、`opus-4.8` 降 **LEGACY** 保留(模型仍 Active,對齊既有 sonnet-4.6 降級先例)。dev-story / dev-story-complex / dev-story-fix-Rn(sonnet-5)/ subagent(haiku)不變。CLI 2.1.219 live-verified:`claude-opus-5[1m]` → `modelUsage.contextWindow=1000000`,`canonicalModel=claude-opus-5`。References 同步:integration-and-routing §7 矩陣 + footnote / architecture-and-scripts 流程圖 worker 標示 / general-task-mode 表格+範例+Self-Check / worktree-parallel-mode 範例 / dispatch-general.ps1 usage 註解+錯誤訊息字串 / `.claude/rules/pipeline-handshake-protocol.md` §3.2 範例 payload(v1.2.2)。健檢順帶修復 architecture-deep-dive.md 既有 stale「Opus 4.7」「Sonnet 4.6 default」殘留(2 世代未同步,獨立於本次 model rename)。觸發:使用者提供 CLI 現行 `/model` picker 選單,要求對齊薄手調用 + BMAD create/review 模型命名。走 skill-builder Mode B。 |
| 3.0.1 | 2026-04-05 | v3.0 bugfix — last-synced-epic + dynamic scheduling 實戰數據更新 |
| 3.1.0 | 2026-05-03 | §6 Capability Integration Awareness + §7 Model Routing Matrix mini |
| 3.2.0 | 2026-05-03 | 雙模式選擇 (Mode A Party Mode / Mode B Skip Mode) |
| 4.0.0 | 2026-05-04 | 重大改版:Self-Contained Orchestrator (7 scripts) + ACK Handshake + 主線/副線分流 + IPC 三段唯一鍵 + 12 FORBIDDEN |
| 4.1.0 | 2026-05-04 | 5 軸 SSoT 文檔化 + Effort 機制 Spike + Phase 2/3 Story closure |
| 5.0.0 | 2026-05-04 | 4 Layer Ultrathink 重大升級:4-Tuple Identity Quad-Confirm 防 Windows PID 重用 + 5 軸 Conflict Matrix + Greedy Schedule-Batches + UTF-8 防雷 (phycool-windows-ps-encoding Skill) + MCP Discipline (Invoke-PhycoolMcpSafe) + Multi-Story batch dispatch + worker --chrome flag |
| **5.1.0** | **2026-05-04** | **L2 modular refactor — body 897→~280 lines per saas-to-skill SOP ≤500 行門檻**。Body extracted 至 5 references files (architecture-and-scripts / ack-handshake / main-side-track / integration-and-routing / orchestrator-awareness),L3 progressive disclosure 範式。Body Version callout 移除(避免雙版本號 drift)。三引擎同步 md5 identical。 |
| **5.2.0** | **2026-05-28** | **E2 主對話中控模式設預設首要 + Phase 4 執行控制維度新增**(與 Mode A/B 任務來源維度正交)。新增 references/main-controlled-mode.md(L3 完整 SOP · ~250 行 · 含 E1/E2 對比 + 中控驗證證據項對齊 lifecycle invariants I1-I9 + 三層任務語意 ✅✅/✅/⬜ + review 後 3 情境分析 A/B/C + 最終抽樣 3 項 file:line + E1/E2 選擇矩陣 + worker Chrome 沙盒指示)。**E2 = 主對話親自當中控,逐階段 dispatch 單 worker(-SkipCreate/-SkipDev/-SkipReview)+ 每階段驗證回填證據 + 階段間 commit clean tree + 抽樣防假回填**。對應 architecture-deep-dive §1.1 User 原始設計直覺復原(claude-launcher-interactive 主視窗手動 launcher 範式)。本 session 實證 E2 解決 D3(opus stall)/D14(hang 無 progress)/D2(handshake.enabled=false 名存實亡)三個 open 缺陷 — A CR Chrome 授權 timeout 改主視窗親自(score 92) / B dev dirty tree 卡死 30min×2 改 clean tree 後 6.8min 成功 / B review worker timeout 但 DB done 靠 STATE_DRIFT 救援(運氣) → E2 直接驗 DB 證據不賭 worker IPC。E1 Orchestrator-Controlled(黑箱)保留為「批次/簡單/低風險」備選。**零改 orchestrator.ps1 核心**(-Skip 已支援逐階段)。配套 worker prompt Chrome 沙盒指示已寫入 main-controlled-mode §9,實際注入 protocol-template.md / worker-review.ps1 屬後續 hooks-mechanization 落實。Mode B 八面向驗證 PASS。觸發: 本 session(2026-05-28 ecc-emergence A/B Stories)主對話中控實戰 + 使用者明確要求 E2 設預設。Story: ecc-emergence-governance follow-up commit `7f9a24e5`。 |
| **5.3.0** | **2026-06-05** | **Mode C General-Task 通用任務模式(第三任務來源維度)** — 主視窗直控:dispatch-general.ps1 薄手(零決策/零驗證/零重試/零 ACK)直接對接 worker-general.ps1 子視窗(克隆 worker-dev 啟動骨架,砍 Story DB/BMAD/Wait-AckFile,**不剝 [1m]**),非 Story 一般任務不走 BMAD workflow。model 3 presets(opus-4.8 / sonnet-4.6 / sonnet-4.6-1m,raw id passthrough)+ effort max 固定(env + directive 雙保險,克隆 worker-dev.ps1:97-108)+ ultrathink 注入。stop-report.ps1 v1.1.0 general 分支(skip Story DB / report_exists evidence)+ pipeline-config.json generalTask 段 + general-protocol-template.md(worker 8 FORBIDDEN:禁 commit/Chrome 沙盒/他軌隔離/完成即停)+ references/general-task-mode.md(G0-G5 中控迴圈 + V1-V5 審查 + 分界矩陣 + FC1-FC5)。新增 F14(禁 SaaS production code 走 Mode C)+ F15(worker 禁 commit + 主視窗 pathspec)。dispatcher baseline 差集隔離他軌髒檔(雙軌並行場景)。**零改 orchestrator.ps1 / shared-utils.ps1**(Stop-WorkerSafe scriptSuffix default 分支天然支援 general)。觸發:2026-06-05 Party Mode 全專家收斂 + 使用者 5 點補充裁定(model 可選/effort max/ultrathink/去 orchestrator 黑箱 100% 掌握/模組校正序列場景)。走 skill-builder Mode B。 |
| **5.3.1** | **2026-06-05** | **Mode C 收尾 UX 雙模式**(使用者裁定):`generalTask.close_mode = auto`(預設)/ `controller`。auto = worker watchdog(Start-Job)於 status 落地 + `close_delay_sec`(5s)後以 IpcDir cmdline 比對殺 claude → worker 自關,子視窗 turn 末顯示「✅ 任務完成,已回報中控,視窗將在約五秒後自動關閉」;controller = 子視窗顯示「等待中控關閉視窗」,dispatcher lingering grace 後 Stop-WorkerSafe 關窗。雙層防護:auto watchdog 失敗 → dispatcher grace 備援兜底。背景:gt-smoke-001/002 實證 claude 互動模式 turn 結束後不自行退出 → 機械收尾必要。general-protocol-template §收尾顯示新增 + TASK META 帶 CLOSE_MODE。gt-smoke-003 實證 auto 路徑。 |
| **5.4.0** | **2026-06-06** | **薄手統一改造(使用者裁定「Story 任務也應同 Mode C 直連」)** — dispatch-general.ps1 擴充 `-Phase create-story|dev-story(-fix-Rn)|code-review(-Rn)` 直連 BMAD 三 worker 並設為 **E2 預設路徑**;worker-create/dev/review v1.1.0 接 close watchdog + 砍 Wait-AckFile 死碼段;protocol-template.md Step 3/4 + 失敗處理對齊現實(主視窗驗證 + watchdog 關窗 + 新視窗接續)+ 收尾顯示;orchestrator.ps1 **退守 E1 批次黑箱專用**(零改其本體)。鐵證:`logs/party-pipeline-tracker.json` 全歷史 142/143 BMAD worker status=killed(99.3%)— ACK 優雅關窗儀式從未在生產走通,實際靠 Wait-WindowClosed 10s 超時 force-kill 收尾;watchdog 改為 status+5s 優雅自關(tracker 真實 'closed' 證據鏈)。general-task-mode.md v1.1.0 同步新增 §11 通訊模型與全情境流程(MCP 類比/token 帳本/八通道/情境 A-F,使用者裁定固化)。體系收斂 = **1 腦(主視窗)+ 1 手(dispatch)+ 4 worker**。 |
| **5.3.2** | **2026-06-06** | **description CSO 優化 1019→~410 字元**(TB-LEVEL ≤500 達標,quick_validate WARN 清零)。重排優先序對齊使用者實際觸發語:Mode C 主視窗直控 + E2 中控放最前,Mode A/B 一句帶過;罕用內部術語(Schedule-Batches / multi-Story batch / --chrome / Pipeline dogfood 等)下沉 body + frontmatter triggers array(完整保留,零 description 成本)。背景:全專案 ~97 skills 共用 16,000 字元 description 預算,超標靜默掉 skill(worker-dev.ps1:80 既往實證 drop ~11 skills)。觸發:使用者詢問 description 過長影響與優化空間。 |
| **5.6.0** | **2026-07-04** | **Worker 活動探測 30/10/10 範式**(使用者裁定 · 防誤刪執行中 worker):dispatch 後 **T0+30min 首檢**記錄檔案活動快照(git dirty/untracked mtime 指紋 + IPC dir;排除中控自身並行編輯路徑;**僅記錄不判殺**)→ **每 +10min 複查**檔案變動(有變動 = worker 正常執行,重置計數)→ **連續 2 輪(20min)零變動**中控才 kill 視窗 → 分析檢查(DB/IPC/已產出檔案)→ 重新發配;完成信號(IPC status / claude gone)任一時點轉 GATE。dispatch 薄手 timeout = 放棄等待,**非 kill 時點**。落點 [main-controlled-mode.md](references/main-controlled-mode.md) §4.5(v1.2.0,含 5 操作要點 + D14 open → 緩解)+ 核心原則 9 補述 + rule `worker-lifecycle-judgment.md` 同步。首例:2026-07-04 後台軌 L1 CR worker(timeout exit 2 後依範式背景活動探測續等)。走 skill-builder Mode B。 |
| **5.7.0** | **2026-07-16** | **Model 名單對齊 Claude Code 現行款(picker:Opus 4.8 1M 預設 / Fable 5 / Sonnet 5 / Haiku 4.5;CLI 2.1.211)**。① Mode C presets 新增 `sonnet-5`(→ `claude-sonnet-5[1m]`,實測 modelUsage.contextWindow=1,000,000;沿用 2026-06-07「sonnet 一律 [1m]」裁定)為一般執行現行推薦 + `fable-5`(→ `claude-fable-5[1m]`,最高階 opt-in、~2× opus 成本、原生 1M);`opus-4.8` preset 補顯式 [1m];`sonnet-4.6` / `sonnet-4.6-1m` 降 LEGACY 保留(模型仍 Active 不會壞)。② BMAD 三階段 phaseModelMapping 維持 `claude-opus-4-8[1m]`+max **不變**(仍為現行 Opus,2026-06-08/11 裁定續行)。③ 修 references drift:integration-and-routing §7 矩陣(opus-4-7/sonnet-4-6 舊值 → SSoT opus-4-8 全相 + 補 dev-story-complex 列)+ architecture-and-scripts 流程圖 worker 模型標示。④ pipeline-config modelPricing 校正現行 API 定價(opus 15/75→5/25、haiku 0.8/4→1/5、新增 fable 10/50;source: claude-api skill cached 2026-06-24)+ 4 個 model-key 映射腳本(pipeline-log-tokens / otel-session-aggregate / pipeline-quota-check / token-cache-health-advisor)補 fable 分支。觸發:使用者盤點 /model picker 要求分析薄手 LLM model 是否需更新。走 skill-builder Mode B。 |
| **5.8.0** | **2026-07-19** | **dev 全階段 phaseModelMapping opus-4.8 → `claude-sonnet-5[1m]` max(使用者裁定)**。`dev-story` / `dev-story-complex` / `dev-story-fix-Rn` 三 phase:model_id `claude-opus-4-8[1m]`→**`claude-sonnet-5[1m]`**、model_alias `opus`→`sonnet`(對應既有 `modelPricing.sonnet` 3/15)、effort `max` 不變;**supersede** 2026-06-08/11 opus-dev 裁定(含 v5.7.0 ②「BMAD 三階段維持 opus」條)。複雜卡不再自動升 opus,effort=max 仍注入 ultrathink(worker-dev.ps1:107)供深度。**`create-story` / `code-review` 維持 `claude-opus-4-8[1m]` max 不變**。estimated_cost_usd 保守留 opus-scaled(sonnet 實際更低,不動 budgetPerPhase headroom)。`model_purity_enforcement` match_mode=full_model_id 自動改驗 sonnet(不硬編 opus,零改)。references 同步:integration-and-routing §7 矩陣 3 dev 行 + v5.8.0 對齊註 / architecture-and-scripts 流程圖 worker 標示 / shared-utils.ps1:529 註解。DryRun 實證 `dispatch-general -Phase dev-story-complex` → `claude-sonnet-5[1m]`。觸發:2026-07-19 使用者裁定「dev 階段改調用 sonnet 5 effort max」。走 skill-builder Mode B。 |
| **5.5.0** | **2026-06-10** | **worktree opt-in 並行隔離能力正式整合落地** — 新建 [worktree-parallel-mode.md](references/worktree-parallel-mode.md)(整合研究報告 v2.2.0 §12 + 既有資產 ADR-AIOS-004 W2/TRS-33/worktree-manager)。**定位 opt-in 互補(非全面 W3,W3 已 CEO 否決)**;commit 異常三層解構(L1 worker index race worktree 物理根治 / L2 中控 merge race 序列化+`--ff-only` 無銀彈 / L3 語意衝突不解);main-pinned 鐵律(控制平面 DB/IPC/log 絕對路徑 · 執行平面 code worktree-local);`dispatch-general.ps1 -Worktree` per-dispatch opt-in(預設不帶=現行行為)+ 4 worker 雙根(PIPELINE_CONTROL_ROOT/WORK_ROOT,scripts 層 PoC 已落地 dec5cd24/844b4249)+ 動態 workers-mcp.json 絕對路徑解 B1;三情境(單軌多 worktree 最佳/雙軌 M1M2/三軌)+ 強化優先序(L2 ff-only>L1 opt-in>L1 manifest)。新增核心原則 11 + L2 索引 + References 表 + triggers(worktree/並行隔離/requires_worktree)。正式全面啟用待解凍 gate(ECC+m0-4),① startup-ack 降級待 ROI 重估。觸發:第二輪 CEO 研究(Party Mode 4 任務)使用者裁示「worktree 研究要執行落地 + 更新 party-to-pipeline」。走 skill-builder Mode B。 |
