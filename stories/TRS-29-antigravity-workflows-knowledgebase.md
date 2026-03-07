# TRS-29: Antigravity Workflows 審查 + Knowledge Base 規劃

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-29 |
| **狀態** | done |
| **複雜度** | S |
| **優先級** | P2 |
| **建立時間** | 2026-02-25 23:30 |
| **依賴** | TRS-24（Skills 適配完成後再處理 Workflows 和 Knowledge Base） |
| **類型** | D 類（操作流程優化） |
| **建立者** | CC-OPUS（Party Mode） |
| **建議執行者** | CC-OPUS 或 AG-OPUS |

---

## 目標

審查 `.agent/workflows/` 的 7 個 Workflow 是否有冗餘或可利用 Antigravity 組合性特性優化，並評估將 Antigravity 內建 Knowledge Base（永久記憶）納入多引擎知識同步策略。

---

## 問題描述

### Workflows 審查

`.agent/workflows/` 目前有 7 個 Workflow 檔案，但：
- 是否有與 BMAD Workflows 重複的？
- Antigravity Workflows 支援**組合性**（工作流調用工作流），是否有整合空間？
- 每檔上限 12,000 字元，是否有超限？

### Knowledge Base 規劃

Antigravity IDE 內建**永久記憶系統**（Knowledge Base / Knowledge Items）：
- 自動學習跨 session 知識
- 與 Claude Code 的 `~/.claude/projects/*/memory/MEMORY.md` 概念類似但更強大
- 目前未納入多引擎知識同步策略

| 引擎 | 記憶機制 | 持久性 | 同步現況 |
|------|---------|--------|---------|
| Claude Code | `memory/MEMORY.md` 手動管理 | 持久 | ✅ 已建立 |
| Gemini CLI | `/memory` 手動檢視 | 非持久 | ❌ 未規劃 |
| Antigravity | Knowledge Base（自動） | 永久 | ❌ 未規劃 |
| Rovo Dev CLI | 待確認 | 待確認 | ❌ 未規劃 |

---

## 實作方案

### Phase 1：Workflows 審查

- 列出 `.agent/workflows/` 全部 7 個檔案
- 逐一分析用途、是否與 BMAD Workflows 重複
- 識別可刪除或整合的 Workflow
- 檢查字元數是否超過 12,000 限制

### Phase 2：Knowledge Base 評估

- 確認 Antigravity Knowledge Base 的管理方式（自動 vs 手動）
- 評估是否需要預先寫入 Knowledge Items（如專案架構、技術決策）
- 設計與其他引擎的知識同步策略（如果有價值）

### Phase 3：實作

- 刪除/整合冗餘 Workflows
- （選配）預先寫入 Knowledge Items
- 更新文件記錄

---

## 驗收標準

- [x] `.agent/workflows/` 已審查，記錄每個 Workflow 的用途
- [x] 冗餘 Workflows 已刪除或整合（7→6，刪除 `bmm-auto-pilot.md`，修復 4 個路徑引用）
- [x] Knowledge Base 評估報告完成（被動觀察策略，不預寫入）
- [x] 如有 Knowledge Items 需要預寫，已完成（結論：不需預寫）
- [x] 策略文件 §11.8 對應項目已更新狀態（#5、#6、#12 已標記 ✅ done）

---

## 風險

- :green_circle: 低：Workflows 審查是純分析任務
- :yellow_circle: 中：Knowledge Base 的自動學習可能引入不準確知識（緩解：可手動管理）

---

## 執行記錄

### [CC-OPUS] 2026-02-26T23:06:15+08:00 TRS-29 完成

**Workflows 審查結果**：

| # | 檔案 | 字元 | 用途 | 處置 |
|---|------|------|------|------|
| 1 | `bmad-workflow-bmm-auto-pilot.md` | 1,960 | 智慧導航決策引擎 | ✅ 保留，修復過時路徑 |
| 2 | `bmad-workflow-core-party-mode.md` | 197 | Party Mode 代理轉發 | ✅ 保留 |
| 3 | ~~`bmm-auto-pilot.md`~~ | 807 | 舊版 Auto-Pilot（過時指令名） | ❌ 刪除（被 #1 取代） |
| 4 | `code-review.md` | 2,107 | BMAD Code Review 入口 | ✅ 保留，修復 `.gemini/` → `.agent/` |
| 5 | `create.md` | 1,538 | BMAD Create Story 入口 | ✅ 保留，修復同上 |
| 6 | `dev.md` | 1,320 | BMAD Dev Story 入口 | ✅ 保留，修復同上 |
| 7 | `ui-ux-pro-max.md` | 8,550 | UI/UX 設計搜尋系統 | ✅ 保留，修復 `.shared/` → `.agent/skills/` |

**Knowledge Base 評估**：採用「被動觀察策略」—— 不主動預寫入 Knowledge Items，讓系統自然積累；以 Git 版本控制文件為 Source of Truth。

**變更摘要**：
- 刪除 1 個冗餘 Workflow（`bmm-auto-pilot.md`）
- 修復 4 個路徑引用錯誤（3 個 `.gemini/` → `.agent/`，1 個 `.shared/` → `.agent/skills/`）
- 修復 1 個過時檔案引用（`docs/bmm-workflow-status.yaml` 移除）
- 策略文件 §11.8 問題 #5、#6 標記已解決，§11.6 #12 標記 done
