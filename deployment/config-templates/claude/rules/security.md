# Security

Commit 前檢查：
- 無硬編碼 secrets（API keys, passwords, tokens）
- 使用者輸入已驗證
- SQL 參數化查詢（禁止字串拼接）
- XSS 防護（sanitize HTML）、CSRF 啟用
- 錯誤訊息不洩漏敏感資料
- Secrets 一律用環境變數 / Azure Key Vault
