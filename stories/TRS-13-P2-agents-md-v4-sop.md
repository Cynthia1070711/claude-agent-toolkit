# TRS-13-P2: AGENTS.md v4.0 升級 + 四引擎協作 SOP 文件化

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-13-P2 |
| **父 Story** | TRS-13（四引擎協作 SOP 標準化 + AGENTS.md v4.0 升級） |
| **狀態** | done |
| **Review Agent** | Claude Opus 4.6 |
| **Review 完成時間** | 2026-02-25 21:47 |
| **複雜度** | L |
| **優先級** | P1 |
| **建立時間** | 2026-02-25 21:17 |
| **前置依賴** | TRS-13 Phase 1（✅ 已完成：Agent ID 注入 + sprint-status.yaml 格式擴充） |
| **設計文件** | `claude token減量策略研究分析/multi-engine-collaboration-strategy.md` |
| **類型** | E 類（多引擎協作策略） |

---

## 目標

完成 TRS-13 的 Phase 2：將 AGENTS.md 從 v3.0 升級至 v4.0（補上 6 個跨引擎協作缺口），並產出正式的四引擎協作 SOP 文件。

---

## 背景

### Phase 1 已完成的基礎設施（2026-02-25）

| 項目 | 狀態 |
|------|------|
| 細分 Agent ID 定義（14 個 ID） | ✅ 寫入策略文件 §4.1 |
| `CLAUDE.local.md`（Claude Code Agent ID 注入） | ✅ 已建立 |
| `.agent/rules/agent-identity.md`（Antigravity Agent ID 注入） | ✅ 已建立 |
| `GEMINI.md` Agent Identity 區段（Gemini CLI Agent ID 注入） | ✅ 已追加 |
| sprint-status.yaml 多引擎 Agent 標記格式 | ✅ 已加入註解 |
| 已知陷阱清單（6 項） | ✅ 策略文件 §5.5 |
| 語言選擇規則 | ✅ 策略文件 §5.6 |

### 本 Phase 需完成的缺口（策略文件 §6.2）

| # | 缺口 | 目標位置 |
|---|------|---------|
| 1 | Agent 分工表不存在 | AGENTS.md §16 |
| 2 | 狀態流轉的 Agent 標記機制 | AGENTS.md §17 |
| 3 | 交接協議不完整 | AGENTS.md §15.2 擴充 |
| 4 | Rovo Dev CLI 指令格式未記錄 | AGENTS.md §10 擴充 |
| 5 | Antigravity 多模型動態角色策略 | AGENTS.md §16 內含 |
| 6 | 四引擎協作 SOP 流程未文件化 | 獨立 SOP 文件 + AGENTS.md §18 摘要 |

---

## 驗收標準

### AC-1: AGENTS.md v4.0 升級 ✅

**必讀**：升級前先完整讀取 `AGENTS.md`（857 行）+ `multi-engine-collaboration-strategy.md`（~580 行）。

- [x] **§10 擴充**：BMAD 指令對照表新增 Rovo Dev CLI / Antigravity 欄位
- [x] **§15.2 擴充**：多 AI 協作規範中加入完整的交接三步驟 + 執行紀錄格式 + 指向 SOP 文件
- [x] **§16 新增**：多引擎 Agent 分工表
  - 16.1 四引擎角色定位（指揮官 / 執行兵 / 副官 / 特種兵）
  - 16.2 BMAD Workflow 階段 → 主責引擎 → Agent ID 對照
  - 16.3 Antigravity 動態角色切換（依選用模型）
  - 16.4 完整 Agent ID 對照表（14 個 ID）
- [x] **§17 新增**：狀態流轉與 Agent 標記
  - 17.1 sprint-status.yaml 的 `assigned_agent` / `reviewed_by` / `tested_by` 格式
  - 17.2 各狀態轉換對應的執行者 Agent ID
- [x] **§18 新增**：四引擎協作 SOP 摘要（含四階段流程圖 + 已知陷阱清單 + 指向 SOP 文件）
- [x] 頂部版本號更新為 v4.0，最後更新日期 2026-02-25
- [x] 文件行數控制在 1000 行以內（實際 992 行）

### AC-2: 四引擎協作 SOP 正式文件 ✅

- [x] 建立 `docs/reference/multi-engine-sop.md`，包含：
  - §1 四引擎概覽（名稱、類型、Agent ID、核心職責）
  - §2 標準四階段工作流程（規劃 → 實作 → 審查 → E2E 收尾）
  - §3 交接協議（三步驟 + 執行紀錄格式 + sprint-status.yaml 標記格式 + 狀態轉換表）
  - §4 已知陷阱清單（6 項）
  - §5 語言選擇規則
  - §6 各引擎配置路徑對照表
  - §7 Antigravity 動態角色切換
- [x] 文件自我引用：AGENTS.md §18 + §15.2 指向此 SOP 文件

### AC-3: 狀態與追蹤更新 ✅

- [x] TRS-13 Story 文件（`TRS-13-multi-engine-sop.md`）：Phase 1 + Phase 2 驗收標準全部勾選
- [x] TRS-13 Story 文件狀態更新為 `review`
- [x] TRS-13 Story 文件的「變更紀錄」新增 Phase 2 完成 log
- [x] TRS-13-P2 Story 文件狀態更新為 `review`
- [x] sprint-status.yaml：`trs-13-multi-engine-sop` → `review`、`trs-13-p2-agents-md-v4-sop` → `review`

---

## 技術備註

### 必讀檔案清單

| 順序 | 檔案 | 原因 |
|------|------|------|
| 1 | `claude token減量策略研究分析/multi-engine-collaboration-strategy.md` | 完整策略設計，§4.1 Agent ID、§5 狀態同步、§6 缺口分析 |
| 2 | `AGENTS.md` | 升級目標，需理解現有結構（§1~§15） |
| 3 | `claude token減量策略研究分析/stories/TRS-13-multi-engine-sop.md` | 父 Story + Phase 1 執行明細 |
| 4 | `CLAUDE.local.md` | Phase 1 產出的 Claude Code Agent ID 注入範本 |
| 5 | `.agent/rules/agent-identity.md` | Phase 1 產出的 Antigravity Agent ID 注入範本 |

### 寫作規範

- AGENTS.md 中的技術規範段落使用**混合語言**（標題/說明繁體中文 + 程式碼/路徑/變數英文）
- SOP 文件為人類閱讀，一律**繁體中文**
- 新增章節的格式須與 AGENTS.md 既有風格一致（Markdown 表格 + 簡潔說明）
- 避免從策略文件原文照搬——策略文件是分析報告，AGENTS.md 是執行規範，用字精簡度不同

---

## 風險

- 🟡 中：AGENTS.md 行數可能超過 1000 行（目前 857 行 + 6 個新章節）→ 需精簡寫法
- 🟡 中：Rovo Dev CLI 透過系統提示注入 AGENTS.md，新增內容不能破壞其解析邏輯

---

## 範圍外（Phase 3，跑 2 Sprint 後再議）

- Agent ID 細分是否過於複雜
- Hooks 自動追蹤機制
- `.shared/` + symlink 架構（已決定放棄）
- E2E 測試範圍定義

---

## 變更紀錄

| 時間 | Agent | 動作 |
|------|-------|------|
| 2026-02-25 21:17 | CC-OPUS | 建立 Story（TRS-13 Phase 2 拆分） |
| 2026-02-25 21:27 | CC-OPUS | AC-3 完成：sprint-status.yaml 雙 Story 狀態→review |
| 2026-02-25 21:29 | CC-OPUS | 完成開發：AGENTS.md v4.0（993 行，6 缺口全補）+ multi-engine-sop.md 建立 |
