# 🟢 TRS-32: File Lock 機制實作

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-32 |
| **狀態** | done |
| **複雜度** | M |
| **優先級** | P1 |
| **建立時間** | 2026-02-27 21:18 |
| **最後更新** | 2026-02-27 22:28 |
| **依賴** | TRS-31 ✅ |
| **類型** | E 類（多引擎協作） |
| **建立者** | CC-OPUS（Party Mode） |

## 描述

實作跨引擎的動態檔案鎖定機制，防止多個 Agent 同時寫入同一檔案導致靜默覆蓋。

適用場景：跨引擎在同一目錄協作（CC + GC + AG + RD 各一個）。
不適用：同引擎多開（應使用 Worktree，見 TRS-33）。

## 驗收條件

- [x] AC-1: 建立 `.agent-file-policy.yaml` 靜態政策宣告（hot files 列表 + 衝突策略）
- [x] AC-2: 實作 `scripts/file-lock-check.ps1`（寫入前檢查鎖定狀態 + 清理過期鎖 + 路徑正規化）
- [x] AC-3: 實作 `scripts/file-lock-acquire.ps1`（寫入時登記鎖定 + Mutex 防 race condition）
- [x] AC-4: 實作 `scripts/file-lock-release.ps1`（支援按 Agent/Story/FilePath 三種粒度釋放）
- [x] AC-5: Claude Code Hook 配置（PreToolUse + PostToolUse 串接 lock 腳本）
- [x] AC-6: Gemini CLI Hook 配置（BeforeTool + AfterTool 串接 lock 腳本）
- [x] AC-7: Antigravity Rules 配置（`.agent/rules/file-lock-awareness.md` Always On 規則）
- [x] AC-8: Rovo Dev CLI Charter 配置（注入 lock 感知規則）
- [x] AC-9: 驗證測試 — 兩個不同引擎同時嘗試寫入 Program.cs，確認 Lock 警告正確觸發
- [x] AC-10: `.agent-locks.json` 加入 `.gitignore`（動態狀態不入版控）
- [x] AC-11: 腳本範本複製至 `docs/專案部屬必讀/scripts/`

## 任務拆解

### Task 1: 靜態政策宣告
- 建立 `.agent-file-policy.yaml`
- 定義 exclusive_write / domain_lock / free 三種政策
- 列出 MyProject 專案的 hot files

### Task 2: Lock 腳本實作
- `file-lock-check.ps1`：TTL 過期清理 + 路徑正規化 + Agent ID 比對
- `file-lock-acquire.ps1`：Mutex 寫入 + 重複登記防護
- `file-lock-release.ps1`：三種粒度釋放

### Task 3: 四引擎 Hook 配置
- Claude Code: `.claude/settings.json` 追加 PreToolUse/PostToolUse
- Gemini CLI: `.gemini/settings.json` 追加 BeforeTool/AfterTool
- Antigravity: `.agent/rules/file-lock-awareness.md`
- Rovo Dev: `.rovodev/config.yml` charter 擴充

### Task 4: 驗證 + 部署整合
- 模擬兩引擎同時寫入測試
- 腳本複製至部署必讀範本包

## 技術備註

- Lock 檔 `.agent-locks.json` 使用 Windows Mutex (`System.Threading.Mutex`) 防止 lock 檔本身的 race condition
- TTL 預設 30 分鐘，可依 Story 複雜度調整
- Lock 衝突行為為「警告但不阻斷」— Agent 看到警告後自主決定
- Antigravity IDE 無原生 Hooks API，改用 Rules 模擬（Agent 在寫入前自主讀取 lock 狀態）

## 實作檔案清單

| 檔案 | 操作 | 說明 |
|------|------|------|
| `.agent-file-policy.yaml` | 新建 | 靜態政策宣告（17 條規則） |
| `scripts/file-lock-check.ps1` | 新建 | 寫入前檢查鎖定（TTL 清理 + 路徑正規化） |
| `scripts/file-lock-acquire.ps1` | 新建 | Mutex 保護的鎖定登記 |
| `scripts/file-lock-release.ps1` | 新建 | 三粒度釋放（Agent/Story/File） |
| `.claude/settings.json` | 修改 | 新增 PreToolUse/PostToolUse hooks |
| `.gemini/settings.json` | 修改 | 新增 BeforeTool/AfterTool FileLock hooks |
| `.agent/rules/file-lock-awareness.md` | 新建 | Antigravity Always On 感知規則 |
| `.rovodev/config.yml` | 修改 | 注入 File Lock Protocol 至 Charter |
| `.gitignore` | 修改 | 新增 `.agent-locks.json` |
| `docs/專案部屬必讀/scripts/file-lock-*.ps1` | 新建 | 部署範本包副本（3 個檔案） |
| `docs/專案部屬必讀/README.md` | 修改 | 目錄樹新增 3 個腳本 |

## Change Log

```
[CC-OPUS] 2026-02-27T21:18:00+08:00 Story 建立
[CC-OPUS] 2026-02-27T21:43:00+08:00 dev-story 完成: 11/11 AC 全通過
  - .agent-file-policy.yaml: 8 exclusive_write + 5 domain_lock + 4 free 政策
  - 3 個 PS1 腳本: check(TTL清理+正規化) / acquire(Mutex防race) / release(3粒度)
  - 4 引擎 Hook: CC settings.json + GC settings.json + AG rules + RD charter
  - 驗證: GC-PRO鎖定→CC-OPUS警告觸發→釋放→無警告 全通過
[CC-OPUS] 2026-02-27T22:28:00+08:00 code-review 完成: CR 72→92 (3H+3M+1H4 Fixed, 3L Deferred)
  - H1: domain_lock 降級為 exclusive_write（移除 domain 欄位）
  - H2: 新增 GEMINI_TOOL_INPUT + destination 欄位支援
  - H3: Test-FreePolicy 動態解析 policy yaml
  - H4: glob-to-regex 轉換 bug 修復（Convert-GlobToRegex placeholder 方法）
  - M1-M3: ArrayList 統一 + UTF-8 no-BOM 統一 + release OR 語義文檔化
  - 同步: 部署必讀副本 + AG rules + RD charter domain_lock 參考清理
```
