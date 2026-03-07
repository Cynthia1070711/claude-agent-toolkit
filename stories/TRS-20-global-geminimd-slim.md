# TRS-20: 全域 GEMINI.md 瘦身

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-20 |
| **狀態** | done |
| **複雜度** | S |
| **優先級** | P1 |
| **建立時間** | 2026-02-25 21:51 |
| **依賴** | 無（獨立執行） |
| **類型** | D 類（操作流程優化） |
| **建立者** | CC-OPUS（Party Mode） |
| **建議執行者** | GC-PRO 或 CC-OPUS |

---

## 目標

將全域 `~/.gemini/GEMINI.md` 從 388 行精簡至 ~100 行，移除冗餘的 Thinking Protocol 和已被 AGENTS.md v4.0 覆蓋的內容。

---

## 問題描述

### 現況

- 全域 `~/.gemini/GEMINI.md` = **388 行**，每次 Gemini CLI 和 Antigravity IDE 對話都會載入
- §5 Thinking Protocol 佔 **~150 行**（38.6%），教 Gemini 模型「怎麼思考」——但 Gemini 3.1 Pro 已有內建推理能力
- §2 Behavioral Directives、§4 Development Environment、§7 Quick Reference 與 AGENTS.md v4.0 大量重複
- Antigravity IDE 選用 Claude 模型時，這些冗餘 token **要付費**

### 根因分析

1. 全域 GEMINI.md 建立於 2026-02-07，當時 AGENTS.md 只有 v3.0（857 行），無多引擎協作章節
2. TRS 系列聚焦 Claude Code，未將 Gemini 憲章納入優化範圍
3. §5 Thinking Protocol 是早期從通用 prompt engineering 範本複製，未經 ROI 評估

---

## 實作方案

### Phase 1：砍掉冗餘章節

| 章節 | 行數 | 動作 | 理由 |
|------|------|------|------|
| §5 Thinking Protocol（全部） | ~150 行 | 🗑️ 刪除 | Gemini 3.1 Pro 原生推理能力已足夠 |
| §2.1 Default to Action | ~10 行 | 🗑️ 刪除 | Gemini CLI 預設行為 |
| §2.2 Parallel Tool Execution | ~8 行 | 🗑️ 刪除 | Gemini CLI 原生支援 |
| §2.3 Investigation Before Response | ~8 行 | 🗑️ 刪除 | 基本 AI 行為 |
| §2.5 Analysis & Reporting | ~30 行 | 🗑️ 刪除 | 已在 AGENTS.md §2 覆蓋 |
| §4 Development Environment | ~25 行 | 🗑️ 刪除 | 硬體規格對 AI 無影響，技術棧在 AGENTS.md §1 |
| §7 Quick Reference Card | ~15 行 | 🗑️ 刪除 | 重複 §1-§2 摘要 |

### Phase 2：壓縮保留章節

| 章節 | 原行數 | 目標行數 | 說明 |
|------|--------|---------|------|
| §1.1 Language Policy | ~15 行 | ~5 行 | 保留語言規則核心 |
| §1.2 Timestamp | ~25 行 | ~8 行 | 保留系統時間指令，砍範例 |
| §2.4 Code Quality | ~15 行 | ~6 行 | 壓縮為要點清單 |
| §3 Context Window | ~12 行 | ~5 行 | 壓縮為核心指令 |
| §6 File Encoding | ~10 行 | ~3 行 | 壓縮為一行 |

### Phase 3：新增繼承聲明

在檔案底部新增：
```
> 專案規範請讀取 `./GEMINI.md`。完整專案指引請讀取 `AGENTS.md`。
```

---

## 目標結構（精簡後 ~100 行）

```markdown
# GEMINI.md (Global Configuration)
> Version: 3.0.0

## 1. Language & Timestamp
- 繁體中文 (zh-TW)，程式碼/路徑/變數名英文
- 時間戳必須執行系統指令，禁止推斷
- Windows: powershell -Command "Get-Date -Format 'yyyy-MM-dd HH:mm:ss'"

## 2. Code Quality
- 先讀再改，禁止未讀即推測
- DRY 原則，重用現有抽象
- 最小複雜度，不做額外 refactor
- 禁止：時間估算、工時預測、完成日期

## 3. Context Window
- 不因 token 預算提前停止任務
- 接近上限時儲存進度

## 4. File Encoding
- UTF-8 強制，禁止 Mojibake

> Project-specific ./GEMINI.md will OVERRIDE these settings.
> Full project guidelines: AGENTS.md
```

---

## 驗收標準

- [x] 全域 GEMINI.md 行數 ≤ 120 行 → **65 行**
- [x] §5 Thinking Protocol 完全移除
- [x] §4 Development Environment 完全移除
- [x] 保留的章節核心指令無遺漏（語言、時間戳、編碼、Code Quality）
- [x] Gemini CLI 能正確讀取精簡後的檔案（執行 `/memory` 驗證）
- [x] Antigravity IDE 行為不受影響（開一個 session 驗證）

---

## 預估效益

| 指標 | Before | After | 節省 |
|------|:------:|:-----:|:----:|
| 全域 GEMINI.md 行數 | 388 | ~100 | -288 行 |
| Token 消耗/對話 | ~3,600 | ~800 | -2,800 tokens |
| Antigravity Claude 模型成本 | 每次載入付費 | 大幅降低 | 成本節省 |

---

## 風險

- 🟢 低：Gemini CLI 行為退化（Gemini 3.1 Pro 不依賴 Thinking Protocol）
- 🟡 中：Antigravity IDE 未繼承到足夠指令（緩解：`.agent/rules/` 有獨立規則）

---

## Required Skills

> dev-story 和 code-review 執行時，必須先載入以下 Skills。

- 無特定 Skill 需求（純文件精簡任務）
