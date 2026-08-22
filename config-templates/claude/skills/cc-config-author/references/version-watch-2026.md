# 2026 版本相容性 Watch List

寫 cc 配置時要意識到的重要版本變更。配置與當前版本不相容,即使 syntax 對也不會生效。

---

## Claude Code CLI 重要版本

| 版本 | 日期 | 影響配置 |
|---|---|---|
| v2.0.64 | 2026 Jan | `.claude/rules/` 正式支援 + paths frontmatter |
| v2.1.111 | 2026 Apr | Opus 4.7 支援 |
| v2.1.117 | 2026 Apr 22 | Pro/Max 預設 effort 升級為 high(Opus 4.6) |
| v2.1.118 | 2026 Apr | `DISABLE_ALL_UPDATES` 環境變數 |
| v2.1.129 | 2026 Apr/May | 終端同步輸出強制 |
| v2.1.132 | 2026 May | `/tui default` 切換 |
| v2.1.140 | 2026 May | Agent View、`/goal` 完成迴圈、PostToolUse `continueOnBlock`、`CLAUDE_PROJECT_DIR` 給 MCP stdio |

```bash
claude --version  # 檢查當前版本
claude update     # 升級
```

---

## Opus 4.7 不相容變更(2026 Apr 16 起)

### A. `thinking.budget_tokens` 已移除

**影響的配置**:
- `MAX_THINKING_TOKENS` 環境變數
- API 直接呼叫含 `thinking.budget_tokens` 的腳本

**現在的做法**:
- 用 `/effort` 級別(low/medium/high/xhigh/max)
- 或 `output_config.task_budget`(beta header `task-budgets-2026-03-13`)
- 預設 Opus 4.7 用 **adaptive thinking**,模型自行決定何時思考

**修法**:
```json
// settings.json env 區塊
{
  "env": {
    // 移除這行(已 deprecated)
    // "MAX_THINKING_TOKENS": "15000",

    // 改用此命令(在 CLI 內)
    // /effort xhigh
  }
}
```

### B. `temperature` / `top_p` / `top_k` 非預設值會 HTTP 400

Opus 4.7 API 拒絕這些參數。若有 wrapper script 或 hook 設定這些,要移除。

### C. Thinking content 預設 hidden

```json
// 要看 thinking,設定
{
  "showThinkingSummaries": true
}
```

API 層級用 `thinking.display: "summarized"`。

### D. 新 tokenizer,1.0-1.35x token 消耗

同樣文字在 Opus 4.7 可能用比 Opus 4.6 多 35% tokens。影響:

- `max_tokens` 預算需放寬
- compact 觸發點需提早(配合 `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: "60"`)
- Cost 估算需重算

### E. effort 預設 xhigh

Opus 4.7 在 Claude Code 預設 effort 已升 **xhigh**。

| Effort | 適用 |
|---|---|
| low | 分類、提取、格式化 |
| medium | 簡單編輯、Q&A |
| high | 一般 coding |
| **xhigh** | Agentic coding(預設) |
| max | 最深推理(僅當前 session,不持久) |

`max` 通常 over-thinking,**少用**。

---

## 規範新增的 frontmatter / hook 事件

### 2026 Jan

- **Async hooks**(`async: true`)— 非阻塞執行

### 2026 Feb

- **HTTP hooks**(`type: "http"`)— POST 到 URL
- **Agent Teams**(`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`)— 隊員間直接通訊

### 2026 Mar

- **`PostToolBatch` 事件** — 批次工具呼叫後
- **`/loop` 命令** — 重複執行直到條件滿足
- **`isolation: worktree`**(subagent frontmatter)
- **Setup hooks**(`--init` / `--maintenance`)

### 2026 Apr

- **`InstructionsLoaded` 事件** — 觀測 rules/CLAUDE.md 真實載入
- **`ConfigChange` 事件** — 配置檔變更
- **`FileChanged` 事件** — 一般檔案變更
- **`/goal` 命令** — 完成迴圈
- **`continueOnBlock`** (PostToolUse) — 阻擋但繼續
- **`CLAUDE_PROJECT_DIR`** 環境變數穩定可用

---

## 已 deprecated(2026 確認過時)

| 項目 | 替代 |
|---|---|
| `MAX_THINKING_TOKENS` env | `/effort` 級別 |
| `thinking.budget_tokens` API | `thinking: {type: "adaptive"}` |
| `CLAUDE_CODE_NO_FLICKER` | `CLAUDE_CODE_TUI_DEFAULT` |
| `npm install -g @anthropic-ai/claude-code` | 原生 binary `curl https://claude.ai/install.sh \| bash` |
| 扁平 `decision` JSON 輸出 | `hookSpecificOutput.permissionDecision` |
| `.claude/commands/*.md` 單檔(仍支援) | `.claude/skills/<name>/SKILL.md` |
| `globs:` frontmatter(Cursor 用) | `paths:`(Claude Code 永遠是 paths) |

---

## 模型 ID 對應(2026 May)

| Alias | 完整 ID | 適用場景 |
|---|---|---|
| `opus` | `claude-opus-4-7`(API) `claude-opus-4-6`(Bedrock/Vertex/Foundry 預設) | 規劃、架構、agentic |
| `sonnet` | `claude-sonnet-4-6` | 主力 coding |
| `haiku` | `claude-haiku-4-5-20251001` | 探索、簡單任務 |

Bedrock / Vertex / Foundry 用戶要 pin Opus 4.7:

```bash
export ANTHROPIC_DEFAULT_OPUS_MODEL='arn:aws:bedrock:...'
```

---

## Skills 開放標準(2026)

Anthropic 發布 **Agent Skills 開放標準**,跨工具相容:

- Claude Code ✅
- Codex CLI ✅(部分)
- OpenClaw ✅
- 其他 ✅

寫 skill 時可加 `compatible-with`:

```yaml
---
name: my-skill
compatible-with: claude-code, codex, openclaw
---
```

純宣告用途,Claude Code 不強制檢查。

---

## CLI 啟動旗標變更

| Flag | 2026 變更 |
|---|---|
| `--init` | 觸發 Setup hook(matcher: init) |
| `--init-only` | 同上,跑完 hook 即退出(CI 友好) |
| `--maintenance` | Setup hook(matcher: maintenance) |
| `--plan-mode` | Plan mode,只讀工具 |
| `--worktree` / `-w` | 在 worktree 內啟動 |
| `--add-dir` | 加額外可讀目錄(不自動載 CLAUDE.md) |
| `--agents` | JSON 傳 session-only subagent |

---

## 健檢清單(版本相容性)

寫配置前:

- [ ] `claude --version` 確認 v2.1.111+
- [ ] settings.json env 不含 `MAX_THINKING_TOKENS`
- [ ] 不在 API 呼叫設 `temperature/top_p/top_k`
- [ ] CLAUDE_AUTOCOMPACT_PCT_OVERRIDE 已調整為 60
- [ ] hook 用 `hookSpecificOutput`,非扁平 `decision`
- [ ] 用 `paths:` 而非 Cursor 的 `globs:`
- [ ] Subagent frontmatter 用 `skills:` preload(不繼承)

---

## 預期 2026 後續變更(觀測 watch)

依官方 roadmap 推測(非保證):

- **Plugin 系統強化**:更易散布 skill / hook bundle
- **更多事件**:可能新增 `Idle`、`Heartbeat` 觀測事件
- **Mythos 模型釋出**:目前 Project Glasswing 限定,後續可能 GA
- **MCP OAuth 普及**:第三方 MCP server 走 OAuth 2.0

---

## 監看新版本變更

每月一次:

```bash
claude --version
claude update
# 看 CHANGELOG
curl https://docs.claude.com/changelog | head -100
```

關注 GitHub repo 的 release notes:
- https://github.com/anthropics/claude-code/releases

當前版本資訊也可問:
> `What version of Claude Code am I running? What's new since N+1?`