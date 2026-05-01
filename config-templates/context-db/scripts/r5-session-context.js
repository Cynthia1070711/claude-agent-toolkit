/**
 * CR-R5 Session context_entries writeback
 */
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new Database(path.join(__dirname, '..', 'context-memory.db'));
const ts = '2026-04-15T16:35:00+08:00';

// 探索 context_entries 欄位
const info = db.prepare('PRAGMA table_info(context_entries)').all();
console.log('context_entries cols:', info.map(c => c.name).join(', '));

// 插入 R5 session + decision + pattern 紀錄
const cols = info.map(c => c.name);
const has = (n) => cols.includes(n);

const entries = [
    {
        agent_id: 'CC-OPUS',
        category: 'session',
        title: 'CR-R5 eft-imagepanel-v2-ui-completion — User-Reported Scope Gap 修復完成',
        content: [
            'Round: R5 (第五輪 CR,使用者要求深度審查)',
            'Trigger: 使用者手動測試發現 3 個 Spec scope gap bug — (1) upload→存檔→重開 panel 清單空; (2) 我的圖庫按鈕 toggle UX 不直覺; (3) 我的圖檔拖曳至畫布異常。R1-R4 四輪 CR 均未抓到。',
            'Path A (User-authorized): scope 擴充 + 全量 auto-fix + 調用 ui-ux-pro-max skill 設計 Tab。',
            'Key Changes: ImagePanel.tsx 重構為 WAI-ARIA tablist segmented control(已上傳/我的圖檔),gallery item 加 draggable+onDragStart 塞 isV2Asset shape,Tab lazy-load + invalidate-on-upload。editor.css 新增 tablist CSS 純 CSS Variable token。',
            'Test: Vitest 29/29 PASS(原 20 + 9 新 R5 tests)。Chrome MCP Live A4 驗證 Tab render + 83 gallery items + Keyboard Arrow + dataTransfer isV2Asset shape + IDD grep 全通過。',
            'Findings: 6 new(R5-F1~F6)— 5 FIXED + 1 DEFERRED(R5-F6 Tooltip pre-existing Fragment+portal key warning, TD priority=2)。',
            'DB: stories.cr_score=0, total=26, fixed=21, deferred=4, test_count=37, status=done。cr_issues +6, tech_debt +1, workflow +1。',
            'Lesson: 使用者驗證不可替代 — 4 輪 CR 均 miss 3 個 user-visible bug,Spec Scope 應 include 功能生命週期(upload→save→reload→re-use);Tab pattern 優於 toggle button;Persist 問題優先從既有 backend user-level store 找自然解;dataTransfer shape 統一簡化 drop handler。',
        ].join('\n'),
        tags: JSON.stringify(['epic-eft', 'cr-r5', 'imagepanel', 'tab-switcher', 'gallery-drag', 'persist', 'user-reported', 'scope-gap', 'path-a', 'ui-ux-pro-max']),
        story_id: 'eft-imagepanel-v2-ui-completion',
        epic_id: 'epic-eft',
        related_files: 'src/Platform/App.Web/ClientApp/src/components/Editor/panels/ImagePanel.tsx, src/Platform/App.Web/ClientApp/src/components/Editor/panels/ImagePanel.test.tsx, src/Platform/App.Web/ClientApp/src/styles/editor.css, docs/implementation-artifacts/specs/epic-eft/eft-imagepanel-v2-ui-completion-spec.md, docs/implementation-artifacts/reviews/epic-eft/eft-imagepanel-v2-ui-completion-code-review-report.md',
    },
    {
        agent_id: 'CC-OPUS',
        category: 'decision',
        title: '[DECISION] Persist-across-sessions 問題優先用 backend user-level store 自然解,而非前端 local storage',
        content: [
            'Context: eft-imagepanel-v2-ui-completion R5-F1 — 使用者上傳圖片→存檔→重開專案→panel 清單空',
            '',
            'Options considered:',
            'A) 前端 Zustand persist middleware (localStorage/IndexedDB) 跨 session 保留 uploadedAssets — 但違反 projectStore BR-010 不使用 persist; 且 session 狀態污染多專案場景',
            'B) 專案層 save 額外存 uploadedAssets[] 欄位 → 後端 DB 新 column — 破壞 canvasJson SSoT, 增加 schema 負擔',
            'C) 擴展 assetManifest 包含 未加 canvas 的 asset — 破壞 assetManifest 語意 (canvas-relevant assets only)',
            'D) (CHOSEN) 新增「我的圖檔」Tab 直接走 backend /MemberAsset/GetAssets (既有 API, user-level persist) — 最小改動, 符合既有架構, 跨 session 自動可見, 同時解決 R5-F2 UX toggle 問題',
            '',
            'Decision: Option D — Tab design 作為 persist 問題的自然解',
            '',
            'Rationale:',
            '1. Backend 已有 user-level 持久化 storage (MemberAssetController), 前端只需暴露為獨立 Tab',
            '2. 避免前端 persist 機制帶來的 cache stale / 多專案污染問題',
            '3. 一次設計同時解決 F1 persist + F2 UX toggle 兩個 bug',
            '4. 符合 pcpt-editor-arch SKILL 的 asset 管理架構 (CanvasJson 只存 assetManifest, gallery 獨立 backend store)',
            '',
            'Trade-offs: 需要 network request 載入 gallery (lazy-load mitigates), 首次切 tab 有短暫 loading',
        ].join('\n'),
        tags: JSON.stringify(['decision', 'persist', 'backend-first', 'tab-design', 'architecture', 'epic-eft']),
        story_id: 'eft-imagepanel-v2-ui-completion',
        epic_id: 'epic-eft',
        related_files: 'src/Platform/App.Web/ClientApp/src/components/Editor/panels/ImagePanel.tsx',
    },
    {
        agent_id: 'CC-OPUS',
        category: 'pattern',
        title: '[PATTERN] WAI-ARIA tablist + CSS Variable segmented control for editor side panel',
        content: [
            'Context: CR-R5 將 ImagePanel 的「我的圖庫」toggle button 重構為 Tab Switcher',
            '',
            'Pattern applied:',
            '- role="tablist" + 2 x role="tab" button + role="tabpanel"',
            '- aria-selected, aria-controls, aria-labelledby',
            '- Roving tabIndex (active=0, inactive=-1)',
            '- Arrow Left/Right + Home/End keyboard navigation',
            '- focus-visible outline using --color-primary',
            '- Count badge per tab showing item count',
            '- Active tab: --color-surface bg + --color-primary color + --shadow-sm',
            '- 純 CSS Variable token(無硬編碼 Hex)',
            '',
            'References:',
            '- ui-ux-pro-max skill: accessibility keyboard focus guidelines',
            '- WAI-ARIA Authoring Practices 1.2 tablist pattern',
            '- PCPT design-system tokens: --color-primary, --color-text-secondary, --color-surface, --shadow-sm, --transition-fast',
            '',
            'Files: ImagePanel.tsx:392-450 (tablist markup), editor.css:1134-1213 (segmented control CSS)',
            '',
            'Reusable: 其他 editor panel 若需雙清單切換(e.g., 批次圖檔 panel 的上傳/我的批次)可直接複用此 CSS class + 同 aria pattern',
        ].join('\n'),
        tags: JSON.stringify(['pattern', 'wai-aria', 'tablist', 'accessibility', 'editor-panel', 'css-variables', 'reusable']),
        story_id: 'eft-imagepanel-v2-ui-completion',
        epic_id: 'epic-eft',
        related_files: 'src/Platform/App.Web/ClientApp/src/components/Editor/panels/ImagePanel.tsx, src/Platform/App.Web/ClientApp/src/styles/editor.css',
    },
];

// Dynamic INSERT based on detected columns
for (const e of entries) {
    const useCols = ['agent_id', 'category', 'title', 'content', 'tags'];
    const vals = [e.agent_id, e.category, e.title, e.content, e.tags];
    if (has('story_id')) { useCols.push('story_id'); vals.push(e.story_id); }
    if (has('epic_id')) { useCols.push('epic_id'); vals.push(e.epic_id); }
    if (has('related_files')) { useCols.push('related_files'); vals.push(e.related_files); }
    if (has('timestamp')) { useCols.push('timestamp'); vals.push(ts); }
    if (has('created_at')) { useCols.push('created_at'); vals.push(ts); }
    if (has('updated_at')) { useCols.push('updated_at'); vals.push(ts); }
    const placeholders = useCols.map(() => '?').join(', ');
    const stmt = db.prepare(`INSERT INTO context_entries (${useCols.join(', ')}) VALUES (${placeholders})`);
    const res = stmt.run(...vals);
    console.log('INSERT context_entries id=' + res.lastInsertRowid + ' (' + e.category + ')');
}

db.close();
console.log('DONE');
