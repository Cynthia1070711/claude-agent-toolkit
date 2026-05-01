# `~/.claude/` 全域層配置完整指南

> **版本**: 1.0.0
> **建立日期**: 2026-05-01
> **資料快照日**: 2026-05-01
> **適用範圍**: Claude Code CLI 全域層(所有專案共用)+ 與專案層(`./.claude/`)的協作關係

---

## 1. 三層 CLAUDE.md Hierarchy

Claude Code 使用三層 CLAUDE.md 配置覆寫鏈:

```
~/.claude/CLAUDE.md          (全域層,所有專案共用,目標 ≤ 30 行)
  ↓ 被覆寫
./CLAUDE.md                  (專案層,版本控制,目標 ≤ 200 行)
  ↓ 被覆寫
./CLAUDE.local.md            (本地私密,不納版控,Agent Identity)
```

**覆寫規則**:
- 同名指令 → 專案層 > 全域層
- 同名規則 → 本地層 > 專案層 > 全域層
- 互不相關指令 → 累加(全域 + 專案 + 本地 = 完整載入)

---

## 2. 全域 `~/.claude/CLAUDE.md`(極簡 27 行)

**設計理念**:全域層**不放專案特定規則**,只放跨所有專案的共識規範。

### 2.1 標準範本

```markdown
# CLAUDE.md (Global Configuration)

## Language
- All responses, code comments, and documentation in Traditional Chinese (zh-TW)
- English allowed: code, technical terms, paths, Git commands, variable names

## Timestamp
- Before writing any timestamp, run `powershell -Command "Get-Date -Format 'yyyy-MM-dd HH:mm:ss'"`
- Never infer, estimate, or use fake timestamps

## Code Quality
- Read before modify — never guess without reading
- DRY — reuse existing abstractions
- Minimal complexity — no extra refactoring or features

## Reporting
- No time estimates (days, hours, completion dates)
- Organize by Phase + task count

## Dev Environment
- OS: Windows 11 Pro | Stack: C# ASP.NET Core MVC + SQL Server + Azure PaaS
- Frontend: React 18 + Zustand + Fabric.js | IDE: VS Code / Antigravity / VS 2026

## File Encoding
- UTF-8 only — no Mojibake or mixed encoding

> Project-specific `./CLAUDE.md` overrides these global settings.
```

### 2.2 歷史版本(僅供參考,**不再使用**)

| 版本 | 行數 | 用途 |
|:----|:----:|:----|
| `CLAUDE_v2.0.md`(已棄用)| 262 | v2.0 詳細擴展(Thinking Protocol / Behavioral Directives / Context Window 管理)|
| `CLAUDE - Thinking版.md`(已棄用)| 388 | Thinking Protocol(Stream-of-consciousness / Adaptive Depth Scaling / Pattern Recognition)|
| `CLAUDE-old.md`(已棄用)| 349 | 原始綜合版(Response Standards / Quick Reference Card)|

**減量歷史**:
- 原始版本 ~389 行(Token ~2,000)
- 精簡版 27 行(Token ~221)
- **-92% 減量**(主因:Thinking Protocol 移除 — Claude 4.6+ 原生支援 Extended Thinking,人工協議無用且可能衝突)

---

## 3. 全域 `~/.claude/settings.json`

```json
{
  "permissions": { "allow": [] },
  "enabledPlugins": {
    "frontend-design@claude-code-plugins": true,
    "ralph-wiggum@claude-code-plugins": false,
    "ralph-loop@claude-plugins-official": false
  },
  "alwaysThinkingEnabled": true,
  "effortLevel": "high",
  "autoUpdatesChannel": "latest",
  "skipDangerousModePermissionPrompt": true
}
```

| Key | 值 | 含義 |
|:----|:----|:----|
| `permissions.allow` | `[]` | 全域層**不**白名單任何工具,各專案自行宣告 |
| `enabledPlugins` | 3 個 | frontend-design 啟用 / ralph-* 兩個停用(見 §5) |
| `alwaysThinkingEnabled` | `true` | 全域啟用 Extended Thinking |
| `effortLevel` | `high` | 預設高 effort(可被 `/effort` slash 命令暫時 override) |
| `autoUpdatesChannel` | `latest` | Claude Code 自動更新管道 |
| `skipDangerousModePermissionPrompt` | `true` | 跳過 dangerous mode 確認(便利)|

> 全域**無** `settings.local.json`(本機專屬 override 一律放專案層)。

---

## 4. 全域 Slash Commands(3 個 Telegram Bridge)

`~/.claude/commands/*.md`

### 4.1 `/claude-max`

Telegram bridge 雙向 CLI ↔ Telegram 遠端執行:
- Service path: `~/claude-telegram-bridge/`
- Bot 註冊於 Telegram(個人 bot)
- Pre-flight checks:
  1. Kill zombie node.exe(Windows process cleanup)
  2. Verify `CLAUDECODE` env var
  3. Clear stale polling connections
  4. Verify network connectivity

### 4.2 `/啟動電報`

啟動 Claude Max Telegram Service:
```powershell
cd $HOME\claude-telegram-bridge
npm run dev
```
- 驗證啟動成功:看 log 輸出 + Telegram 收到上線通知

### 4.3 `/停止電報`

停止 Claude Max Telegram Service:
```powershell
# 方式 1: TaskStop API(優雅)
# 方式 2: PowerShell taskkill(強制)
taskkill /F /IM node.exe /FI "WINDOWTITLE eq *telegram-bridge*"
```
- 可選擇傳送 offline 通知至 Telegram

---

## 5. 全域 Plugins(3 個,1 啟用 + 2 停用)

`~/.claude/plugins/cache/`

### 5.1 `frontend-design@claude-code-plugins` v1.0.0(✅ 啟用)

- 來源:Anthropic 官方範例
- 作者:Prithvi Rajasekaran, Alexander Bricken
- 用途:UI/UX 實作支援 Skill
- 包含 SKILL.md frontmatter

### 5.2 `ralph-wiggum@claude-code-plugins` v1.0.0(❌ 停用)

- 來源:Anthropic 官方範例
- 作者:Daisy Hollman
- 用途:Ralph Wiggum technique — 連續自我參考 AI 迴圈用於互動式迭代開發
- Hook:`Stop` lifecycle(`stop-hook.sh`)
- Commands:`cancel-ralph` / `help` / `ralph-loop`

### 5.3 `ralph-loop@claude-plugins-official` v1.0.0(❌ 停用)

- 官方版 Ralph Loop
- Hook:`Stop`(同 ralph-wiggum 機制)
- Commands:`cancel-ralph` / `help` / `ralph-loop`

> **設計**:全域層 hooks 由 plugins 攜帶,而非獨立 `~/.claude/hooks/`。本身**無全域 hooks 目錄**。

---

## 6. 全域 MCP 認證快取(`~/.claude/mcp-needs-auth-cache.json`)

```json
{
  "claude.ai Google Drive": { "timestamp": "...", "id": "..." },
  "claude.ai Google Calendar": { "timestamp": "...", "id": "..." },
  "claude.ai Gmail": { "timestamp": "...", "id": "..." }
}
```

3 個 Google MCP server 已**註冊但等待 OAuth 認證**。需 user 互動授權才可使用。

---

## 7. 全域子目錄用途(共 12 類)

`~/.claude/` 內含多個自動產生的 cache / state 子目錄:

| 目錄 | 大小(範例)| 用途 |
|:----|:----:|:----|
| `cache/` | ~265 KB | LRU issue cache + changelog |
| `file-history/` | ~93 MB | 跨 session 檔案變更追蹤(支援 `/undo`)|
| `shell-snapshots/` | ~3.1 MB | Shell 執行狀態快照 |
| `telemetry/` | ~14 MB | 使用統計(含 OTel) |
| `plugins/` | ~31 MB | Plugin 安裝快取(含多版本)|
| `projects/` | ~1.3 GB | 專案專屬 .claude folder symlink/copy |
| `sessions/` | ~5 KB | Session metadata |
| `session-env/` | ~128 KB | Session 環境狀態 |
| `tasks/` | ~1.1 MB | 背景任務追蹤 |
| `todos/` | ~1.8 MB | To-do list + memory snapshots |
| `plans/` | ~32 KB | 命名 workflow plan(三個範例:hashed-giggling-blanket / snappy-floating-teacup / splendid-chasing-fox)|
| `paste-cache/` | ~220 KB | 複製貼上 buffer 歷史 |
| `backups/` | ~284 KB | 配置 snapshot |
| `chrome/` | ~1 KB | 瀏覽器自動化 state |
| `ide/`(空)| 0 | 預留(VS Code / Antigravity 設定在專案層)|
| `downloads/` `debug/`(空)| 0 | 預留 |

### 7.1 關鍵狀態檔

- `stats-cache.json` — 每日活動 metrics(messageCount / sessionCount / toolCallCount),從 2026-01-04 累計
- `.credentials.json` — 加密 API key / auth token(無法直接讀,由 harness 管理)

---

## 8. 全域 vs 專案層 Priority 規則

### 8.1 衝突解決

| 配置項 | 全域層 | 專案層 | 結果 |
|:----|:----|:----|:----|
| 同名指令 | `/build-fix` | `/build-fix` | **專案層勝出** |
| 同名 hook(同 event)| 無(plugin 內) | settings.json 註冊 | 專案層獨立執行 |
| 同名環境變數 | `MAX_THINKING_TOKENS` | `MAX_THINKING_TOKENS` | **專案層勝出** |
| Plugin enabled | 3 個 | 5 個 | **累加**(去重後)|
| Skill 觸發 | 全域 3 個 | 專案 74 個 | **累加** |

### 8.2 設計理念

> **全域 = 跨專案共識**(zh-TW / UTF-8 / 不假時間戳 / 簡潔報告)
> **專案 = 領域特定知識**(74 Skills / 19 Rules / 14 Hooks / Memory DB)
> **本地 = 個人偏好**(Agent ID / Telegram bridge state)

**原則**:全域層 ≤ 30 行(極簡),專案層可豐富(BMAD / Skills / Memory),本地層動態(不版控)。

---

## 9. 全域 vs 專案 Token 量化對比

| 層 | 行數 | Token 估算 | 載入方式 |
|:----|:----:|:----:|:----|
| 全域 CLAUDE.md | 27 | ~221 | Always-On |
| 全域 settings.json | ~12 lines | (config,不計 prompt) | n/a |
| 全域 commands × 3 | ~150 | (按需,不計 always-on) | Slash 觸發 |
| 全域 skills × 3 | ~600 | (按需) | 觸發載入 |
| **全域層 Always-On** | — | **~221** | 每次新對話 |
| 專案 CLAUDE.md(典型)| ~150 | ~1,276 | Always-On |
| 專案 19 Rules | ~497 | ~5,400 | Always-On |
| 專案 74 Skills 摘要 | — | ~6,200 | Always-On(描述)|
| **專案層 Always-On** | — | **~12,876** | 每次新對話 |
| **三層合計** | — | **~13,097** | 每次新對話 |

> Opus 4.6/4.7 使用 1M context window,~13K 佔比 ~1.3%,合理範圍。

---

## 10. 部屬到新專案 SOP

### 10.1 從 Toolkit 部屬全域層(若全新機器)

```powershell
# 1. 確認 ~/.claude 存在
New-Item -ItemType Directory -Path "$HOME\.claude" -Force

# 2. 複製極簡 CLAUDE.md(從 toolkit)
Copy-Item "<toolkit>\config-templates\claude-global\CLAUDE.md.template" `
          -Destination "$HOME\.claude\CLAUDE.md"

# 3. 複製 settings.json
Copy-Item "<toolkit>\config-templates\claude-global\settings.json.template" `
          -Destination "$HOME\.claude\settings.json"

# 4. (選用)複製 Telegram bridge commands
New-Item -ItemType Directory -Path "$HOME\.claude\commands" -Force
Copy-Item "<toolkit>\config-templates\claude-global\commands\*.md" `
          -Destination "$HOME\.claude\commands\"
```

### 10.2 從 Toolkit 部屬專案層(每個新專案)

詳見 `README.md` 的 Step 1-5 流程。

---

## 11. 自助驗證指令

```powershell
# 全域層完整健康檢查
$g = $HOME + '\.claude'
[PSCustomObject]@{
  ClaudeMd_Exists = (Test-Path "$g\CLAUDE.md")
  ClaudeMd_Lines = if (Test-Path "$g\CLAUDE.md") { (Get-Content "$g\CLAUDE.md").Count } else { 0 }
  Settings_Exists = (Test-Path "$g\settings.json")
  Commands_Count = (Get-ChildItem "$g\commands\*.md" -EA SilentlyContinue).Count
  Skills_Count = (Get-ChildItem "$g\skills" -Directory -EA SilentlyContinue).Count
  Plugins_Count = (Get-ChildItem "$g\plugins\cache" -Directory -EA SilentlyContinue).Count
  MCP_PendingAuth = (Test-Path "$g\mcp-needs-auth-cache.json")
} | Format-List

# 預期值(2026-05-01):
# ClaudeMd_Lines = 27 / Commands_Count = 3 / Skills_Count = 3 / Plugins_Count = 3
```

---

## 12. Related Reading

- `README.md` — 主索引(本檔被引用)
- `commands-reference.md` §3 — 3 全域 commands 詳細
- `hooks-events-deep-dive.md` §6 — 全域層**無** hooks(本身設計)
- `skills-deep-dive.md` §2 — `~/.claude/skills` 全域 3 個極少
- `mcp-ecosystem.md` §3.3 — Google MCP 全域註冊
- `開發前環境部署_v3.0.0.md` PART 1.2 — 三層 CLAUDE.md hierarchy 部署細節

---

## 13. 版本歷史

| 版本 | 日期 | 變更 |
|:----|:----|:----|
| 1.0.0 | 2026-05-01 | 初版建立。三層 CLAUDE.md hierarchy + 全域 27 行極簡 + settings.json 解析 + 3 Telegram commands + 3 plugins(1 enabled + 2 disabled) + Google MCP OAuth + 12 子目錄 + 全域 vs 專案 priority + 部屬 SOP + 自助驗證 |
