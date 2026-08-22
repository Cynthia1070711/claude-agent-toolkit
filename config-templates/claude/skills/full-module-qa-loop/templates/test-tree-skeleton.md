# Test Tree Skeleton Template

複製此範本至 `docs/tracking/active/{project}-full-test-tree.md`,並依實際專案調整。

---

```markdown
# {Project} Full Module QA Test Tree
> 產出: {date} | 版本: v1.0.0 | 狀態: Phase 2 Setup
> Owner: {user_name} (首席驗收者)
> Orchestrator: CC-OPUS (主控端觀察員)

## L0 — 整體信心指標(Confidence Scorecard)

| 指標 | 定義 | 目標 | 當前 |
|------|------|:----:|:----:|
| **穩定性** | fail 次數 / 總測試數 | < 5% | — |
| **一致性** | 5 Plan 視覺差異 | 0 drift | — |
| **回復性** | 錯誤後可繼續使用 | 100% | — |
| **信心指數** | 使用者主觀分數 | ≥ 8/10 | — |

**exit criterion**: 信心指數 ≥ 8 + 穩定性 < 5% + 0 drift → 可進 Phase 4 Pipeline

---

## L1 — 使用者目標(User Goals)

依真實使用者時間軸排序,不依技術模組排序:

| G# | 目標 | 對應模組 (L2) | 優先級 |
|:--:|------|--------------|:------:|
| G1 | 開啟/建立專案與載入畫布 | Dashboard + ProjectLoader + CanvasInit | P1 |
| G2 | 版面設定(紙張/方向/邊距/分割) | PageSettingsPanel + SplitPanel | P1 |
| G3 | 接入動態資料(Excel/API) | DataSourcePanel + FieldListPanel | P0 |
| G4 | 設計靜態元素(文字/形狀/圖片) | ToolsPanel + ImagePanel | P1 |
| G5 | 建立動態物件(QR/Barcode/Serial/Batch) | QRBarcodePanel + SerialPanel + BatchImagePanel | P0 |
| G6 | 預覽、儲存、PDF 產出 | TopBar + GeneratePdfButton + Preview | P0 |
| G7 | 例外處理(離線/配額/權限/錯誤) | DataSourcePanel quota + PDF limits + Session mgmt | P2 |

---

## L2 — 功能模組(Modules)

### G3.M1 — DataSourcePanel

**檔案**: `src/components/Editor/DataSourcePanel.tsx`
**Hooks**: useExcelWorker, useDataSourceValidation
**BR 規則**: BR-DATA-01 ~ BR-DATA-05
**依賴**: ExcelWorker.ts, DataImportModal.tsx
**預估測試時間**: 15 分鐘(MTL)

#### L3 測試點

##### G3.M1.T01 — Excel 上傳 50 列內

```yaml
test_id: G3.M1.T01
title: "Excel 上傳 50 列內(A1 Free 邊界測試)"
module: DataSourcePanel
priority: P0
edf_regression: false
user_emotion: curious
mtl_position: 1

# 5D 矩陣
plans_matrix:
  A1_Free:
    editor_ui_visible: true
    editor_ui_enabled: true
    upload_50_rows_allowed: true
    upload_51_rows_behavior: "截斷 + toast 升級提示"
    expected_toast: "Free 方案最多 50 列,升級 Basic 解鎖 250 列"
    expected_cta: "[升級 Basic]"
  A2_Basic:
    upload_250_rows_allowed: true
    upload_251_rows_behavior: "截斷 + toast"
  A3_Advanced:
    upload_500_rows_allowed: true
  A4_Professional:
    upload_1000_rows_allowed: true
  A5_Business:
    upload_2000_rows_allowed: true

saas_compliance:
  upgrade_cta:
    required: true
    trigger: "row_count > max_rows"
  error_message_clarity:
    required: true
    must_include_next_action: true
  loading_transparency:
    required: true
    progress_bar: true

ui_ux_lifecycle:
  idle: "DataSourcePanel 顯示 'Upload Excel' 按鈕 + 說明"
  active: "Hover/Focus 狀態清晰"
  loading: "ExcelWorker 解析時顯示進度 %"
  success: "完成後顯示欄位映射表"
  error: "錯誤訊息 + 下一步按鈕"
  locked: "Free 超過 50 列時顯示升級 Modal"

chrome_mcp_locator:
  url: "/editor/{projectId}"
  ui_anchor: "data-testid=data-source-panel-upload"
  pre_action: "使用者手動開啟 DataSourcePanel"
  alan_action: "上傳 50 列 Excel 並回饋"
  post_evidence:
    - take_snapshot
    - take_screenshot
    - list_console_messages
    - list_network_requests (xhr + fetch)

expected_result:
  all_plans:
    - "無 JS error"
    - "欄位映射 UI 顯示"
    - "FieldListPanel 出現欄位 chips"
  A1_specific:
    - "row_count 正確"
    - "無 toast(50 列內正常)"

status: pending
feedback: ""
story_ref: ""
tested_at: ""
tested_plans: []
```

##### G3.M1.T02 — Excel 上傳 51 列(配額觸發)

```yaml
test_id: G3.M1.T02
title: "Excel 上傳 51 列(A1 Free 配額觸發)"
module: DataSourcePanel
priority: P0
edf_regression: false
user_emotion: focused
mtl_position: 2

plans_matrix:
  A1_Free:
    expected_behavior: "截斷至 50 列 + toast 升級提示"
    br_ref: BR-DATA-02
  # Basic 以上不觸發(250 列以內)

saas_compliance:
  quota_messaging:
    required: true
    must_show_toast: true
    toast_must_include:
      - "Free 方案最多 50 列"
      - "已載入前 50 列"
      - "升級至 Basic"
  upgrade_cta:
    required: true
    button_text: "升級 Basic"
    action: "跳轉 /pricing?plan=Basic"

chrome_mcp_locator:
  url: "/editor/{projectId}"
  pre_action: "使用者手動登入 A1 + 開啟 DataSourcePanel"
  alan_action: "上傳 51 列 Excel"
  
expected_result:
  A1_Free:
    - "toast 顯示 quota 訊息"
    - "row_count = 50"
    - "升級 CTA 可見"
    - "點擊 CTA 跳轉 /pricing"

status: pending
```

##### (更多測試點...)

---

### G3.M2 — ImagePanel

**檔案**: `src/components/Editor/ImagePanel.tsx`
**BR 規則**: BR-IMG-01 ~ BR-IMG-03
**預估測試時間**: 15 分鐘

#### L3 測試點

##### G3.M2.T01 — 單張圖片上傳 10MB 邊界

```yaml
test_id: G3.M2.T01
title: "單張圖片上傳 10MB 邊界測試"
...
```

---

## 測試樹填寫規則

### 填寫順序
1. **先填 L0-L1** — 信心指標 + 使用者目標
2. **再填 L2** — 功能模組(依 L1 展開)
3. **最後填 L3** — 測試點(依 L2 展開)
4. **L3 每個測試點必須有 5D 矩陣**(plans + saas + ui/ux + chrome_mcp + expected)

### 狀態流程
```
pending → testing → pass / fail / blocked
```

### 問題回饋時的欄位
- `status: fail`
- `feedback: "{Alan 原話}"`
- `story_ref: "{eft-story-id}"` (由 CMRD 決定)
- `tested_at: "{timestamp}"`
- `tested_plans: ["A1", "A2"]`

---

## 測試進度追蹤

| L2 模組 | 總 L3 | 完成 | 通過 | 失敗 | 狀態 |
|---------|:-----:|:----:|:----:|:----:|:----:|
| G3.M1 DataSourcePanel | 8 | 0 | 0 | 0 | pending |
| G3.M2 ImagePanel | 6 | 0 | 0 | 0 | pending |
| ... | | | | | |

**總計**: 0 / N 測試點完成 (0%)

---

## 產出的 Stories(跨模組合併後)

| Story ID | 類別 | 合併來源 | AC 數 | 狀態 |
|---------|:---:|---------|:----:|:----:|
| eft-saas-quota-toast | B1 | M1.T02 + M2.T01 + ... | 0 | — |
| ... | | | | |

---

## 相關文件
- `phase-structure.md` — 完整 Phase 流程
- `chrome-mcp-observer-sop.md` — 觀察員操作 SOP
- `sub-agent-pivot-template.md` — Sub-agent 委派模板
- `cmrd-algorithm.md` — 跨 Story 合併演算法
- `sds-refinement-gate.md` — Phase 3.5 拆分公式
- `root-cause-taxonomy.md` — 5×16 根因分類
```
