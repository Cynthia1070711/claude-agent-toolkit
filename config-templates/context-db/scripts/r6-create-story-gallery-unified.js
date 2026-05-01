/**
 * R6 Story Creation: eft-imagepanel-gallery-unified
 * Creates new Story in DB (DB-first, no .md mirror per .claude/rules/db-first-no-md-mirror.md)
 */
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new Database(path.join(__dirname, '..', 'context-memory.db'));
const now = '2026-04-15T17:10:00+08:00';
const sid = 'eft-imagepanel-gallery-unified';

const user_story = `**身為** Editor 使用者,
**我想要** ImagePanel 採用單一 Gallery 清單設計(無 Tab 區分「已上傳」與「我的圖檔」),並沿用既有 3 欄排版,
**以便** 上傳圖片後直接排列於清單中,退出專案重新進入後仍看得到所有歷史上傳圖片,享受一致的瀏覽 / 搜尋 / 排序 / 批次操作 / 拖放上傳 / hover 預覽體驗。

**痛點**: R5 Tab Switcher 設計雖解決 Gallery 拖曳 bug,但「已上傳」tab 跨 session 永遠為空(因 \`projectStore.uploadedAssets[]\` 為 session-only transient buffer),造成使用者『圖片不見了』的 persist 錯覺(R5-F1 CRITICAL)。

**驗證原則**: Gallery-first SSoT(ADR-EDITOR-IMAGE-PANEL-GALLERY-SSOT) — Panel UI 只讀 L1(/MemberAsset/GetAssets backend user-level gallery),L2 session state 保留為 sanitize/restore 技術 buffer 但不在 UI 渲染。`;

const background = `## Related Documents

- ADR: \`docs/technical-decisions/ADR-EDITOR-IMAGE-PANEL-GALLERY-SSOT.md\`(2026-04-15 本 Story 決策根據)
- SDD Spec: \`docs/implementation-artifacts/specs/epic-eft/eft-imagepanel-gallery-unified-spec.md\`(15 AC + BR + Flow)
- Supersedes: \`eft-imagepanel-v2-ui-completion\`(R5 Tab 設計,status=done,保留歷史)
- Related ADR: ADR-IDD-COM-001 / ADR-IDD-COM-003 / ADR-BUSINESS-001
- Party Mode 討論記憶:\`context_entries\` 3315-3317 + 本 Story 討論 session

## Code Baseline(file:line 證據鏈)

### L1 — Backend Gallery(SSoT)

- \`src/Platform/App.Web/Controllers/MemberAssetController.cs:428-466\` — GetAssets API(既有)
- \`src/Platform/App.Web/Controllers/MemberAssetController.cs:204-227\` — DeleteAsset POST + AntiForgery(既有,AC-7 使用)
- \`src/Platform/App.Web/Models/MemberViewModels.cs:470\` — AssetItemViewModel 定義
- \`src/Platform/App.Web/ClientApp/src/types/AssetTypes.ts:71-95\` — 前端型別

### L2 — Session Transient Buffer(技術 buffer,保留不動)

- \`src/Platform/App.Web/ClientApp/src/stores/projectStore.ts:18\` — BR-010 不使用 persist
- \`src/Platform/App.Web/ClientApp/src/stores/projectStore.ts:338-359\` — addUploadedAsset
- \`src/Platform/App.Web/ClientApp/src/stores/projectStore.ts:362-367\` — removeUploadedAsset
- 下游耦合(grep 確認不可移除):
  - \`utils/sanitizeBase64Assets.ts:121\` — v1 → v2 升級
  - \`hooks/editor/useSideSwitcher.ts:50-89 restoreCanvasState\` — 切正反面 populate
  - \`hooks/editor/useProjectLoader.ts:148\` — 初始載入 populate
  - \`services/CanvasJsonSerializer.ts:263-305 transformObjectsForSave\` — serialize

### L3 — Canvas Binding

- \`CanvasJson.assetManifest.images\` — per-project,由 canvas objects 提取

### R5 反模式(要移除的 code)

- \`src/Platform/App.Web/ClientApp/src/components/Editor/panels/ImagePanel.tsx\`:
  - L104(\`activeTab\` state)
  - L272-295(handleTabChange + handleTablistKeyDown)
  - L387-437(tablist DOM + 2 tabs)
  - L439-505(uploaded tabpanel v1+v2 dual list)
- \`src/Platform/App.Web/ClientApp/src/styles/editor.css:1131-1220\`(\`.editor-panel-tablist\` / \`.editor-panel-tab\` 段)

## 根因分析(Depth Summary)

R5 CR Amendment 將 Tab Switcher 當成「UX 升級」,但實際是把 session-only L2 state 當成 UI SSoT 顯示 — 這在使用者「上傳 → 存檔 → 重開」的 functional lifecycle 中破碎。經 Party Mode 5-agent Sally/John/Winston/Amelia/Murat 共識 + 客座 Dr. Quinn system root cause 分析 + Victor innovation strategy,推翻 Tab 設計採 Gallery-first SSoT 並納入 Tier 0+1+2 15 AC 一次到位。`;

const acceptance_criteria = `## AC-1 單一 Gallery 清單 UI(移除 Tab)[BR-GU-SINGLE-LIST]

**Given** 使用者打開 Editor ImagePanel
**When** panel 完成 render
**Then** DOM 中不應含 \`role="tablist"\` / \`[data-testid="image-panel-tablist"]\` / \`.editor-panel-tab\` 元素
**And** 應只有單一 \`.editor-image-grid\` 清單容器
**And** 無「已上傳」/「我的圖檔」區分

## AC-2 Panel mount 即 auto-load gallery [BR-GU-AUTO-LOAD]

**Given** 使用者首次開啟 ImagePanel
**When** component mount
**Then** 自動觸發 \`fetch('/MemberAsset/GetAssets')\`(非 lazy,無需 tab 切換)
**And** loading 期間顯示 skeleton
**And** 失敗時顯示 error + retry button
**Example**: panel open → 200ms 內 skeleton 顯示 → 500ms 內實際 items 出現(若網路 200ms 內回應)

## AC-3 Upload 成功 optimistic prepend + scroll + highlight [BR-GU-UPLOAD-OPTIMISTIC]

**Given** gallery 已載入 N 張圖片
**When** 使用者上傳新圖 + backend 回應成功
**Then** galleryItems[0] = newItem(prepend,非 append)
**And** grid container \`scrollTo({top: 0, behavior: 'smooth'})\` 觸發
**And** newItem 套用 \`.editor-image-item--highlight\` class 2 秒後移除
**And** \`addUploadedAsset(asset, filename, fileSize)\` 仍被呼叫(L2 buffer 保留 sanitize 路徑)

## AC-4 沿用 editor-image-grid 3 欄排版 [BR-GU-GRID-LAYOUT]

**Given** gallery 有 ≥1 張圖片
**When** panel render
**Then** grid 容器 computed style \`grid-template-columns: repeat(3, 1fr)\`
**And** 每個 item aspect-ratio 1:1
**And** hover 顯示刪除按鈕 + filename label
**禁止**: 自訂新 grid CSS、改變欄數、改變 aspect-ratio

## AC-5 Storage quota 進度條 [BR-GU-STORAGE-QUOTA]

**Given** \`window.PHYC_CONTEXT.storageUsedBytes\` = 163202560 (163.2 MB), \`maxStorageBytes\` = 1073741824 (1 GB)
**When** panel render
**Then** 頂部顯示「163.2 MB / 1 GB used」文字
**And** 進度條 width = 15.2%
**And** <70% 用 primary 色、70-90% warning、>90% error
**Source**: 資料來源與 Dashboard 的 \`163.2 MB / 1 GB\` 相同(PHYC_CONTEXT)

## AC-6 Empty state 設計 [BR-GU-EMPTY-STATE]

**Given** galleryItems.length === 0 && !galleryLoading && !galleryError
**When** panel render
**Then** 顯示 empty state:「✨ 還沒有圖片」標題 + 「點擊上方上傳按鈕,或將圖片拖到這裡開始」說明 + Icon/插畫

## AC-7 刪除 with canvas 引用 guard + 二次確認 [BR-GU-DELETE-WITH-GUARD](決策 1-C)

**Scenario A**(無引用):
**Given** 使用者點擊 item 刪除 icon + canvas.getObjects 中無 \`data.assetId === id\`
**When** 點擊刪除
**Then** 彈出確認 dialog「此操作會永久刪除該圖片,確定?」
**And** 確定 → POST /MemberAsset/DeleteAsset?id={id}
**And** 成功 → setGalleryItems(filter out) + removeUploadedAsset(id) 同步 L2

**Scenario B**(有引用):
**Given** canvas.getObjects 中有物件 \`data.assetId === id\`
**When** 點擊刪除
**Then** 彈出警告 dialog「此圖片正被畫布使用,請先從畫布移除後再刪除」
**And** 僅提供取消按鈕(不可繼續刪除)
**And** 不呼叫 backend

## AC-8 舊專案 v1 遷移 toast [BR-GU-V1-MIGRATION-TOAST]

**Given** 使用者開啟 project A,parsedCanvasJson.uploadedImages 為非空陣列
**When** useProjectLoader apply JSON
**Then** toast 5 秒顯示「偵測到舊版圖片,儲存後將自動升級到你的圖庫」
**And** 每個 session 該 toast 僅顯示一次(防轟炸)

## AC-9 Search bar filter(debounce 200ms,filename) [BR-GU-SEARCH-FILTER]

**Given** gallery 有 20 張圖片,filenames 混合
**When** 使用者輸入「bmad」
**Then** 200ms 後 filter 生效,僅顯示 filename 含 "bmad"(case-insensitive)的 items
**And** 輸入框右側顯示 ✕ 清除按鈕
**And** 搜尋結果 0 時顯示「沒有符合的圖片」empty variant

## AC-10 Sort dropdown(4 options,預設最新) [BR-GU-SORT-DROPDOWN](決策 2-A)

**Given** panel render
**When** sort dropdown 顯示
**Then** 提供 4 options:最新上傳(預設)/ 最舊上傳 / 檔名 A-Z / 檔案大小由大到小
**And** 選擇後 galleryItems sort 生效
**And** 選擇保存至 localStorage \`editor-gallery-sort\` key(跨 session UX preference)

## AC-11 Hover lightbox 大預覽 [BR-GU-HOVER-LIGHTBOX]

**Given** 使用者滑鼠 hover 縮圖
**When** 持續 hover 500ms
**Then** 右側 Portal(document.body)彈出 lightbox
**And** 顯示 max 300×300 原圖 contain + filename + 尺寸 + 上傳日期 + 檔案大小
**And** Mouse leave 立即關閉
**And** Keyboard focus 不自動開啟(避免鍵盤 user 困擾)
**Location**: 右側優先,超出 viewport 時 fallback 左側

## AC-12 Canvas 使用指示 badge [BR-GU-CANVAS-USAGE-BADGE]

**Given** canvas 有 object \`data.assetId === "asset-42"\`
**When** panel render item asset-42
**Then** item 右下角顯示 \`.editor-image-item__usage-badge\`(primary 色小圓點)
**And** aria-label="本畫布正在使用"
**And** 沒有引用的 item 無此 badge
**效能**: useMemo 快取 usedAssetIds Set,canvas change event 重算

## AC-13 批次多選 + 批次刪除 [BR-GU-BATCH-MULTI-SELECT]

**Given** panel 有多張 items
**When** 使用者 Ctrl/Cmd+click → 切換 selection
**Or** Shift+click → 範圍選取 last-clicked → current
**Then** items 套用 \`.editor-image-item--selected\` class
**And** 頂部顯示 \`.editor-gallery-batch-toolbar\`「已選 N 張」+ 批次刪除按鈕
**And** 批次刪除走 AC-7 guard flow,任一引用阻止整批
**And** Esc 清除選取

## AC-14 Drag-to-upload 區域 [BR-GU-DRAG-TO-UPLOAD]

**Given** 使用者從 OS Finder/Explorer 拖 1+ 圖片檔至 panel
**When** dragover panel 空白區(或整個 panel)
**Then** 顯示 \`.editor-gallery-drop-overlay\` dashed border + 「拖放圖片至此上傳」overlay
**And** drop → 觸發 upload pipeline(同 handleFileChange)
**And** 支援多檔案(files.length ≤ 20 既有限制)
**And** Chrome + Firefox + Safari 均 work(dataTransfer.items + dataTransfer.files 雙 fallback)

## AC-15 使用次數排序 [BR-GU-USAGE-COUNT-SORT]

**MVP(本 Story)**:
**Given** canvas 聚合得 asset-1 使用 3 次,asset-2 使用 1 次,asset-3 未使用
**When** sort 選「使用次數」
**Then** 排序 DESC:asset-1 > asset-2 > asset-3(0 使用排最後)
**Implementation**: useMemo 從 canvas.getObjects 聚合

**Future(Out of Scope)**:
跨專案 usage 需 backend \`AssetItemViewModel.TotalUsageCount\` 支援,分離 Story \`eft-backend-asset-usage-tracking\`

## AC-NFR IDD Compliance(保留 R5)

- \`grep isFreeUser|isLocked ImagePanel.tsx\` → 0 新增(annotation 字串不算)
- \`grep '[Intentional: IDD-COM-003]' ImagePanel.tsx\` → ≥6 處保留
- A1 Free plan Chrome MCP live:上傳 + gallery 全功能可見(無 gating)`;

const tasks = `## Tasks

### Phase 1 — 基礎重構(Tier 0 AC-1 ~ AC-8)

- ⬜ 1.1 ImagePanel.tsx:移除 activeTab / handleTabChange / handleTablistKeyDown / tablist DOM / uploaded+gallery tabpanel 條件 render(AC-1)
- ⬜ 1.2 ImagePanel.tsx:新增 galleryItems state + mount useEffect auto-load(AC-2)
- ⬜ 1.3 ImagePanel.tsx:handleFileChange 加 optimistic prepend + scrollTo + highlight class(AC-3)
- ⬜ 1.4 editor.css:新增 \`.editor-image-item--highlight\` 2s pulse animation(AC-3)
- ⬜ 1.5 ImagePanel.tsx:新增 StorageQuotaBar 子組件(PHYC_CONTEXT)(AC-5)
- ⬜ 1.6 ImagePanel.tsx:新增 EmptyState 子組件(AC-6)
- ⬜ 1.7 ImagePanel.tsx:handleDeleteClick with canvas guard + confirm dialog + backend DELETE(AC-7)
- ⬜ 1.8 useProjectLoader.ts:偵測 v1 uploadedImages 非空 → toast dispatch(AC-8)
- ⬜ 1.9 editor.css:移除 \`.editor-panel-tablist\` / \`.editor-panel-tab*\` 段(或標 deprecated)
- ⬜ 1.10 editor.css:新增 storage-quota / empty-state / gallery CSS

### Phase 2 — 強烈建議(Tier 1 AC-9 ~ AC-10)

- ⬜ 2.1 ImagePanel.tsx:search state + debounced 200ms filter(AC-9)
- ⬜ 2.2 ImagePanel.tsx:sort state + 4 options + localStorage persistence(AC-10)
- ⬜ 2.3 editor.css:.editor-gallery-search + .editor-gallery-sort

### Phase 3 — 進階功能(Tier 2 AC-11 ~ AC-15)

- ⬜ 3.1 ImagePanelHoverLightbox.tsx 新組件(Portal + 500ms timer + 定位)(AC-11)
- ⬜ 3.2 ImagePanel.tsx:usedAssetIds useMemo + canvas change 監聽 + badge render(AC-12)
- ⬜ 3.3 ImagePanel.tsx:selectedIds Set + ctrl/shift-click + batch toolbar(AC-13)
- ⬜ 3.4 ImagePanel.tsx:handleDragOver/Drop + overlay(AC-14)
- ⬜ 3.5 ImagePanel.tsx:usage count sort(canvas aggregate MVP)(AC-15)
- ⬜ 3.6 editor.css:lightbox / selected / badge / batch-toolbar / drop-overlay CSS

### Phase 4 — 測試與驗證

- ⬜ 4.1 ImagePanel.test.tsx 重寫 ~25-30 tests 覆蓋 15 AC
- ⬜ 4.2 Vitest coverage ≥80% ImagePanel.tsx
- ⬜ 4.3 Playwright E2E 1 條 critical flow(upload→存檔→重開→刪除)
- ⬜ 4.4 Chrome MCP Live Verify 12 情境 A4 + 12-IDD A1

### Phase 5 — 文檔與記憶

- ⬜ 5.1 更新 ADR-EDITOR-IMAGE-PANEL-GALLERY-SSOT.md Verification Criteria checkbox
- ⬜ 5.2 Skill sync 3 engines(.claude / .gemini / .agent):pcpt-editor-arch / pcpt-editor-data-features / pcpt-design-system
- ⬜ 5.3 Memory entries(pattern + decision + session)
- ⬜ 5.4 tracking file 記錄 + sprint-status.yaml 更新(若適用)`;

const dev_notes = `## Implementation Approach(TDD + Party Mode 共識)

### 順序原則(Red-Green-Refactor)

Phase 1 基礎重構採 RED-GREEN-REFACTOR 嚴格:
1. RED: 寫 failing vitest(AC-1 單一清單 DOM assertion / AC-2 mount fetch / AC-3 prepend)
2. GREEN: 最小改動 make test pass(依序取代 Tab 結構)
3. REFACTOR: 重構命名 / 抽子組件(StorageQuotaBar / EmptyState)

### L2 State 保留策略(CRITICAL)

**禁止移除** \`projectStore.uploadedAssets[]\` / \`uploadedImages[]\` state:
- sanitizeBase64Assets.ts:121 使用
- restoreCanvasState 使用
- transformObjectsForSave 使用

Panel UI 不渲染 L2,但 handleFileChange 仍呼叫 addUploadedAsset。

### Gallery-first 呼叫鏈

\`\`\`
Panel mount → useEffect → loadGallery() → fetch /MemberAsset/GetAssets → setGalleryItems
Upload success → addUploadedAsset (L2) + setGalleryItems(prepend) → scroll + highlight
Delete → canvas.getObjects guard → confirm → fetch POST /MemberAsset/DeleteAsset → setGalleryItems(filter) + removeUploadedAsset
\`\`\`

### 測試 Mock 策略

- fetch mock(vi.stubGlobal('fetch', ...))
- canvas.getObjects mock(用 vi.fn 回傳可控 array)
- PHYC_CONTEXT mock(window.PHYC_CONTEXT stub)
- localStorage mock(sort preference)

## Testing Strategy

參照 SDD Spec §6:25-30 Vitest tests + 12 Chrome MCP 情境 + 1 Playwright E2E。

Vitest coverage ≥80% on ImagePanel.tsx(AC-8 規範)。

Regression baseline:editor 全 suite 必綠(R5 已確認 192/192 PASS)。

## Definition of Done

- [ ] 15 AC 全部 Vitest 驗證通過
- [ ] Vitest coverage ≥80% ImagePanel.tsx
- [ ] Chrome MCP Live Verify 12 情境 A4 + A1 IDD 全 PASS
- [ ] Playwright E2E critical flow PASS(建議)
- [ ] Regression baseline: \`vitest run src/components/Editor/\` 192+/192+ 全綠
- [ ] IDD compliance: grep 驗證 ≥6 處 IDD-COM-003 annotations
- [ ] pcpt-editor-arch / pcpt-editor-data-features / pcpt-design-system 三引擎同步
- [ ] ADR Verification Criteria 全部 ✅
- [ ] CR Report + DB cr_issues + tech_debt_items writeback
- [ ] memory entries(session + decision + pattern)

## Rollback Plan

單一 commit 設計,\`git revert <commit>\` 恢復 R5 Tab 設計。

L2 state 保留未動,rollback 只復原 UI,Backend /MemberAsset/* API 本來存在,CSS 新增 class 不影響既有 style。

## Risk Assessment

| Risk | Probability | Severity | Mitigation |
|------|:-----------:|:--------:|------------|
| L2 state 下游破壞 | Low | Critical | 保留不動,Amelia grep 確認 10-17 檔無改 |
| Network 首開 lag | Med | Low | useProjectLoader prefetch 建議 |
| Canvas usage 效能 | Low | Med | useMemo 快取 + event listener |
| 舊 v1 專案混淆 | Med | Low | AC-8 toast 管理預期 |
| Scope creep(L) | Med | Med | Phase 1-3 分階段 TDD,Tier 可 gradual ship |

## Related

- Party Mode 討論:context_entries 3315-3317(R5 session + decision + pattern)
- R5 Story: \`eft-imagepanel-v2-ui-completion\` (done,Tab 設計已推翻)
- R5 CR Report: \`docs/implementation-artifacts/reviews/epic-eft/eft-imagepanel-v2-ui-completion-code-review-report.md\`(R5 Amendment section 含完整 context)`;

const required_skills = JSON.stringify([
    "pcpt-editor-arch",
    "pcpt-editor-data-features",
    "pcpt-design-system",
    "pcpt-tooltip",
    "pcpt-testing-patterns",
    "ui-ux-pro-max",
    "pcpt-type-canonical",
    "pcpt-zustand-patterns",
]);

const file_list = [
    "src/Platform/App.Web/ClientApp/src/components/Editor/panels/ImagePanel.tsx",
    "src/Platform/App.Web/ClientApp/src/components/Editor/panels/ImagePanel.test.tsx",
    "src/Platform/App.Web/ClientApp/src/components/Editor/panels/ImagePanelHoverLightbox.tsx",
    "src/Platform/App.Web/ClientApp/src/styles/editor.css",
    "src/Platform/App.Web/ClientApp/src/hooks/editor/useProjectLoader.ts",
    "docs/implementation-artifacts/specs/epic-eft/eft-imagepanel-gallery-unified-spec.md",
    "docs/technical-decisions/ADR-EDITOR-IMAGE-PANEL-GALLERY-SSOT.md",
    ".claude/skills/pcpt-editor-arch/SKILL.md",
    ".claude/skills/pcpt-editor-data-features/SKILL.md",
    ".claude/skills/pcpt-design-system/SKILL.md",
].join(', ');

const dependencies = JSON.stringify(["eft-imagepanel-v2-ui-completion"]);
const tags = JSON.stringify(["gallery-first", "ssot", "refactor", "tab-removal", "ux-architecture", "L-complexity", "tier-2-full", "party-mode-consensus"]);

const implementation_approach = `### Phase 1 — 基礎重構(Tier 0 AC-1 ~ AC-8,TDD red-green-refactor)
1. 移除 R5 Tab 結構(activeTab / handleTabChange / tablist DOM)
2. 新增 galleryItems state + mount auto-load
3. Upload 成功 optimistic prepend + scroll + highlight
4. 保留既有 editor-image-grid 3 欄
5. 新增 StorageQuotaBar + EmptyState 子組件
6. handleDeleteClick with canvas guard + confirm + backend DELETE
7. v1 遷移 toast 偵測

### Phase 2 — Tier 1(AC-9 ~ AC-10)
8. search state + debounced filter
9. sort dropdown + localStorage

### Phase 3 — Tier 2(AC-11 ~ AC-15)
10. HoverLightbox Portal 組件
11. Canvas usage badge + aggregate
12. Batch multi-select(ctrl/shift-click)
13. Drag-to-upload overlay
14. Usage count sort(canvas aggregate MVP)

### Phase 4 — 測試與驗證
15. Vitest ≥25 tests + coverage ≥80%
16. Chrome MCP Live 12 情境 A4 + A1 IDD
17. Playwright E2E critical flow

### Phase 5 — 文檔與記憶
18. 三引擎 Skill sync
19. ADR Verification 勾選
20. Memory entries`;

const testing_strategy = `### Vitest Unit Tests(自證層,25-30 tests)

參照 SDD Spec §6.1,覆蓋 15 AC + IDD compliance:
- Tier 0: mount auto-load / optimistic prepend / scroll / highlight / grid layout / storage quota / empty state / delete guard / v1 toast (10 tests)
- Tier 1: search debounce / sort 4 options / localStorage (3 tests)
- Tier 2: hover lightbox / canvas badge / ctrl/shift multi-select / batch delete / drag-to-upload / usage count sort (9 tests)
- 相容保留: IDD grep / onError fallback / stopPropagation (3-5 tests)

Coverage target ≥80% ImagePanel.tsx lines(SDD Spec AC-8 規範延用)

### Chrome MCP Live Verification(CR 對抗層,12 情境)

前置:curl backend/vite + list_pages + A4 login

1-10 為 Tier 0-2 功能 live 驗證,11 為 A1 Free Plan IDD compliance,12 為 E2E 整合流程。

### Regression Baseline

\`vitest run src/components/Editor/\` 維持 R5 後的 192/192 全綠基線。

### Playwright E2E(選配,建議)

1 條 critical flow:A4 login → open project → upload 3 → list → exit → re-enter → list persisted → delete 1 → canvas reference guard → other delete success`;

const rollback_plan = `單一 commit 設計,\`git revert <R6 commit>\` 可完整恢復 R5 Tab 設計。

風險等級:LOW
- L2 state(uploadedAssets / uploadedImages)保留未動
- Backend /MemberAsset/* API 原本存在
- CSS 新增 class 不覆寫既有 style
- IDD-COM-001/003 annotations 完整保留

若發現 R6 live 問題:
1. \`git revert <commit>\` → 恢復 R5 Tab 設計
2. Vitest 29/29 PASS(R5 test 仍在)
3. 若 R5 也有 live 問題 → 進一步 revert 到 pre-R5(R4 時點)

Feature flag 非必要(scope 雖 L,但變更集中於 ImagePanel.tsx + editor.css 2 檔)`;

const risk_assessment = `| Risk | Probability | Severity | Mitigation |
|------|:-----------:|:--------:|------------|
| L2 state 下游破壞(10-17 檔 coupling) | Low | Critical | 保留 state 不動,grep 驗證,Amelia code evidence |
| Network 首開 lag(GetAssets ~200-500ms) | Med | Low | useProjectLoader prefetch(選配)|
| Canvas usage aggregate 效能(每 render 掃 canvas) | Low | Med | useMemo 快取 + object:modified 事件監聽 |
| 舊 v1 專案使用者混淆(暫時看不到舊圖) | Med | Low | AC-8 toast 管理預期 |
| Scope creep(L complexity 15 AC) | Med | Med | Phase 1-3 分階段 ship,Tier 1/2 可 gradual |
| Drag-to-upload 跨瀏覽器差異 | Med | Low | dataTransfer.items + .files 雙 fallback |
| 批次刪除 race condition(引用變更) | Low | Med | 樂觀鎖 + toast 失敗回滾 |
| Lightbox Portal 定位 edge case | Low | Low | viewport 邊界檢測 + fallback 左側 |`;

const definition_of_done = `- [ ] 15 AC 全部 Vitest 驗證通過
- [ ] Vitest coverage ≥80% ImagePanel.tsx
- [ ] Chrome MCP Live Verify 12 情境 A4 + A1 IDD 全 PASS
- [ ] Playwright E2E critical flow PASS(建議不強制)
- [ ] Regression baseline: \`vitest run src/components/Editor/\` 維持 192/192+ 全綠
- [ ] IDD compliance: grep \`[Intentional: IDD-COM-003]\` ≥6 處 + \`isFreeUser/isLocked\` 0 新增
- [ ] pcpt-editor-arch / pcpt-editor-data-features / pcpt-design-system 三引擎同步(.claude + .gemini + .agent)
- [ ] ADR-EDITOR-IMAGE-PANEL-GALLERY-SSOT Verification Criteria 全部 ✅
- [ ] CR Report 撰寫 + DB cr_issues 回寫 + tech_debt_items 若需要
- [ ] memory entries 3 筆(session + decision + pattern)
- [ ] Story status=done via Pipeline workflow(禁止手動 done)`;

const monitoring_plan = `### Post-deploy 監控指標

1. **Panel open → 看到清單 P95 延遲** ≤ 300ms(Application Insights dependency tracking)
2. **Upload → 重開可見率** = 100%(Chrome MCP 或 Playwright E2E 每日)
3. **/MemberAsset/GetAssets API latency** P95 ≤ 200ms
4. **/MemberAsset/DeleteAsset error rate** < 0.1%
5. **Storage quota 進度條顯示正確率** = 100%(與 Dashboard 對比)

### 警報門檻

- Panel open latency P95 > 500ms → Slack #editor-alerts
- GetAssets 5xx rate > 1% → PagerDuty
- Delete 意外失敗(引用 guard bypass) → immediate investigation

### 回溯分析

每週 Epic-eft KPI review 加入 ImagePanel usage 指標(open rate / upload freq / batch delete usage)`;

// INSERT story
const insert = db.prepare(`
  INSERT INTO stories (
    story_id, epic_id, domain, title, status, priority, complexity, story_type,
    dependencies, tags, file_list, dev_agent, review_agent, source_file,
    created_at, user_story, background, acceptance_criteria, tasks, affected_files,
    cr_score, test_count, discovery_source, updated_at,
    dev_notes, required_skills, implementation_approach, risk_assessment,
    testing_strategy, rollback_plan, monitoring_plan, definition_of_done,
    cr_issues_total, cr_issues_fixed, cr_issues_deferred, cr_summary,
    started_at, completed_at, review_completed_at, execution_log,
    sdd_spec, create_agent, create_completed_at, create_started_at,
    review_started_at, pipeline_notes
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?
  )
`);

const result = insert.run(
    sid,                                    // story_id
    'epic-eft',                             // epic_id
    'editor',                               // domain
    'Editor ImagePanel Gallery-first 單一清單重構(L)',  // title
    'ready-for-dev',                        // status(可直接進 dev-story)
    'P0',                                   // priority
    'L',                                    // complexity
    'UX Architecture Refactor',             // story_type
    dependencies,                           // dependencies
    tags,                                   // tags
    file_list,                              // file_list(TEXT,CSV)
    null,                                   // dev_agent
    null,                                   // review_agent
    'context-db://stories/eft-imagepanel-gallery-unified',  // source_file(DB-first)
    now,                                    // created_at
    user_story,
    background,
    acceptance_criteria,
    tasks,
    'src/Platform/App.Web/ClientApp/src/components/Editor/panels/ImagePanel.tsx, src/Platform/App.Web/ClientApp/src/styles/editor.css',  // affected_files
    null,                                   // cr_score
    null,                                   // test_count
    'Alan user manual testing after R5 Tab design + Party Mode 5-agent consensus',  // discovery_source
    now,                                    // updated_at
    dev_notes,
    required_skills,
    implementation_approach,
    risk_assessment,
    testing_strategy,
    rollback_plan,
    monitoring_plan,
    definition_of_done,
    0, 0, 0,                                // cr_issues_*
    null,                                   // cr_summary
    null, null, null,                       // started_at, completed_at, review_completed_at
    null,                                   // execution_log
    'docs/implementation-artifacts/specs/epic-eft/eft-imagepanel-gallery-unified-spec.md',  // sdd_spec
    'CC-OPUS',                              // create_agent
    now,                                    // create_completed_at
    now,                                    // create_started_at
    null,                                   // review_started_at
    null,                                   // pipeline_notes
);

console.log('INSERT stories rowid=' + result.lastInsertRowid);

// Verify
const verify = db.prepare('SELECT story_id, status, complexity, sdd_spec FROM stories WHERE story_id = ?').get(sid);
console.log('\n=== Verify ===');
console.log(JSON.stringify(verify, null, 2));

db.close();
console.log('\nDONE — R6 Story created');
