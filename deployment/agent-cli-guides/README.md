# Agent CLI 使用指南總覽

> **版本**: 3.0.0
> **建立日期**: 2026-08-07 11:45:00
> **更新日期**: 2026-08-07 14:30:00

---

## 指南列表

| CLI 工具                           | 指南文檔                                        | 定位                      | 適用場景                                          |
| ---------------------------------- | ----------------------------------------------- | ------------------------- | ------------------------------------------------- |
| **Claude Code CLI**          | [claude-code-guide.md](./claude-code-guide.md)   | **主力開發工具**    | 全棧開發、代碼審查、重構、CI/CD、Agentic Workflow |
| **Gemini CLI**               | [gemini-cli-guide.md](./gemini-cli-guide.md)     | **免費額度首選**    | 大上下文分析、Google 生態整合、搜尋接地           |
| **Google Antigravity (AGY)** | [antigravity-guide.md](./antigravity-guide.md)   | **Agent-First IDE** | 多代理協作、視覺化 Diff、雲端無縫切換             |
| **Codex CLI**                | [codex-cli-guide.md](./codex-cli-guide.md)       | **OpenAI 生態整合** | ChatGPT 方案用戶、三合一體驗 (CLI/IDE/Desktop)    |
| **Crush (原 OpenCode)**      | [opencode-cli-guide.md](./opencode-cli-guide.md) | **終端機原生 TUI**  | 多模型提供商、Vim 操作、自架模型支援              |

---

## 快速對比表

| 特性                     | Claude Code                    | Gemini CLI                     | Antigravity (AGY)             | Codex CLI                | Crush                  |
| ------------------------ | ------------------------------ | ------------------------------ | ----------------------------- | ------------------------ | ---------------------- |
| **廠商**           | Anthropic                      | Google                         | Cognition (Devin)             | OpenAI                   | Charm                  |
| **授權**           | 專有                           | Apache 2.0                     | 專有                          | Apache 2.0               | MIT                    |
| **介面**           | Terminal + IDE + Desktop + Web | Terminal                       | **IDE (主要)** + Remote | Terminal + IDE + Desktop | Terminal (TUI)         |
| **模型**           | Claude 4.6 系列                | Gemini 3 系列                  | SWE-1.6 + 多模型              | GPT-4o/o1/o3 系列        | **全提供商**     |
| **Context Window** | 200K (1M 可選)                 | **1M**                   | 依模型                        | 128K-1M                  | 依模型                 |
| **免費額度**       | 有限                           | **慷慨 (60rpm/1000rpd)** | SWE-1.6 無限                  | ChatGPT 方案含           | 依提供商               |
| **MCP 支援**       | ✅ 完整                        | ✅ 完整                        | ✅ 內建                       | ✅                       | ✅                     |
| **ACP 支援**       | ✅                             | ✅                             | ✅ 原生                       | ✅                       | ✅                     |
| **LSP 整合**       | Via Extensions                 | Via Extensions                 | 內建 IDE                      | Via Extensions           | ✅ 原生                |
| **自定義命令**     | Skills/Commands                | Custom Commands                | Skills                        | Commands                 | ✅ 原生                |
| **會話管理**       | Auto-compact                   | Checkpointing                  | Spaces + 雲端同步             | Teleport/Cloud           | SQLite + Auto Compact  |
| **Git 整合**       | 原生                           | 原生                           | 內建 IDE                      | 原生                     | 工具支援               |
| **CI/CD 整合**     | GitHub Actions                 | GitHub Actions                 | 不適用                        | GitHub Actions           | 腳本支援               |
| **跨設備同步**     | Teleport/Remote                | 無                             | **雲端無縫切換**        | Teleport/Cloud           | 無                     |
| **Vim/鍵盤操作**   | 基礎                           | 基礎                           | IDE 標準                      | 基礎                     | **原生 Vim TUI** |

---

## 選型建議

### **主要開發機 (單一選擇)**

| 團隊/個人狀況                   | 推薦                        | 理由                                        |
| ------------------------------- | --------------------------- | ------------------------------------------- |
| **標準全棧開發**          | **Claude Code**       | 生態最完整、Agentic Loop 最強、技能生態豐富 |
| **預算敏感/大上下文**     | **Gemini CLI**        | 1M Context 免費、Google Search Grounding    |
| **多代理協作/視覺化**     | **Antigravity (AGY)** | Spaces 管理、Supercomplete、雲端同步        |
| **ChatGPT 訂閱用戶**      | **Codex CLI**         | 方案整合、三合一體驗、OpenAI 模型優先       |
| **終端機純粹主義/多模型** | **Crush**             | TUI 體驗、全提供商、Vim 操作、自架模型      |

### **輔助工具 (可並行使用)**

| 需求                     | 工具組合                                              |
| ------------------------ | ----------------------------------------------------- |
| **代碼審查自動化** | Claude Code (GitHub Actions) + Codex (PR Review)      |
| **大代碼庫分析**   | Gemini CLI (1M Context) + Claude Code (重構)          |
| **多代理並行**     | Antigravity Spaces + Crush (ACP 協作)                 |
| **成本優化**       | Gemini CLI (免費) + Crush (自架模型) + Codex (方案含) |

---

## 環境變數統一管理

建立 `~/.env.ai` 統一管理所有 CLI 需要的 API Keys：

```bash
# ~/.env.ai (權限 600)
# Anthropic / Claude Code
export ANTHROPIC_API_KEY="sk-ant-..."

# Google / Gemini CLI / Vertex AI
export GEMINI_API_KEY="..."
export GOOGLE_CLOUD_PROJECT="my-project-123"
export GOOGLE_GENAI_USE_VERTEXAI="true"

# OpenAI / Codex CLI
export OPENAI_API_KEY="sk-..."

# GitHub Copilot (Crush, Codex IDE)
export GITHUB_TOKEN="gho_..."

# AWS Bedrock (Crush)
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_REGION="us-east-1"

# Groq (Crush)
export GROQ_API_KEY="gsk_..."

# Azure OpenAI (Crush)
export AZURE_OPENAI_ENDPOINT="https://xxx.openai.azure.com"
export AZURE_OPENAI_API_KEY="..."
export AZURE_OPENAI_API_VERSION="2024-10-01"

# OpenRouter (Crush 統一介面)
export OPENROUTER_API_KEY="sk-or-..."

# 自架模型 (Crush)
export LOCAL_ENDPOINT="http://localhost:11434/v1"  # Ollama
```

在 Shell 配置中載入：

```bash
# ~/.zshrc 或 ~/.bashrc
[ -f ~/.env.ai ] && source ~/.env.ai
```

---

## 共同配置最佳實踐

### **1. 專案級配置檔 (提交到 Git)**

| 工具                  | 配置檔                                   | 用途                               |
| --------------------- | ---------------------------------------- | ---------------------------------- |
| **Claude Code** | `CLAUDE.md`、`.claude/settings.json` | 專案規範、權限、Hooks、MCP         |
| **Gemini CLI**  | `GEMINI.md`、`.gemini/settings.json` | 上下文、模型、工具權限、MCP        |
| **Codex CLI**   | `AGENTS.md`                            | 專案規範、開發指令                 |
| **Crush**       | `.crush.json`、`.crush/commands/`    | 提供商、模型、LSP、MCP、自定義命令 |
| **Antigravity** | IDE 設定同步                             | Settings → Sync                   |

### **2. 統一專案規範模板 (AGENTS.md / CLAUDE.md / GEMINI.md)**

```markdown
# 專案規範 (通用)

## 技術棧
- Runtime: Node.js 20 + TypeScript 5.6 / .NET 8
- Package Manager: pnpm 9
- Framework: React 18 + Vite 5 / ASP.NET Core 8

## 程式碼規範
- 日期時間: UTC 儲存，顯示轉 Asia/Taipei (ADR-TZ-001)
- API 回應: RFC 7807 ProblemDetails
- 無硬編碼色彩: 使用 Design Tokens (--color-*)
- 無 Base64 圖片在 CanvasJson (ADR-ARCH-001)

## 架構決策 (ADR)
- ADR-ARCH-001: Editor v2.0 (CanvasJson V2, AssetService, JSON Patch)
- ADR-TZ-001: 時區處理標準
- ADR-UI-005: FloatingToolbar 實作規範

## 開發指令
- Build: `pnpm run build` / `dotnet build`
- Test: `pnpm run test` / `dotnet test`
- Lint: `pnpm run lint`
- Typecheck: `pnpm run typecheck` / `dotnet build`

## 審查清單
- [ ] 測試覆蓋率 ≥ 80% (Backend) / ≥ 70% (Frontend)
- [ ] 無硬編碼十六進位色碼
- [ ] 無 Base64 圖片
- [ ] CanvasJson ≤ 500KB
- [ ] 所有 MCP 伺服器正常連線
```

### **3. MCP 伺服器標準化配置**

```json
// .claude/mcp_config.json / .gemini/settings.json / .crush.json 共用
{
  "mcpServers": {
    "github": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"]},
    "filesystem": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]},
    "slack": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-slack"]},
    "postgres": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://..."]},
    "sqlite": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-sqlite", "./data.db"]}
  }
}
```

---

## 版本歷程

| 版本   | 日期       | 變更內容                                                                                                                                        |
| ------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| v1.0.0 | 2026-05-01 | 初版：Claude Code、Gemini CLI、Antigravity、Rovo Dev                                                                                            |
| v2.0.0 | 2026-08-07 | 更新版本標頭、移除 Rovo Dev、修正 AGY 定義                                                                                                      |
| v3.0.0 | 2026-08-07 | **全面更新 2026 最新資訊**：Claude Code 4.6、Gemini 3、Antigravity→Devin Desktop、新增 Codex CLI、OpenCode→Crush 遷移、統一配置最佳實踐 |

---

## 參考資源

- **開發前環境部署.md** PART 1: Token 減量策略
- **Claude Code 官方文檔**: https://code.claude.com/docs/
- **Gemini CLI 官方文檔**: https://geminicli.com/docs/
- **Devin Desktop 文檔**: https://docs.devin.ai/desktop/
- **Codex CLI 文檔**: https://developers.openai.com/codex
- **Crush 專案**: https://github.com/charmbracelet/crush
- **Agent Client Protocol (ACP)**: https://github.com/agent-client-protocol/acp
- **MCP 伺服器註冊表**: https://github.com/modelcontextprotocol/servers
