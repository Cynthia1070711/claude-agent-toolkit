# 未納入本包的 Skill（開源業務內容禁入）

**更新日期**: 2026-08-08

本目錄中的其他 Skill 文件可能引用下列名稱（實測 45 處交叉引用）。
它們**不是遺失或損壞** —— 是內容主體即產品業務資訊，依開源禁入原則整個排除。

| Skill | 排除原因 |
|-------|---------|
| `phycool-review-analyst` | 審查模式與前後台帳號矩陣散佈全 Skill（68 處業務內容 / 10 檔） |
| `phycool-testing-patterns` | 測試 fixture 與 CI 帳號綁定產品專案結構（52 處 / 10 檔） |
| `phycool-chrome-mcp-login-sop` | SKILL.md 主體即前後台登入帳號矩陣與 SOP（42 處 / 1 檔） |
| `phycool-e2e-playwright` | 頁面、帳號、流程全數綁定產品（31 處 / 3 檔） |
| `phycool-integration-testing` | SKILL.md 內 23 處產品原始碼路徑 |

另有一條規範同理排除：`.claude/rules/canvas-layout-invariants.md`（產品畫布佈局不變量）。

## 遇到懸空引用時

這些引用多出現在「相關 Skill」「依賴」章節。處理方式：

1. **忽略即可** —— 引用的是方法論脈絡，不影響該 Skill 本身運作。
2. **需要對應能力時**，自行建立不含產品資訊的通用版：
   - 審查分析 → 可參考本包的 `receiving-code-review` / `edge-case-hunter`
   - 測試策略 → 可參考本包的 `tdd-workflow` / `verification-before-completion`
   - E2E 自動化 → 可參考本包的 `autorun-e2e` / `chrome-connect-real-browser`

## 為什麼不逐檔清理後保留

這 5 個 Skill 逐檔清理掉帳號與路徑後，剩下的多是「對著已被抽掉的具體資產說話」的空殼，
對接手者沒有可用價值。整個排除並在此說明，比殘缺打包誠實。

若要開源測試與審查方法論，正確做法是另寫一份不含產品資訊的通用版，
而非從這些檔案裡刪減。

---

驗證方式：`node scripts/verify-package-sanitization.cjs`（非 0 命中不得推送）
完整規則：`開發環境架構清單/09-打包與部署-深度補全.md` §9.2.5
