/**
 * edf-14 tasks backfill script
 * Run: node .context-db/scripts/update-edf14-tasks.js
 */
const path = require('path');
const Database = require(path.join(__dirname, '../../node_modules/better-sqlite3'));

const dbPath = path.join(__dirname, '../context-memory.db');
const db = new Database(dbPath);

const tasks = `## Tasks (依執行順序)

- ✅ **Task 1: 建立 computePanelInitialPosition helper**
  - ✅ 1.1 在 \`uiStore.ts\` 頂部 (INITIAL_Z_INDEX 附近) 新增純函式 \`computePanelInitialPosition()\` (uiStore.ts:186-205)
  - ✅ 1.2 SSR 檢查: \`if (typeof window === 'undefined') return { x: 100, y: 100 }\` BR-05 (uiStore.ts:188-190)
  - ✅ 1.3 Mobile (innerWidth < 768): \`x = Math.max(16, (window.innerWidth - 260) / 2), y = 60\` BR-03 (uiStore.ts:193-199)
  - ✅ 1.4 Desktop (innerWidth >= 768): \`x = Math.max(24, window.innerWidth - 360), y = 150\` BR-02 (uiStore.ts:200-204)
  - ✅ 1.5 Y 值與 useFloatingCards.ts:433 對齊 (desktop 150, mobile 60) (uiStore.ts:197,203)

- ✅ **Task 2: 修改 openDynamicPropertyPanel action (uiStore.ts:401-412)**
  - ✅ 2.1 在 set((state) => ...) 內讀取 \`state.dynamicPropertyPanel.isPinned\` (uiStore.ts:408)
  - ✅ 2.2 若 \`isPinned === true\`: 保留 position (uiStore.ts:408-409)
  - ✅ 2.3 若 \`isPinned === false\`: 呼叫 \`computePanelInitialPosition()\` 覆寫 position (uiStore.ts:410)
  - ✅ 2.4 保留既有 zIndex 邏輯不動 (spread operator at uiStore.ts:404)

- ✅ **Task 3: 修改 dynamicPropertyPanel 初始 state (uiStore.ts:224-231)**
  - ✅ 3.1 將 \`position: { x: 100, y: 100 }\` 改為 \`computePanelInitialPosition()\` (uiStore.ts:229)
  - ✅ 3.2 helper 宣告在 useUIStore 之前，SSR 時自動回到 {100, 100} (uiStore.ts:186 before 211)

- ✅ **Task 4: 撰寫 Unit Tests (uiStore.test.ts)**
  - ✅ 4.1 新增 \`describe('動態屬性面板位置 (edf-14)', () => { ... })\` 區塊 (uiStore.test.ts:426)
  - ✅ 4.2 撰寫 5 個 AC 對應測試: AC1/AC2/AC3a/AC3b/AC4/AC5 (uiStore.test.ts:441-568)
  - ✅ 4.3 Mock 策略: Object.defineProperty(window, 'innerWidth', { value, writable, configurable }) (uiStore.test.ts:442-446)
  - ✅ 4.4 SSR 測試: delete (globalThis as unknown as Record<string, unknown>).window (uiStore.test.ts:544)
  - ✅ 4.5 TDD GREEN: 執行 npm test -- uiStore.test.ts → 26/26 tests pass
  - ✅ 4.6 Regression: uiStore.test.ts 既有測試全部通過 (26 tests GREEN)

- ✅ **Task 5: Runtime 驗證 (Unit Test 覆蓋替代 — Pipeline YOLO 模式)**
  - ✅ 5.1 AC1 Unit test 模擬桌面 1920px → position.x=1560 (uiStore.test.ts:441)
  - ✅ 5.2 AC2 Unit test 模擬桌面 1280px → position.x=920 (uiStore.test.ts:459)
  - ✅ 5.3 AC4 Unit test 模擬手機 375px → 水平置中 position.x≈57.5 (uiStore.test.ts:525)
  - ✅ 5.4 AC3b Unit test pin 保留位置 {x:50,y:50} (uiStore.test.ts:501)
  - ✅ 5.5 AC3a Unit test unpin 重置至右側預設 (uiStore.test.ts:475)
  - ✅ 5.6 Pipeline YOLO 模式 — 手動瀏覽器步驟以 Unit test 覆蓋替代

- ✅ **Task 6: 執行 Skill Sync Gate 檢查**
  - ✅ 6.1 Grep dynamicPropertyPanel on pcpt-floating-ui/** → panel-architecture.md:175,177,181 hit
  - ✅ 6.2 Grep dynamicPropertyPanel on pcpt-zustand-patterns/** → no hit
  - ✅ 6.3 Skill Impact Report 產出 + 三引擎同步更新 panel-architecture.md DynamicPropertyPanel Position Rules
  - ✅ 6.4 pcpt-system-platform/references/PCPTSystem/editor-floating-ui.md → no position spec, no update needed

- ✅ **Task 7: 執行 /tasks-backfill-verify edf-14-property-panel-right-position**
  - ✅ 7.1 逐項驗證每個 Task 有 file:line 證據 (本報告完成)
  - ✅ 7.2 DB 欄位 tasks 更新為含 ✅ 的 Markdown 字串 (本次 upsert)
  - ✅ 7.3 file_list 欄位回填實際變更檔案清單`;

const fileList = [
  'src/Platform/App.Web/ClientApp/src/stores/uiStore.ts',
  'src/Platform/App.Web/ClientApp/src/stores/uiStore.test.ts',
  '.claude/skills/pcpt-floating-ui/references/panel-architecture.md',
  '.agent/skills/pcpt-floating-ui/references/panel-architecture.md',
  '.gemini/skills/pcpt-floating-ui/references/panel-architecture.md'
].join('\n');

const now = '2026-04-06T19:42:00+08:00';

const result = db.prepare(`
  UPDATE stories
  SET tasks = ?, file_list = ?, test_count = 26, updated_at = ?
  WHERE story_id = 'edf-14-property-panel-right-position'
`).run(tasks, fileList, now);

console.log('Updated rows:', result.changes);

const story = db.prepare('SELECT story_id, status, test_count, updated_at FROM stories WHERE story_id = ?')
  .get('edf-14-property-panel-right-position');
console.log('Story after update:', JSON.stringify(story, null, 2));

db.close();
process.exit(0);
