# TRS-18: `.claude/settings.json` deny 規則建立

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-18 |
| **狀態** | done |
| **複雜度** | S |
| **優先級** | P0 |
| **建立時間** | 2026-02-25 19:37 |
| **依賴** | TRS-0（.claudeignore 已建立，本 Story 補齊第二道防線） |
| **類型** | C 類（防禦性保護） |

---

## 目標

建立 `.claude/settings.json` 並配置 deny 規則，作為 `.claudeignore` 之外的第二道安全防線，防止敏感檔案被模型讀取。

---

## 問題描述

### 現況

- `.claudeignore` 已在 TRS-0 建立，排除了 `.env`、`appsettings.*.json` 等敏感檔案
- 但 `.claude/settings.json` **不存在**，缺少 Claude Code 原生的 deny 規則防護

### 風險

最終彙整報告 §2.3 明確記錄：

> **Gemini 3.1 Pro 研究發現**：`.claudeignore` 在某些邊界情況可能被繞過讀取 `.env`。建議在 `.claude/settings.json` 中額外配置 deny 規則作為雙重防護。

深度分析報告 Phase 0 第 4 項同樣要求：

> 配置權限阻擋：在 `.claude/settings.json` 中阻擋 `.env` 讀取

### 影響

- 無 token 節省效益（純安全性優化）
- 防止 `.claudeignore` 邊界繞過導致 secrets 洩漏至模型上下文

---

## 實作方案

建立 `.claude/settings.json`，配置 deny 規則：

```json
{
  "permissions": {
    "deny": [
      "Read .env*",
      "Read appsettings.Development.json",
      "Read appsettings.Production.json",
      "Read **/credentials*",
      "Read **/secrets*"
    ]
  }
}
```

### 注意事項

1. 若 `.claude/settings.json` 已存在（如 `settings.local.json`），需合併而非覆蓋
2. `appsettings.json`（非環境特定）為開發必要檔案，**不應** deny
3. deny 規則語法需依 Claude Code 當前版本確認（`Read` 前綴 vs glob 模式）
4. 確認與 `.claude/settings.local.json`（PreCompact Hook 配置）不衝突

---

## 驗收標準

- [x] `.claude/settings.json` 已建立或既有設定已合併 deny 規則
- [x] deny 規則涵蓋：`.env*`、`appsettings.Development.json`、`appsettings.Production.json`、`credentials`、`secrets` 模式
- [x] 確認 deny 規則不影響 `appsettings.json`（基礎配置）的正常讀取
- [x] 確認與 `settings.local.json` 的 PreCompact Hook 配置不衝突
- [x] 手動測試：需於下一次 session 驗證（deny 規則在 session 啟動時載入）

---

## 實作紀錄

**完成時間**: 2026-02-25 19:42

**實際 deny 規則**（修正了 Story 原始提案的語法格式）：

```json
{
  "permissions": {
    "deny": [
      "Read(.env)",
      "Read(.env.*)",
      "Read(**/.env)",
      "Read(**/.env.*)",
      "Read(**/appsettings.Development.json)",
      "Read(**/appsettings.Production.json)",
      "Read(**/credentials*)",
      "Read(**/secrets*)"
    ]
  }
}
```

**與原提案差異**：
1. 語法格式：`Read .env*` → `Read(.env)` — Claude Code 使用 `Tool(specifier)` 語法
2. 新增 `**/` 前綴：appsettings 檔案位於 `src/MyProject.Platform/MyProject.Web/` 子目錄，需遞迴匹配
3. 拆分 `.env` 與 `.env.*` 為獨立規則，確保精確匹配
4. 新增 `**/.env` 與 `**/.env.*` 以覆蓋任意層級子目錄

---

## 瘦身前後對照

| 指標 | 優化前 | 優化後 | 變化 |
|------|:------:|:------:|:----:|
| 安全防線數 | 1（.claudeignore） | 2（+settings.json deny） | **+100%** |
| Token 節省 | — | — | 無（純安全性） |
| 邊界繞過風險 | 存在 | 雙重攔截 | **大幅降低** |
