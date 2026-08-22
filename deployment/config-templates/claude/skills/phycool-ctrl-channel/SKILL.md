---
name: phycool-ctrl-channel
description: |
  Use when 跨軌 agent(前台軌 / 後台軌 / 中控 / pipeline 子視窗)需要發送、讀取、關閉、或更新中控聊天室話題與看板時,或需要查閱/分享 DevConsole `/channel` 唯讀觀察頁的深連結時,或需要理解三個通知掛點(UserPromptSubmit 未讀注入 + registry 綁定 / PostToolUse 節流探針 / Stop check-at-stop)與 idle 敲門的觸發條件、軌別解析與職責分工時,或 post_ctrl_message 之後要主動喚醒 idle 收件視窗時。規範 4 個 ctrl-channel MCP tool 的正確呼叫方式與 CAS 語意,取代已於 2026-07-28 凍結唯讀的 2 個手寫 .md 聊天室檔;並說明與 DevConsole UI 觀察面(人眼唯讀,零寫入)、三個 hook 掛點(只敲門不推內容)的分工邊界。
  觸發關鍵字:中控留言, 跨軌溝通, 聊天室, 留言板, ctrl_threads, ctrl_messages, ctrl_boards, controller_windows, post_ctrl_message, read_ctrl_messages, close_ctrl_thread, update_ctrl_board, 簽收, 看板, thread_id, CCB1-E01, CCB4-E01, 已凍結, 非同步聊天訊息討論專區, MCP 掛掉, re-import, DevConsole /channel, 簽收矩陣, 深連結, encodeURIComponent thread_id, ctrl-channel-inject, ctrl-channel-probe, ctrl-channel-stop-check, knock-controller, 未讀注入, 節流探針, check-at-stop, 敲門, 喚醒 idle 視窗, 中控視窗註冊表, 軌別解析, 主視窗手動軌, track_plan.lane, 通知反轉, 10 分鐘輪詢, 收件人過濾, to_tracks 過濾。
version: 1.3.1
updated: 2026-08-04
last_synced_epic: epic-bwu
last_synced_story: bwu-15-closure-debt-triage
disable-model-invocation: false
user-invocable: true
watches:
  - glob: ".context-db/scripts/ctrl-channel-ops.js"
  - glob: ".context-db/scripts/ctrl-unread-sql.cjs"
  - glob: ".context-db/scripts/ctrl-window-ops.cjs"
  - glob: ".context-db/scripts/knock-controller-ops.js"
  - glob: ".context-db/scripts/import-ctrl-channel.js"
  - glob: "tools/dev-console/server/services/channelService.ts"
  - glob: ".claude/hooks/ctrl-channel-inject.js"
  - glob: ".claude/hooks/ctrl-channel-probe.js"
  - glob: ".claude/hooks/ctrl-channel-stop-check.js"
  - glob: ".claude/skills/party-to-pipeline/scripts/knock-controller.ps1"
---

# PhyCool Ctrl-Channel — 中控跨軌聊天室紀律

> **核心任務**: `ccb-1-db-mcp-import`(epic-ccb)已把跨軌溝通從「2 個手寫 .md 聊天室 + 15 個封存檔」遷移至 `ctrl_threads`/`ctrl_messages`/`ctrl_message_reads`/`ctrl_boards` 4 表 + FTS5,唯一寫入路徑改為 4 個 MCP tool。本 Skill 規範**何時 / 如何**呼叫這 4 個 tool,以及 MCP 不可用時的正確應變,取代過去「開 .md 加一個 block」的直覺反射。

## 適用 / 不適用

**適用**:
- 任何跨軌(前台軌/後台軌/中控/pipeline 子視窗)訊息傳遞、話題開啟/回覆/關閉、跨軌看板(如 staging-db 開關狀態)讀寫
- 出現「要不要留言通知另一軌」「這個話題結束了嗎」「看板現在是誰持有」等情境
- MCP `phycool-context` server 疑似無法連線時的應變決策

**不適用**:
- ❌ 單軌內部筆記 / 暫存 —— 用自己的 scratchpad 或對話上下文即可,不必開 ctrl thread
- ❌ Story / Task / 業務資料 —— 走 `search_stories` / `upsert-story.js`(見 `pipeline-subwindow` skill)
- ❌ 一般 Memory DB 決策/debug/pattern 記錄 —— 走 `add_context`/`add_tech`(見 `phycool-mcp-discipline`)
- ❌ 兩個已凍結 `.md` 檔的**歷史內容** —— 唯讀參考即可,禁止新增留言(見下方 FORBIDDEN)

---

## 4 個 Tool 一覽

> 完整欄位表(required/optional/enum)見 `phycool-mcp-discipline` skill 的 `references/mcp-tools-cheatsheet.md` §「Ctrl-Channel 4 tools」—— 本 Skill 只講**使用情境**,不重複維護欄位細節(避免兩處漂移)。

| Tool | 何時用 | 一句話語意 |
|:---|:---|:---|
| `post_ctrl_message` | 開新話題 / 回覆既有話題 / 標記更正自己先前訊息 | 寫入一則訊息;省略 `thread_id` 即開新題(此時 `topic` 變必填) |
| `read_ctrl_messages` | 查看某話題 / 查**寄給本軌**的未讀訊息 / 查必讀公告 | **唯讀 + 讀取即自動簽收**(有寫入副作用,勿當純查詢重複呼叫)。`unread_only:true` 自 `ccb-4`(2026-08-03)起套用收件人過濾,語意見下方警語 |
| `close_ctrl_thread` | 發起軌認定話題已解決,結束該話題 | 僅**發起軌本人**可關閉,CAS 保護 |
| `update_ctrl_board` | 更新跨軌共享看板狀態(如 Migration 窗口誰持有) | 樂觀鎖(`expected_version`),版本不符即拒絕 |

**呼叫範例**(對齊 SDD Spec 02 章流程 A):

```javascript
// 1. 後台軌開新題,請前台軌協調
mcp__phycool-context__post_ctrl_message({
  topic: 'Migration 窗口協調',
  to_tracks: ['前台軌'],
  msg_type: 'request',
  body: '請前台軌讓出今晚 22:00-23:00 的 Migration 窗口',
})
// → {ok:true, thread_id:'2026-07-28 20:00:00', msg_id:501, seq:1, created_at:'...'}

// 2. 前台軌讀取(自動簽收該則)
mcp__phycool-context__read_ctrl_messages({ reader_track: '前台軌', unread_only: true })

// 3. 前台軌回覆(帶 thread_id,不再需要 topic)
mcp__phycool-context__post_ctrl_message({
  thread_id: '2026-07-28 20:00:00',
  from_track: '前台軌',
  to_tracks: ['後台軌'],
  msg_type: 'decision',
  body: '同意,22:00-23:00 讓出窗口',
})

// 4. 後台軌關閉話題(僅發起軌本人可執行)
mcp__phycool-context__close_ctrl_thread({ thread_id: '2026-07-28 20:00:00', caller_track: '後台軌' })
// → {ok:true, thread_id:'...', state:'closed', closed_at:'...'}
```

`from_track` / `reader_track` / `caller_track` / `updated_by` 皆可省略,省略時 fallback 環境變數 `PHYCOOL_CONTROLLER_TRACK`;兩者皆缺才報 `CCB1-E01`。

---

## 架構七原理精簡版

> 完整見 `claude token減量策略研究分析/AGENT溝通管道/聊天室設計報告/02-*.md` §一.2。

| # | 原理 | 本 Skill 的體現 |
|:-:|:---|:---|
| A1 | 單一寫入路徑 | 4 個 MCP tool 是**唯一**合法寫入方式,不得手寫 `.md` 或直接 SQL |
| A2 | Append-only | 訊息只增不改;更正走 `superseded_by` 標記,不覆寫 `body` |
| A3 | 投影分離 | 話題(`ctrl_threads`)/ 訊息(`ctrl_messages`)/ 簽收(`ctrl_message_reads`)分表,各自獨立演化 |
| A4 | CAS | `close`/`update_board` 皆單句 `WHERE ... AND <條件>`,零筆 = 語意拒絕非錯誤 |
| A5 | Mailbox 顯式收件 | `to_tracks` 必為非空陣列,沒有「廣播給大家」的隱式預設 |
| A6 | 通知反轉 | 三個掛點與敲門**只送「有幾則」的信號,從不推內容**;body 一律由讀者自己 `read_ctrl_messages` 取回並簽收(`ccb-4` 把送達點從 1 個擴為 3 個 + idle 敲門,但反轉方向不變) |
| A7 | 載體出版控 | 兩個舊 `.md` 檔對帳通過後貼凍結標頭轉唯讀,新內容一律進 DB |

---

## UI 觀察面(唯讀,DevConsole `/channel` 頁)

> `ccb-3-devconsole-channel-page`(epic-ccb)為**人眼觀察**面,與本 Skill 規範的 4 個 MCP tool(**Agent 讀寫**介面)是同一組表的**兩條獨立讀取路徑**——UI 頁面直接以 `better-sqlite3` 唯讀連線查詢 `ctrl_threads`/`ctrl_messages`/`ctrl_message_reads`/`ctrl_boards`(`tools/dev-console/server/services/channelService.ts`),**不經過**`post_ctrl_message`/`read_ctrl_messages`/`close_ctrl_thread`/`update_ctrl_board` 這 4 個 MCP tool,故 UI 開啟頁面**不會**觸發 `read_ctrl_messages` 的簽收副作用(UI 唯讀,零寫入路徑,`channelService.ts` 不含 INSERT/UPDATE/DELETE)。

**6 支後端 API**(`/api/channel/*`):`stats`(動態軌清單 + 統計)/ `boards`(看板卡)/ `threads`(通話中/封存列表)/ `threads/:id/messages`(時間軸)/ `read-matrix`(簽收矩陣)/ `search`(FTS5 全文)。

**深連結 URL 格式**(`useSearchParams` 8 參數,URL 為單一真值來源):

```
/channel?tab={live|archive|matrix}&thread={encodeURIComponent(thread_id)}&channel=&q=&category=&must_read=&page=&days=
```

- `thread_id` 為 `YYYY-MM-DD HH:mm:ss` 流水號格式(含空白與冒號),拼入 URL **必 `encodeURIComponent`**,否則瀏覽器會將冒號誤判為 URL scheme 分隔。
- 分享一個「跳到某話題時間軸」的連結範例:`/channel?thread=2026-07-26%2017%3A14%3A49`。
- 三分頁:`tab=live`(預設,通話中)/ `tab=archive`(封存查詢,`q`/`category`/`must_read`/`page` 生效)/ `tab=matrix`(簽收矩陣,`days`/`channel`/`category` 生效)。

**何時該用 UI 而非直接查 DB / 呼叫 MCP tool**:人眼快速回答「誰還沒簽?」「哪些話題通話中?」「看板現在誰持有?」三個問題,3 秒內從 `/channel` 頁看到,勝過手動組 SQL 或連續呼叫 `read_ctrl_messages`。**Agent 若需要程式化讀寫**,仍應走本 Skill 上方規範的 4 個 MCP tool,不應改呼叫 `/api/channel/*`(該 API 專供 Web UI 消費,非 Agent-facing 介面)。

---

## 三個通知掛點 + idle 敲門(ccb-4)

> `ccb-2` 只掛 `UserPromptSubmit` —— 中控**只有在使用者送出 prompt 的那一瞬間**看得到他軌留言;執行任務中、turn 結束、idle 等待三種狀態全部無感。`ccb-4-ctrl-notify-knock`(2026-08-03)補上這三個缺口。四個送達點共用同一條紀律:**只送未讀數,從不送 body**。

| # | 掛點 | 事件 | 涵蓋的視窗狀態 | 送達形式 |
|:-:|:---|:---|:---|:---|
| 0 | `ctrl-channel-inject.js` | `UserPromptSubmit` | 使用者剛送出 prompt | `additionalContext` ≤800 字元摘要(唯一帶 body 首段截短者) |
| 1 | `ctrl-channel-probe.js` | `PostToolUse` | **執行任務中**(長 turn 的 tool call 間隙) | `additionalContext` 一行,≤300 字元,節流 |
| 2 | `ctrl-channel-stop-check.js` | `Stop` | **turn 即將結束** | top-level `decision:"block"`,同視窗續轉 |
| 3 | `knock-controller.ps1` | 人/agent 主動呼叫 | **idle 等待中** | 對該視窗 console 注入一行 ASCII + Enter |

**適用視窗**:各軌中控主視窗 + 手動軌主視窗。**worker 子視窗零注入**(三個 hook 皆在 `PIPELINE_RUN_ID` 有值時**開 DB 之前** exit 0 — 對齊使用者裁定「dispatch 的子視窗不需讀聊天室,避免污染」)。

### 🔴 硬邊界:未綁定視窗零通知

掛點 1/2/3 一律先查 `controller_windows` registry;**查無列即靜默**(stdout 0 bytes、exit 0、不建列、不臆測、不敲門)。這是使用者明定的邊界,不是缺陷。

**不適用 ≠ 訊息遺失**:訊息仍在 DB,該視窗**綁定後第一次 `read_ctrl_messages` 會一次收齊全部積壓**。

### `controller_windows` registry — 為何是結構必需

`Stop` 與 `PostToolUse` 的 stdin **沒有 `prompt` 欄位**(官方 schema [Source: https://code.claude.com/docs/en/hooks | Fetched 2026-08-03]),而軌別解析四路徑中優先序 2/3 讀 prompt 文字、優先序 4 掃 `conversation_turns`。**沒有 registry,新增的兩個掛點在結構上無從得知自己是哪一軌** —— 這不是「換個實作也行」的取捨。

活體佐證(2026-08-02,BMAD升級軌中控視窗):hook 持續注入 `[聊天室] 主視窗手動軌 未讀 1 則`。優先序 4 掃的 `conversation_turns` 被同 session id 空間的 worker 子視窗與別視窗宣告污染 —— **通知機制在最需要它的視窗上失準**。顯式綁定是修法,推斷才是缺陷。

| 欄位 | 用途 |
|:---|:---|
| `session_id`(PK) | 一個 session = 一個視窗 = 一個軌;以 track 為 key 會讓「同軌換視窗」變成靜默丟棄舊視窗 PID 的 update |
| `track` | 綁定的軌別(仍須通過 canonical 驗證,BR-037) |
| `console_pid` / `console_cmdline` | 敲門目標 + 防 PID 重用的 2-Tuple 判活。**可為 NULL** —— 綁定時 best-effort 解析,失敗仍算綁定成功,該視窗只是不可敲 |
| `last_probe_at` / `last_probe_count` | 掛點 1 的節流狀態(預設 `-1`,`0` 是真實未讀數故不可當哨兵) |
| `last_stop_block_at` / `last_stop_block_count` | 掛點 2 的迴圈上界 |
| `last_knock_at` | 掛點 3 的速率上界 |

綁定由 `ctrl-channel-inject.js` 在解析出 canonical 軌別後執行(UPSERT);祖先鏈 console PID 探測**每 session 至多一次**(已有列即跳過,實測一次全行程掃描 ~580ms)。

### 掛點 1 — PostToolUse 節流探針

三條件**同時成立**才輸出,任一不成立即 stdout 0 bytes:

1. 距上次輸出 ≥ `ctrlChannel.probeThrottleSec`(`scripts/pipeline-config.json`,預設 `180`)
2. 未讀數與上次輸出值**不同**
3. 未讀數 **> 0**(歸零不報 ——「未讀 0 則」不是值得占一行的消息)

輸出 `[聊天室] {軌} 未讀 {N} 則({M} 必讀)— 可用 read_ctrl_messages 讀取簽收`(≤300 字元,**不含任何 body**)。非輸出的 turn **不開可寫連線**,成本是一次索引查詢。

### 掛點 2 — Stop check-at-stop

有未讀即 top-level `decision:"block"` + `reason`,turn 在**同一視窗**續轉,agent 讀取簽收後再結束。

🔴 **迴圈上界押在 `controller_windows.last_stop_block_count`,不是 `stop_hook_active`** —— 後者**已不在官方 `Stop` stdin schema**(現行欄位是 `stopped_by_hook`;實 fetch 確認 2026-08-03)。repo 內 6 處仍稱其為「鐵則」者為 stale。規則:**僅當未讀數 > 已 block 過的數字才 block**,故

- agent 簽收 → 歸零 → 不再 block(自我終止,非依賴 agent 自律)
- agent 忽略 block → 數字沒變 → 不再 block(至多一次)
- 新訊息進來 → 數字變大 → 再 block 恰一次
- 佇列清空時計數重置為 `-1`,否則「積壓 2 則後清空」之後,單則新訊息(`1 > 2` 為偽)將永遠不再 block

### 掛點 3 — idle 敲門(`knock-controller.ps1`)

```powershell
# 先看會送什麼(零副作用)
powershell -File .claude/skills/party-to-pipeline/scripts/knock-controller.ps1 -Track 後台軌 -DryRun
# 真的敲
powershell -File .claude/skills/party-to-pipeline/scripts/knock-controller.ps1 -Track 後台軌
```

🔴 **敲門文字必為純 ASCII,因而不含軌名**:`console-knock.ps1`(whp-12 交付,本卡**逐字複用不改**)在任何 Win32 呼叫之前就拒絕碼位 `< 0x20` 或 `> 0x7E`,而全部 6 個 canonical 軌名皆為 CJK。收件視窗本來就知道自己是哪一軌,省略不損資訊:

```
[ctrl-channel] 3 unread message(s) -- run read_ctrl_messages to read and sign off
```

| exit | 意義 |
|:-:|:---|
| 0 | 已敲門,或合法 no-op(kill switch 關 / 零未讀 / 無已綁定視窗 / 速率上界內 / DB 不可讀 fail-open) |
| 1 | 目標確認存活但注入失敗(`last_knock_at` 不變,可重試) |
| 2 | 前置未過(`CCB4-E01` 軌名非 canonical / `CCB4-E03` `console_pid` 為 NULL / `CCB4-E04` 判活失敗)或判活探測不可用(`CCB4-E05`,**fail-closed**) |

**fail 方向刻意不對稱**:DB 不可讀 → fail-**open**(不敲門無害);判活探測不可用 → fail-**closed**(對沒驗過的 PID 送按鍵等於對陌生 console 打字)。速率上界 `ctrlChannel.knockMinIntervalSec`(預設 `60`),kill switch `ctrlChannel.knockEnabled`。

### post 之後要不要敲門(SOP)

```javascript
// 1. 照常發訊息
post_ctrl_message({ topic: '...', to_tracks: ['後台軌'], msg_type: 'request', body: '...' })
// 2. 若收件軌可能正 idle(等 worker / 剛收工),敲一下
//    → 收件視窗自己會呼叫 read_ctrl_messages 取全文
```

**何時該敲**:收件軌正 idle 等待、或訊息有時效性。**何時不必**:收件軌正在執行任務(掛點 1 會在下一個 tool call 間隙送達)、或訊息不急(對方下次送 prompt 時掛點 0 自然送達)。敲門是**加速**,不是唯一送達途徑 —— 零未讀 / 未綁定 / 速率上界內皆為合法 no-op,投機敲門不是錯誤。

**回覆不需要第二套機制**:回覆本身就是一則 `to_tracks` 指向原發送者的訊息,同一條 post → notify 路徑對稱閉環。

**軌別解析優先序(掛點 0 專用,共 5 條)**(命中即用,皆無法判定則零成本 return)。**每條路徑都對 canonical 清單驗證**——BR-003 只認 DB 實際存在的軌名,不因來源是 env、registry 或硬編字面而放行:

| 序 | 來源 | 涵蓋視窗 |
|:-:|:---|:---|
| **0** | **`controller_windows` registry(ccb-4 新增)** —— 顯式綁定,**優先於下方三條推斷路徑** | 已綁定的中控 / 手動軌視窗(第 2 個 prompt 起) |
| 1 | `PHYCOOL_CONTROLLER_TRACK` env(**須命中 canonical,否則 fall through**) | 保留擴充點(主視窗目前恆無) |
| 2 | 當前 prompt 含 DB canonical 軌名字面 substring | 各軌中控(習慣性宣告「我們是 XX 軌中控」) |
| 3 | prompt 為 bmad slash 形態 → 解析 story_id → 查 `track_plan.lane`,`manual` → `主視窗手動軌`(**該字面亦須命中 canonical**) | 手動軌主視窗 |
| 4 | `conversation_turns` 本 session 歷史(取最後匹配序 2 邏輯的宣告列,`LIMIT 60`) | 中控第 2 個 prompt 起(序 3 對 dispatch/reconcile lane 回 null 時亦落此) |

序 0 命中即用,**不再看 prompt 寫了什麼** —— 這正是修掉「hook 持續注入他軌未讀數」那個活體缺陷的機制。registry 值本身仍過 canonical 驗證(非 canonical 即落回序 1-4,不盲信);**無 registry 列時序 1-4 行為完全不變**(ccb-2 的既有回歸套件逐字全綠)。

Canonical 軌名清單為 `SELECT DISTINCT from_track FROM ctrl_messages`(不硬編),再扣除 **sentinel 值**,且**刻意不聯集 `to_tracks`**。兩項排除各有其踩過的坑:

- **不聯集 `to_tracks`**:該欄曾出現「BMAD升級軌中控」誤植(`msg_id` 1119/1120/1121/1126,2026-07-29 使用者實際踩過的雙軌名混淆),聯集會讓 BR-003「只認 canonical 字面」的防線失效。
- **扣除 sentinel `unspecified`**(`SENTINEL_TRACKS`):它是 ccb-1 匯入器對「發送方無法判定」訊息填的佔位值(33 列),不是軌。它同時是**常見英文單字**,又是該欄**最長的值(11 字元)**,而清單依長度降序比對 —— 未排除前,任何提到該字的 prompt(TypeScript 型別錯誤 / JSON schema / log 訊息)都會解析成它,**且優先於所有真實軌名**,連手動軌的 bmad slash 判定都會被蓋過。ccb-2 code-review 實測:prompt `Type is unspecified` 注入了 `[聊天室] unspecified 未讀 2 則`。新增 sentinel 時一併更新此處。

### 🔴 未讀述詞:一處定義,四處消費(ccb-4 BR-009)

「軌別 T 的未讀」= 三條**同時**成立,定義站點恰一處:`.context-db/scripts/ctrl-unread-sql.cjs`。

1. `m.from_track != T` —— 防自發自收(全庫 36 列自寄自收,live 2026-08-03)
2. `EXISTS(json_each(m.to_tracks) WHERE value = T)` —— 收件人過濾
3. `NOT EXISTS` `ctrl_message_reads` 的 `(msg_id, T)` 列 —— 尚未簽收

四個消費端:三個 hook 掛點 + `read_ctrl_messages` 的 `unread_only` 分支。**開工前這裡有兩份形狀不同的 SQL** —— `ctrl-channel-inject.js` 三條齊備、`ctrl-channel-ops.js:276-279` 只有第 3 條。漂移的代價是實測出來的:

| 軌別 | 修前 `unread_only` | 修後 | 誤撈率 |
|:---|---:|---:|---:|
| 賦能軌 | 374 | 0 | 100.0% |
| 後台軌 | 253 | 0 | 100.0% |
| azure佈署軌 | 396 | 2 | 99.5% |
| 前台軌 | 150 | 8 | 94.7% |

(唯讀實測 2026-08-03,415 訊息 / 184 話題 / 1405 簽收列。修前數字為 SQL `COUNT(*)`;tool 回傳受 `limit` 預設 20 截斷 —— 這正是為何各軌呼叫時撈到的 20 則**幾乎必然全是他軌對話**,真正寄給自己的因時間較晚被擠掉。)

🔴 **修後 `unread_only` 的數字會大幅下降,那是修復不是回歸**。任何把舊的膨脹數字當工作量信號的判斷都需重新校準。

**過濾只掛 `unread_only` 分支**(使用者核可的選項 b):`thread_id` / `channel` / `category` / `state` / `must_read_only` 全查詢範圍**一律不變** —— DevConsole `/channel` 與跨軌對帳都依賴 `thread_id` 查得到完整 thread(含非寄給本軌者)。若自行寫 SQL 統計未讀,**必須自帶收件人條件**,不可假設 tool 層已全域過濾。

掛點 0 的渲染另加 `ORDER BY must_read DESC, created_at ASC` + `LIMIT 12`。

**首行的 `{N}` 是真實未讀總數,非渲染列數**:總數由獨立 `COUNT(*)` 取得,不用 `rows.length` —— 後者受 `LIMIT` 與 800 字元截斷雙重裁切,若拿來當總數,積壓 40 則時會顯示「未讀 12 則」,恰在最該提醒的時候讀起來像「都在這了」。實測 800 字元約可完整渲染 8 列,超出者只裁列不動總數。

**輸出格式**(`additionalContext` 硬上限 800 字元,首行統計列不可裁,逾限尾部 `…` 收尾;零未讀 = 空字串不輸出空 banner):

```
[聊天室] {軌} 未讀 {N} 則({M} 必讀)
🔴 #{msg_id} {from_track} {yyyy-MM-dd HH:mm} {topic} — {body 首段截短}
#{msg_id} {from_track} {yyyy-MM-dd HH:mm} {topic} — {body 首段截短}
（可用 read_ctrl_messages 讀全文並簽收）
```

**與 `read_ctrl_messages` 職責分工**(職責正交,非重複):

| 面向 | 三個掛點 + 敲門 | `read_ctrl_messages` MCP tool |
|:---|:---|:---|
| 觸發 | 送出 prompt / tool call 間隙 / turn 結束 / 被敲門 | 呼叫方主動(如 workflow step-00 起手式) |
| 管道 | 讀走 readonly 連線(`lib.openContextDb()` —— 無參數,readonly 寫死在 `_lib.js:53`);只有寫自己的 registry 狀態欄時才另開短命可寫連線 | MCP tool |
| 簽收 | **不會**(讀取路徑物理唯讀;掛點寫的是 `controller_windows` 自身狀態,從不碰 `ctrl_message_reads`) | **會**(UPSERT `ctrl_message_reads`) |
| 內容 | 掛點 0 ≤800 字元摘要;掛點 1/2/3 **只有未讀數,零 body** | 完整 body |
| 語意 | 「你還有未讀」 | 「我讀了並簽收」 |

未讀訊息會持續出現,直到實際呼叫 `read_ctrl_messages` 簽收為止 — 這是「通知反轉」取代輪詢的設計本意,不是需要修的疲勞 bug(掛點 1 的節流與掛點 2 的計數上界已把重複度降到「每個未讀數層級至多各一次」)。任何異常(stdin 非法 / DB 不可讀 / SQL 拋錯)一律 fail-open 收斂為 stdout 空字串 + exit 0,不阻斷 prompt 送出、不擋 tool call、不困住 turn。

### Troubleshooting —「為什麼我沒收到通知?」

| 症狀 | 最可能原因 | 確認方式 |
|:---|:---|:---|
| 三個掛點全都沒動靜 | 本視窗**未綁定**(從未宣告過軌別) | `SELECT * FROM controller_windows WHERE session_id=?`;宣告一次軌別即綁定 |
| 掛點 0 有、掛點 1/2 沒有 | 同上(掛點 0 可從 prompt 推斷,1/2 沒有 prompt 可推斷) | 同上 |
| 未讀數突然從幾百變成 0 | **正確** —— ccb-4 收件人過濾生效,舊數字含大量他軌往來 | 見上方誤撈率表 |
| 敲門回 `CCB4-E03` | 該視窗綁定時未解析出 console PID(可能非 `claude.exe` 承載) | `SELECT console_pid FROM controller_windows WHERE track=?` |
| 敲門回 `CCB4-E04` | PID 已消失或被重用(命令列與登記的不符) | 目標視窗可能已關閉;該視窗重新宣告軌別即重綁 |
| worker 子視窗完全沒有聊天室內容 | **設計如此**(`PIPELINE_RUN_ID` 排除) | 非缺陷,見「適用視窗」 |

---

## Fallback — MCP 不可用時怎麼辦

MCP `phycool-context` server 若暫時無法連線(呼叫逾時 / 連線錯誤),**正確應變**:

1. **不得**因此回頭在兩個已凍結的 `.md` 檔手寫留言 block —— 那條路徑已於 import 對帳 PASS 後永久關閉(A7 原理),重新手寫等於製造新的雙 source drift。
2. 暫時把待發訊息內容記在自己的 scratchpad 或對話上下文,待 MCP 恢復後照常呼叫 `post_ctrl_message` 補發即可(訊息本來就有 `created_at` 時間戳,晚幾分鐘補發不影響語意)。
3. 若懷疑 DB 資料與歷史 `.md`/封存檔有落差,或需要重新核對匯入結果,可重跑:
   ```bash
   node .context-db/scripts/import-ctrl-channel.js --report
   ```
   此 script **冪等**(`INSERT OR IGNORE` 鍵於自然唯一鍵),**re-import 不會產生重複列、不會覆蓋既有訊息**(含之後透過 MCP tool 新增的原生訊息),適合當作資料一致性的 fallback 校驗手段。若 `--report` 顯示 `reconcile=FAIL`,回報中控而非自行修改匯入邏輯。
4. 若 MCP 長時間不可用而任務有時效性,應在自己的 tracking file / dev_notes 記錄「待補發訊息清單」,而非用其他管道(如 commit message、其他 Story 的 dev_notes)夾帶跨軌溝通內容。

---

## FORBIDDEN

- ❌ **對兩個已凍結 `.md` 聊天室檔新增留言 block**(不論用 Edit 或 Write)
  Common Rationalization: "MCP 可能暫時不穩,先寫進 `.md` 保險,之後再補 DB 就好"
  Red Flag: transcript 出現對 `非同步聊天訊息討論專區.md` 或 `非同步聊天訊息討論專區-校正區.md` 的 Edit/Write 呼叫;或 `git diff` 顯示凍結標頭之後又有新增內容

- ❌ **`post_ctrl_message` 的 `to_tracks` 傳空陣列或省略,期待"廣播給全部軌"**
  Common Rationalization: "反正對方軌看得到,大概沒差,先給空陣列應該會自動變廣播"
  Red Flag: payload 出現 `to_tracks: []` 或缺省後仍預期成功;實際會回 `isError:true, code:'CCB1-E01'`

- ❌ **非發起軌呼叫 `close_ctrl_thread` 收到 `{ok:false}` 後,改用其他手段強制關閉**(如直接 SQL UPDATE `ctrl_threads`、或假冒 `caller_track` 為發起軌本名)
  Common Rationalization: "邏輯上這任務都做完了,直接改 state 沒差,反正結果一樣"
  Red Flag: 出現對 `ctrl_threads`/`ctrl_boards` 的直接 SQL UPDATE(非透過 4 個 MCP tool);或 `caller_track` 參數與實際呼叫者軌別不符

- ❌ **`update_ctrl_board` 略過 `expected_version`(或送字串版本號),或塞不符 `BoardState` shape 的 `state`**(缺 `status`/`holder`/`history` 任一者)
  Common Rationalization: "我只是想快速更新一下狀態,shape 細節之後再補就好"
  Red Flag: 缺 `expected_version` 或送 `"7"` 這種字串 → `isError:true, code:'CCB1-E01'`;`state.history` 非陣列 / 缺 `status`/`holder` → `isError:true, code:'CCB1-E02'`。兩者 DB 皆零變更(`ctrl-channel-ops.js:391-400`)

- ❌ **把 `read_ctrl_messages` 當純唯讀操作,以為多呼叫幾次沒有副作用**
  Common Rationalization: "反正是 read,呼叫幾次都一樣"
  Red Flag: 未意識到每次呼叫會對「實際回傳的訊息」UPSERT 簽收(`ctrl_message_reads`);`unread_only:true` 連續呼叫第二次會回 `count:0`(這是正確行為,非 bug)

- ❌ **把任一掛點的通知(摘要 / 未讀數 / Stop block reason / 敲門那行)當成「已讀取全文並簽收」**
  Common Rationalization: "prompt 開頭已經看到 `[聊天室] ... 未讀 N 則` 了,應該算讀過了吧"
  Red Flag: 看到通知後直接依片段行動,卻未呼叫 `read_ctrl_messages` 取完整 body;`ctrl_message_reads` 對該 `msg_id`+軌別組合仍無簽收列(掛點的讀取路徑物理唯讀,不可能寫入該表)

- ❌ **(ccb-4)自行寫 SQL 統計未讀卻不帶收件人條件,以為 tool 層已全域過濾**
  Common Rationalization: "收件人過濾不是修好了嗎,我這句 SQL 只查未簽收的應該就對了"
  Red Flag: 出現 `NOT EXISTS (... ctrl_message_reads ...)` 卻無 `json_each(to_tracks)` 與 `from_track !=` 兩條;過濾**只掛 `unread_only` 分支**,自寫 SQL 不在其中。正解是 require `.context-db/scripts/ctrl-unread-sql.cjs` 的 `UNREAD_PREDICATE`(BR-009 單一定義站點),不要複製第五份

- ❌ **(ccb-4)在敲門路徑加入行程終止、關窗、或視窗焦點操作**
  Common Rationalization: "對方視窗沒反應,乾脆順手關掉/重開比較快"
  Red Flag: `knock-controller.ps1` / `knock-controller-ops.js` 出現終止或關窗類 API 名稱(含註解)。敲門是**純加法**通知:它不移除任何東西、不關閉任何東西。關窗是另一條路徑的職責,有它自己的前置條件與終態把關,敲門不得成為繞過它們的後門(靜態斷言把關,對齊 `pipeline-handshake-protocol.md` F17)

- ❌ **(ccb-4)看到「未綁定視窗沒收到通知」就判定機制壞掉並繞過 registry 直接推斷軌別**
  Common Rationalization: "那個視窗明明就是後台軌啊,registry 沒有列不代表它不是,先照 prompt 猜一個吧"
  Red Flag: 掛點程式碼出現「registry 查無列時 fall back 到 prompt/歷史推斷」的分支。**未綁定視窗零通知是使用者明定的硬邊界**,而推斷正是 2026-08-02 那次「注入他軌未讀數」缺陷的成因。訊息不會遺失 —— 綁定後首次 `read_ctrl_messages` 一次收齊

- ❌ **(bwu-15)`from_track` / `to_tracks` / `reader_track` 填自然語言稱呼變體,而非該軌自己作為 `from_track` 使用的機器身分字面**(如以「BMAD升級軌中控」指「BMAD升級軌」)
  Common Rationalization: "都看得懂是同一軌,加個『中控』只是說清楚是誰在講話"
  Red Flag: `SELECT DISTINCT track FROM ctrl_message_reads` 或 `from_track` 出現同一軌的多種拼法;變體簽收列不被 canonical 軌名的未讀查詢視為已讀,同一則訊息被重複簽收。2026-08-04 幽靈簽收清理實據:「BMAD升級軌中控」13 筆簽收列全數與 canonical「BMAD升級軌」重複而遭去重刪除 —— 變體從未產生過任何獨立效果,只產生髒資料。不確定正名時,先 `read_ctrl_messages` 看該軌歷史 `from_track` 字面(依 BR-003 canonical 集合 = 實際出現過的 `from_track`,不硬編清單);本條為 TD-CCB-TRACK-NAME 收口裁定的約定層方案(不做寫入層正規化,對齊勿過度開發)

### Pressure Test(Discipline 型 · 2 組組合壓力情境)

**情境 1(時間壓力 × MCP 疑似不穩 × 收尾死線)**: pipeline 子視窗即將被 close watchdog 關閉,`post_ctrl_message` 因 `SQLITE_BUSY` 重試中而暫無回應(實際仍在 3 次退避內,尚未真正失敗)。Agent 是否會因「快沒時間了」而回頭手寫進 `.md` 通知另一軌,想著「之後再補 DB」?
→ **正確行為**:等待重試結果(至多 200+400+600ms),真正失敗(`CCB1-E04`)才進入上方 Fallback 流程;絕不手寫已凍結檔案。

**情境 2(合理化動機 × 路徑依賴 × 任務收尾壓力)**: Agent 呼叫 `close_ctrl_thread` 因非發起軌被 CAS 拒絕,但手上 Story 的 AC 寫著「話題必須關閉」。Agent 是否會想「反正邏輯上都做完了,直接 UPDATE state='closed' 也不會怎樣」?
→ **正確行為**:CAS 拒絕代表語意上不該由本軌關閉,應請發起軌執行、或在 dev_notes 記錄待辦交接,不得繞過保護直接寫 DB。

| Iron Law | Verbatim Rationalization | Red Flag |
|:---|:---|:---|
| 禁手寫已凍結 `.md` | "MCP 可能暫時不穩,先寫進 `.md` 保險,之後再補 DB 就好" | Edit/Write 呼叫指向已凍結兩檔路徑 |
| `to_tracks` 必非空陣列 | "反正對方軌看得到,大概沒差,先給空陣列應該會自動變廣播" | payload 出現 `to_tracks: []` 或缺省 |
| 不得繞過 CAS 拒絕 | "邏輯上任務已完成,直接更新 state 沒差" | 出現對 `ctrl_threads`/`ctrl_boards` 的直接 SQL UPDATE,而非透過 4 個 tool |

---

## Self-Check(每次呼叫 4 tool 前必自問)

1. **這是跨軌溝通,還是單軌內部筆記/業務 Story 資料?** → 後者改走對應工具,非本 Skill 範圍
2. **`to_tracks` 是否為非空陣列且列出真實收件軌別?** → 空陣列/省略必被拒
3. **開新題時 `topic` 是否已填?回覆既有題時 `thread_id` 是否正確?**
4. **要 `close` 的話題,我是否是發起軌本人?** → 不是就請發起軌執行,不強行繞過
5. **`update_ctrl_board` 的 `state` 是否符合 `BoardState` shape(status/holder/history 皆備)?**
6. **MCP 若真的不可用,我是否記得 Fallback 流程(暫存 + 事後補發 / 必要時 `--report` re-import 校驗),而非回頭寫 `.md`?**
7. **(ccb-4)發完訊息後,收件軌若可能正 idle,我是否考慮敲一下門?** → 不確定就敲(零未讀 / 未綁定 / 速率上界內皆為合法 no-op,投機敲門不是錯誤)
8. **(ccb-4)我若要自行統計未讀,是否引用了 `ctrl-unread-sql.cjs` 的 `UNREAD_PREDICATE`,而非自寫第五份 SQL?**

---

## Cross-Skill References

| 相關 Skill | 連動點 |
|:---|:---|
| `phycool-mcp-discipline` | 4 個 tool 的完整欄位表 / enum / CAS 語意 SSoT(`references/mcp-tools-cheatsheet.md` §Ctrl-Channel);本 Skill 是其「使用情境」補充,不重複維護欄位細節 |
| `party-to-pipeline` | pipeline 子視窗 agent 的跨軌溝通一律走本 Skill 的 4 個 tool;`knock-controller.ps1` 住在該 skill 的 `scripts/`,並**逐字複用**其 `console-knock.ps1` 敲門原語(whp-12 刻意設計為對收件端中立,參數只有 `-TargetPid` + `-Text`) |
| `pipeline-subwindow` | Story/Task 資料查詢走 `search_stories`/`upsert-story.js`,與本 Skill(跨軌訊息)職責互補不重疊 |
| `hooks-mechanization` | 三個掛點皆依其 7-step playbook 建立;7 步驟 SOP 本身不在本 Skill 重複維護。⚠ 該 skill 的 `references/event-schemas.md:152` 等 6 處仍稱 `stop_hook_active` 為 Stop 的迴圈信號 —— 該欄位**已不在官方 schema**(現行為 `stopped_by_hook`,實 fetch 確認 2026-08-03),掛點 2 的迴圈上界因此押在 DB 計數 |
| `phycool-context-memory` | `controller_windows` 表的 schema 章節;本 Skill 只講該表的**用途與生命週期**,欄位型別 SSoT 在其 `references/db-schema.md` |

---

## References

- `.context-db/scripts/ctrl-channel-ops.js` — 4 個函式完整實作(CAS 邏輯 + 錯誤碼 `CCB1-E01~E04`)
- `.context-db/scripts/import-ctrl-channel.js` — 一次性 / 可重跑的匯入 + 對帳 script(`--report`)
- `.context-db/scripts/ctrl-unread-sql.cjs` — **未讀述詞唯一定義站點**(BR-009),四個消費端共用;`.cjs` 使 CJS hooks 與 ESM ops 皆可 require
- `.context-db/scripts/ctrl-window-ops.cjs` — registry 綁定 / 心跳 / 軌別解析 / 2-Tuple 判活 / 祖先鏈 console PID 探測
- `.context-db/scripts/knock-controller-ops.js` — 敲門決策層(canonical 驗證 / 判活 / 速率上界 / ASCII 文字組裝 / 成功後蓋章)
- `.claude/hooks/ctrl-channel-inject.js` — 掛點 0(UserPromptSubmit 第 4 支),registry 綁定 + 解析優先序 0 + 收件人過濾未讀查詢 + 唯讀零簽收
- `.claude/hooks/ctrl-channel-probe.js` — 掛點 1(PostToolUse),節流三條件 + ≤300 字元 + 非輸出 turn 不開可寫連線
- `.claude/hooks/ctrl-channel-stop-check.js` — 掛點 2(Stop),top-level `decision` + 計數上界 + 佇列清空重置
- `.claude/skills/party-to-pipeline/scripts/knock-controller.ps1` — 掛點 3,薄包裝;`console-knock.ps1` 逐字不改
- 測試:`ctrl-channel-inject.test.js`(27 案例,含 registry 優先序)/ `ctrl-channel-probe.test.js`(18)/ `ctrl-channel-stop-check.test.js`(19)/ `.context-db/tests/ctrl-window-ops.test.js`(24)/ `knock-controller-ops.test.js`(25)。**除 inject 外全走 temp fixture DB**(`tests/helpers/ctrl-hook-env.cjs`);inject 沿用 live DB 為 `TD-CCB2-INJECT-TEST-READS-LIVE-DB-NONDETERMINISTIC` 未修部分
- `docs/implementation-artifacts/specs/epic-ccb/ccb-4-ctrl-notify-knock-spec.md` — SDD Spec(41 BR / 7 錯誤碼 / 18 邊界條件 / 5 條外部驗證)
- `docs/implementation-artifacts/specs/epic-ccb/ccb-1-db-mcp-import-spec.md` — SDD Spec(42 條 BR + 七原理 + 流程 A-H)
- `claude token減量策略研究分析/AGENT溝通管道/聊天室設計報告/` — 00 總計畫 / 02 架構全書(七原理 + 狀態機 + 流程圖)

---

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.3.1** | **2026-08-04** | **`bwu-15-closure-debt-triage` 直接執行 — 軌名正名 FORBIDDEN 約定層**(消費 `TD-CCB-TRACK-NAME-NO-ALIAS-NORMALIZATION` 候選 A;收口裁定不做寫入層正規化,對齊勿過度開發)。FORBIDDEN 新增第 10 條:`from_track`/`to_tracks`/`reader_track` 必用該軌機器身分正名字面,禁自然語言稱呼變體(「BMAD升級軌中控」類)—— 附 2026-08-04 幽靈簽收清理實據(變體 13 筆簽收列全數與 canonical 重複而遭去重,變體從未產生獨立效果只產生髒資料);不確定正名時依 BR-003 canonical 集合(實際出現過的 `from_track`,不硬編清單)。走 `Skill(skill="saas-to-skill")` Mode B(面向 1/7/8 實質變更;面向 4 無 references/ 目錄 N/A,其餘無涉)。 |
| **1.3.0** | **2026-08-03** | **`ccb-4-ctrl-notify-knock` dev-story — 送達點由 1 個擴為 3 個 + idle 敲門 + 收件人過濾修復**。`ccb-2` 只掛 `UserPromptSubmit`,中控在「執行任務中 / turn 結束 / idle 等待」三種狀態全部無感。本次新增:(1) **`controller_windows` registry** —— `session_id → track` 顯式綁定(+ 可空 `console_pid`)。這不是錦上添花:`Stop` 與 `PostToolUse` 的 stdin **無 `prompt` 欄位**(官方 schema 實 fetch 確認),而四條解析路徑有三條依賴 prompt 文字,**沒有 registry 兩個新掛點在結構上無從得知自己是哪一軌**;活體佐證見上方「為何是結構必需」節。(2) **掛點 1 `ctrl-channel-probe.js`**(PostToolUse 節流探針,三條件同時成立才輸出)。(3) **掛點 2 `ctrl-channel-stop-check.js`**(Stop check-at-stop,top-level `decision:"block"`;🔴 迴圈上界押 `last_stop_block_count` 而非 `stop_hook_active` —— 後者已不在官方 schema,repo 內 6 處相反陳述為 stale)。(4) **掛點 3 `knock-controller.ps1`**(idle 敲門,複用 whp-12 `console-knock.ps1` **逐字不改**;文字純 ASCII 故不含 CJK 軌名)。(5) **`read_ctrl_messages` 的 `unread_only` 收件人過濾**(消費 `TD-CCB1-READCTRLMESSAGES-NO-RECIPIENT-FILTER`,使用者核可選項 b:只掛 `unread_only`,全查詢範圍不變)—— 唯讀實測誤撈率 賦能軌/後台軌 100%、azure佈署軌 99.5%、前台軌 94.7%。(6) **未讀述詞收斂為單一定義站點** `ctrl-unread-sql.cjs`(此前 inject 與 ops 各一份且形狀不同,漂移即上述誤撈)。(7) 解析優先序新增序 0(registry,仍過 canonical 驗證;無列時序 1-4 行為逐字不變)。新增 FORBIDDEN 3 條(自寫 SQL 漏收件人條件 / 敲門路徑加終止原語 / 未綁定即繞過 registry 推斷)+ Troubleshooting 表 + Self-Check 2 題。走 `Skill(skill="saas-to-skill")` Mode B 八面向(面向 1/2/3/5/6/7/8 皆有實質變更;面向 4 該 skill 無 `references/` 子目錄故 N/A)。 |
| **1.2.1** | **2026-08-01** | **ccb-2-unread-inject-hook code-review — hook 行為修正回寫**。CR 對 `ctrl-channel-inject.js` 修四項並同步本節:(1) **sentinel 排除** —— canonical 清單新增扣除 `unspecified`(ccb-1 匯入器對「發送方無法判定」填的佔位值,33 列)。它是常見英文單字又是該欄最長值,而清單依長度降序比對,未排除前任何提到該字的 prompt 都會解析成它並**優先於所有真實軌名**,連手動軌 bmad slash 判定都被蓋過(CR 實測 `Type is unspecified` → 注入 `[聊天室] unspecified 未讀 2 則`);(2) **canonical 驗證涵蓋全部四路徑** —— 原 env(序 1)與 lane 硬編字面(序 3)未驗證,與 BR-003 不一致;(3) **首行總數改由獨立 `COUNT(*)` 取得** —— 原用 `rows.length`,受 `LIMIT` 與字元上限雙重裁切,積壓時會少報;(4) `LIMIT` 30 → 12(800 字元實測約可渲染 8 列,取更大值只是撈了會被裁掉的列)+ 序 4 歷史掃描加 `LIMIT 60`。職責分工表 `lib.openContextDb({readonly:true})` 更正為 `lib.openContextDb()` —— `_lib.js:47` 該函式**不接受任何參數**,readonly 寫死於 `:53`,原記法會誤導讀者以為可傳參開成可寫。配套新增 `.claude/hooks/ctrl-channel-inject.test.js`(24 案例涵蓋 BR-001~012,含前述兩項的回歸鎖)。走 `Skill(skill="saas-to-skill")` Mode B 八面向(面向 2/4/6/7 有實質變更)。 |
| **1.2.0** | **2026-08-01** | **ccb-2-unread-inject-hook dev-story — 新增「Hook 自動注入行為」節 + 修正 `read_ctrl_messages` 收件人過濾 gap 敘述**。`.claude/hooks/ctrl-channel-inject.js` 落地為 UserPromptSubmit 第 4 支:對中控 / 手動軌主視窗每個 prompt 自動注入未讀摘要(worker 子視窗經 `PIPELINE_RUN_ID` 排除零注入),軌別解析四來源優先序(env → prompt canonical substring → bmad slash + `track_plan.lane` → `conversation_turns` session 歷史),canonical 軌名清單刻意不聯集 `to_tracks`(`msg_id` 1119/1120/1121/1126 之「BMAD升級軌中控」誤植會重新引入 BR-003 要防的雙軌名混淆)。新增與 `read_ctrl_messages` 職責分工表(觸發/管道/簽收/內容/語意 5 維度對照)+ FORBIDDEN 第 6 條(誤把 hook 摘要當已簽收)。修正 4 個 Tool 一覽表 `read_ctrl_messages` 列敘述,補其 `unread_only`(`ctrl-channel-ops.js:276-279`)未以 `to_tracks` 過濾收件人的既有 gap(此前僅 A6 通知反轉原理籠統帶過,未點名具體行號與實測數字)。frontmatter description 補 hook 觸發詞,watches 新增 `ctrl-channel-inject.js`,References 新增該 hook。走 `Skill(skill="saas-to-skill")` Mode B 八面向(面向 1 新增 FORBIDDEN #6 + 面向 2 使用者故事新增 hook 自動注入場景 + 面向 4 References 索引 + 面向 7 frontmatter/history)。 |
| **1.1.0** | **2026-07-28** | **ccb-3-devconsole-channel-page dev-story — 新增「UI 觀察面」節**。DevConsole `/channel` 頁(唯讀,零寫入,`channelService.ts` 不經過本 Skill 規範的 4 個 MCP tool,直接唯讀查同 4 表)+ 6 支 `/api/channel/*` API + 深連結 URL 格式(`thread_id` 含空白冒號需 `encodeURIComponent`)。frontmatter description 補 DevConsole/簽收矩陣/深連結觸發詞,watches 新增 `channelService.ts`。`skills_list.md` 同步關鍵字列。走 `Skill(skill="saas-to-skill")` Mode B 八面向(面向 2 使用者故事 + 面向 4 references 索引 + 面向 6 cross-skill 一致 + 面向 7 frontmatter/history)。 |
| **1.0.1** | **2026-07-28** | **ccb-1-db-mcp-import code-review F7 — FORBIDDEN #4 錯誤碼校正**。原 Red Flag 把「呼叫缺 `expected_version`」標為 `CCB1-E02`,與實作不符:`ctrl-channel-ops.js:391-394` 對缺參數回 **`CCB1-E01`**,`CCB1-E02` 只用於 `BoardState` shape 不合法(`:395-401`)。照抄錯誤碼會讓 agent 依錯誤分支判讀而誤診。一併補上同批 CR 修復的字串型別分支(送 `"7"` → `CCB1-E01`)。走 `Skill(skill="saas-to-skill")` Mode B 八面向(本 skill 為 `phycool-*` 前綴,依 `skill-tool-invocation-mandatory.md` 矩陣 row 1)。 |
| **1.0.0** | **2026-07-28** | 初版建立。`ccb-1-db-mcp-import`(epic-ccb)落地 4 個 ctrl-channel MCP tool 後,對齊 BR-048 建立本 Discipline 型 Skill,規範使用情境 + FORBIDDEN(含 Pressure Test 2 組組合情境 + Rationalization Table)+ Fallback(含 re-import 校驗手段)。走 `Skill(skill="skill-builder")` Mode A。 |
