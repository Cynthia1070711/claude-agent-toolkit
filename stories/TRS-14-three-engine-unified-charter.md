# TRS-14: ~~三引擎統一憲章（AGENTS.md）與共用資源架構~~ [CANCELLED-MERGED]

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-14 |
| **狀態** | cancelled-merged |
| **合併至** | **TRS-13**（四引擎協作 SOP 標準化 + AGENTS.md v4.0 升級） |
| **取消原因** | 原三引擎範圍已過時（實際為四引擎），且 `.shared/` + symlink 架構經評估風險過高（Windows symlink 權限）決定放棄 |
| **取消時間** | 2026-02-25 21:01 |
| **複雜度** | ~~XL~~ |
| **優先級** | ~~P2~~ |
| **建立時間** | 2026-02-24 20:55 |
| **依賴** | ~~TRS-13~~ |
| **後續** | ~~無~~ |
| **來源** | E-3~E-13（全研究彙整報告）、web_claude多agnet協作策略.md |
| **類型** | E 類（多引擎協作策略） |

---

## 目標

建立三引擎（Claude Code / Gemini CLI / Antigravity IDE）的統一憲章 `AGENTS.md`、共用 `.shared/` 資源目錄、MCP 同步機制。

---

## 背景

三引擎協作研究（web_claude多agnet協作策略.md）已完成架構設計：
- AGENTS.md 作為統一憲章（單一真相來源）
- `.shared/` 目錄存放共用 Rules/Skills
- symlink 分發至 `.claude/`、`.gemini/`、`.agent/`
- MCP 同步腳本（sync-mcp.ps1）

但此設計尚未實施，且存在已知風險（~/.gemini/GEMINI.md 共用衝突）。

---

## 驗收標準

### 統一憲章
- [ ] 建立 `AGENTS.md`，包含：技術棧、開發方法論、Agent 分工表、執行紀錄規範、程式碼規範、禁止事項
- [ ] `CLAUDE.md` 保持獨立（非 symlink，因含 Claude-specific 觸發器）
- [ ] `GEMINI.md` 精簡化，指向 `AGENTS.md` 作為主要參考

### 共用資源架構
- [ ] 建立 `.shared/rules/` 存放通用規則
- [ ] 建立 `.shared/skills/` 存放共用 Skills（SKILL.md 標準格式）
- [ ] 各引擎目錄透過 symlink 指向 `.shared/`

### MCP 同步
- [ ] 建立 `.mcp-shared.json`（共用 MCP 定義）
- [ ] 建立 `.shared/mcp/sync-mcp.ps1`（同步腳本）
- [ ] 驗證三引擎 MCP 配置一致

### 追蹤格式
- [ ] `.track.md` 格式標準化：`[AGENT-ID] [ISO-8601] [動作摘要]`
- [ ] sprint-status.yaml 擴充 `assigned_agent` / `reviewed_by` 欄位

---

## 風險

- 🟠 高：Windows 11 的 symlink 需要開發者模式或管理員權限
- 🟡 中：~/.gemini/GEMINI.md 與 Antigravity 共用路徑衝突（GitHub Issue #16058）
- XL 複雜度建議拆分為子任務逐步推進

---

## 預估效益

- 消除三引擎間的規則/Skill 重複維護成本
- 統一追蹤格式，實現完整的執行追溯
- 長期降低新引擎接入的配置成本
