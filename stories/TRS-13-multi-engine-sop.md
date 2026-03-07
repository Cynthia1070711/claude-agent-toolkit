# TRS-13: 四引擎協作 SOP 標準化 + AGENTS.md v4.0 升級

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-13 |
| **狀態** | done |
| **複雜度** | XL |
| **優先級** | P1 |
| **建立時間** | 2026-02-24 20:55 |
| **最後更新** | 2026-02-25 21:47 |
| **Review Agent** | Claude Opus 4.6 |
| **Review 完成時間** | 2026-02-25 21:47 |
| **依賴** | TRS-6~10（B 類 Workflow 壓縮完成後） |
| **合併來源** | TRS-14（cancelled-merged，原三引擎統一憲章 Story） |
| **來源** | multi-engine-collaboration-strategy.md（Party Mode 討論 + Alan 決策確認） |
| **類型** | E 類（多引擎協作策略） |

---

## 目標

將 MyProject 專案的四引擎（Claude Code / Gemini CLI / Antigravity IDE / Rovo Dev CLI）協作分工標準化為 SOP 文件，並將 AGENTS.md 從 v3.0 升級至 v4.0 補上跨引擎協作的 6 個缺口。

---

## 背景

- Alan 已在日常開發中使用四個 AI 引擎，但分工流程為**隱性知識**
- `multi-engine-collaboration-strategy.md` 已完成 ~90% 的策略設計（534 行）
- AGENTS.md v3.0 已存在（857 行），但缺少 Agent 分工表、狀態流轉標記、交接協議等
- 原 TRS-13（雙引擎 SOP）和 TRS-14（三引擎統一憲章）範圍過時，合併為本 Story

---

## 驗收標準

### Phase 1：Agent ID 注入 + 格式擴充（✅ 2026-02-25 21:17 完成）
- [x] 各引擎 Agent ID 注入檔案建立（細分模式：CC-OPUS/GC-PRO/AG-OPUS/RD-SONNET 等）
- [x] sprint-status.yaml 新增 `assigned_agent` / `reviewed_by` / `tested_by` 欄位

### Phase 2：SOP 文件化（✅ 2026-02-25 21:29 完成）
- [x] 建立 `docs/reference/multi-engine-sop.md`（四引擎協作 SOP 正式文件）
- [x] AGENTS.md v4.0 升級，補上 6 個缺口：
  - §16: 多引擎 Agent 分工表（含 16.1~16.4）
  - §17: 狀態流轉與 Agent 標記（含 17.1~17.2）
  - §15.2: 交接協議擴充（交接三步驟 + 執行紀錄格式）
  - §10: Rovo Dev CLI / Antigravity 指令格式
  - §16.3: Antigravity 多模型動態角色策略
  - §18: 四引擎協作 SOP 摘要（含陷阱清單）

### Phase 3：驗證與迭代（跑 2 Sprint 後）
- [ ] 檢視 Agent ID 細分是否過於複雜
- [ ] 評估 Hooks 自動追蹤的必要性
- [ ] 評估 E2E 測試範圍（每 Story vs 有 UI 變更的 Story）

---

## 風險

- 🟠 高：`~/.gemini/GEMINI.md` 與 Antigravity 共用路徑衝突（GitHub Issue #16058）
- 🟡 中：四引擎狀態同步遺漏（緩解：交接三步驟 + Agent ID 標記）
- 🟡 中：Party Mode token 倍增（緩解：使用 subagent 隔離模式）

---

## 設計文件

**完整策略設計**：`claude token減量策略研究分析/multi-engine-collaboration-strategy.md`

---

## 變更紀錄

| 時間 | Agent | 動作 |
|------|-------|------|
| 2026-02-24 20:55 | CC-OPUS | 建立 Story（原雙引擎 SOP 範圍） |
| 2026-02-25 21:01 | CC-OPUS | 合併 TRS-14 + 重新規劃為四引擎範圍 + Phase 1 開始執行 |
| 2026-02-25 21:17 | CC-OPUS | Phase 1 完成：8 項配置/文檔產出（詳見下方） |
| 2026-02-25 21:17 | CC-OPUS | Phase 2 Story 建立：`TRS-13-P2-agents-md-v4-sop.md`（ready-for-dev） |
| 2026-02-25 21:29 | CC-OPUS | Phase 2 完成：AGENTS.md v4.0 升級（992 行）+ `docs/reference/multi-engine-sop.md` 建立 |
| 2026-02-25 21:37 | CC-OPUS | Code Review 開始：發現 4H+5M+2L 問題，SaaS Score 31/100 |
| 2026-02-25 21:47 | CC-OPUS | Code Review 完成：H1-H4 + M1-M5 全修復，SaaS Score 31→88，檔案重命名 dual→multi |

---

## Code Review 發現（2026-02-25 21:37→21:47，Reviewer: CC-OPUS）

> SaaS Readiness Score: **31 → 88**/100
> 使用者補充：AGENTS.md 是給 AI 看的（AI 消費文件），語言選擇應優化 token 效率

### HIGH (4) — ✅ 全部修復

| # | 維度 | 問題 | 修復結果 |
|---|------|------|---------|
| H1 | Consistency | AGENTS.md 語言選擇根本矛盾 | ✅ SOP §5 修正：移除「混合」例外，明確 AI 憲章→英文；加入過渡期說明 |
| H2 | DataConsistency | AGENTS.md §12 專案現況嚴重過時 | ✅ §12 瘦身：移除靜態 Epic 表格→指向 project-context.md + 2026-02-25 快速摘要（993→984 行） |
| H3 | DataConsistency | §17.1 格式定義不一致 | ✅ 修正 AGENTS.md §17.1 + SOP §3.3 為實際扁平 KV + 行尾註解格式 |
| H4 | DataConsistency | §3.1 sprint-status.yaml 路徑錯誤 | ✅ 修正為 `docs/implementation-artifacts/sprint-status.yaml` |

### MEDIUM (5) — ✅ 全部修復

| # | 維度 | 問題 | 修復結果 |
|---|------|------|---------|
| M1 | CodeQuality | TRS-13-P2 變更紀錄時間序混亂 | ✅ 重新排序為正確時間順序 |
| M2 | Consistency | 文件名 dual vs sprint-status key multi 不一致 | ✅ 檔案重命名 `dual→multi` + 所有引用更新（P2 Story、任務.md） |
| M3 | Consistency | 追蹤檔案缺失 | ✅ 免建（TRS 系列非標準 BMAD Story 路徑，以 sprint-status.yaml 追蹤） |
| M4 | CodeQuality | TRS-13 缺少 Phase 2 File List | ✅ 新增 Phase 2 執行明細表（4 個檔案） |
| M5 | Consistency | SOP §5 語言規則矛盾 | ✅ 與 H1 一併修正 |

### LOW (2) — ℹ️ 已緩解

| # | 維度 | 問題 | 結果 |
|---|------|------|------|
| L1 | CodeQuality | SOP 與 AGENTS.md 重複 | ℹ️ 設計上為摘要+完整版關係，已建立互相指向 |
| L2 | CodeQuality | AGENTS.md 行數接近上限 | ✅ H2 修復後 993→984 行，餘量 16 行 |

### Phase 1 執行明細（2026-02-25 21:01~21:17）

| # | 產出檔案 | 動作 | 說明 |
|---|---------|------|------|
| 1 | `multi-engine-collaboration-strategy.md` | 更新 | §4.1 細分 Agent ID（14 個）、§5.5 已知陷阱清單（6 項）、§5.6 語言選擇規則、§8.2 決策紀錄、§9.1 進度 |
| 2 | `TRS-13-multi-engine-sop.md` | 更新 | 標題→四引擎、狀態→in-progress、複雜度→XL、合併 TRS-14 |
| 3 | `TRS-14-three-engine-unified-charter.md` | 更新 | 狀態→cancelled-merged |
| 4 | `CLAUDE.local.md` | 新建 | CC-OPUS / CC-SONNET / CC-HAIKU + 交接三步驟 |
| 5 | `.agent/rules/agent-identity.md` | 新建 | AG-OPUS / AG-SONNET / AG-PRO / AG-FLASH / AG-GPT + 交接三步驟 |
| 6 | `GEMINI.md` | 更新 | 末尾追加 Agent Identity 區段（GC-PRO / GC-FLASH） |
| 7 | `sprint-status.yaml` | 更新 | 新增多引擎 Agent 標記說明 + 完整 Agent ID 對照表 |
| 8 | `.gitignore` | 更新 | 加入 `CLAUDE.local.md` 排除規則 |

### Phase 2 執行明細（2026-02-25 21:17~21:29）

| # | 產出檔案 | 動作 | 說明 |
|---|---------|------|------|
| 1 | `AGENTS.md` | 更新 | v3.0→v4.0：新增 §16 Agent 分工表、§17 狀態流轉、§18 SOP 摘要；擴充 §10 指令格式、§15.2 交接協議 |
| 2 | `docs/reference/multi-engine-sop.md` | 新建 | 四引擎協作 SOP 正式文件（§1-§7，189 行） |
| 3 | `TRS-13-P2-agents-md-v4-sop.md` | 新建 | Phase 2 子 Story 文件 |
| 4 | `sprint-status.yaml` | 更新 | trs-13-multi-engine-sop + trs-13-p2 → review |
