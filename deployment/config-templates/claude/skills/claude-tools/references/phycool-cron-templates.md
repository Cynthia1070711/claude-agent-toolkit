# PhyCool 排程模板 (Cron Templates)

> PhyCool 專屬自動化排程模板，搭配 CronCreate tool + PushNotification / claude-max Telegram bridge。
>
> **前置條件**: Claude Code CLI session 需運行中（CronCreate 為 session-scoped tool）。
> 若需跨 session 持久化，加 `durable: true`。
>
> **CronCreate 規格**: 5-field cron（分 時 日 月 週）/ Local timezone / Auto-expiry（見 CronCreate tool schema） / Max 50 per session
>
> **Hermes 來源**: `claude token減量策略研究分析/工作流/hermes-agent-main/hermes-already-has-routines.md`

---

## Template 1: Weekly Tech Debt Sweep

**用途**: 每週一早上掃描 `tech_debt_items` 表，找出 status=open 超過 14 天的項目，推送 reminder 至 Telegram。

**Cron**: `7 9 * * 1`（每週一 09:07，避開 :00 整點）

**對應 Hermes Pattern**: `scheduled` + multi-skill（`phycool-debt-registry` + `claude-max`）

**引用 Script**: `.context-db/scripts/debt-stale-report.js`（Layer 1 + Layer 2 stale detection）

**指令**:

```
CronCreate({
  cron: "7 9 * * 1",
  prompt: "執行 Weekly Tech Debt Sweep:\n1. 跑 `node .context-db/scripts/debt-stale-report.js` 取得 stale report JSON\n2. 從 JSON 提取 remaining_open、stale_file_not_exist、stale_pattern_not_found 數量\n3. 用 search_debt({status: 'open', limit: 20}) 列出 open 超過 14 天的項目\n4. 彙整摘要（total open / stale count / top 5 oldest items）\n5. 用 PushNotification 推送：'Tech Debt Weekly: {remaining_open} open, {stale_count} stale — oldest: {top_item_title}'\n6. 若 remaining_open < 10 且 stale = 0，回應 [SILENT] 不推送",
  recurring: true,
  durable: true
})
```

**預期輸出範例**:
```
Tech Debt Weekly: 44 open, 3 stale — oldest: TD-eft-405-01 image upload error handling (23d)
```

---

## Template 2: Nightly Skill Sync Audit

**用途**: 每晚掃描 40+ phycool-* Skills 的 `last_synced_epic` frontmatter vs DB 中 `stories` 表活躍 Stories 的 `epic_id`，告警不一致。無差異時 `[SILENT]` 不發通知。

**Cron**: `57 1 * * *`（每晚 01:57，避開 :00 整點）

**對應 Hermes Pattern**: `scheduled` + `[SILENT]`（Hermes `cron/scheduler.py:56` SILENT_MARKER）

**引用 Script**: 無（直接使用 Glob + Grep + search_stories MCP tool）

**指令**:

```
CronCreate({
  cron: "57 1 * * *",
  prompt: "執行 Nightly Skill Sync Audit:\n1. Glob 所有 `.claude/skills/phycool-*/SKILL.md` 檔案\n2. 對每個 SKILL.md，Grep 提取 frontmatter 的 `last_synced_epic:` 值\n3. 取得活躍 Stories（排除 done/backlog）: search_stories({fields: 'story_id,epic_id,status', limit: 50})，篩選 status ∉ {done, backlog}，提取不重複 epic_id 集合\n4. 比對: 若 Skill 的 last_synced_epic 不在 active epic 列表中，標記為 drift\n5. 產出 drift 清單（Skill name / expected epic / actual last_synced_epic）\n6. 若 drift 數量 = 0，回應 [SILENT] 不推送\n7. 若 drift > 0，用 PushNotification 推送：'Skill Drift: {count} skills behind — {top_3_names}'\n注意: [SILENT] 表示無差異，不發通知",
  recurring: true,
  durable: true
})
```

**預期輸出範例**:
```
Skill Drift: 3 skills behind — phycool-editor-arch, phycool-payment-subscription, phycool-admin-module
```

**[SILENT] 模式說明**: 當所有 Skill 的 `last_synced_epic` 與活躍 Epic 一致時，Agent 回應 `[SILENT]`。此為 Hermes SILENT_MARKER 語意移植——無新發現時抑制通知，避免訊息疲勞。

---

## Template 3: OTel Token Usage Daily Report

**用途**: 每日彙整 token 消耗統計（整合 `phycool-otel-micro-collector`），僅超標時推送通知。

**Cron**: `47 23 * * *`（每晚 23:47，避開 :00/:30）

**對應 Hermes Pattern**: `scheduled` + `[SILENT]` 除非超標

**引用 Script**: `scripts/otel-session-aggregate.js`（SessionEnd Hook 聚合 token → workflow_executions DB）

**指令**:

```
CronCreate({
  cron: "47 23 * * *",
  prompt: "執行 OTel Token Usage Daily Report:\n1. 跑 `node scripts/otel-session-aggregate.js` 聚合當日 token 數據\n2. 用 Bash 查詢 token 統計（sqlite3 .context-db/phycool.db）: SELECT SUM(input_tokens) as total_input, SUM(output_tokens) as total_output, COUNT(*) as session_count FROM workflow_executions WHERE date(created_at) = date('now', '+8 hours') AND agent_id IS NOT NULL\n3. 計算當日總 token = total_input + total_output\n4. 若總 token < 500000（50 萬），回應 [SILENT] 不推送\n5. 若總 token >= 500000，用 PushNotification 推送：'Token Alert: {total}k today ({session_count} sessions) — input: {input}k / output: {output}k'\n6. [SILENT] 表示消耗正常，不發通知",
  recurring: true,
  durable: true
})
```

**預期輸出範例**:
```
Token Alert: 1.2M today (8 sessions) — input: 890k / output: 310k
```

**[SILENT] 模式說明**: 閾值 500k token/天為建議 baseline，可依實際用量調整。低於閾值時 `[SILENT]` 不推送。

---

## Template 4: Depth Gate Batch Check（選配）

**用途**: 每週三深夜批次跑全 Epic 的 Depth Gate，偵測新增不合規 Story。

**Cron**: `23 2 * * 3`（每週三 02:23，避開 :00）

**對應 Hermes Pattern**: `scheduled` + `--skills "phycool-create-story-depth-gate"`

**引用 Script**: `.claude/skills/phycool-create-story-depth-gate/scripts/run-depth-gate.js`

**指令**:

```
CronCreate({
  cron: "23 2 * * 3",
  prompt: "執行 Depth Gate Batch Check:\n1. 查詢所有 ready-for-dev Stories: search_stories({status: 'ready-for-dev', fields: 'story_id,epic_id,title', limit: 50})\n2. 對每個 Story 執行: `node .claude/skills/phycool-create-story-depth-gate/scripts/run-depth-gate.js {story_id} --dry-run`\n3. 收集結果: exit=0 (PASS) / exit=1 (WARN) / exit=2 (BLOCK)\n4. 彙整: PASS count / WARN count（含 story_id 列表）/ BLOCK count（含 story_id 列表）\n5. 若全部 PASS 且無 WARN/BLOCK，回應 [SILENT]\n6. 若有 WARN 或 BLOCK，用 PushNotification 推送：'Depth Gate: {block_count} BLOCK, {warn_count} WARN in {total} stories — {blocked_ids}'",
  recurring: true,
  durable: true
})
```

**預期輸出範例**:
```
Depth Gate: 1 BLOCK, 2 WARN in 12 stories — BLOCK: dla-12-new-feature
```

---

## 共通指引

### CronCreate 參數速查

| 參數 | 說明 | 建議值 |
|------|------|--------|
| `cron` | 5-field（分 時 日 月 週），local timezone | 避開 :00 和 :30 |
| `prompt` | 排程觸發時執行的 prompt | 含具體步驟 + [SILENT] 條件 |
| `recurring` | `true`（預設）= 重複；`false` = 一次性 | 排程模板用 `true` |
| `durable` | `true` = 寫入 `.claude/scheduled_tasks.json` 跨 session 持久 | 生產排程建議 `true` |

> **Auto-expiry 注意**: `recurring: true` 排程有 auto-expiry 限制（具體天數見 CronCreate tool schema，用 ToolSearch 查詢最新值）。週頻率排程（Template 1/4）在 expiry 期內僅觸發有限次數。`durable: true` 可在新 session 啟動時重建排程，但 session 間隔超過 expiry 週期時需手動重新建立。

### [SILENT] 語意規範

來源: Hermes `cron/scheduler.py:56` `SILENT_MARKER = "[SILENT]"`

- Agent 在 prompt 最末判斷「無新發現 / 無差異 / 低於閾值」時，回應字串 `[SILENT]`
- `[SILENT]` 代表本次排程無需通知使用者，**不發** PushNotification
- 使用情境：drift 數 = 0、stale 數 = 0、token 低於閾值、全部 PASS
- 反面：有新發現 / 超標 / BLOCK → 發 PushNotification

### Telegram 推送方式

1. **PushNotification tool**（首選）: 桌面通知 + Remote Control 手機推送，單行 < 200 字元
2. **claude-max Telegram bridge**（替代）: 若需完整 Markdown 格式或長訊息，用 `/claude-max` skill 發送至 Telegram chat

### 自訂閾值

各模板的 `[SILENT]` 閾值可依實際情境調整：

| 模板 | 預設閾值 | 調整方式 |
|------|---------|---------|
| Tech Debt Sweep | remaining_open < 10 且 stale = 0 | 修改 prompt 中數字 |
| Skill Sync Audit | drift 數 = 0 | N/A（0 即無 drift） |
| OTel Token Report | 總 token < 500k/天 | 修改 prompt 中 500000 閾值 |
| Depth Gate Batch | 全部 PASS | N/A（有 WARN/BLOCK 即報） |
