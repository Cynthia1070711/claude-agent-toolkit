/**
 * R6 Depth Gate Fix:
 * - D1: required_skills 格式從 JSON array 改為逗號分隔
 * - D7: implementation_approach 擴充至 ≥1000 chars + `### Phase N:` 格式 (≥2 Phases)
 */
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new Database(path.join(__dirname, '..', 'context-memory.db'));
const sid = 'eft-imagepanel-gallery-unified';
const ts = '2026-04-15T19:00:00+08:00';

// D1 Fix: required_skills 逗號分隔(不是 JSON array)
const required_skills = 'pcpt-editor-arch, pcpt-editor-data-features, pcpt-design-system, pcpt-tooltip, pcpt-testing-patterns, ui-ux-pro-max, pcpt-type-canonical, pcpt-zustand-patterns';

// D7 Fix: implementation_approach 改 Phase N: 格式 + 擴充
const implementation_approach = `### Phase 1: 基礎重構 — Tier 0 核心(AC-1 ~ AC-8,TDD red-green-refactor)

1.1 Remove R5 Tab Switcher 結構:ImagePanel.tsx 移除 \`activeTab\` state / \`handleTabChange\` / \`handleTablistKeyDown\` / tablist DOM + 2 tabs + count badges / 「已上傳」tabpanel 條件 render(保留 v1/v2 L2 state 不動)
1.2 New \`galleryItems\` / \`galleryLoading\` / \`galleryError\` state + mount \`useEffect\` auto-load \`/MemberAsset/GetAssets\`
1.3 handleFileChange optimistic:\`addUploadedAsset\`(L2 buffer)+ \`setGalleryItems(prev => [newItem, ...prev])\`(L1 prepend) + \`gridRef.current?.scrollTo({top:0, behavior:'smooth'})\` + 2s highlight class
1.4 CSS:新增 \`.editor-image-item--highlight\` 2s pulse animation(via @keyframes)
1.5 子組件 \`StorageQuotaBar\`(讀 PHYC_CONTEXT)+ \`EmptyState\`(新使用者)
1.6 handleDeleteClick with canvas 引用 guard:\`canvas.getObjects().some(o => o.data?.assetId === id)\` → 引用時警告 dialog 阻止,無引用 → 確認 dialog → POST \`/MemberAsset/DeleteAsset\` + CSRF
1.7 useProjectLoader 偵測 \`parsedCanvasJson.uploadedImages?.length > 0\` → toast dispatch
1.8 CSS:新增 storage-quota / empty-state / gallery(含移除舊 \`.editor-panel-tablist\` 段,或標 deprecated)

### Phase 2: 強烈建議 — Tier 1(AC-9 ~ AC-10)

2.1 Search state + debounced 200ms filter by filename(case-insensitive partial match)
2.2 Sort state + dropdown 4 options + localStorage \`editor-gallery-sort\` 跨 session persist
2.3 CSS:\`.editor-gallery-search\` + \`.editor-gallery-sort\`

### Phase 3: 進階功能 — Tier 2(AC-11 ~ AC-15)

3.1 新組件 \`ImagePanelHoverLightbox.tsx\`:Portal + 500ms timer + viewport 邊界 fallback 右→左 + metadata 顯示
3.2 Canvas usage 聚合 \`useMemo + canvas event listener\` → items 套用 \`.editor-image-item__usage-badge\`
3.3 Batch multi-select:\`selectedIds: Set<string>\` + ctrl/shift/single-click logic + Esc clear + BatchToolbar 子組件 + 批次刪除走 AC-7 guard flow(任一引用阻止整批)
3.4 Drag-to-upload:\`ondragover\` overlay + \`ondrop\` → upload pipeline + \`dataTransfer.items + .files\` 跨瀏覽器 fallback
3.5 Usage count sort(canvas 聚合 MVP):items 按 current canvas 引用次數 DESC
3.6 CSS:lightbox / selected / usage-badge / batch-toolbar / drop-overlay

### Phase 4: 測試與驗證

4.1 ImagePanel.test.tsx 重寫 25-30 tests 覆蓋 15 AC(刪 R5 Tab/Persist 9 tests,保留相容 11 tests,新增 14 tests)
4.2 Vitest \`--coverage\` ImagePanel.tsx ≥80% lines
4.3 Playwright E2E 1 條 critical flow:A4 登入 → 開專案 → 上傳 3 張 → 清單顯示 → 退出 → 重進 → 清單仍在 → 刪除 1 張 → canvas 引用 guard → 其他成功刪除
4.4 Chrome MCP Live 12 情境(A4 Professional)+ 1 情境(A1 Free IDD compliance)
4.5 Regression baseline:\`vitest run src/components/Editor/\` 維持 192/192+ 全綠

### Phase 5: 文檔與記憶

5.1 更新 ADR-EDITOR-IMAGE-PANEL-GALLERY-SSOT.md Verification Criteria checkbox(全 ✅)
5.2 Skill sync 三引擎(.claude / .gemini / .agent):pcpt-editor-arch v1.13.0 / pcpt-editor-data-features v1.2.0 / pcpt-design-system v1.8.0
5.3 Memory entries 3 筆:session summary + decision Gallery-first SSoT + pattern Tab-removal lesson
5.4 tracking file \`docs/tracking/active/eft-imagepanel-gallery-unified.track.md\` working log
5.5 CR Report 預寫(預期 R6 review 時填入)+ DB cr_issues 空準備`;

const stmt = db.prepare(`UPDATE stories SET required_skills = ?, implementation_approach = ?, updated_at = ? WHERE story_id = ?`);
const result = stmt.run(required_skills, implementation_approach, ts, sid);
console.log('UPDATE stories:', result.changes, 'row');

const verify = db.prepare('SELECT required_skills, length(implementation_approach) as impl_len FROM stories WHERE story_id = ?').get(sid);
console.log('required_skills length:', verify.required_skills.length);
console.log('impl_len:', verify.impl_len);
console.log('required_skills sample:', verify.required_skills.substring(0, 80));

// Count "### Phase" occurrences
const impl = db.prepare('SELECT implementation_approach FROM stories WHERE story_id = ?').get(sid).implementation_approach;
const phaseCount = (impl.match(/### Phase \d+:/g) || []).length;
console.log('### Phase N: count:', phaseCount);

db.close();
console.log('DONE');
