# 6.3 ★ Pipeline 子視窗派發與握手閉環

**版本**: 3.2.0
**建立日期**: 2026-08-07 15:56:13
**更新日期**: 2026-08-10 00:21:48
**上層**: [開發環境架構清單（總表）](../00-開發環境架構清單.md)

> 子視窗派發雙向握手（9 態 lifecycle）+ 常駐守護迴圈 + Monitor 送達層 + ctrl-channel 多視窗訊息板

---

用於把工作分派給獨立的 Claude Code 視窗並行執行。

四個層次要分清楚，後面各節分別展開：

| 層 | 是什麼 | 誰負責 |
|:--|:--|:--|
| **契約層**（§6.3.1） | 一次 run 從派發到關窗的有序交接 —— `worker_runs.lifecycle` 狀態機 | 中控 ⇄ worker 雙向 |
| **觀測層**（§6.3.2） | 「視窗還在不在 / 回報有沒有人收 / 有沒有卡住」 | 常駐守護迴圈（旁路，不參與握手） |
| **送達層**（§6.3.3） | 把觀測層的判定**推進中控對話** —— 補「通知已產生但沒人來看」 | `Monitor` 工具 + `party-to-pipeline/scripts/watch.cjs`（v5.26.0 起為標準腳本；紀律面 SSoT 仍在 `main-controlled-mode.md` §4.6） |
| **通訊層**（§6.4） | 多個**中控視窗之間**的訊息板 | ctrl-channel |

> 觀測層與送達層常被誤認為重複。分界是：**守護是感測器（偵測 + 判定 + 寫 DB），Monitor 是電鈴（只送達）**。
> 守護的通知要靠 `UserPromptSubmit` hook 在中控**下一次有 prompt** 時注入 —— 沒有下一個 prompt 就送不到，
> 這正是 §6.3.3 補的缺口。

**腳本**（`.claude/skills/party-to-pipeline/scripts/`，20 個檔案 = 17 支 `.ps1` + 2 份 protocol 範本 + `workers-mcp.json`）：

| 腳本 | 職能 |
|------|------|
| `dispatch-general.ps1` | 派發薄手 —— BMAD 三階段（`-Phase`）與通用任務（Mode C）共用同一支 |
| `worker-create.ps1` / `worker-dev.ps1` / `worker-review.ps1` / `worker-general.ps1` | 四種 worker 角色 |
| `preflight-dispatch.ps1` | 派發前五項檢查，首個 BLOCK 即停 |
| `register-run.ps1` | 註冊執行記錄（`-Mode Register` 寫 `dispatching` / `-Mode Confirm` 回填 PID → `running`） |
| `stop-report.ps1` | worker 回報（Stop hook 呼叫）—— 寫 IPC status + CAS 推進 `reported` |
| `knock-controller.ps1` / `knock-worker.ps1` / `console-knock.ps1` | 敲門通知（原語 + worker 域 / 中控域兩個包裝） |
| `close-worker.ps1` | **中控唯一程式化關窗途徑**（握手 approved 後才可呼叫） |
| `pipeline-guardian.ps1` / `ensure-guardian.ps1` | 常駐守護迴圈（見 §6.3.2） |
| `shared-utils.ps1` | 共用 helper（Logger / 原子寫 JSON / IPC / DB / model 路由） |
| `orchestrator.ps1` | 編排器（E1 已 FROZEN，禁派發） |
| `smoke-test.ps1` | 冒煙測試（16 個 group，涵蓋衝突矩陣 / 4-Tuple 判活 / 註冊雙寫 / 握手 CAS / 敲門靜態守護等） |

### 6.3.1 雙向握手協議（契約層）

握手鏈的唯一 SSoT 是 `worker_runs.lifecycle`，共 **9 個值**：6 個非終態 + 3 個終態。

```
   中控 preflight-dispatch.ps1（五項檢查，首個 BLOCK 即停）
        │  STORY_STATE · NON_TERMINAL_RUN · PREV_PHASE_CLOSED
        │  MIGRATION_WINDOW · UNREAD_MESSAGES
        ▼
   中控 dispatch-general.ps1
        │  register-run -Mode Register（INSERT 佔位列）
        ▼
   [dispatching] ── 已登記，視窗尚未確認
        │  register-run -Mode Confirm（回填 wrapper_pid / cmd_line / window_title）
        ▼
   [running] ────── worker 執行中；薄手有界確認即退出，中控不空等
        │           ★ 此後中控與 worker 無同步連線，唯一還在看的是守護迴圈（§6.3.2）
        │
        │  worker turn 結束 → stop-report.ps1
        │  （先 D2 有界輪詢；命中中控新指示則同視窗續轉，不推進 lifecycle）
        ▼
   [reported] ───── 已回報（寫 IPC status-{phase}.json + CAS 推進）
        │           ★ 握手鏈在此「停住」等中控 —— 守護負責把 notify_count 推上去，
        │             再由 worker-notify-inject.js 送進中控的下一個 prompt
        │
        │  中控跑六證據鏈驗證：
        │    IPC status=completed · error 空 · workflow_invoked=true
        │    evidence_incomplete=0 · DB status 達標 · 時間戳齊備 · 產出欄位非空
        │  中控 ack_worker_run（簽收）
        ▼
   [awaiting-review] ── 待裁決
        │  中控 gate_worker_run
        ├──── verdict=revise ──► [revising] ──┐
        │                                      │ 指示入 worker_messages
        │     ┌────────────────────────────────┘ D2 快環 / 慢環敲門，原視窗續作
        │     └──► 回到 [reported]
        │
        ├──── verdict=rejected ──► [failed]（分析後重派）
        │
        ▼  verdict=approved
   [approved] ───── 閘門通過
        │  中控 close-worker.ps1（C4 CAS 寫終態「先於」C5 taskkill）
        ▼
   [closed] ─────── 視窗關閉（close_source=ControllerAfterHandshake）

   ┌─────────────────────────────────────────────────────────────────┐
   │ [abandoned] ── 異常終態（主鏈之外）                              │
   │   守護 / reaper 判定「視窗已消失且無人收尾」時就地標記           │
   │   close_source=Unknown · requires_attention=1                   │
   └─────────────────────────────────────────────────────────────────┘
```

> ⚠ **覆核修正（2026-08-10）**：前版圖把 `[ack]` 畫成獨立狀態並稱「六態」，實測不成立 ——
> `ack_worker_run` 是 **`reported → awaiting-review` 的轉移動作**，不是狀態值
> （`worker-protocol-ops.js:169` CAS `WHERE lifecycle='reported'`）。同時補上前版缺漏的
> `dispatching` / `revising` / `failed` / `abandoned` 四態。lifecycle 值域權威定義見
> `.context-db/scripts/reap-worker-runs.js` 的 `NON_TERMINAL_LIFECYCLES`（6）+
> `TERMINAL_LIFECYCLES`（3）。

**實績**（盤點時 68 筆 run）：`closed` 50 筆（`close_source=ControllerAfterHandshake`）·
`abandoned` 17 筆（`close_source=Unknown`，其中 16 筆死在 `running`、1 筆死在 `awaiting-review`）·
1 筆進行中。`notify_count > 0` 共 50 筆。

**中控 → worker 的指示三通道**（revise 迴圈用，皆「只敲門不推內容」，指示 body 一律由 worker 自己讀 DB）：

| 通道 | 時機 | 機制 |
|:--|:--|:--|
| D1 開工注入 | worker 下次 spawn / `-Resume` | `read-worker-directives.js` 於 prompt **前綴** banner |
| D2 快環 | turn 即將結束的 `hookGraceSec`(120s) 窗內 | Stop hook 輪詢命中 → `decision:"block"` 同視窗續轉 |
| 慢環敲門 | worker 已 idle（D2 窗已過） | `knock-worker.ps1` → 對 console 注入一行 ASCII + Enter |

**關鍵紀律**：
- 派發前寫並行通告（他軌任務 / 勿觸碰 / 交疊閉環 / commit 界限）
- **dispatch timeout ≠ worker hung** —— 薄手退出只代表放棄等待，worker 仍在跑；驗 DB + IPC 狀態才判定
- **判活與 lifecycle 分離** —— 判活唯一權威是 4-Tuple 現場探測（`judgeLiveness()`），
  `lifecycle` 只是「最後觀測到的狀態機標記」，禁單獨拿它判斷「此刻還活著嗎」
- **視窗永不自動關閉** —— worker 自關 watchdog 已全數退場

**🔴 關窗有且僅有兩條合法途徑**（這是本機制最常被誤述的一點）：

1. **中控走完雙向握手後關** —— `gate_worker_run` 裁定 `approved` 之後，由**派發該子視窗的那個中控主對話視窗**呼叫 `close-worker.ps1`。
   五項前置 + 4-Tuple 判活 + CAS 終態先寫後殺，缺一不可。**誰派發誰負責關**。
   - **第二階段 `-Reap`（2026-08-11）**：第一階段送出 taskkill 後視窗仍存活（`WHP6-E06`）時的收尾路徑。
     因為採「先寫終態後殺」，此刻 DB 已是 `lifecycle='closed'`，該 run **永久**過不了第 1 條的 `approved` 前置
     （實測第二次呼叫逐字回 `WHP6-E01 failedChecks: lifecycle`）—— **E06 不是「重試一次就好」，
     而是使該 run 在正規途徑上失去關窗能力**，這正是先前「每張卡都要人工關窗」的結構性原因。
     `-Reap` 開在**同一條授權途徑之內**（不是第三條途徑）：入場條件為第一階段留下的特徵組合
     （`closed` + `requires_attention=1` + `close_source` 可收屍），握手證據逐項沿用不放寬，
     判活仍複用同一個 `judgeLiveness()`；差別只在**手段升級** —— 第一階段刻意只下一次 taskkill 不 fallback，
     第二階段追加 `Stop-Process -Force`，理由是**第一階段那次 taskkill 已對這個 PID 證明無效，
     重試同一招沒有理由會成功**。第二階段若仍未終止 → `WHP6-E10` 並回寫旗標保持可重入。
2. **使用者手動關閉視窗**。

除此之外沒有第三條。守護迴圈**兩條都不是** —— 它零終止原語、零關窗（§6.3.2）；
繞道 `taskkill` / `Stop-Process` 會被 `worker-kill-guard.js` 對 `lifecycle ∈ {running, revising}` 條件式 hard-block。

> ⚠ **語意修正（2026-08-10）**：程式碼註解與部分 rule 中仍留有「kill 與關窗永遠是人的決策」
> 這句 **whp-2 過渡期措辭** —— 該說法成立於「取消自動關窗、但尚無任何程式化關窗途徑」的那段期間。
> whp-6 落地 `close-worker.ps1` 後已不精確：**握手完成後由中控關窗，是與使用者手動關窗並列的合法途徑**，
> 不是「人以外的例外」。守護迴圈的鐵則要獨立表述為「**守護自己零 kill 零關窗**」，
> 而非「只有人能關」—— 兩者混講會讓人誤讀成中控無權關窗。

**便攜版**：`party-to-pipeline-portable/`（含 INSTALL.md + 架構原理說明 + hooks snippet）

---

### 6.3.2 守護迴圈（觀測層）

**一句話定位**：住在所有子視窗**外面**的常駐單例，持續回答「視窗還在不在 / 回報有沒有人收 /
有沒有卡住」三個問題，把答案寫回 `worker_runs` 旗標欄位。**它不參與握手，只觀測握手。**

#### 為什麼需要它

取消 worker 視窗自動關閉之後，系統裡出現一段**完全沒有觀察者**的空窗。原本有兩個，取消後都沒了：

| 舊觀察者 | 住在哪 | 為何失效 |
|:--|:--|:--|
| worker close watchdog | worker 進程**自己裡面** | worker 掛了 watchdog 一起掛；且其職責是關窗，已隨自動關窗一併退場 |
| dispatch 等待迴圈 | 派發薄手**自己裡面** | 薄手改為有界確認即退出，退出後系統內零觀察者 |

守護迴圈住在兩者外面，所以**兩者都掛了它還在**。它補的是握手鏈的三個「沒人看」缺口：

1. `running` 期間視窗死掉 → 沒人知道，run 永遠停在 `running`
2. `reported` 後中控沒回來 → 沒人催，回報永遠沒人收
3. worker 卡住不寫檔 → 沒人偵測，中控傻等

> 這三個缺口有實測值：歷史 733 筆派發紀錄中 **33 筆（4.5%）永久停在 `running`**。

#### 三層架構（薄宿主 / 厚決策）

```
ensure-guardian.ps1          冪等自癒 spawner — 每次派發呼叫，恆 exit 0（絕不擋派發）
        │ spawn -WindowStyle Hidden
        ▼
pipeline-guardian.ps1        常駐宿主 — 持鎖 + 雙節奏排程 + log，零判定邏輯
        │ 每輪 spawn 一個 node subprocess
        ▼
guardian-tick.js             決策層 — 純函式，26 條 BR，5 個 loop + heartbeat（64 tests）
        │ import（禁重寫）
        ▼
reap-worker-runs.js          judgeLiveness() 4-Tuple + probeLiveProcesses()
        │ 讀寫
        ▼
worker_runs（旗標欄位）+ guardian_heartbeat（單列 id=1）
```

判定邏輯全在 JS 純函式且每個外部依賴皆可注入（`dbPath` / `now` / `probeFn` / `mtimeFn` / `config`），
所以 26 條規則能用 seed 列 + 假 proc map + 假 mtime 驗證，**不需 spawn 任何真實 worker**。

**單例機制**：全生命週期持有 `logs/pipeline-guardian.lock` 的 file handle（`FileShare::None`）。
handle 即擁有權。刻意不用 CreateNew marker（崩潰留檔會**永久**擋住自癒），也不用
「既存 PID 存活性檢查」（死 PID 被 OS 回收給無關行程後會**永久**誤判「還有守護活著」）。

#### 雙節奏 tick 與五個 loop

| 節奏 | 週期 | Loop | 做什麼 | 寫什麼 |
|:--|:--:|:--|:--|:--|
| fast | 30s | **B** | 首次通知：`reported` ∧ 未簽收 ∧ `notify_count=0` | `notify_count=1` |
| fast | 30s | **A** | 存活偵測：4-Tuple 判活 | 判死 → `lifecycle='abandoned'` + `requires_attention=1` |
| fast | 30s | — | heartbeat upsert | `guardian_heartbeat` 全欄 |
| slow | 600s | **C** | 30/10/10 停滯偵測 | `stall_rounds` / `health_flag='stalled-suspect'` |
| slow | 600s | **D** | 逾期催辦：距上次通知 ≥ 10min | `notify_count + 1` |
| slow | 600s | **E** | 待審逾期統計 | **不寫 DB**，只計數進報告 |

**主迴圈流程**（宿主 `pipeline-guardian.ps1`）：

```
   每次派發 → register-run.ps1 → Ensure-Guardian（冪等 · fail-open · 恆 exit 0）
                                        │
                        ┌───────────────┴───────────────┐
                        │ pid 檔 + CommandLine 比對存活？ │
                        └───┬───────────────────────┬───┘
                       是 → no-op, exit 0      否 → 行程掃描複驗（第二判準）
                                                     │  找到 → 回寫 pid 檔, exit 0
                                                     │  沒有 ↓
                                            Start-Process -WindowStyle Hidden
                                                     ▼
                        ┌────────────────────────────────────────────┐
                        │ 取 pipeline-guardian.lock（FileShare::None）│
                        │   取不到 → 已有守護在跑，exit 0（單例保證） │
                        │   取到   → 寫 .pid，進入主迴圈             │
                        └───────────────────┬────────────────────────┘
                                            │
            ╔═══════════════════════════════▼═══════════════════════════════╗
            ║                        while ($true)                          ║
            ╚═══════════════════════════════╤═══════════════════════════════╝
                                            │
                     ┌──────────────────────▼──────────────────────┐
                     │  node guardian-tick.js --fast   （每 30s）  │
                     │    Loop B（首次通知）→ Loop A（存活）        │
                     │    → heartbeat upsert                       │
                     └──────────────────────┬──────────────────────┘
                                            │
                        牆鐘相減 ≥ 600s ？ ─┤
                                       是 → │
                     ┌──────────────────────▼──────────────────────┐
                     │  node guardian-tick.js --slow               │
                     │    Loop C（30/10/10 停滯）→ Loop D（催辦）   │
                     │    → Loop E（待審統計，不寫 DB）             │
                     └──────────────────────┬──────────────────────┘
                                            │
                          fast 回報 idle_exit ？
                            是 → 乾淨退出（guardian_pid 寫 null，釋放 lock）
                            否 → Start-Sleep 30s ──► 回到迴圈頂
```

排程用**牆鐘相減**而非累加迭代計數 —— 機器休眠或延遲喚醒後仍在正確時機觸發。更關鍵的是
**每輪 tick 的判定本身無狀態**，只看 DB 內容與檔案 mtime，不依賴守護自己活了多久；
宿主重啟只影響「下一輪慢 tick 何時觸發」，不影響任何一輪判定的正確性。

**fast tick 內部**（順序本身就是正確性的一部分）：

```
   guardianTick(mode='fast')
       │
       ├─ 1. SELECT 非終態候選列                        ★ 先取快照
       │      lifecycle IN (dispatching, running, reported,
       │                    awaiting-review, revising, approved)
       │
       ├─ 2. probeLiveProcesses()  單次批次探測（常數命令字串，零 DB 值插入）
       │        └─ 拋錯 → probe_unavailable=true，liveProcMap=null（fail-open）
       │
       ├─ 3. Loop B ── 首次通知                          ★ 必先於 Loop A
       │      reported ∧ 未簽收 ∧ notify_count=0 → notify_count=1
       │
       ├─ 4. Loop A ── 存活偵測
       │      liveProcMap == null ?  ──► 全跳過，絕不判死
       │      run_mode='inline'   ?  ──► 跳過（無視窗可消失）
       │      dispatching 且無 PID ?  ──► 年齡規則（180s 才算放棄），未逾期則跳過
       │      judgeLiveness 4-Tuple
       │           alive ──► 計數，不寫 DB
       │           dead  ──► CAS UPDATE lifecycle='abandoned'
       │                            + requires_attention=1
       │                            + abandoned_at_stage / window_vanished_at
       │
       └─ 5. heartbeat upsert（id=1 單列）
              全 run 終態 ∧ 閒置 ≥ 60min ──► idle_exit=true，guardian_pid=null
```

**為何「先 SELECT 才 probe」**：CAS 的比對基準必須是「探測當下已讀到的快照」。
若探測排在 SELECT 之前，探測期間中控搶先推進 lifecycle 的寫入會在 SELECT 時就已生效，
競態偵測整個失效。

**為何「Loop B 必先於 Loop A」**：A 會把「已回報但視窗已消失」的列就地推成 `abandoned`，
而 B 的候選鍵在 `lifecycle='reported'` —— A 先跑，這類列的首次通知**永不觸發**，
催辦階梯就再也接不到這筆未簽收的回報，正好是守護要堵的黑洞。
B 先跑不影響 A：B 只寫 `notify_count`，不動 `lifecycle`。

#### Loop C 的停滯判準

以「**檔案活動**」為 worker 仍在工作的證據（實質工作必然寫檔）。判準是存在性，不是快照差分：

```
active ⟺ ∃ p ∈ scope : (now - mtime(p)) < 10min      首個命中即提早退出，零狀態儲存
```

scope 三層，**降序訊號強度**：

| 順位 | 來源 | 說明 |
|:-:|:--|:--|
| 1 | `files_modified` 逐筆 | 最高訊號，天然 per-run；逐筆路徑 confinement，越界者絕不 stat |
| 2 | `ipc_dir` 子樹 | 一律納入 |
| 3 | `work_root` 子樹 | **僅當它不等於控制平面根** |

第 3 條的排除是重點：非 worktree 模式下 `work_root` 就是 repo root，若納入遞迴走訪，
**多軌並行時他軌的寫入會讓本 run 永遠「看似有活動」，停滯永遠測不出來**。

```
T0 + 40min 才首檢（30 首檢 + 10 複查間隔）
  ├─ active   → stall_rounds = 0，清 health_flag
  └─ 不 active → stall_rounds + 1
                  └─ 達 2 輪 → health_flag='stalled-suspect' + requires_attention=1
                                ★ lifecycle 完全不動 · 零 kill
```

中控收到旗標後三選一：**續等**（可能長思考中未寫檔）／**喚醒**（提醒使用者查看該視窗畫面）／
**重派**（使用者親自關窗後重新派發）。`stalled-suspect` 是「**疑似**停滯」不是「已死」——
通知面特意以「疑似停滯」渲染，寫成「已死」會誤導中控做出錯誤裁決。

#### 欄位職責分工（權限邊界不靠自律，靠欄位切分）

同一張 `worker_runs` 表，握手鏈與守護寫的欄位幾乎不重疊：

```
├─ 握手鏈專屬（守護絕不寫）
│    lifecycle ∈ {dispatching, running, revising, reported,
│                 awaiting-review, approved, closed, failed}
│    reported_at    ← worker Stop hook CAS
│    ack_at/ack_by  ← 中控 ack_worker_run
│    closed_at      ← 中控 close-worker（close_source=ControllerAfterHandshake）
│
├─ 守護專屬（握手鏈絕不寫）
│    notify_count / last_notified_at      ← Loop B / Loop D
│    stall_rounds / health_flag           ← Loop C
│    window_vanished_at / closed_detected_at / abandoned_at_stage  ← Loop A
│
└─ 交界欄位（值域切開，不會撞）
     lifecycle       守護只寫一個值：'abandoned'（異常終態，在主鏈之外）
                     ★ 永不寫 reported / awaiting-review / approved / closed
     close_source    守護寫 'Unknown'（沒人收尾）
                     中控寫 'ControllerAfterHandshake'（握手後正常收尾）
     requires_attention  守護寫 1（升旗）· 中控 / DevConsole 清 0（降旗）
```

#### 判活判準共用，但失敗方向相反

`judgeLiveness()` 4-Tuple（PID > 0 → PID 在活行程 map → CommandLine 含 `ipc_dir` → 含 `worker-*.ps1`）
有四個消費端：守護 Loop A、`close-worker.ps1` 關窗前置、`knock-worker.ps1` 敲門前置、批次 reaper。
**禁重寫**，四者用同一份判準。但探測不可用時的方向刻意相反：

| 消費端 | 方向 | 理由 |
|:--|:--|:--|
| 守護 Loop A | **fail-open** — 全跳過，絕不判死 | 誤判死 = 對正在工作的 worker 升紅旗 |
| `close-worker.ps1` | **fail-closed** — exit 2 拒絕關窗 | 誤判活 = 對陌生 console 下 taskkill |

同一份判準、同一個探測結果，因為後果不對稱，失敗方向就必須相反。

#### 通知怎麼抵達中控

守護**不主動推**任何東西，它只寫 DB 欄位。真正的送達在另一顆 hook：

```
guardian 寫 notify_count / requires_attention / health_flag
        │ 唯讀彙整（worker 子視窗在開 DB 前即 exit，零污染）
        ▼
worker-notify-inject.js（UserPromptSubmit 第 5 顆 hook）
        │ 六類待辦：🔔 待確認 / 🔍 待驗證 / 🚪 待關窗 / 🔴 需注意 / ⚠ 流程異常 / 👁 守護心跳
        ▼
中控「下一次送出 prompt」時看到 [待辦]
        └─ notify_count ≥ 3 或有流程異常 → 額外升級 systemMessage
```

所以守護的可見性有一個前提：**中控必須繼續活動**。中控派發後不該空等，
但序列依賴且無其他可推進項時要掛監看器，否則通知鏈完好卻沒人來取。

> 這個前提不成立時會發生什麼、中控該掛什麼、以及「掛了但寫錯」的實例 —— 見 **§6.3.3 送達層**。

#### fail-open 貫穿全鏈

| 失敗點 | 行為 |
|:--|:--|
| 行程探測拋錯 | Loop A 全跳過，記 `probe_unavailable`，exit 0 |
| 任一 loop 拋錯 | 已完成的其餘寫入保留，**不整輪回滾**，記 `last_error`，exit 0 |
| config 讀不到 / 壞掉 | 退回內建預設，記錯誤碼，繼續跑 |
| `Ensure-Guardian` 任何例外 | **恆 exit 0** —— 守護非關鍵路徑，絕不因它失敗而擋住派發 |
| 唯一 exit 1 | DB 開不起來（且此時未寫入任何東西） |

**閒置退出**：全部 run 皆終態且閒置逾 60 分鐘 → 乾淨退出，`guardian_pid` 寫 `null`。
這個 null 是「乾淨退場」標記，通知面據此區分「預期靜止」與「真正失聯」；
下次派發時 `Ensure-Guardian` 會再把它拉起來。

#### 小結：與握手鏈的時間軸關係

把 §6.3.1（契約層）與本節（觀測層）疊在同一條時間軸上，才看得出兩者如何分工。
左欄是握手鏈推進，右欄是同一時刻守護在做什麼：

```
時間  握手鏈（中控 ⇄ worker 雙向）              守護迴圈（第三方旁路）
════════════════════════════════════════════════════════════════════════════
 T0   preflight 五檢查
      │ NON_TERMINAL_RUN 檢查 ◄──────────── 讀守護標記的 abandoned 列
      ▼                                      （守護收屍，preflight 才不會誤擋重派）
 T1   register -Mode Register
      │ INSERT lifecycle='dispatching'
      └─► Ensure-Guardian ────────────────► ★ 守護在此被拉起（冪等 · fail-open）
      ▼
 T2   spawn worker 子視窗
      ▼
 T3   register -Mode Confirm
      │ dispatching → running               ┌─ fast tick 30s ───────────────┐
      ▼                                     │ Loop A: 4-Tuple 判活           │
 T4   薄手有界確認即退出                     │   活 → 計數，不寫 DB           │
      ★ 中控與 worker 之間                   │   死 → abandoned + 升旗        │
        零同步連線                           └────────────────────────────────┘
      │  worker 跑 workflow                  ┌─ slow tick 600s ──────────────┐
      │  每 turn Stop hook 寫心跳            │ Loop C: 30/10/10 停滯偵測      │
      │  （turn_count / files_modified）     │   T0+40min 才首檢              │
      │   └─ 這份 files_modified 正是 ─────► │   連 2 輪零檔案活動            │
      │      Loop C 的最高訊號來源           │   → health_flag='stalled-      │
      │                                      │      suspect'（lifecycle 不動）│
      ▼                                      └────────────────────────────────┘
 T5   Stop hook: running → reported
      │ 寫 IPC status-{phase}.json
      ▼                                      ┌─ fast tick ───────────────────┐
 T6   ★ 握手鏈在此「停住」等中控             │ Loop B: notify_count = 1       │
        worker 已回報，但中控不知道          └────────────────────────────────┘
                                             ┌─ slow tick ───────────────────┐
                                             │ Loop D: 每 10min notify_count++│
                                             └───────────────┬────────────────┘
      ◄──────────────────────────────────────────────────────┘
      worker-notify-inject.js → 中控下次 prompt 看到「🔔 待確認 N 筆」
      │
      ▼
 T7   中控六證據鏈 → ack_worker_run → awaiting-review
      ▼                                      ┌─ slow tick ───────────────────┐
 T8   gate_worker_run                        │ Loop E: 待審逾期只計數         │
      ├ revise → revising → 回 T5            │         完全不寫 DB            │
      ├ rejected → failed                    └────────────────────────────────┘
      ▼ approved
 T9   close-worker.ps1（CAS 寫 closed 先於 taskkill）
      ▼
T10   commit 波 → 下一階段回 T0
                                             ┌─ fast tick ───────────────────┐
                                             │ 全終態 ∧ 閒置 60min            │
                                             │ → idle_exit 乾淨退出           │
                                             │   （下次派發再被拉起）         │
                                             └────────────────────────────────┘
```

兩個關鍵時刻決定了守護的存在價值：

- **T4 之後**：薄手已退出，中控與 worker 之間**零同步連線**。這段期間唯一還在看的就是守護。
- **T6**：握手鏈物理上會停住等中控。worker 已寫 `reported`，但中控不會自己知道 ——
  **是守護的 Loop B/D 把 `notify_count` 推上去，再由 hook 送進中控的下一個 prompt**。
  守護在這裡是握手鏈的**傳輸層**，但它不代替中控簽收。

依賴方向是**單向**的：守護 import 握手鏈的判活模組與 lifecycle 常數，
握手鏈完全不 import 守護的任何東西；`Ensure-Guardian` 呼叫點 fail-open ——
**守護整個掛掉，派發照跑，只是失去觀測**。

#### 鐵則

三支檔案的檔頭都明寫：**零行程終止原語、零檔案刪除原語、絕不關窗、絕不派發**。
守護只回報、只提醒。偵測到卡住也不代人決策 —— 關窗授權來自握手鏈（`approved`）或使用者，
守護不是授權方（見 §6.3.1 關窗兩條合法途徑）。

**相關 config**（`scripts/pipeline-config.json` → `workerProtocol`）：
`guardianFastTickSec`(30) · `guardianSlowTickSec`(600) · `guardianIdleExitMin`(60) ·
`guardianDispatchGraceSec`(120) · `guardianScopeMaxFiles`(2000) · `stallFirstCheckMin`(30) ·
`stallRecheckMin`(10) · `stallRoundsToFlag`(2) · `ackCheckIntervalMin`(10) ·
`guardianStaleMin`(5) · `ackEscalateAfterRounds`(3)

**查目前狀態**（唯讀，不取鎖，無論守護是否在跑皆可安全呼叫）：

```powershell
powershell -File .claude/skills/party-to-pipeline/scripts/pipeline-guardian.ps1 -Status
# guardian_pid / host / freshness_sec / watched_runs / last_error
```

---

### 6.3.3 送達層（Monitor 電鈴）

**一句話定位**：把守護已經寫進 DB 的判定**主動推進中控對話**。它不偵測、不判定、不參與握手 ——
補的是「通知已經產生，但沒人來看」那一段。

#### 為什麼需要它 —— 守護的通知有一個前提條件

送達路徑本身已完整寫在 **§6.3.2「通知怎麼抵達中控」**（守護只寫 DB → `worker-notify-inject.js`
→ 中控下次 prompt），本節不重述，只接著談那條路徑的**前提條件**與中控該怎麼做。

關鍵在 `worker-notify-inject.js` 掛的是 **`UserPromptSubmit`** —— 顧名思義，
**要有 prompt 被送出才會觸發**。所以整條鏈的隱含前提是**「中控會繼續活動」**。
E2 模式本來就假設中控持續在線，所以這個前提平常成立。

**不成立的那個場景**：中控 dispatch 後依 §4.6 ① 結束 turn，使用者剛好離開 ——
沒有下一個 prompt，`reported` 的通知就靜靜躺在 DB 裡。

> **實證（`bwu-12`，2026-08-03 22:18–22:34）**：worker 22:18:44 寫入 `reported`，
> guardian `notify_count=2`，`worker-notify-inject` 也確實在下個 prompt 注入了 `[待辦]` ——
> **通知鏈每一環都正確**。但中控 21:12 dispatch 後結束 turn 且未掛 Monitor，使用者離開，
> 於是 `reported` **停等 16 分鐘**。使用者觀感是「雙向握手協議斷訊」，查證結論卻是
> **機制零斷點，偏離的是中控行為**。

這就是 Monitor 存在的全部理由：**它走 harness 事件主動推送，不需要有人先開口。**

#### 規範演進（為何從「可選」變成「必掛」）

| 版本 | 日期 | §4.6 ② 的措辭 | 為什麼改 |
|:--|:--|:--|:--|
| v5.23.0 | 2026-08-03 | Monitor 為「序列依賴時的**例外工具**」 | 三條等待紀律首次成文 |
| **v5.24.1** | **2026-08-03** | 「序列依賴且無其他可推進項時，結束 turn 前**必掛**」（**MUST**） | `bwu-12` 顯示：**保守措辭正好讓中控合理化不掛** —— 當時序列依賴確實成立（CR 完全依賴該卡、中控無其他工作），中控讀了「例外工具」四字便判斷本次不屬例外 |

#### §4.6 三條等待紀律

| # | 紀律 | 理由 |
|:-:|:--|:--|
| ① | **dispatch 後不空等** —— 去做下一件事或結束 turn | 通知走 hook 注入，該路徑本就完整 |
| ② | **序列依賴且無其他可推進項時，結束 turn 前必掛 `Monitor` + `persistent`**；終止條件須**同時涵蓋完成與異常** | 只監看成功信號時，worker 崩潰與仍在跑的外顯**完全相同** |
| ③ | **禁以 Bash `run_in_background` 開長迴圈等 worker** | 2026-08-03 實測兩次皆被中止；第二次設定已對齊仍被中止且**原因未查明**（只記錄實測，不做超出證據的推論） |

#### 兩條最容易搞混的界線

**① Monitor 是送達管道，不是第二套偵測。**
守護已用 4-Tuple 判活（防 PID 重用），中控在 Monitor 腳本裡再寫一次 `Get-Process -Id $PID`
等於**用較弱的方法重複跑已經有人在做的事**。終止條件應只讀守護寫好的 DB 欄位
（`lifecycle` / `health_flag` / `requires_attention`）與 IPC `status`。

> **反面教材（2026-08-10 實測，本專案中控自己犯的）**：中控為三張卡掛的 Monitor 腳本
> 皆含 `powershell -Command "if (Get-Process -Id $PID ...)"` 存活探測，每輪一次。
> 經使用者提問「守護迴圈有在運作的話為什麼還要派一個監控的排程監控子視窗？」後查證：
> 守護確實正常（`guardian_pid=36784`，連續運作 12 天，`freshness_sec` 27.2，`watched_runs` 1），
> **職能差異成立（送達 vs 偵測），但腳本內的重複探測屬實**。已記
> `memory/feedback_monitor_is_delivery_channel_not_second_detector.md`。

**② Monitor 是通知捷徑，不是判定依據。**
響了**不代表**可以跳過 GATE 六證據鏈；沒響**不代表**worker 未完成。
判定權威永遠是 `worker-lifecycle-judgment.md` §1 的 4-Tuple + IPC status。

> 相關陷阱見 §6.3.1：`reported` 是**每個 turn 結束都會寫**的狀態，不是完成信號。
> Monitor 終止條件若設 `lifecycle=reported`，會在 worker 還在寫程式碼時誤報完成 ——
> 正確判準是 IPC `status=completed` **且** DB 達該 phase 目標狀態。

#### 三者分工一句話

| 元件 | 角色 | 鐵則 |
|:--|:--|:--|
| **守護迴圈** | 感測器 —— 觀測、判定、寫回 `worker_runs` | 零 kill / 零關窗 / 零派發 |
| **`worker-notify-inject.js`** | 郵差 —— 把待辦注入中控下一個 prompt | 唯讀，需有 prompt 才觸發 |
| **`Monitor`** | 電鈴 —— harness 事件主動推送 | 不偵測、不判定，只送達 |

#### 標準腳本（v5.26.0 起 —— 前版「非 scripts 資產」的誠實邊界已失效）

> **前版逐字**：「Monitor 屬中控端行為紀律，**不是 `party-to-pipeline` 的 scripts 資產** —— 它沒有對應的 `.ps1`」。
> 該敘述自 **2026-08-17** 起不再成立：`party-to-pipeline/scripts/watch.cjs` 已落地。
> **仍成立的部分**：紀律面 SSoT 依舊在 `main-controlled-mode.md` §4.6，且 Monitor **不寫任何 DB 欄位**。

**為什麼需要標準腳本（而非繼續讓中控每次手寫）**：紀律層早已完備（§6.3.3 + §4.6 + ctrl-channel 四個送達點），
但工具層是真空 —— 中控每次掛 Monitor 都當場寫 watcher，腳本住 scratchpad **session 結束即消失**，
且每次重寫都可能再踩同一批坑。**2026-08-17 前台軌中控一個 session 內就寫了四個一次性 watcher**，
其中一個把終止條件寫成「IPC 檔案存在」，在 revise 情境會誤報完成（當場才發現）。
與 `chrome-connect-real-browser` v1.3.0 把 `Wait-CtrlBoard.ps1` 由 scratchpad 固化為 skill 資產屬同型。

| 模式 | 等待對象 | 終止條件 |
|:--|:--|:--|
| 🔴 **`--all <軌別>`**（**中控常駐首選**）| 他軌留言 + 全部非終態 run + L0，**合併同一 tick、同一份輸出** | persistent |
| `--run <run-id>` | 盯住某一個剛派出去的 worker | IPC `status` 值（`completed`/`failed`/`partial`），並比對 baseline timestamp |
| `--ctrl <軌別>` | 僅他軌留言 | persistent（依收件軌別過濾 `ctrl_messages`） |
| `--l0 [root] --phantom "a,b"` | 僅部署前置：工作樹乾淨度 | persistent（狀態翻轉即報） |

⚠ **常駐監看用 `--all`，不要起三個 Monitor**：三者本就共用同一輪詢週期，分開起會產生**交錯通知**反而更難讀；且 `Monitor` 官方說明載明「**產生太多事件的 monitor 會被自動停止**」，合併不只是可讀性，也是避免限流。

> **這是本次固化中唯一由他軌實務推翻中控原設計的一項。** 中控原本按「職責分離」設計三個獨立模式，後台軌（ctrl `#1455`）指出它實務上是**一支腳本同時看三件事**，因為中控要的是「一個電鈴、一份雜訊」而非三個各自響的鈴。已採納並補 `--all`。

**內建三個坑的對策**（皆為實際踩過）：

| # | 坑 | 對策 |
|:-:|:--|:--|
| 1 | IPC `status-{phase}.json` 是**覆寫式** —— 以「檔案存在」為終止條件在 revise 情境必然誤報（第一輪的檔案還在） | 記下啟動時的 baseline timestamp，只認更新後那份 |
| 2 | `reported` 是**每個 turn 結束都會寫**的狀態，不是完成信號 | 判 `status` 值，不判 `lifecycle` |
| 3 | 腳本內自建 `Get-Process` 判活，重複守護的 4-Tuple 職責 | 零行程探測，只讀守護已寫的欄位 |

🔴 **`--l0` 是「Monitor 不是第二套偵測」的唯一例外**：它量的是**本軌自己要不要部署的前置條件**，
不是他軌 worker 狀態，沒有任何守護在量它。（判準來源：後台軌 2026-08-17 ctrl `#1455` §四，
該軌實際以此監看跨軌部署時機，並與前台軌的口頭宣告構成兩條獨立來源。）

#### 🔴 它是輪詢，不是推播 —— 延遲上界即週期本身

`ctrl_messages` 就是一張 SQLite 表，沒有任何 push 機制。**2026-08-17 後台軌三次實測**（週期 120s）：

| 訊息 | 建立 | 送達 | 延遲 |
|:--|:--|:--|:--:|
| #1451 | 15:50:49 | 15:51:42 | 53 秒 |
| #1453 | 16:19:00 | 16:19:05 | **5 秒** |
| #1454 | 16:20:46 | 16:21:05 | 19 秒 |

5 秒那次純粹是剛好落在 tick 前面。**文檔與跨軌回報一律不得寫成「即時」。**

#### 仍在規劃的互補方案

`ccb-5-pending-ack-controller-knock`（epic-ccb，P1/S，backlog）：守護催辦達門檻時，
直接對已登記的 idle 中控視窗敲門（複用 `knock-controller.ps1` 原語鏈），該卡 design 須論證與守護
「絕不派發」鐵則的語意邊界。⚠ 它是**推送**、`watch.cjs` 是**輪詢**，兩者仍互補；
但標準腳本落地後 ccb-5 的相對急迫性下降（輪詢已有可靠工具，推送是延遲優化）。

---

### 6.4 跨軌通訊（ctrl-channel）

多個**中控視窗之間**的訊息板，取代手寫 .md 交接檔。與 §6.3 的中控⇄worker 握手是不同的兩個面向：
握手管「一次派發的交接」，ctrl-channel 管「並行的多個中控如何協調」。worker 子視窗**零注入**。

| 元件 | 內容 |
|------|------|
| 資料表 | `ctrl_threads`（討論串，205）· `ctrl_messages`（500 則）· `ctrl_message_reads`（已讀，1,570）· `ctrl_boards`（看板，2）· `controller_windows`（視窗註冊，20 筆） |
| MCP tools | `post_ctrl_message` · `read_ctrl_messages`（讀取即簽收）· `close_ctrl_thread` · `update_ctrl_board` |
| Hooks | `ctrl-channel-inject.js`（UserPromptSubmit 注入未讀）· `ctrl-channel-probe.js`（PostToolUse 探測）· `ctrl-channel-stop-check.js`（Stop 檢查） |
| 腳本 | `ctrl-channel-ops.js` · `ctrl-unread-sql.cjs` · `ctrl-window-ops.cjs` |
| UI | DevConsole `/channel` |
| 紀律 | 每階段完成必查未讀留言；呼叫前必先判本視窗軌別 |

---

## 版本歷史

| 版本 | 日期 | 變更 |
|:----:|:----:|------|
| **3.3.0** | 2026-08-17 16:3x | **§6.3.3 送達層補「標準腳本」與「輪詢非推播」兩節 —— v3.2.0 的誠實邊界「Monitor 非 scripts 資產」已失效並改寫**。**觸發**：使用者交辦「party-to-pipeline 擔任各軌中控直接掛該 monitors，並將腳本建立在 party-to-pipeline script 內」。**缺口性質**：pre-audit 對齊矩陣顯示紀律層 **100%**（本節 + §4.6 三條 + ctrl-channel 四個送達點皆已完備）而**工具層 0%** —— 中控每次掛 Monitor 都當場手寫 watcher，腳本住 scratchpad **session 結束即消失**。⚠ **2026-08-17 前台軌中控一個 session 內寫了四個一次性 watcher，其中一個把終止條件寫成「IPC 檔案存在」，在 revise 情境會誤報完成**（當場發現）—— 這是本次固化的直接動機，與 `chrome-connect-real-browser` v1.3.0 把 `Wait-CtrlBoard.ps1` 由 scratchpad 固化屬同型。**落地**：`party-to-pipeline/scripts/watch.cjs`（v5.26.0），三模式 `--run` / `--ctrl` / `--l0`，內建三個坑的對策（覆寫式 IPC 不以存在性判斷 · `reported` 非完成信號 · 零行程探測）。🔴 **`--l0` 為「Monitor 不是第二套偵測」的唯一例外** —— 量的是本軌自己的部署前置而非他軌 worker 狀態（判準來源：後台軌 ctrl `#1455` §四，該軌實際以此監看跨軌部署時機，與前台軌口頭宣告構成兩條獨立來源）。🔴 **新增「它是輪詢不是推播」節**：後台軌三次實測 53s / 5s / 19s（週期 120s）⇒ **延遲上界即週期本身**，文檔與跨軌回報一律禁寫「即時」；5 秒那次純屬剛好落在 tick 前。`ccb-5` 定位同步調整為「推送 vs 輪詢互補，但標準腳本落地後其相對急迫性下降」。⚠ **方法論註記**：本目錄整個 gitignore（`.gitignore:157`），**Grep 工具對其假性 0 命中**，本次窮舉三處舊表述靠 Bash `grep -r` 才取得（對齊 `code-review-discipline.md` §5）；中控一度誤把 0 命中歸因為「pattern 寫太複雜」，實為工具盲區。 |
| **3.2.0** | 2026-08-10 00:21 | **新增 §6.3.3 送達層（Monitor 電鈴）**—— 前版三層次架構（契約 / 觀測 / 通訊）缺了「守護的判定如何抵達中控」這一環，導致 §6.3.2 雖已寫「守護在 T6 是傳輸層」，卻未說明該傳輸有**前提條件**。本次補全前因後果:**前因**（`worker-notify-inject.js` 掛在 `UserPromptSubmit`，**要有 prompt 被送出才觸發**，整條鏈隱含前提是「中控會繼續活動」；中控依 §4.6 ① 結束 turn 而使用者剛好離開時，通知即停在 DB）· **實證**（`bwu-12` 2026-08-03 22:18–22:34:worker 已 `reported`、guardian `notify_count=2`、hook 確實注入 `[待辦]`，**通知鏈每一環都正確**，但中控未掛 Monitor 致停等 **16 分鐘**；查證結論為**機制零斷點、偏離的是中控行為**）· **規範演進表**（v5.23.0 「例外工具」→ v5.24.1 **MUST**，並記錄改動理由:保守措辭正好讓中控合理化不掛，因當時序列依賴確實成立）· **§4.6 三條等待紀律表**（①不空等 ②必掛 Monitor 且終止條件須同時涵蓋完成與異常 ③禁 Bash `run_in_background` 長迴圈，第三條附誠實邊界:第二次被中止**原因未查明**，只記錄實測不外推）· **兩條界線**（Monitor 是送達管道非第二套偵測 / 是通知捷徑非判定依據，後者連結 §6.3.1 的 `reported` ≠ 完成陷阱）· **三者分工表**（守護=感測器 / notify-inject=郵差 / Monitor=電鈴）。⚠ **含反面教材（本專案中控自身，2026-08-10 實測）**:中控為三張卡掛的 Monitor 腳本皆含 `Get-Process` 存活探測，屬重複守護的 4-Tuple 判活職責;經使用者提問後查證，守護運作正常（`guardian_pid=36784`、連續 12 天、`freshness_sec` 27.2）**職能差異成立但重複探測屬實**，已記 memory。頂部導引表三層 → **四層**並補「兩層常被誤認重複」的分界說明。**誠實邊界**:Monitor 屬中控端行為紀律（`main-controlled-mode.md` §4.6），**非 `party-to-pipeline` scripts 資產**（無對應 `.ps1`、不寫任何 DB 欄位）;機制面互補方案 `ccb-5-pending-ack-controller-knock` 仍在 backlog。 |
| **3.1.0** | 2026-08-10 00:15 | **守護迴圈補全 + 握手狀態機校正 + 關窗語意修正**。① 新增 **§6.3.2 守護迴圈（觀測層）**完整章節 —— 前版僅在腳本表有「守護程序」一行，未說明其存在理由、架構、判準與權限邊界。本次依「功能架構與用途 / 運作原理 / 運作流程圖」三面向補全：**用途**（取消自動關窗後兩個舊觀察者同時失效，歷史 733 筆派發 33 筆 4.5% 永久停在 `running`；補的是握手鏈三個「沒人看」缺口）· **功能架構**（`ensure-guardian` → `pipeline-guardian` → `guardian-tick.js` → `judgeLiveness()` 四層，薄宿主/厚決策 + file handle 單例，附刻意不採用的兩種互斥方案與其永久卡死原因）· **運作原理**（雙節奏 5 loop 表 · Loop C 存在性判準與 scope 三層降序含 `work_root` 排除控制平面根防跨軌污染 · 欄位職責分工 · 判活共用但 fail 方向相反 · 通知抵達路徑 · fail-open 全鏈 · 閒置退出 · 11 個 config 鍵與 `-Status` 指令）· **運作流程圖 3 張**（主迴圈：Ensure 雙判準自癒 → 取鎖單例 → while 雙節奏 → idle_exit；fast tick 內部：先 SELECT 才 probe、Loop B 必先於 Loop A，兩個順序約束各附「順序錯了會壞在哪」；**守護 × 握手鏈時間軸對照**：T0–T10 左右分欄，標出 T4「零同步連線」與 T6「握手鏈停住等中控」兩個關鍵時刻，並記依賴為單向 + fail-open）。② **⚠ 覆核修正**：握手圖前版把 `[ack]` 畫成獨立狀態並稱「六態」，實測不成立（`ack_worker_run` 是 `reported → awaiting-review` 的**轉移動作**，非狀態值；`worker-protocol-ops.js:169` CAS 為證），且缺漏 `dispatching`/`revising`/`failed`/`abandoned` 四態 —— 全圖重繪為 9 態（6 非終態 + 3 終態，值域權威為 `reap-worker-runs.js` 的兩個常數），補 revise 迴圈與 abandoned 旁路。③ **⚠ 語意修正**：明訂**關窗有且僅有兩條合法途徑**（握手 `approved` 後由派發方中控呼叫 `close-worker.ps1` / 使用者手動），並註記程式碼與 rule 中殘留的「kill 與關窗永遠是人的決策」屬 whp-2 過渡期措辭 —— 該說法成立於「已取消自動關窗但尚無程式化關窗途徑」那段期間，`close-worker.ps1` 落地後會被誤讀成中控無權關窗；守護鐵則應獨立表述為「守護自己零 kill 零關窗」。④ 新增三層次導引表（契約層 / 觀測層 / 通訊層）+ 指示三通道表（D1/D2/慢環）。⑤ **⚠ 覆核修正**數字：`ctrl_messages` 444→**500** · `controller_windows` 11→**20** · 補 `ctrl_threads` 205 / `ctrl_message_reads` 1,570 / `ctrl_boards` 2 · scripts「20 支 PowerShell」→ **20 個檔案 = 17 支 `.ps1` + 2 份 protocol 範本 + `workers-mcp.json`** · smoke 補 16 group 涵蓋範圍（case 總數在上游三處文檔記載不一致 138/189/225，本次僅寫已獨立驗證的 group 數，不引用未驗證數字）· §6.4 補「worker 子視窗零注入」與兩機制的分界。 |
| 3.0.0 | 2026-08-07 20:33 | 由總表 §6.3–6.4 拆出為獨立子章節。 |

---

← [工作流 · BMAD 三大開發流程](05-工作流-BMAD三流程.md) · [總表](../00-開發環境架構清單.md) · [自我演化（ECC Instincts）](07-自我演化-ECC.md) →
