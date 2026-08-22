---
name: autorun-e2e
description: "E2E 任務執行器。在獨立 PowerShell 視窗中以完整互動式 Claude Code 執行 E2E 測試任務（載入 MCP，如 Chrome DevTools），由 /fw 中控調用。Triggers: Use when executing E2E tests or Chrome DevTools MCP automation."
version: 2.0.1
updated: 2026-04-05
disable-model-invocation: true
triggers:
  - E2E test execution
  - Chrome DevTools MCP
author: CC-OPUS
created: 2026-03-19
watches:
  - glob: ".claude/skills/autorun-e2e/scripts/*.ps1"
    domain: pipeline
last-synced-epic: epic-sku
last-synced-date: 2026-04-05
---

# Autorun-E2E — E2E 任務執行器 (v2.0)

> 與 `autorun` 的差異：使用**完整互動式** Claude Code（非 `-p` 模式），
> 因為 E2E 測試需要載入 MCP Server（如 Chrome DevTools MCP）。
> **Auto-chain**: E2E 完成後若 Story 非 Done，自動鏈式接 autorun `/dev` 修復。

## Story 狀態與任務對應

此 skill 由 `/fw` 中控調用，適用於任何狀態的 Story（只要需要 E2E 測試）。

| 觸發條件 | 中控配發的 -Command | 任務視窗完成後應回填的狀態 |
|----------|---------------------|--------------------------|
| Story 所需 Skills 含 `e2e-testing` | `/e2e-test` | 依測試結果：通過 → 不改（由中控決定）、失敗 → 記錄問題 |

**任務視窗的責任**：
1. 使用 Chrome DevTools MCP 執行 E2E 測試
2. 完成後用 Edit tool 回填 Story 文件：SOP 追蹤表、checklist、變更歷史
3. E2E 結果記錄於 Story 的變更歷史中

**重跑機制**：中控直接重新配發任務即可（E2E 不依賴 Story 狀態）。

## 使用時機

Story 的「所需 Skills」中包含 `e2e-testing` 或任務需要：
- Chrome DevTools MCP（截圖、DOM 操作、導航）
- 其他 MCP Server 互動
- 需要使用者中途介入的測試流程

## 使用方式

由 `/fw` 中控調用，不直接由使用者觸發。

### 啟動 E2E 任務

```bash
MSYS_NO_PATHCONV=1 powershell -ExecutionPolicy Bypass \
  -File ".claude/skills/autorun-e2e/scripts/pipeline-e2e.ps1" \
  -Launch \
  -StoryId "S3-04" \
  -Command "/e2e-test" \
  -StoryPath "docs/implementation-artifacts/stories/epic-3/S3-04-test-result-window-ui.md" \
  -PipelineId "20260316-1600" \
  -PlanName "Epic-3 E2E Testing" \
  -BatchId 1
```

### 監控完成

```bash
# 同 autorun watcher
powershell -ExecutionPolicy Bypass \
  -File ".claude/skills/autorun/scripts/watcher.ps1" \
  -TrackingFile "docs/pipeline-tracking/{PipelineId}.json" \
  -Interval 10 -Timeout 1800
```

## 與 autorun 的差異

| 項目 | autorun | autorun-e2e |
|------|---------|-------------|
| Claude 模式 | `claude -p --dangerously-skip-permissions` | `claude "prompt"`（完整互動式） |
| MCP 載入 | 否（`-p` 不載入） | 是（完整模式載入所有 MCP） |
| 視窗自動關閉 | 是（5 秒後） | 否（使用者手動關閉） |
| 使用者介入 | 不需要 | 可能需要（權限確認、MCP 操作） |
| 適用階段 | `/dev`、`/code-review`、`/verify` | `/e2e-test`、需 MCP 的任務 |

## 檔案結構

```
.claude/skills/autorun-e2e/
├── SKILL.md
└── scripts/
    └── pipeline-e2e.ps1    # E2E 任務啟動（互動模式）
```

## Auto-chain 鏈式執行

E2E 完成後，腳本自動讀取 Story 狀態：

| E2E 後 Story 狀態 | 下一步 | 執行器 |
|-------------------|--------|--------|
| Done | 停止 | — |
| 非 Done | `/dev` | **autorun**（非 autorun-e2e） |

E2E → autorun `/dev` → autorun `/code-review` → ... 直到 Done 或 MaxChain。

## 注意事項

- E2E 任務耗時較長（可能 10~30 分鐘），watcher timeout 建議設 1800 秒
- 互動模式下使用者可能需要確認權限提示
- **必須用 `/exit` 退出 Claude**，不可直接關閉視窗（否則 tracking + auto-chain 不會執行）
- Claude `/exit` 後，腳本自動更新 tracking JSON → auto-chain 判斷 → 視窗 5 秒後關閉

$ARGUMENTS

---

## Window Auto-Close

E2E 測試視窗為**手動關閉**（設計如此）：
- 使用者完成 E2E 測試後須執行 `/exit` 退出 Claude
- Claude 退出後腳本自動 cleanup → 視窗 5 秒後關閉
- **禁止直接關閉視窗**（tracking + auto-chain 不會執行）

---

## Context Recovery (cmi-recovery-01)

E2E tasks run 10-30 min, may outlast orchestrator context window.

- **Before spawning**: `node .context-db/scripts/pipeline-checkpoint.js --save --reasoning "autorun-e2e: launching E2E sub-window"`
- **After compaction**: `session-recovery.js` auto-injects last checkpoint + 3 sessions. Check for `POSSIBLY STALE` warning (>30 min)
- **Sub-window crash**: If checkpoint remains `running` >30 min, treat as stale — check signal file / process status before retry
- **Truncation**: Sub-window `pre-prompt-rag.js` shows `⚠` warnings when context budget exceeded — agent has incomplete history

Full spec: `/phycool-context-memory` §12 Pipeline Context Recovery

---

## 除錯參考

> 相關除錯知識請查閱 `docs/knowledge-base/` 目錄。
