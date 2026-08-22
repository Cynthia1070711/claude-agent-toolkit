---
name: pipeline-window-control
description: >
  Pipeline 子視窗生命週期控制與中控追蹤機制。查看活躍子視窗狀態、
  強制關閉指定/全部視窗、偵測殭屍視窗、讀取完成通知。
  中控（CC-OPUS）透過此 Skill 主動追蹤和控制所有 pipeline 子視窗。
  Trigger keywords: pipeline control, 子視窗控制, window control,
  zombie, 殭屍視窗, 強制關閉, pipeline status, kill window
version: 1.1.0
updated: 2026-08-01
disable-model-invocation: true
triggers:
  - pipeline control
  - 子視窗控制
  - window control
  - zombie
  - 殭屍視窗
  - close-worker
  - 關窗判準
author: CC-OPUS
created: 2026-03-29
watches:
  - glob: ".claude/skills/pipeline-window-control/scripts/*.js"
    domain: pipeline
  - glob: ".claude/skills/party-to-pipeline/scripts/close-worker.ps1"
    domain: pipeline
last-synced-epic: epic-whp
last-synced-date: 2026-08-01
---

# Pipeline Window Control

> 中控 (CC-OPUS) 對 pipeline 子視窗的主動追蹤與控制工具

> **⚠ (whp-6,2026-08-01)與 `close-worker.ps1` 的邊界**:本 Skill 記載的是 `story-pipeline-interactive.ps1` 時代的 PID 追蹤機制(`pipeline-control.js` + `logs/pipeline-active.json`,`last-synced-epic: epic-sku` 早於 epic-whp),與 party-to-pipeline v4.0.0+ self-contained orchestrator 的 `worker_runs` DB 生命週期(`dispatching→running→...→closed`)是**兩套平行系統**,非同一機制的新舊版本。**若要關閉 `worker_runs` 已登記(`whp-3` 起)的子視窗,一律走 `.claude/skills/party-to-pipeline/scripts/close-worker.ps1`**(whp-6 起中控唯一程式化關窗途徑,C2 五項前置 + C3 4-Tuple 判活 + C4 CAS 終態寫入,詳下方新增章節)——**不要**用本 Skill 的 `--kill`/`--kill-all` 對這類 run 動手,兩套追蹤帳本(`logs/pipeline-active.json` vs `worker_runs` 表)互不同步,`pipeline-control.js` 對 `worker_runs` 表毫無所知。下方「四層自動關閉機制」章節描述的 L1-L4 已被 whp-2(2026-08-01,「取消 worker 子視窗自動關閉」硬裁定)整體取代 —— **視窗永不自動關閉**,四層皆為歷史敘述,`worker_runs` 生命週期下的子視窗不受其管轄。

## 架構

```
中控 (CC-OPUS)
  │
  ├── pipeline-control.js --status     ← 查看所有活躍視窗
  ├── pipeline-control.js --kill {id}  ← 強制關閉指定視窗
  ├── pipeline-control.js --kill-all   ← 強制關閉全部
  ├── pipeline-control.js --check-zombie ← 偵測+清理殭屍視窗
  ├── pipeline-control.js --notify     ← 讀取完成通知
  └── pipeline-control.js --cleanup    ← 清理已完成紀錄
```

## 使用方式

### 查看活躍子視窗

```bash
node .claude/skills/pipeline-window-control/scripts/pipeline-control.js --status
```

輸出表格：Story | Phase | PID | Running | DB Status | Target | Elapsed

### 強制關閉指定 Story 的子視窗

```bash
node .claude/skills/pipeline-window-control/scripts/pipeline-control.js --kill fix9-03-csrf-unified
```

### 偵測並清理殭屍視窗

```bash
node .claude/skills/pipeline-window-control/scripts/pipeline-control.js --check-zombie
```

殭屍 = DB 已達 target status 但視窗仍在執行的進程。自動 graceful close + force fallback。

### 讀取完成通知

```bash
node .claude/skills/pipeline-window-control/scripts/pipeline-control.js --notify
```

顯示最近 10 筆完成通知（由 pipeline-notify.js Stop Hook 寫入）。

## 四層自動關閉機制

| 層 | 機制 | 觸發速度 | 元件 |
|:--:|------|:-------:|------|
| L1 | Stop Hook Signal | ~3s | `pipeline-auto-exit.js` 偵測 DB target → 寫 signal file |
| L2 | Watchdog DB 偵測 | ~30s | `story-pipeline-interactive.ps1` 輪詢 DB status |
| L3 | 無活動偵測 | 約 5 分鐘 | Watchdog 偵測 5min 無 stdout + DB target → auto-close |
| L4 | Timeout | 30-40min | Watchdog 超時 → force-kill |

### 中控主動控制（補充 L1-L4）

| 操作 | 時機 | 指令 |
|------|------|------|
| 狀態檢查 | 每批次啟動後 | `--status` |
| 殭屍清理 | 每批次完成後 | `--check-zombie` |
| 強制關閉 | 子視窗卡住時 | `--kill {story_id}` |
| 全部停止 | 緊急情況 | `--kill-all` |

## 檔案

| 檔案 | 用途 |
|------|------|
| `scripts/pipeline-control.js` | 中控追蹤腳本（使用者手動呼叫） |
| `scripts/pipeline-notify.js` | Stop Hook — 子視窗完成通知寫入 |
| `logs/pipeline-active.json` | PID 追蹤檔（由 story-pipeline-interactive.ps1 寫入） |
| `logs/pipeline-notify.json` | 完成通知佇列（由 pipeline-notify.js 寫入） |

## 整合

- **settings.json Stop Hook**: `pipeline-notify.js` 已註冊在 `pipeline-auto-exit.js` 之後
- **story-pipeline-interactive.ps1**: Pipeline Tracker 寫入 `pipeline-active.json`
- **smart-review-fix**: 中控在批次間呼叫 `--check-zombie` 清理殭屍

---

## `close-worker.ps1` 關窗判準(whp-6,`worker_runs` 生命週期專用)

> 對象是 `worker_runs` 表登記的子視窗(whp-3 起),與上方章節描述的 `pipeline-active.json` 追蹤對象**不是同一批**。呼叫方式:`.claude/skills/party-to-pipeline/scripts/close-worker.ps1 -RunId <uuid> [-CallerTrack <track>] [-Override -OverrideReason <text>] [-Force] [-DryRun]`。

### C2 五項前置(`checkClosePreconditions`,零副作用讀取)

| # | 前置 | 未過時 `failedChecks` 值 |
|:-:|------|:----|
| 1 | `run_mode !== 'inline'` | `run-mode-inline`(inline run 從未流向本腳本 —— approved 裁決已在 `gateWorkerRun` 同一交易直達 `closed`,見 `pipeline-subwindow`/`whp-9` dev_notes 裁定) |
| 2 | `lifecycle === 'approved'` | `lifecycle` |
| 3 | `ack_at` 有值 | `ack_at` |
| 4 | `worker_handoffs.gate_result === 'approved'` | `gate_result` |
| 5 | `controller_track` 相符,或 `-Override` + `-OverrideReason` 齊備 | `controller_track` |

五項皆過 → 才進入 C3(4-Tuple 判活,複用 `reap-worker-runs.js` `judgeLiveness()`,不重寫第二套判活邏輯)。

### 三種判活結果 → 三種收尾(C3+C4 同一原子單位,`close-worker-ops.js`)

| 判活結果 | outcome | DB 寫入 | taskkill? |
|:--------|:--------|:--------|:--------:|
| PID 已死(`not-registered`/`window-gone`) | `already-closed` | `lifecycle='closed'`,`close_source='UserClosed'`,`closed_detected_at`(`closed_at` 留 NULL) | 否 |
| PID 存活,CommandLine 相符 | `alive-closed` | `lifecycle='closed'`,`close_source='ControllerAfterHandshake'`(或 `-Force`→`'ControllerForce'`),`closed_at` —— **先寫 DB 再殺**(taskkill 在 C4 之後) | 是,恰 1 次,無 Stop-Process 備援 |
| PID 存活但 CommandLine 不符(`pid-reused`/`cmdline-mismatch`) | `pid-reused` | 零寫入 | 否(ABORT) |

### Exit codes

| Exit | 情境 |
|:----:|------|
| 0 | 成功關閉(含 `already-closed` 路徑)/ `-DryRun` |
| 1 | C4 CAS 落空(`WHP6-E04`,precheck 與此刻之間 lifecycle 已被推進)/ C6 確認窗逾時仍存活(`WHP6-E06`,`requires_attention=1` 已寫,無重試無 Stop-Process fallback) |
| 2 | C2 前置未過(`WHP6-E01`/`E02`/`E05`)/ C3 判活為 PID 重用(`WHP6-E03`)/ 判活探測不可用(`WHP6-E07`) |

### 與本 Skill 上方章節的差異速查

| | `pipeline-control.js`(本 Skill 既有) | `close-worker.ps1`(whp-6) |
|---|---|---|
| 追蹤帳本 | `logs/pipeline-active.json` | `worker_runs` 表 |
| 判活 | 未知(需另行查證該腳本內部) | 4-Tuple(`judgeLiveness()`) |
| 殺前置檢查 | 無明文五項前置 | C2 五項前置(含 inline 排除) |
| 殺後 DB 寫入 | 無(僅 PID 追蹤檔) | CAS 終態(`lifecycle='closed'` + `close_source` + `closed_at`) |
| 誰在用 | `story-pipeline-interactive.ps1` 時代場景(是否仍有生產呼叫端待查證) | whp-3 起登記的 4 支 `worker-{create,dev,review,general}.ps1` |

---

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.1.0** | **2026-08-01** | **`whp-6-directive-delivery-and-close` Skill Sync(Task 6.3)**。首次補上 Version History 表(本 Skill 先前無此章節)。頂端新增邊界說明:本 Skill 記載的 `pipeline-control.js`/`logs/pipeline-active.json` PID 追蹤機制與 party-to-pipeline v4.0.0+ 的 `worker_runs` DB 生命週期是**兩套平行系統**,`worker_runs` 登記的子視窗一律走 `close-worker.ps1`(whp-6 起中控唯一程式化關窗途徑),不得用本 Skill 的 `--kill`/`--kill-all`(兩套帳本互不同步)。新增章節「`close-worker.ps1` 關窗判準」:C2 五項前置表(含 `run_mode='inline'` 排除,對照 `whp-9` dev_notes 記載的跨卡裁定)+ 三種判活結果→三種收尾對照表(`already-closed`/`alive-closed`/`pid-reused`,先寫 DB 再殺的順序)+ Exit codes(0/1/2 對照 `WHP6-E01~E07`)+ 與既有 `pipeline-control.js` 的差異速查表。「四層自動關閉機制」章節標註為已被 whp-2 取代之歷史敘述(未刪除,保留供歷史參考)。`disable-model-invocation: true` 不變(僅使用者手動觸發)。走 `Skill(skill="skill-builder")` Mode B。 |
| 1.0.1 | 2026-04-05 | (歷史,本次補建 Version History 前無沿革記錄。) |
