# C1-C10 約束矩陣 — SaaS 模組 Skill 通用約束分類

> 每個 PhyCool 模組 Skill 須映射至對應的約束類別，確保 AI 在開發時不違反核心商業規則。

---

## 約束分類表

| 代碼 | 約束名稱 | 說明 | 主責 Skill |
|------|---------|------|-----------|
| C1 | 多租戶隔離 | 所有 DB 查詢必須帶 TenantId / UserId 過濾，禁止全域查詢 | `phycool-auth-identity` |
| C2 | 金流安全 | 金流操作必須透過 Service 層，禁止 Controller 直接處理；Webhook 簽章驗證 | `phycool-payment-subscription` |
| C3 | 訂閱生命週期 | 方案升降級必須走狀態機，禁止直接修改訂閱欄位；免費試用不退款 | `phycool-payment-subscription` |
| C4 | 編輯器資料完整性 | CanvasJson 禁止 Base64 嵌入、必須 Diff Sync、Asset 必須透過 AssetService | `phycool-editor-arch` |
| C5 | PDF 座標精度 | DPI 轉換（72→96）必須精確、裁切排序演算法不可變更、字型必須走 FontCache | `phycool-pdf-engine` |
| C6 | 管理員權限邊界 | Admin Service 必須在 BackOffice namespace、高風險操作需二次認證、審計日誌必寫 | `phycool-admin-module`, `phycool-auth-identity` |
| C7 | 前端狀態管理 | Zustand store 為唯一狀態源，禁止 useState 重複定義；useCallback 依賴陣列禁含 Zustand 值 | `phycool-zustand-patterns` |
| C8 | 資料操作安全 | CSV 匯出必須 UTF-8 BOM + Injection 防護；API 金鑰批次操作必須審計 | `phycool-admin-data-ops`, `phycool-admin-module` |
| C9 | Design Token 一致性 | 禁止硬編碼 Hex 色碼，一律用 CSS Variable；WCAG contrast ratio ≥ 4.5:1 | `phycool-design-system` |
| C10 | 國際化/SEO 合規 | 語系偵測走 GeoIP→Cookie→Header 三層；SEO meta 必須走 SeoRouteHelper | `phycool-i18n-seo` |

---

## 使用方式

### Mode A（建立新 Skill）

Phase 1 模組盤點時，將模組功能逐一對應 C1-C10：
1. 辨識模組涉及的約束類別
2. 在新 Skill 的「絕對限制」區塊中，引用對應的 C 代碼
3. 每條約束附 file:line 程式碼證據 + ✅/❌ 範例

### Mode B（更新既有 Skill）

變更影響分析時，檢查變更是否涉及 C1-C10 的規則修改：
- 若是 → 受影響的所有引用該約束的 Skill 均需同步更新
- 特別注意 C2/C3（金流）和 C1（多租戶）—— 這兩類變動影響範圍最廣

### 約束優先級

| 嚴重度 | 約束 | 說明 |
|--------|------|------|
| 🔴 CRITICAL | C1, C2, C3, C6 | 安全/金流/權限 — 違反即為 P0 Bug |
| 🟡 HIGH | C4, C5, C7, C8 | 資料完整性/狀態管理 — 違反導致功能異常 |
| 🟢 MEDIUM | C9, C10 | 視覺/國際化 — 違反影響使用體驗 |
