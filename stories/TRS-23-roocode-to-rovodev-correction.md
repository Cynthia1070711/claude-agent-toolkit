# TRS-23: Roo Code → Rovo Dev CLI 全文修正

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-23 |
| **狀態** | done |
| **複雜度** | L |
| **優先級** | P1 |
| **建立時間** | 2026-02-25 22:56 |
| **依賴** | 無（獨立執行） |
| **類型** | D 類（文件修正） |
| **建立者** | CC-OPUS（Party Mode） |
| **建議執行者** | CC-OPUS（需要跨文件一致性審查） |

---

## 目標

修正策略文件及相關文件中所有「Roo Code」的錯誤引用，根據 `各AGENT使用說明/Rovo Dev CLI 入門指南.md` 重寫 §2.4 及相關章節，將 Agent ID 前綴從 RC-* 更新為 RD-*。

---

## 問題描述

### 事故說明

策略文件建立時，第四引擎被錯誤記錄為「**Roo Code**」（Roo Code, Inc. 開源產品），但 Alan 實際使用的是「**Rovo Dev CLI**」（Atlassian 企業產品）。兩者是**完全不同的工具**。

§5.5 陷阱 #5 記錄「Roo Code 被誤稱為 Rovo Dev」更是**顛倒因果**——實際上是一開始就搞混了工具。

### 兩者差異

| 項目 | Roo Code（❌ 錯誤引用） | Rovo Dev CLI（✅ 實際使用） |
|------|----------------------|--------------------------|
| 開發商 | Roo Code, Inc. | Atlassian |
| 授權 | Apache 2.0（開源） | Atlassian 商業授權 |
| 核心特色 | 模型無關（Model Agnostic） | Atlassian 生態系整合（Jira/Confluence/Bitbucket） |
| 憲章機制 | `AGENTS.md` 原生讀取 | YAML 配置 + Charter 系統 |
| 內建模式 | Architect/Code/Ask/Debug + Boomerang | 企業級代理模式 + Skill 體系 |

### 影響範圍

| 文件 | 出現次數 | 修正類型 |
|------|---------|---------|
| `multi-engine-collaboration-strategy.md` | ~25 處 | 改名 + **§2.4 整節重寫** |
| `AGENTS.md` v4.0 | ~10 處 | 改名 + **§16 Agent ID 重寫** |
| `docs/reference/multi-engine-sop.md` | ~8 處 | 改名 + 配置路徑更新 |
| `sprint-status.yaml` | 1 處 | Agent ID 註解更新 |

---

## 實作方案

### 前置條件（必須先完成）

**完整閱讀 Rovo Dev CLI 入門指南**：
- 路徑：`claude token減量策略研究分析/各AGENT使用說明/Rovo Dev CLI 入門指南.md`（167 行）
- 目的：確認 Rovo Dev CLI 的實際能力、配置路徑、模型支援、憲章格式
- 產出：提取 §2.4 重寫所需的所有規格資訊

### Phase 1：重寫 `multi-engine-collaboration-strategy.md`

| 修正項 | 內容 |
|--------|------|
| §1.1 表格 | Roo Code → Rovo Dev CLI，更新類型/說明 |
| §1.2 | 更新 AGENTS.md 命名說明（不再是 Roo Code 原生路徑） |
| §1.3 表格 | 更新 Rovo Dev CLI 讀取 AGENTS.md 的方式 |
| **§2.4 整節重寫** | 根據入門指南重寫：基本資訊、可用模型、Charter 機制、Skills 體系、Jira/Confluence 整合、在 MyProject 中的角色定位 |
| §3.1-3.3 | 更新分工表中的引擎名稱和 Agent ID |
| §4.1 Agent ID | RC-* → RD-*，重新定義可用模型組合 |
| §4.2 注入方式 | 更新 Rovo Dev CLI 的 Agent ID 注入位置 |
| §4.3 範例 | 更新 RC- → RD- |
| §5.5 陷阱 #5 | 修正描述：原因是「搞混了兩個不同工具」 |
| §6.2 缺口 | 更新 #4, #5 |
| §7 配置表 | 更新 Rovo Dev CLI 欄位 |
| §8 風險/決策 | 更新相關引用 |

### Phase 2：修正 `AGENTS.md` v4.0

| 修正項 | 內容 |
|--------|------|
| §10 指令格式 | 更新 Rovo Dev CLI 的指令格式 |
| §16 Agent ID 表 | RC-* → RD-*，更新 Rovo Dev CLI 段落描述 |
| §17 狀態流轉 | 更新引用 |
| §18 SOP 流程 | 更新引用 |
| 文件頂部 | 更新引擎列表 |

### Phase 3：修正其他文件

| 文件 | 修正 |
|------|------|
| `docs/reference/multi-engine-sop.md` | 全文 Roo Code → Rovo Dev CLI + 配置表更新 |
| `sprint-status.yaml` | Agent ID 註解：RC-* → RD-* |

### Phase 4：驗證

- `grep -r "Roo Code" .` 確認零殘留
- `grep -r "RC-OPUS\|RC-SONNET\|RC-GPT\|RC-GEMINI" .` 確認 Agent ID 全部更新
- 交叉比對 Rovo Dev CLI 入門指南 vs §2.4 重寫內容，確保無遺漏

---

## 驗收標準

- [x] 入門指南已完整閱讀，關鍵規格已提取
- [x] §2.4 已根據 Rovo Dev CLI 實際能力重寫（非 find-and-replace）
- [x] `multi-engine-collaboration-strategy.md` 全文零「Roo Code」殘留（歷史記錄除外）
- [x] `AGENTS.md` v4.0 全文零「Roo Code」殘留
- [x] `multi-engine-sop.md` 全文零「Roo Code」殘留（陷阱說明除外）
- [x] `sprint-status.yaml` Agent ID 註解已更新
- [x] Agent ID 前綴全部更新：RC-* → RD-*（含新增 RD-HAIKU 取代 RC-GEMINI）
- [x] §5.5 陷阱 #5 描述已修正
- [x] grep 驗證通過：全專案零實質「Roo Code」引用 + 零 RC-* Agent ID

---

## 風險（已處理）

- ✅ Rovo Dev CLI 模型支援已確認：Haiku 4.5 (0.4x)、Sonnet 4.5 (1.0x)、GPT-5.2 (1.0x)、Opus 4.5/4.6 (2.0x)
- ✅ AGENTS.md v4.0 僅修改 §10、§16 相關行，§1-§15 未受影響
- ✅ sprint-status.yaml Agent ID 註解已更新，不影響功能

---

## Change Log

| 時間 | Agent | 動作 |
|------|-------|------|
| 2026-02-25 23:46 | CC-OPUS | TRS-23 執行完成：4 個 Phase 全部通過，修正 8 個文件，§2.4 整節重寫，Agent ID RC-*→RD-* |
