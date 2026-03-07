# TRS-27: Rovo Dev CLI 初始配置

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-27 |
| **狀態** | done |
| **複雜度** | S |
| **優先級** | P2 |
| **建立時間** | 2026-02-25 23:30 |
| **依賴** | TRS-23（✅ 已完成 Roo Code→Rovo Dev CLI 修正，工具規格已確認） |
| **類型** | D 類（操作流程優化） |
| **建立者** | CC-OPUS（Party Mode） |
| **建議執行者** | CC-OPUS |

---

## 目標

為 Rovo Dev CLI 建立基礎憲章配置（Charter），使其與其他三引擎一樣能遵循專案規範。

---

## 問題描述

### 現況

- Rovo Dev CLI 是四引擎中**唯一沒有任何配置**的引擎
- 無 `.rovo/`、`.rovo-dev/` 或任何對應配置目錄
- Agent ID（RD-*）已在策略文件中規劃，但實際配置尚未建立

### 參考資料

- 入門指南：`claude token減量策略研究分析/各AGENT使用說明/Rovo Dev CLI 入門指南.md`（167 行）
- 需從入門指南確認：配置路徑、Charter 格式（YAML/Markdown）、模型支援清單

---

## 實作方案

### Phase 1：閱讀入門指南

完整閱讀 Rovo Dev CLI 入門指南，提取：
- 配置目錄結構（全域 vs 專案）
- Charter 檔案格式與載入機制
- 可用模型清單
- Skills/Rules 對應概念

### Phase 2：建立基礎配置

根據入門指南，建立最小可行配置：
- Agent Identity（RD-* Agent ID）
- 專案規範引用（指向 AGENTS.md）
- 基本規則（繁體中文、時間戳、禁止時間估算）

### Phase 3：驗證

- 在 Rovo Dev CLI 中啟動對話，確認配置被讀取
- 確認能遵循基本規範

---

## 驗收標準

- [x] 入門指南已完整閱讀
- [x] Rovo Dev CLI 配置目錄已建立
- [x] 基礎 Charter/配置檔已建立
- [x] Agent Identity 已設定
- [x] 在 Rovo Dev CLI 中驗證配置載入正確（RD-SONNET 正確辨識身份、角色、四引擎協作）

---

## 風險

- :green_circle: 低：Rovo Dev CLI 間歇使用，配置不影響主線開發
- :yellow_circle: 中：入門指南可能不完整，需實際測試確認配置路徑
- :red_circle: 已發生：Windows cp950 編碼錯誤 — config.yml 含非 ASCII 字元導致啟動失敗（已修復）

---

## 實作摘要

### 執行者
- CC-OPUS | 2026-02-26T00:23:02+08:00

### Phase 1：入門指南資訊提取

| 項目 | 確認結果 |
|------|---------|
| 全域配置路徑 | `~/.rovodev/config.yml`（已存在，來自舊專案） |
| 格式 | YAML（階層式結構） |
| 系統提示注入 | `agent.additionalSystemPrompt` 欄位 |
| 專案配置 | `--config-file` 旗標或專案目錄 `.rovodev/config.yml` |
| 可用模型 | Haiku 4.5 (0.4x)、Gemini 3 Flash (0.4x)、Sonnet 4/4.5/4.6 (1.0x)、GPT-5/5.1/5.2/5.2-Codex (1.0x)、Opus 4.5/4.6 (2.0x, 需升級方案) |
| 工具權限 | 三級：Allow / Ask / Deny |
| MCP 支援 | stdio / http / sse |

### Phase 2：建立配置

**檔案異動清單**：

| 檔案 | 操作 | 說明 |
|------|------|------|
| `~/.rovodev/config.yml` | 修改 | 注入 `additionalSystemPrompt`（Agent Identity + Core Rules + Must-Read Files + Handoff Protocol） |
| `.rovodev/config.yml` | 新增 | 專案層級配置，包含完整 Charter + MyProject 專用 Tech Stack + Key Constraints + toolPermissions |
| `AGENTS.md` §16.4 | 修改 | RD-* Agent ID Injection Point 從 "YAML Charter config" 更新為 `.rovodev/config.yml` |
| `AGENTS.md` §19.2 | 修改 | Related Config Files 表格新增 `.rovodev/config.yml` |

### Phase 3：驗證

- 全域配置注入確認：`additionalSystemPrompt` 已從 `null` 更新為完整 Charter
- 專案配置建立確認：`.rovodev/config.yml` 已建立，可透過 `acli rovodev run --config-file .rovodev/config.yml` 使用
- Agent Identity 已設定：RD-OPUS / RD-SONNET / RD-GPT / RD-HAIKU 四個 Agent ID 已在 Charter 中定義
- 待使用者手動驗證：啟動 Rovo Dev CLI 確認配置載入正確

### 使用方式

```bash
# 方式 1：使用全域配置（已自動注入 MyProject Charter）
acli rovodev run

# 方式 2：使用專案層級配置（推薦）
acli rovodev run --config-file .rovodev/config.yml
```

### 事故修復：cp950 編碼錯誤

**問題**：首次啟動時 Rovo Dev CLI 報錯 `'cp950' codec can't decode byte 0xe2 in position 254`
**根因**：Rovo Dev CLI 的 Python 解析器在 Windows 上使用系統預設編碼 cp950 (Big5) 讀取 config.yml，而 YAML 中含有 UTF-8 多位元組字元（em dash `—`、emoji `❌🔧`、Markdown `**bold**`）
**修正**：將 `additionalSystemPrompt` 全部改為純 ASCII 字元
**教訓**：Rovo Dev CLI 的 config.yml 在 Windows 環境下**必須保持純 ASCII**，這與其他三引擎（Claude Code / Gemini CLI / Antigravity IDE）不同

### 模型清單更新（實測 vs 入門指南）

入門指南僅列出 4 款模型，實測發現 10 款可用：

| 模型 | 倍率 | 入門指南 | 實測 |
|------|------|---------|------|
| Claude Haiku 4.5 | 0.4x | O | O |
| Gemini 3 Flash (preview) | 0.4x | X | O（新增） |
| Claude Sonnet 4 | 1.0x | X | O（新增） |
| Claude Sonnet 4.5 | 1.0x | O | O |
| Claude Sonnet 4.6 | 1.0x | X | O（新增，當前選用） |
| GPT-5 | 1.0x | X | O（新增） |
| GPT-5.1 | 1.0x | X | O（新增） |
| GPT-5.2 | 1.0x | O | O |
| GPT-5.2-Codex | 1.0x | O | O |
| Claude Opus 4.5 | 2.0x | O | O（需升級方案） |
| Claude Opus 4.6 | 2.0x | O | O（需升級方案） |

Agent ID 已新增 **RD-FLASH**（Gemini 3 Flash），同步更新至 AGENTS.md 和多引擎策略文件。
