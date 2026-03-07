# TRS-28: Gemini CLI settings.json 審查 + Hooks 啟用

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-28 |
| **狀態** | done |
| **複雜度** | S |
| **優先級** | P2 |
| **建立時間** | 2026-02-25 23:30 |
| **完成時間** | 2026-02-26 22:55 |
| **依賴** | TRS-20/21（全域+專案 GEMINI.md 精簡完成後再處理進階設定） |
| **類型** | D 類（操作流程優化） |
| **建立者** | CC-OPUS（Party Mode） |
| **執行者** | CC-OPUS |

---

## 目標

審查 `.gemini/settings.json` 配置最佳化，並評估啟用 Gemini CLI 原生 Hooks（BeforeTool/AfterTool）用於 Agent ID 追蹤或安全攔截。

---

## 問題描述

### settings.json 審查

Gemini CLI 的 `settings.json` 支援多項配置：
- `context.fileName`：指定全域上下文檔案
- `mcpServers`：MCP 伺服器配置
- `hooks`：原生事件 Hooks（11 種事件）

當前 `.gemini/settings.json` 可能未充分利用這些能力。

### Hooks 機會

Gemini CLI 支援 **11 種原生 Hooks**（BeforeTool/AfterTool 最實用）：
- **Agent ID 追蹤**：在 BeforeTool 中自動記錄 GC-PRO/GC-FLASH 的操作
- **安全攔截**：在 BeforeTool 中檢查危險操作（如 `git push --force`）
- **對齊 Claude Code**：Claude Code 已有 `check-hygiene.ps1` Hook，Gemini CLI 可建立對等機制

---

## 實作方案

### Phase 1：審查現有 settings.json

- 讀取 `.gemini/settings.json`
- 檢查 `context.fileName`、`mcpServers`、`hooks` 配置
- 識別可優化項目

### Phase 2：評估 Hooks 啟用

選擇最有價值的 Hook 場景（建議從 1-2 個開始）：
- `BeforeTool[write_file]`：commit 前自動執行 hygiene 檢查
- `AfterTool[*]`：記錄 Agent ID 到追蹤檔

### Phase 3：實作與測試

- 配置選定的 Hooks
- 在 Gemini CLI 中測試觸發正確性
- 確認不影響正常開發流程

---

## 驗收標準

- [x] `.gemini/settings.json` 已審查，識別出可優化項目
- [x] 至少 1 個 Hook 已啟用並驗證
- [x] Hook 不影響正常開發流程
- [x] 文件記錄已啟用的 Hooks 及用途

---

## 風險

- :green_circle: 低：Hooks 是可選功能，啟用失敗不影響主線
- :yellow_circle: 中：Hook 腳本在 Windows 環境的相容性 → **已解決**：使用 Node.js 跨平台方案

---

## 實作結果

### settings.json 審查結果

| # | 項目 | 審查前 | 審查後 |
|---|------|--------|--------|
| 1 | `mcpServers` | ✅ chrome-devtools 已配置 | 維持不變 |
| 2 | `context.fileName` | 未設定 | 不需要（Gemini CLI 預設讀取 `GEMINI.md`） |
| 3 | `hooks` | ❌ 未配置 | ✅ 2 個 BeforeTool hooks 已啟用 |

### 已啟用的 Hooks

#### 1. SecretGuard（`.gemini/hooks/secret-guard.js`）

| 欄位 | 值 |
|------|-----|
| **事件** | BeforeTool |
| **Matcher** | `write_file\|edit_file\|replace_in_file` |
| **用途** | 防止 API Key、Token、密碼等秘密寫入原始碼 |
| **Timeout** | 5000ms |

**偵測規則**：
- AWS Access Key (`AKIA...`)
- Google API Key (`AIza...`)
- Secret Key (`sk-...`，含 OpenAI/Anthropic/Stripe)
- GitHub PAT (`ghp_...`, `gho_...`)
- Azure Account Key (`AccountKey=...`)
- SendGrid API Key (`SG....`)
- Private Key blocks
- 寫入 `.env`/`credentials`/`secrets.json` 等敏感路徑

**對齊 Claude Code**：等同 `.claude/settings.json` 的 `deny` 規則（禁止讀取 `.env*`, `appsettings.*.json`, `credentials*`, `secrets*`）。

#### 2. GitSafety（`.gemini/hooks/git-safety.js`）

| 欄位 | 值 |
|------|-----|
| **事件** | BeforeTool |
| **Matcher** | `run_shell_command` |
| **用途** | 攔截危險 git 操作，防止資料遺失 |
| **Timeout** | 5000ms |

**攔截規則**：
- `git push --force / -f`（覆寫遠端歷史）
- `git reset --hard`（丟棄所有未提交變更）
- `git clean -f`（永久刪除未追蹤檔案）
- `git checkout .` / `git checkout -- .`（丟棄所有未暫存變更）
- `git branch -D`（強制刪除分支）
- `git stash clear`（清除所有 stash）
- `git rebase -i`（互動式 rebase 不支援 CLI）

### 驗證結果（10/10 通過）

| 測試案例 | 預期 | 實際 |
|----------|------|------|
| 正常程式碼寫入 | allow | ✅ allow |
| Google API Key 寫入 | deny | ✅ deny |
| sk- Secret Key 寫入 | deny | ✅ deny |
| 寫入 .env 檔案 | deny | ✅ deny |
| `git push --force` | deny | ✅ deny |
| `git reset --hard` | deny | ✅ deny |
| `git status` | allow | ✅ allow |
| `git commit` | allow | ✅ allow |
| `git push origin branch` | allow | ✅ allow |
| `npm run build` | allow | ✅ allow |

### 變更檔案清單

| 檔案 | 操作 | 說明 |
|------|------|------|
| `.gemini/settings.json` | 修改 | 新增 `hooks.BeforeTool` 配置（2 個 matcher） |
| `.gemini/hooks/secret-guard.js` | 新增 | 秘密偵測 Hook（~100 行） |
| `.gemini/hooks/git-safety.js` | 新增 | Git 安全 Hook（~80 行） |

---

## Change Log

| 時間 | 執行者 | 動作 |
|------|--------|------|
| 2026-02-26 22:55 | CC-OPUS | 完成 TRS-28：settings.json 審查 + 2 個 BeforeTool Hooks 啟用，10/10 測試通過 |
