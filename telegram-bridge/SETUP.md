# Claude Telegram Bridge v2.0 — 設定指南

## 前置需求

- Node.js 18+
- Claude CLI 已安裝且已登入（`claude --version` 可執行）
- Telegram 帳號

---

## 步驟 1：建立 Telegram Bot

1. 手機打開 Telegram → 搜尋 `@BotFather`
2. 發送 `/newbot`
3. 依提示輸入 Bot 名稱（例如 `My Claude Bot`）和使用者名稱（例如 `my_claude_bot`）
4. BotFather 會回覆一串 **Bot Token**，格式如：`123456789:ABCdefGHIjklMNOpqrsTUVwxyz`
5. 複製保存此 Token

## 步驟 2：取得你的 Telegram User ID

1. 在 Telegram 搜尋 `@userinfobot`（或 `@RawDataBot`）
2. 對它發送任意訊息
3. 它會回覆你的 **User ID**（純數字，例如 `987654321`）
4. 複製保存此 ID

> 此 ID 用於授權白名單，只有你的帳號能操作 Bot。

## 步驟 3：設定環境變數

```bash
cd telegramup
cp .env.example .env
```

編輯 `.env` 檔案，填入剛才取得的值：

```env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
ALLOWED_USER_IDS=987654321
DEFAULT_WORKING_DIR=C:SERSYOURNAMEPROJECTSMYPROJECT
DEFAULT_MODEL=sonnet
```

| 變數 | 說明 |
|------|------|
| `TELEGRAM_BOT_TOKEN` | 從 BotFather 取得的 Token |
| `ALLOWED_USER_IDS` | 你的 User ID（多人用逗號分隔：`111,222`）|
| `DEFAULT_WORKING_DIR` | Claude 預設工作目錄 |
| `DEFAULT_MODEL` | 預設模型：`haiku` / `sonnet` / `opus` |

## 步驟 4：安裝依賴並啟動

```bash
npm install
npm run dev
```

看到以下輸出即表示成功：

```
========================================
 Claude Telegram Bridge v2.0
 Stream-JSON 持久進程模式
========================================
[Pre-flight] 無殘留進程
[Pre-flight] Bot Token: ...xyz
[Pre-flight] 資料庫就緒
[TelegramBot] Bot 已啟動，等待訊息...
[Bridge] 所有系統就緒，等待 Telegram 訊息...
```

## 步驟 5：開始使用

1. 手機打開 Telegram → 找到你建立的 Bot
2. 直接發送文字訊息（例如 `查看 git status`）
3. Bot 會自動啟動 Claude 進程並回覆結果

---

## 指令速查

| 指令 | 功能 |
|------|------|
| `/new [路徑]` | 開新終端（可選指定工作目錄）|
| `/stop` | 停止 Claude 進程 |
| `/clear` | 清除對話記憶 |
| `/status` | 查看運行狀態、模型、token 統計 |
| `/model <name>` | 切換模型（haiku / sonnet / opus）|
| `/cd <路徑>` | 切換工作目錄 |
| `/bookmark` | 管理常用路徑書籤 |
| `/resume` | 恢復上次會話 |
| `/help` | 顯示指令說明 |

### 書籤用法範例

```
/bookmark add myproject C:SERSYOURNAMEPROJECTSMYPROJECT
/bookmark add side D:\SideProject
/cd myproject          ← 用書籤名稱切換
/bookmark            ← 列出所有書籤
/bookmark del side   ← 刪除書籤
```

---

## 故障排除

| 問題 | 解決方式 |
|------|----------|
| Bot 無回應 | 確認 `npm run dev` 正在執行、Token 正確、User ID 正確 |
| 回應很慢 | 首次啟動需載入專案上下文，後續訊息會快很多 |
| 進程意外中斷 | 直接發新訊息，Bridge 會自動重啟 Claude 進程 |
| 殭屍進程 | 重新啟動服務會自動清理，或手動 `taskkill /F /IM node.exe` |
