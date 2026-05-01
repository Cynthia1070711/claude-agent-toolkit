# Hooks 事件機制深度指南 (Hooks Deep Dive)

> **版本**: 1.0.0
> **建立日期**: 2026-05-01
> **資料快照日**: 2026-05-01
> **驗證指令**: `(Get-ChildItem .claude\hooks\*.js -Exclude *.test.js).Count` 應 = 14

---

## 1. Hook 體系定位

Hook 是 Claude Code 的「**事件驅動自動化機制**」 — 在特定 lifecycle 事件觸發時執行 shell 命令(Node.js / PowerShell),用於:
- 注入動態 context(RAG / Session 恢復 / 子代理上下文)
- 強制檢查 / 防護(file lock / config protection / pre-commit quality)
- 自動化記錄(session log / debt discovery / pattern observation / OTel token)
- 子視窗控制(pipeline heartbeat / auto exit / suggest compact)

設定位置:`.claude/settings.json` 與 `.claude/settings.local.json` 的 `hooks` 區塊。

---

## 2. 14 Hooks 完整列表(2026-05-01)

| # | Hook 檔 | 觸發事件 | matcher | 角色 |
|:-:|:----|:----|:----|:----|
| 1 | `config-protection.js` | PreToolUse | `Edit\|Write` | 攔截 settings.json / appsettings / .prettierrc / .csproj 編輯,防意外破壞 pipeline |
| 2 | `debt-discovery.js` | Stop | (all) | 自動掃 git diff 偵測 TODO/FIXME/HACK/XXX → 計算 Priority Score → 寫 tech_debt_items;跳過 [Intentional:] 標註 |
| 3 | `detect-rule-violation-hint.js` | Stop | (all) | 分析 code 變更比對 `.claude/rules/`,提示可能違反規則(非 BLOCK,advisory)|
| 4 | `mcp-health-check.js` | PreToolUse + PostToolUseFailure | `mcp__pcpt-context` | 驗證 `.context-db/context-memory.db` 可達 + MCP 連線健康 |
| 5 | `pipeline-auto-exit.js` | Stop | (all) | Pipeline daemon 完成所有 phase → 自動 exit(防卡死)|
| 6 | `pipeline-heartbeat.js` | Stop | (all) | 寫 heartbeat(ISO8601 + story_id + phase + loop_count)至 signal file;watchdog 8 分鐘無更新 → 判定卡死 |
| 7 | `pipeline-permission.js` | PermissionRequest | `Bash\|Edit\|Write\|Read\|Grep\|Glob` | PCPT_PIPELINE_MODE=1 時 auto-approve 白名單;否則 pass-through |
| 8 | `pre-commit-quality.js` | PreToolUse | `Bash` | git commit 前驗證 secrets / console.log / msg 格式 |
| 9 | `pre-prompt-rag.js` | UserPromptSubmit | (all) | **11 層 RAG 注入**(見 §4)— 本地 ONNX embedding + Story 進度 + 技術債 + IDD + Skill 推薦 + Code RAG + Document RAG + Rule Violation Hot Zones + LSP Diagnostics + Pipeline State + Session 歷史 |
| 10 | `precompact-tool-preprune.js` | PreCompact | (all) | **Hermes 移植**:Pass 1 dedup 同 md5 工具結果;Pass 2 summarize >2000 字輸出;原文歸檔 context_entries(14 天保留)|
| 11 | `session-recovery.js` | SessionStart | `compact\|resume` | Compaction / 恢復後注入 Pipeline state + Session 摘要(Stale Detection >30min WARN)|
| 12 | `skill-change-detector.js` | FileChanged | `SKILL.md` | 偵測 SKILL.md 變更跨三引擎,輸出 JSON {skill_name, domain, change_type} 至 stderr(非 BLOCK)|
| 13 | `subagent-context-inject.js` | SubagentStart | (all) | 注入 parent session context 至 subagent;含 3-Tier blocked tools 動態載入 |
| 14 | `suggest-compact.js` | Stop | (all) | 累計回應計數;超過閾值(default 40)stderr 提醒 `/compact` |

---

## 3. 10 種 Hook Event 矩陣(.claude/settings.json)

| Event | 觸發時機 | 已註冊 hooks |
|:----|:----|:----|
| **PreToolUse** | 任一工具執行前 | (Bash) pre-commit-quality / (Edit\|Write) file-lock-check + config-protection / (mcp__pcpt-context) mcp-health-check |
| **PostToolUse** | 任一工具執行後 | (Edit\|Write) file-lock-acquire + observe-pattern |
| **UserPromptSubmit** | 使用者送出訊息 | pre-prompt-rag(timeout 5s)|
| **Stop** | Claude 回應完成 | pipeline-heartbeat / log-session / incremental-embed / pipeline-auto-exit / pipeline-notify / debt-discovery / suggest-compact / detect-rule-violation-hint(共 8 hooks 序列)|
| **SessionEnd** | 對話結束 | log-session / otel-session-aggregate(Token 累加 → DB)|
| **PreCompact** | Context 壓縮前 | pre-compact-snapshot.ps1(快照)/ precompact-tool-preprune / log-session |
| **SessionStart** | 對話開始 | (compact\|resume) session-recovery / (all) otel-auto-start |
| **SubagentStart** | 子代理啟動 | subagent-context-inject(timeout 3s)|
| **PostToolUseFailure** | 工具失敗 | (mcp__pcpt-context) mcp-health-check |
| **FileChanged** | 檔案變更 | (SKILL.md) skill-change-detector |
| **PermissionRequest** | 權限請求 | (Bash\|Edit\|Write\|Read\|Grep\|Glob) pipeline-permission(timeout 3s)|

---

## 4. UserPromptSubmit — 11 層 RAG 注入流程

`pre-prompt-rag.js` 是最關鍵 hook,每次提問前注入 11 層動態 context:

```
使用者送出 prompt
  ↓
pre-prompt-rag.js (timeout 5s) 執行:
  ↓
┌─────────────────────────────────────────────┐
│ Layer 1: Session 歷史(最近 3 + 5 user 提問) │
├─────────────────────────────────────────────┤
│ Layer 2: Rule Violation Hot Zones            │
│   (td-rule-violation-rag-inject 30 天 top-5) │
├─────────────────────────────────────────────┤
│ Layer 3: Task-aware Story 進度               │
│   (從 prompt 偵測 Story ID → query stories) │
├─────────────────────────────────────────────┤
│ Layer 4: 相關 tech debt(linked debt_entries)│
├─────────────────────────────────────────────┤
│ Layer 5: 相關技術決策(category=decision)    │
├─────────────────────────────────────────────┤
│ Layer 6: Active Pipeline State              │
│   (pipeline_checkpoints stale 30min+ 警告)  │
├─────────────────────────────────────────────┤
│ Layer 7: Skill Recommendation                │
│   (skill-keywords.json 關鍵字匹配)           │
├─────────────────────────────────────────────┤
│ Layer 8: LSP Diagnostics(C#/TS 編譯錯誤)    │
│   (intent-gated)                             │
├─────────────────────────────────────────────┤
│ Layer 9: Code RAG                            │
│   (ONNX cosine + S_final fusion, intent=code) │
├─────────────────────────────────────────────┤
│ Layer 10: Intentional Decisions (IDD)        │
│   (intent-gated, active IDD forbidden_changes) │
├─────────────────────────────────────────────┤
│ Layer 11: Document RAG(FTS5 文件搜尋)        │
└─────────────────────────────────────────────┘
  ↓
全部注入到 additionalContext (≤ 10K tokens 預算)
  ↓
Claude 接收增強後的 prompt
```

**Token 預算分配**:Code RAG ~3,500 / Session 2,000 / 其他層各 ~500-1,000,總計 ≤ 10K。

**Truncation Warnings**:任一層被預算截斷 → 注入 `⚠` 標記讓 Agent 知道 context 不完整。

---

## 5. 關鍵 Hook 詳解

### 5.1 pre-prompt-rag.js(UserPromptSubmit)

**核心機制**:
- 讀 `context-memory.db` readonly(WAL 模式不阻塞)
- ONNX 本地 inference(Xenova/all-MiniLM-L6-v2, 384D)
- IDD Layer 10 dependency graph 展開
- `S_final = 0.6×vec + 0.2×graph + 0.2×fts` 三路融合

**Fallback**:
- ONNX 不可用 → LIKE keyword fallback
- DB 不可用 → 注入 empty additionalContext + stderr WARN
- 完全停用:`set PROJECT_RAG_HOOK=false`

### 5.2 session-recovery.js(SessionStart matcher: compact|resume)

**核心機制**:
- Compaction / Resume 後恢復 Pipeline state
- 讀 `pipeline_checkpoints` + 最近 3 筆 session(input budget 5000 tokens / ~20 KB)
- **Stale Detection**:checkpoint.updated_at 超過 30 分鐘 → 注入 `POSSIBLY STALE` 警告

**Sub-window 異常偵測**:
- 子視窗 crash 未更新 checkpoint → orchestrator 透過 missing result 偵測

### 5.3 precompact-tool-preprune.js(PreCompact, Hermes 移植)

**雙 Pass 範式**:
- **Pass 1**:dedup 相同 md5 工具結果(同一檔多次讀取只留 1 份)
- **Pass 2**:summarize >2000 字輸出至 1 行
- **Archive**:原文存 `context_entries`(category=archived, 14 天保留)

**效益**:PreCompact 容量 6 倍增(~500 字元/tool → ~80 字元)。

### 5.4 subagent-context-inject.js(SubagentStart)

**核心機制**:
- 透過 JSON stdout 注入 parent session context
- 動態載入 `subagent-blocked-tools.md` 全文(~3K)+ 3-Tier 矩陣(2.9K)= 反降智 +~6K
- Subagent 獲得完整 SOP 而非摘要

### 5.5 debt-discovery.js(Stop)

**核心機制**:
- Scan git diff 偵測 TODO / FIXME / HACK / XXX
- Priority Score(TODO=1.0, FIXME=2.0, HACK=5.0, XXX=3.0)
- SHA256 dedup 防重複
- 寫 `tech_debt_items`(type=AUTO_DISCOVERED)
- 跳過 `[Intentional: IDD-XXX]` 標註(已是 IDD,不算 debt)

### 5.6 detect-rule-violation-hint.js(Stop, Phase 3 Observer)

**核心機制**:
- L1 Observer:38 keyword pattern 偵測規則違反
- 輸出 `hookSpecificOutput.systemMessage` 提示 `log-rule-violation.js` 補登
- ENV flag `PCPT_RULE_VIOLATION_HINT_ENABLED=true` 預設 disabled
- Phase 4 Exit-gate:`check-violation-repeat.js` 533 lines + 44 vitest + keyword map 9 rules

### 5.7 skill-change-detector.js(FileChanged matcher: SKILL.md)

**核心機制**:
- 偵測任一引擎 SKILL.md 變更(.claude / .gemini / .agent)
- 輸出 JSON {skill_name, domain, change_type} 至 stderr(advisory)
- 與 `Skill(saas-to-skill)` Mode B 配合 → 字面 Skill tool 調用 mandatory

---

## 6. 全域 vs 專案層 Hook

| 層 | 路徑 | 範圍 |
|:----|:----|:----|
| **全域層** | `~/.claude/` | NO 全域 hooks(本專案結論);hooks 都在 plugins 內(ralph-wiggum / ralph-loop 各自的 hooks.json)|
| **專案層** | `.claude/hooks/` | 14 hooks(本專案核心)|
| **Plugin 層** | `~/.claude/plugins/cache/.../hooks/` | ralph-* plugin 自帶(目前 disabled)|

> 設計理念:Hook 屬「專案特定機制」(file lock / pipeline / pcpt-* MCP),全域層保持簡潔。

---

## 7. settings.json vs settings.local.json 分工

### 7.1 `.claude/settings.json`(SSoT,版本控制)

註冊 10 種 Hook event + 8 環境變數 + 5 plugin 開關 + 安全 deny(.env / appsettings / secrets):

```json
{
  "permissions": {
    "allow": ["Edit(.claude/**)", "Write(.gemini/**)", ...],
    "deny": ["Read(.env)", "Read(**/appsettings.Production.json)", ...]
  },
  "hooks": { "PreToolUse": [...], "Stop": [...], ... },
  "env": {
    "ENABLE_TOOL_SEARCH": "auto:2",
    "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "85",
    "MAX_THINKING_TOKENS": "15000",
    "MCP_TIMEOUT": "40000",
    "CLAUDE_CODE_USE_POWERSHELL_TOOL": "1",
    ...
  },
  "enabledPlugins": {
    "typescript-lsp@claude-code-plugins": true,
    "csharp-lsp@claude-code-plugins": true,
    "frontend-design@claude-code-plugins": true,
    "ralph-loop@claude-plugins-official": false,
    "ralph-wiggum@claude-code-plugins": false
  }
}
```

### 7.2 `.claude/settings.local.json`(使用者私密 override,不版控)

延伸 100+ Bash 規則作 Skill 三引擎同步白名單;OTLP telemetry endpoint;PostToolUse → sync-epic-readme.ps1。

---

## 8. Hook 撰寫規範

### 8.1 標準骨架(Node.js)

```javascript
#!/usr/bin/env node
// .claude/hooks/example-hook.js

import { readFileSync } from 'node:fs';

async function main() {
  // 1. 讀 stdin(若 hook 需 hookSpecificInput)
  const input = JSON.parse(process.stdin.read() || '{}');

  // 2. 執行邏輯(timeout 內完成)
  try {
    const result = doSomething(input);

    // 3. 輸出 hookSpecificOutput(若需注入 systemMessage)
    if (result.needSystemMessage) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          systemMessage: result.message
        }
      }));
    }

    process.exit(0); // PASS
  } catch (err) {
    // Advisory hook 永遠 exit 0(不 BLOCK)
    process.stderr.write(`[Hook Warning] ${err.message}\n`);
    process.exit(0);
  }
}

main();
```

### 8.2 Block vs Advisory

| 類型 | exit code | 行為 |
|:----|:----:|:----|
| **Block** | 2 | 阻擋當前工具執行(極少用,如 config-protection 偵測 settings.json edit)|
| **Advisory** | 0 | 不阻擋,僅輸出 stderr 提示 |
| **Pass** | 0 | 正常通過 |

### 8.3 Timeout 規範

| Hook | timeout | 理由 |
|:----|:----:|:----|
| pre-prompt-rag | 5s | RAG 涉 ONNX inference |
| pre-commit-quality | 10s | git diff 可能大 |
| log-session / debt-discovery | 2-3s | DB 寫入 |
| pipeline-heartbeat | 1s | 純檔案寫入 |
| skill-change-detector | 3s | md5 + JSON parse |

---

## 9. 自助驗證指令

```powershell
# 列出 14 hooks
Get-ChildItem .claude\hooks\*.js -Exclude *.test.js | Select-Object Name

# 列出 12 hook tests
Get-ChildItem .claude\hooks\*.test.js | Select-Object Name

# 驗證 settings.json 註冊的 hook 與檔案存在性對應
$settings = Get-Content .claude\settings.json -Raw | ConvertFrom-Json
$settings.hooks.PSObject.Properties | ForEach-Object {
  Write-Output "Event: $($_.Name)"
  $_.Value | ForEach-Object {
    $_.hooks | ForEach-Object {
      $cmd = $_.command
      if ($cmd -match '\.claude/hooks/(\S+\.js)') {
        $hookFile = ".claude\hooks\$($matches[1])"
        $exists = Test-Path $hookFile
        Write-Output "  $hookFile : $exists"
      }
    }
  }
}
```

---

## 10. Related Reading

- `memory-system-deep-dive.md` §RAG — 11 層注入流程詳細
- `rules-deep-dive.md` #16 — subagent-blocked-tools 3-Tier(被 subagent-context-inject 動態載入)
- `skills-deep-dive.md` §6 三引擎 — 對應 skill-change-detector
- `bmad-workflows-evolution.md` — Pipeline hooks(heartbeat / auto-exit / permission)
- `.claude/settings.json` — 即時 SSoT
- `claude-code-config-guide.md` — Hook 8 大事件官方教學

---

## 11. 版本歷史

| 版本 | 日期 | 變更 |
|:----|:----|:----|
| 1.0.0 | 2026-05-01 | 初版建立。14 hooks 完整列表 + 11 層 RAG 注入 + 10 種 Hook event + 7 個關鍵 hook 詳解 + Block vs Advisory 規範 |
