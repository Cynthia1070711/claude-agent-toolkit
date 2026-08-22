# Main / Side Track (party-to-pipeline v5.1.0 L3)

> DB stories.task_track ENUM('main', 'side') 分流範式。worker scripts 內 switch 不同 prompt 範式。

---

## 主線 (`task_track = main`) — PhyCool SaaS 業務 code

| 範圍 | 說明 |
|:-----|:----|
| 適用 Story | epic-eft / epic-qgr / epic-mqv / epic-fix* / 業務功能 / Bug 修復 |
| 第一準則 | PhyCool 商業策略 |
| 第二準則 | 業界 SaaS 作法 |
| Create 階段 | 完整 7 維度差異報告 (實際 code / skill / 需求文檔 / 商業策略規範 / 技術文檔 PRD / 記憶庫 DB / DB schema) |
| Dev 階段 | TDD red-green-refactor + 完整 dotnet test / vitest |
| Review 階段 | 9 維審計 + tasks-backfill-verify + bug-fix-verification + 跨 7 維 doc sync 檢查 (skill / PRD / 技術文檔 / DB schema / 商業策略 / 規範 / 其他相關聯文檔) |

---

## 副線 (`task_track = side`) — Toolkit / 環境 / 工作流升級

| 範圍 | 說明 |
|:-----|:----|
| 適用 Story | epic-governance / td-token-decrease-* / td-pipeline-* / toolkit 升級 / 配置調整 / 工作流改進 |
| 重點 | 深度讀取所有相關文檔 + 禁止投機 |
| Create 階段 | 不需 7 維度業務文檔比對 (無業務脈絡),專注 toolkit 規範與既有實作對齊 |
| Review 階段 | 檢查 skill / 技術文檔 / 規範同步,**不查商業策略** |

---

## DB Schema

```sql
ALTER TABLE stories
ADD COLUMN task_track TEXT DEFAULT 'main'
  CHECK (task_track IN ('main','side'));
```

詳 `.claude/rules/pipeline-handshake-protocol.md` §7.1。

---

## worker scripts switch 範式

```powershell
# worker-create.ps1 / worker-dev.ps1 / worker-review.ps1 內
$track = $task.task_track  # 從 task-{phase}.json 讀
if ($track -eq 'main') {
    # 走主線 7 維度比對 + 商業策略 prompt
    $prompt = Build-MainTrackPrompt $task
} elseif ($track -eq 'side') {
    # 走副線 toolkit 規範對齊 prompt
    $prompt = Build-SideTrackPrompt $task
} else {
    throw "Invalid task_track: $track (must be main / side)"
}
```

---

## FORBIDDEN

- ❌ task_track 欄位 NULL 時假設 main(跳過 fallback)— 違反 DB-first SSoT,NULL 應視為 schema 不一致警告
- ❌ Phase 2 Story upsert 不填 task_track — Party Mode 階段必確定
- ❌ worker scripts 主線 prompt 跑副線 Story / 反之 — 範式錯導致 review 維度錯
