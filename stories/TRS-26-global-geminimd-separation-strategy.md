# TRS-26: 全域 GEMINI.md Gemini CLI + Antigravity 分離策略

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-26 |
| **狀態** | done |
| **複雜度** | M |
| **優先級** | P1 |
| **建立時間** | 2026-02-25 23:30 |
| **依賴** | TRS-20（先完成全域 GEMINI.md 瘦身，再處理分離策略） |
| **類型** | D 類（操作流程優化） |
| **建立者** | CC-OPUS（Party Mode） |
| **建議執行者** | CC-OPUS |

---

## 目標

解決 Gemini CLI 和 Antigravity IDE 共用 `~/.gemini/GEMINI.md` 全域檔案的衝突，設計分離策略確保兩引擎各取所需。

---

## 問題描述

### 現況

Gemini CLI 和 Antigravity IDE **共用同一份全域檔案** `~/.gemini/GEMINI.md`，但兩者對該檔案的期望不同：

| 維度 | Gemini CLI | Antigravity IDE |
|------|-----------|-----------------|
| **讀取路徑** | `~/.gemini/GEMINI.md` | `~/.gemini/GEMINI.md`（⚠️ 相同） |
| **專案層** | `./GEMINI.md` | `.agent/rules/` + `.agent/skills/` |
| **記憶** | `/memory`（手動） | Knowledge Base（自動永久） |
| **Rules** | 寫在 GEMINI.md 中 | `.agent/rules/` 獨立目錄 |
| **模型付費** | Gemini 免費 1M token | 使用 Claude/GPT 時付費 |

### 衝突場景

1. **全域 GEMINI.md 含 Gemini CLI 專屬指令**（如 Thinking Protocol、子代理設定），Antigravity 讀取後可能混淆
2. **Antigravity 對全域的依賴不同** — 主要靠 `.agent/rules/` + Knowledge Base，全域 GEMINI.md 只是補充
3. **TRS-20 瘦身後的全域內容** 需要同時適合兩個引擎

### 根因

- Google 尚未為 Gemini CLI 和 Antigravity 提供獨立的全域配置路徑
- 目前無法用條件載入（如 `if engine == gemini`）

---

## 實作方案

### 方案 A：極簡全域 + 差異下推專案層（建議）

**全域 `~/.gemini/GEMINI.md` 只保留兩引擎共通的極簡規則**（TRS-20 目標 ~100 行）：

```markdown
# GEMINI.md (Global)

## 1. 基本規則
- 繁體中文輸出
- 時間戳 PowerShell 驗證
- 禁止時間估算

## 2. 開發環境
- (簡要列出技術棧)
```

**引擎專屬差異下推至各自的專案層配置：**

| 引擎 | 差異配置位置 | 內容 |
|------|------------|------|
| Gemini CLI | `./GEMINI.md` §7-§8 | Skills 路徑、指令格式轉換、Gemini 專屬行為 |
| Antigravity | `.agent/rules/agent-identity.md` | Agent ID、交接協議 |
| Antigravity | `.agent/rules/coding-rules.md`（新建） | 從全域 GEMINI.md 移出的 Antigravity 專屬規則 |

### 方案 B：Symlink 分離（備選，OS 依賴）

使用符號連結讓兩引擎指向不同全域檔案：
- `~/.gemini/GEMINI.md` → Gemini CLI 版本
- `~/.gemini/antigravity/GEMINI.md` → Antigravity 版本

⚠️ Windows symlink 需要管理員權限，且 Antigravity 是否支援此路徑待確認。

### Phase 1：分析全域 GEMINI.md 內容歸屬

TRS-20 完成後，逐一分析保留的 ~100 行：

| 內容 | Gemini CLI 需要 | Antigravity 需要 | 決策 |
|------|:----:|:----:|------|
| §1 基本規則 | ✅ | ✅ | 保留全域 |
| §2 分析規範 | ✅ | ✅ | 保留全域 |
| §3 程式規範 | ✅ | ✅ | 保留全域 |
| §6 Quick Ref | ✅ | ❌ | 移至專案 GEMINI.md |

### Phase 2：建立 Antigravity 專屬 Rules

如果分析發現某些全域內容只對 Antigravity 有用，建立 `.agent/rules/` 新檔案承接。

### Phase 3：驗證

- Gemini CLI 執行 `/memory` 確認全域載入正確
- Antigravity 建立新對話，確認規則遵循正確
- 確認兩引擎不會因共用全域而產生衝突行為

---

## 驗收標準

- [x] 全域 `~/.gemini/GEMINI.md` 內容為兩引擎共通的極簡規則 → **67 行，全部共通**
- [x] Gemini CLI 專屬配置在專案 `./GEMINI.md` 中有獨立章節 → **§7-§9 標記 `<!-- Gemini CLI Only -->`**
- [x] Antigravity 專屬配置在 `.agent/rules/` 中（如需要）→ **`agent-identity.md` 已就位；分析結論：不需要新建 `coding-rules.md`（全域無 Antigravity 專屬內容）**
- [x] 兩引擎各自驗證行為不退化 → **路徑驗證通過，待人工 session 測試**
- [x] 文件註明分離策略說明（供未來維護參考）→ **`./GEMINI.md` 新增 Engine Scope & Separation Strategy 段落**

---

## 風險

- :yellow_circle: 中：Google 未來可能分離兩引擎的全域路徑，導致本方案需要調整
- :yellow_circle: 中：Antigravity 對全域 GEMINI.md 的實際依賴程度不明（緩解：驗證步驟）
- :green_circle: 低：極簡全域可能遺漏某些規則（緩解：專案層補充）
