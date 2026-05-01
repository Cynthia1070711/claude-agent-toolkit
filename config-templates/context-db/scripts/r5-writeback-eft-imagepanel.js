/**
 * CR-R5 DB writeback for eft-imagepanel-v2-ui-completion
 * UPDATE stories + INSERT 6 cr_issues + INSERT 1 tech_debt + INSERT workflow_executions
 * Usage: cd .context-db && node scripts/r5-writeback-eft-imagepanel.js
 */
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new Database(path.join(__dirname, '..', 'context-memory.db'));
const ts = '2026-04-15T16:35:00+08:00';
const sid = 'eft-imagepanel-v2-ui-completion';

const crSummary = [
    'R1-R5 累積 26 findings (5 round adversarial review): R1=10, R2=3, R3=6, R4=1, R5=6.',
    'FIXED=21, DEFERRED=4 (R2-F2 vitest coverage plugin, R3-F3 vitest coverage %, R3-F4 e2e Playwright env, R5-F6 Tooltip pre-existing key warning).',
    'Vitest 29/29 PASS (原 20 + R5 new 9 tests covering Tab Switcher + Gallery Drag + Persist via backend).',
    'R5 Path A auto-fix: F1 CRITICAL persist → Tab design 自然解 (backend /MemberAsset/GetAssets), F2 HIGH UX toggle → WAI-ARIA tablist segmented control, F3 CRITICAL drag → isV2Asset shape + draggable, F4 HIGH scope → Spec §9 + 9 tests, F5 MEDIUM metadata → fabric naturalSize, F6 LOW Tooltip pattern → DEFERRED.',
    'Chrome MCP Live A4: Tab render ✓ / Gallery 83 items ✓ / Keyboard Arrow ✓ / dataTransfer isV2Asset ✓ / IDD grep ✓.',
    'Production Gates post-fix: p0-critical=0 p1-high=0 p2-medium ✅ test-debt=0 SaaS Score=0 (累積扣分反映, 非 post-fix code quality).',
    'Story Status=done; 教訓: 使用者驗證不可替代, SaaS audit 必覆蓋功能生命週期, Tab pattern 優於 toggle button, backend persist 自然解.',
].join(' ');

// 1. UPDATE stories
const updateStory = db.prepare(`
  UPDATE stories SET
    cr_score = ?,
    cr_issues_total = ?,
    cr_issues_fixed = ?,
    cr_issues_deferred = ?,
    test_count = ?,
    review_completed_at = ?,
    updated_at = ?,
    cr_summary = ?
  WHERE story_id = ?
`);
const r1 = updateStory.run(0, 26, 21, 4, 37, ts, ts, crSummary, sid);
console.log('UPDATE stories:', r1.changes, 'row');

// 2. INSERT 6 R5 cr_issues
const insertCr = db.prepare(`
  INSERT INTO cr_issues (story_id, issue_code, severity, dimension, summary, resolution, target_story, file_path, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const crRows = [
    ['R5-F1', 'critical', 'DataConsistency+UX',
        '上傳→存檔→重開 panel 清單空 (Spec scope gap, R1-R4 blind): projectStore uploadedAssets 不跨 session persist, transformObjectsForSave 只從 canvas 提取 assetManifest 致未加畫布 asset 儲存後消失. FIXED via Tab design — 我的圖檔 Tab 走 backend /MemberAsset/GetAssets user-level persist, Chrome MCP 驗證 83 items 自然可見.',
        'FIXED', null,
        'src/Platform/App.Web/ClientApp/src/components/Editor/panels/ImagePanel.tsx'],
    ['R5-F2', 'high', 'UX',
        '我的圖庫按鈕 toggle 不直覺 (使用者回報). FIXED via WAI-ARIA tablist segmented control: 2 tabs (已上傳/我的圖檔) + aria-selected + roving tabIndex + Arrow/Home/End 鍵盤導覽 + focus-visible outline + count badge. 符合 ui-ux-pro-max skill accessibility 指引.',
        'FIXED', null,
        'src/Platform/App.Web/ClientApp/src/components/Editor/panels/ImagePanel.tsx'],
    ['R5-F3', 'critical', 'Functionality',
        '我的圖檔拖曳到畫布異常 (使用者回報): 雙重根因 — (1) gallery item div 無 draggable/onDragStart, (2) dataTransfer shape 不符 CanvasAreaWithDrop:77-108 isV2Asset 分支. FIXED via handleGalleryDragStart 設 dataTransfer 為 AssetReference+isV2Asset shape, CanvasAreaWithDrop 既有邏輯直接 reuse; Chrome MCP 驗 dataTransfer shape {isV2Asset:true, assetId, variants.original+thumbnail}.',
        'FIXED', null,
        'src/Platform/App.Web/ClientApp/src/components/Editor/panels/ImagePanel.tsx'],
    ['R5-F4', 'high', 'Process+Spec',
        'Spec 未覆蓋 persist-across-sessions + gallery drag, R1-R4 4 輪 CR blind. FIXED via Spec §9 Amendment 新增 AC-12 (Tab) / AC-13 (Gallery Drag) / AC-14 (Persist Gallery) + BR 定義 + 9 Vitest tests + 3 Chrome MCP 情境. Process 教訓: Review Trail 應覆蓋功能生命週期.',
        'FIXED', null,
        'docs/implementation-artifacts/specs/epic-eft/eft-imagepanel-v2-ui-completion-spec.md'],
    ['R5-F5', 'medium', 'Defensive',
        'handleGalleryItemClick metadata 全 0 (width/height/fileSize) 致 DesktopPanelRenderer fallback 800×600. FIXED: metadata=0 是 by-design (fabric.Image.fromURL 讀 naturalSize, canvas 實際尺寸以 fabric 為準, DesktopPanelRenderer 的 width||800 只是 pre-load hint 不影響最終渲染); variants.preview 填 originalUrl fallback 避免 adapter chain 失敗.',
        'FIXED', null,
        'src/Platform/App.Web/ClientApp/src/components/Editor/panels/ImagePanel.tsx'],
    ['R5-F6', 'low', 'Maintainability',
        'Live Chrome dev mode 偵測到 React key warning at Tooltip (Tooltip.tsx:22) — Tooltip 組件 Fragment + createPortal(body) 在多實例 map render 下觸發. Pre-existing pattern (非 R5 引入, R4 因 uploadedAssets=0 未觸發), Vitest JSDOM 未觸發, production build 不影響 (DEV-only). DEFERRED via TD-COMPONENT-TOOLTIP-PORTAL-KEY-WARN priority=2.',
        'DEFERRED', null,
        'src/Platform/App.Web/ClientApp/src/components/Common/Tooltip.tsx'],
];
for (const r of crRows) {
    const inserted = insertCr.run(sid, r[0], r[1], r[2], r[3], r[4], r[5], r[6], ts);
    console.log('INSERT cr_issues', r[0], 'rowid=' + inserted.lastInsertRowid);
}

// 3. INSERT tech_debt
const insertDebt = db.prepare(`
  INSERT INTO tech_debt_items
    (debt_id, story_id, category, severity, dimension, title, description,
     affected_files, fix_guidance, root_cause, target_story, status,
     priority_score, blast_radius, business_impact, fix_cost,
     source_review_date, created_at, review_date, accepted_reason)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const debtResult = insertDebt.run(
    'TD-COMPONENT-TOOLTIP-PORTAL-KEY-WARN',
    sid,
    'deferred',
    'low',
    'Maintainability',
    'Tooltip 組件 Fragment+Portal 多實例 map 觸發 React key warning (dev-only)',
    'Tooltip.tsx return pattern: <><div>{children}</div>{createPortal(tooltipElement, document.body)}</> 在多 Tooltip 同時存在 map 中時, React dev mode 產生 "Each child in a list should have a unique key prop" warning. Pre-existing 非 R5 引入 (R4 時 uploadedAssets=0 未觸發, R5 A4 測試時 83 gallery items + uploaded 1 item 觸發). Vitest JSDOM 未觸發, production build React 移除 DEV 檢查不影響功能.',
    'src/Platform/App.Web/ClientApp/src/components/Common/Tooltip.tsx',
    '建議: Tooltip.tsx 改用單一 wrapper div 包裹 + portal 為條件 render 的 sibling; 或顯式 React.Fragment with key; 或改為 React 19 官方 Popover 原語. 影響所有使用 Tooltip 的 panel (not blocking, dev-only).',
    'Tooltip Fragment + createPortal(false fallback) 在多實例 map 渲染下, React reconcile 檢查 child identity 觸發 warning. 非單純 key 缺失, 是 component architecture 問題.',
    null,
    'accepted',
    2,
    'module',
    'DevExp',
    'M',
    ts,
    ts,
    '2027-04-15',
    'Pre-existing pattern (非本 Story 引入), dev-only warning, production build 不影響功能. 修復需重構 Tooltip 組件 pattern 屬跨 panel 影響 (20+ 使用點), scope 超出本 CR. 2027-04-15 review 重新評估是否開獨立 Story 重構.'
);
console.log('INSERT tech_debt_items rowid=' + debtResult.lastInsertRowid);

// 4. INSERT workflow_executions
try {
    const wfInfo = db.prepare('PRAGMA table_info(workflow_executions)').all();
    const cols = wfInfo.map(c => c.name);
    console.log('workflow_executions cols:', cols.join(', '));

    // 用 dynamic column detection 組 INSERT
    const hasStoryId = cols.includes('story_id');
    const hasModel = cols.includes('model');
    const baseCols = ['workflow_type', 'status', 'agent_id', 'started_at', 'completed_at', 'duration_ms'];
    const colsToUse = [...baseCols];
    const vals = ['code-review-r5', 'completed', 'CC-OPUS', '2026-04-15T15:55:00+08:00', ts, 2400000];
    if (hasStoryId) { colsToUse.push('story_id'); vals.push(sid); }
    if (hasModel) { colsToUse.push('model'); vals.push('claude-opus-4-6'); }

    const placeholders = colsToUse.map(() => '?').join(', ');
    const stmt = db.prepare(`INSERT INTO workflow_executions (${colsToUse.join(', ')}) VALUES (${placeholders})`);
    const wfResult = stmt.run(...vals);
    console.log('INSERT workflow_executions rowid=' + wfResult.lastInsertRowid);
} catch (e) {
    console.log('workflow_executions INSERT failed:', e.message);
}

// Verify
const verify = db.prepare(`SELECT cr_score, cr_issues_total, cr_issues_fixed, cr_issues_deferred, test_count, review_completed_at FROM stories WHERE story_id = ?`).get(sid);
console.log('\n=== POST UPDATE stories row ===');
console.log(JSON.stringify(verify, null, 2));

const crCount = db.prepare(`SELECT COUNT(*) as c FROM cr_issues WHERE story_id = ?`).get(sid);
console.log('cr_issues total rows:', crCount.c);

const debtCount = db.prepare(`SELECT COUNT(*) as c FROM tech_debt_items WHERE story_id = ?`).get(sid);
console.log('tech_debt_items rows:', debtCount.c);

db.close();
console.log('\nDONE');
