# Pipeline ACK Handshake Protocol — party-to-pipeline v4.0.0

> **建立**: 2026-05-04
> **適用**: party-to-pipeline self-contained orchestrator scripts (orchestrator.ps1 + 3 worker.ps1 + stop-report.ps1)
> **嚴重等級**: HIGH (與 skill-tool-invocation-mandatory + toolkit-mirror-immediate-sync 並列)

---

## 1. 為何需要本 Rule

party-to-pipeline v4.0.0 改版引入「中控 - 子視窗雙向 ACK handshake」流程,取代舊版輪詢 DB + signal file 設計。新流程涉:

- IPC 三 file (task / status / ack) 原子寫入
- Stop hook (stop-report.ps1) 自動寫 evidence-based status
- 中控驗證 evidence + 寫 ack
- 子視窗等 ack 後倒數 5 秒 graceful close
- 三重 confirm 子視窗已關 (PID + tracker + ack mtime)

**本 rule 規範這些 artifact 的 schema、order、生命週期,確保中控 / 子視窗 / Stop hook 三方 contract 一致**。

---

## 2. Applies When

任何涉及以下檔案 / 行為時:

- Edit `.claude/skills/party-to-pipeline/scripts/*.ps1`
- Edit `.claude/hooks/pipeline-*.js` (相關 Stop hook)
- Edit `scripts/pipeline-config.json` 的 `handshake` section
- Edit `.context-db/scripts/init-db.js` 的 `stories.task_track` 或 `workflow_executions.evidence_json` 欄位
- 新建 `.claude/ipc/{StoryId}__{Timestamp}/` 內檔案
- 設計新 worker / orchestrator 變體

---

## 3. IPC Schema 契約

### 3.1 IPC dir 命名

```
.claude/ipc/{StoryId}__{Timestamp}/
```

- `{StoryId}` = Story ID (如 `td-pipeline-...`)
- `{Timestamp}` = `yyyyMMdd-HHmmss` (orchestrator 啟動時刻)
- 三段唯一鍵 (R5 對策) — 避免並發 / retry 衝突

### 3.2 task-{phase}.json (中控 → 子視窗)

```json
{
  "phase": "create-story",
  "story_id": "...",
  "task_track": "main",
  "complexity": "M",
  "model_id": "claude-opus-4-7[1m]",
  "effort": "max",
  "attempt": 1,
  "ipc_dir": "/abs/path/...",
  "_created": "2026-05-04T01:30:00+08:00"
}
```

### 3.3 status-{phase}.json (Stop hook → 中控)

```json
{
  "phase": "create-story",
  "status": "completed",        // completed | failed | partial
  "evidence": {
    "task_track": "main",
    "db_status": "ready-for-dev",
    "tasks_backfilled": true,
    "file_list_count": 5,
    "files_changed": ["..."],
    "session_id": "...",
    "phase": "create-story"
  },
  "error": "",
  "session_id": "...",
  "timestamp": "2026-05-04T01:30:30+08:00"
}
```

### 3.4 ack-{phase}.json (中控 → 子視窗)

```json
{
  "phase": "create-story",
  "ok": true,                     // true | false
  "message": "Validation passed, ready to close",
  "next_phase": "dev-story",      // empty if last phase
  "timestamp": "2026-05-04T01:31:00+08:00"
}
```

### 3.5 system-{phase}.txt (worker → claude)

純文字,worker 透過 `claude --append-system-prompt-file` 注入。包含 Story DB context + protocol-template.md 全文。

---

## 4. Mandatory Order

```
中控 orchestrator.ps1                   子視窗 worker-{phase}.ps1
    │
    │ Step 1: Clear-IpcStage(Phase)
    │ Step 2: Write-TaskFile (atomic)
    │ Step 3: Start-Process worker
    │  ──────────────────────────►  Step 4: Read task
    │                                Step 5: claude --model X (interactive)
    │                                  │ (BMAD workflow + tasks-backfill)
    │                                  │
    │                                Step 6: claude turn end → Stop hook auto-fire
    │                                                       │
    │                                       [stop-report.ps1]
    │                                            │ env guard
    │                                            │ collect evidence
    │                                            │ atomic Write-StatusFile
    │  ◄──────────────────────────────────────────┘
    │ Step 7: Wait-StatusFile (max 1800s)
    │ Step 8: Confirm-StageResult (DB target / tasks ✅ / file_list)
    │ Step 9: Write-AckFile (atomic, ok=true/false)
    │  ──────────────────────────►  Step 10: Wait-AckFile (max 60s)
    │                                Step 11a (ok=true): Start-Countdown 5s
    │                                Step 11b (ok=false): stderr feedback, retry
    │                                Step 12: Update-Tracker(closed)
    │                                Step 13: ps1 exit (claude already dead)
    │ Step 14: Wait-WindowClosed (triple-confirm)
    │   ├ PID dead? ✓
    │   ├ tracker.closed_at written? ✓
    │   └ ack file mtime > worker start time? ✓
    │ Step 15: Update-Tracker(status=closed)
    │ Step 16: Proceed to next phase
    ▼
```

**violation = breaking contract**:

- 跳過 Step 1 Clear-IpcStage → retry 殘留 ack 誤判
- Step 4 之前 worker 修改 task file → 違反 read-only 契約
- Step 6 之前 agent 主動寫 status / ack → 與 Stop hook 雙寫
- Step 8 跳過驗證直接 ack → 失去 evidence-based 保護
- Step 10 不等 ack 直接 exit → 失去雙向確認
- Step 14 不做三重 confirm 直接進下一階段 → 殘留進程

---

## 5. FORBIDDEN

| # | 禁止 | 原因 |
|:-:|:-----|:----|
| F1 | IPC dir 不含 timestamp 段 (e.g. `.claude/ipc/{StoryId}/`) | R5 — 並發 / retry 衝突 |
| F2 | task / status / ack file 命名不含 `-{phase}` suffix | 多 phase 共用 dir 但 file 衝突 |
| F3 | Stop hook 不寫 atomic (直接 Out-File 而非 tempfile + Move-Item) | R2 — Windows 檔案鎖 race |
| F4 | 中控讀 status 不做 retry (直接 ConvertFrom-Json fail throw) | R2 — JSON 半寫 parse 失敗 |
| F5 | stop-report.ps1 缺 env guard `PHYCOOL_ORCHESTRATOR_MODE` check | 非 orchestrator session 誤觸 |
| F6 | stop-report.ps1 註冊 settings.json Stop hook 順位錯位 (非第 2 位) | R1 — 順位影響 evidence 完整性 |
| F7 | worker 跳過 wait ack 直接 exit | 失去雙向確認 |
| F8 | 中控不做三重 confirm closed | 視窗未關殘留進程 |
| F9 | task_track 欄位 NULL 但 worker 不處理 fallback | 數據不一致風險 |
| F10 | retry (dev-story-fix-Rn) 重用 ack file (不清前次) | R7 — 殘留誤判 |
| F11 | ACK 規則注入 prompt (不透過 protocol-template.md) | R8 — 32K cmdline limit |
| F12 | handshake.enabled flag 永久 disable 但仍嘗試走 ACK 流程 | 設計矛盾 |
| F13 | 子視窗 agent 主動寫 status / ack file | 與 Stop hook + 中控雙寫衝突 |
| F14 | orchestrator.ps1 內部呼叫 claude-launcher-interactive | v4.0.0 self-contained 設計違反 |

---

## 6. Self-Check (執行前 / Edit 前 5 題)

1. **本次變更是否破壞 IPC schema 契約?(task / status / ack 任一 shape 改變)**
2. **Stop hook 順位是否仍在 settings.json Stop chain 第 2 位?**
3. **Atomic write (tempfile + Move-Item -Force) 是否仍套用所有 IPC 寫入?**
4. **Triple-confirm closed (PID + tracker + ack mtime) 是否仍是中控 advancement 條件?**
5. **handshake.enabled flag 與本次變更的相容性?**

---

## 7. Schema 變更

### 7.1 stories 表新增欄位 (init-db.js)

```sql
ALTER TABLE stories
ADD COLUMN task_track TEXT DEFAULT 'main'
  CHECK (task_track IN ('main','side'));
```

- `main` = SaaS App 業務 code
- `side` = toolkit / 環境 / 工作流升級

### 7.2 workflow_executions 表新增欄位

```sql
ALTER TABLE workflow_executions
ADD COLUMN evidence_json TEXT NULL;
```

NULLABLE — 舊紀錄不需 backfill。新 ACK 流程結束後寫入 status.json 完整 evidence。

---

## 8. Migration 路徑

新 schema 對既有 DB 安全套用:

```bash
node .context-db/scripts/init-db.js  # idempotent: CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS
```

既有 stories 紀錄 `task_track` 自動填 `'main'` (DEFAULT)。Story-by-story 確認後,可手動 UPDATE 為 `'side'` (適用 epic-governance / td-token-decrease-* 等)。

---

## 9. Related Rules

- `.claude/rules/skill-tool-invocation-mandatory.md` SUPREME — Skill 升版必走 Skill tool
- `.claude/rules/skill-sync-gate.md` — Skill 與 code 同步閘門
- `.claude/rules/toolkit-mirror-immediate-sync.md` SUPREME — toolkit 鏡像立即同步
- `.claude/rules/dual-repo-push-discipline.md` SUPREME — 雙倉庫推送紀律
- `.claude/rules/constitutional-standard.md` — Code Verification + Backend Contract Mandate

---

## 10. Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.0.0** | **2026-05-04** | 初版建立。對齊 party-to-pipeline v4.0.0 改版。IPC schema 契約 + Mandatory Order 16 步 + 14 條 FORBIDDEN + Self-Check 5 題 + Schema 變更 (stories.task_track + workflow_executions.evidence_json) + Migration 路徑。觸發背景:2026-05-04 user 入口文檔 `claude token減量策略研究分析/party-to-pipeline改版/party-to-pipeline改版.md` 6 階段願景。 |
