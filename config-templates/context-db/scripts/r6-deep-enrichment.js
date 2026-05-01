// ============================================================
// R6 Story eft-imagepanel-gallery-unified 深度補全
// 補強 6 個 enrichment 欄位:implementation_approach / testing_strategy /
// definition_of_done / risk_assessment / rollback_plan / dev_notes
// ============================================================
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'context-memory.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const story = db.prepare(
  "SELECT implementation_approach, testing_strategy, definition_of_done, risk_assessment, rollback_plan, dev_notes FROM stories WHERE story_id = 'eft-imagepanel-gallery-unified'"
).get();

if (!story) {
  console.error('Story not found');
  process.exit(1);
}

// ============================================================
// ENHANCED implementation_approach (add per-Phase code patterns)
// ============================================================
const enhancedImplementation = story.implementation_approach + `

---

## Phase 1 — 基礎重構 Code Patterns(TDD Red-Green-Refactor)

### 1.1 Remove R5 Tab Switcher(AC-1)

\`\`\`tsx
// ❌ BEFORE (ImagePanel.tsx L104, L272-295, L387-505)
const [activeTab, setActiveTab] = useState<'uploaded' | 'gallery'>('uploaded');
const handleTabChange = (tab) => setActiveTab(tab);
const handleTablistKeyDown = (e) => { /* Arrow/Home/End */ };

<div role="tablist" data-testid="image-panel-tablist">
  <button role="tab" aria-selected={activeTab === 'uploaded'}>已上傳 ({count})</button>
  <button role="tab" aria-selected={activeTab === 'gallery'}>我的圖檔 ({count})</button>
</div>
{activeTab === 'uploaded' && <UploadedList />}
{activeTab === 'gallery' && <GalleryList />}

// ✅ AFTER (single gallery list, L1 SSoT)
const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
useEffect(() => { loadGallery(); }, []);

<div className="editor-image-grid" ref={gridRef}>
  {filteredAndSortedItems.map(item => <GalleryItem key={item.id} item={item} />)}
</div>
\`\`\`

### 1.2 Mount Auto-load(AC-2)

\`\`\`tsx
const loadGallery = useCallback(async () => {
  setGalleryLoading(true);
  try {
    const res = await fetch('/MemberAsset/GetAssets');
    if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
    const data = await res.json();
    setGalleryItems(data.items);
  } catch (e) {
    setGalleryError(String(e));
  } finally {
    setGalleryLoading(false);
  }
}, []);

useEffect(() => { loadGallery(); }, [loadGallery]);
\`\`\`

### 1.3 Optimistic Prepend + Scroll + Highlight(AC-3)

\`\`\`tsx
const handleFileChange = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const result = await uploadFile(file);
  if (!result.success) return;

  // L2 保 sanitize 路徑(projectStore)
  addUploadedAsset(result.asset, file.name, file.size);

  // L1 optimistic prepend(UI SSoT)
  const newItem = { ...result.asset, isNew: true, uploadedAt: Date.now() };
  setGalleryItems(prev => [newItem, ...prev]);

  // Scroll + Highlight
  requestAnimationFrame(() => {
    gridRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  });
  setTimeout(() => {
    setGalleryItems(prev => prev.map(i => i.id === newItem.id ? { ...i, isNew: false } : i));
  }, 2000);
};
\`\`\`

\`\`\`css
/* editor.css — highlight animation */
.editor-image-item--highlight {
  animation: gallery-item-pulse 2s ease-out;
}
@keyframes gallery-item-pulse {
  0%   { box-shadow: 0 0 0 0 var(--color-primary); }
  50%  { box-shadow: 0 0 0 8px var(--color-primary-a20); }
  100% { box-shadow: 0 0 0 0 transparent; }
}
\`\`\`

### 1.6 Delete with Canvas Guard(AC-7,決策 1-C)

\`\`\`tsx
const handleDeleteClick = async (item) => {
  // Guard: canvas 引用檢查
  const refs = canvas?.getObjects().filter(o => (o as any).data?.assetId === item.id) ?? [];
  if (refs.length > 0) {
    setConfirmDialog({
      type: 'blocked',
      title: '此圖片正被畫布使用',
      message: '請先從畫布移除後再刪除',
      onlyCancel: true,
    });
    return;
  }

  // 二次確認
  setConfirmDialog({
    type: 'confirm',
    title: '此操作會永久刪除該圖片,確定?',
    onConfirm: async () => {
      const token = document.querySelector('input[name="__RequestVerificationToken"]')?.value;
      const res = await fetch(\`/MemberAsset/DeleteAsset?id=\${item.id}\`, {
        method: 'POST',
        headers: { 'RequestVerificationToken': token },
      });
      if (res.ok) {
        setGalleryItems(prev => prev.filter(i => i.id !== item.id));
        removeUploadedAsset(item.id); // L2 同步
      } else {
        toast.error('刪除失敗,請稍後再試');
      }
    },
  });
};
\`\`\`

### 1.7 v1 Migration Toast(AC-8)

\`\`\`ts
// useProjectLoader.ts (既有 L148 populate 前加偵測)
const v1Images = parsedCanvasJson.uploadedImages;
if (Array.isArray(v1Images) && v1Images.length > 0) {
  const seen = sessionStorage.getItem('v1-migration-toast-shown');
  if (!seen) {
    toast.info('偵測到舊版圖片,儲存後將自動升級到你的圖庫', { duration: 5000 });
    sessionStorage.setItem('v1-migration-toast-shown', '1');
  }
}
\`\`\`

## Phase 2 — Search / Sort Code Patterns

### 2.1 Debounced Search(AC-9)

\`\`\`tsx
const [search, setSearch] = useState('');
const [debouncedSearch, setDebouncedSearch] = useState('');

useEffect(() => {
  const t = setTimeout(() => setDebouncedSearch(search), 200);
  return () => clearTimeout(t);
}, [search]);

const filteredItems = useMemo(() =>
  galleryItems.filter(i =>
    !debouncedSearch || i.fileName.toLowerCase().includes(debouncedSearch.toLowerCase())
  ), [galleryItems, debouncedSearch]);
\`\`\`

### 2.2 Sort with localStorage(AC-10)

\`\`\`tsx
type SortBy = 'newest' | 'oldest' | 'name' | 'size' | 'usage';
const LS_KEY = 'editor-gallery-sort';

const [sortBy, setSortBy] = useState<SortBy>(() =>
  (localStorage.getItem(LS_KEY) as SortBy) ?? 'newest'
);

useEffect(() => { localStorage.setItem(LS_KEY, sortBy); }, [sortBy]);

const sortedItems = useMemo(() => {
  const sorted = [...filteredItems];
  switch (sortBy) {
    case 'newest': return sorted.sort((a, b) => b.uploadedAt - a.uploadedAt);
    case 'oldest': return sorted.sort((a, b) => a.uploadedAt - b.uploadedAt);
    case 'name':   return sorted.sort((a, b) => a.fileName.localeCompare(b.fileName));
    case 'size':   return sorted.sort((a, b) => b.fileSize - a.fileSize);
    case 'usage':  return sorted.sort((a, b) => (usageCount[b.id] ?? 0) - (usageCount[a.id] ?? 0));
  }
}, [filteredItems, sortBy, usageCount]);
\`\`\`

## Phase 3 — Tier 2 Code Patterns

### 3.1 Hover Lightbox Portal(AC-11)

\`\`\`tsx
// ImagePanelHoverLightbox.tsx (新組件)
export const HoverLightbox = ({ item, anchor }) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    const rect = anchor.getBoundingClientRect();
    const rightX = rect.right + 8;
    const fitsRight = rightX + 300 <= window.innerWidth;
    setPosition({
      x: fitsRight ? rightX : rect.left - 300 - 8,
      y: rect.top,
    });
  }, [anchor]);

  return createPortal(
    <div className="editor-gallery-lightbox" style={{ left: position.x, top: position.y }}>
      <img src={item.thumbnailUrl} className="editor-gallery-lightbox__img" />
      <div className="editor-gallery-lightbox__meta">
        <div>{item.fileName}</div>
        <div>{item.width}×{item.height}</div>
        <div>{formatBytes(item.fileSize)}</div>
      </div>
    </div>,
    document.body
  );
};

// ImagePanel.tsx — hover 500ms trigger
const [hovered, setHovered] = useState<{id:string, el:HTMLElement}|null>(null);
const hoverTimer = useRef<number|null>(null);

const handleMouseEnter = (item, el) => {
  hoverTimer.current = window.setTimeout(() => setHovered({id: item.id, el}), 500);
};
const handleMouseLeave = () => {
  if (hoverTimer.current) clearTimeout(hoverTimer.current);
  setHovered(null);
};
\`\`\`

### 3.2 Canvas Usage Aggregation(AC-12 + AC-15)

\`\`\`tsx
const [canvasVersion, setCanvasVersion] = useState(0);

useEffect(() => {
  if (!canvas) return;
  const bump = () => setCanvasVersion(v => v + 1);
  canvas.on('object:added', bump);
  canvas.on('object:removed', bump);
  canvas.on('object:modified', bump);
  return () => {
    canvas.off('object:added', bump);
    canvas.off('object:removed', bump);
    canvas.off('object:modified', bump);
  };
}, [canvas]);

const { usedAssetIds, usageCount } = useMemo(() => {
  const set = new Set<string>();
  const count: Record<string, number> = {};
  canvas?.getObjects().forEach(o => {
    const id = (o as any).data?.assetId;
    if (id) { set.add(id); count[id] = (count[id] ?? 0) + 1; }
  });
  return { usedAssetIds: set, usageCount: count };
}, [canvas, canvasVersion]);
\`\`\`

### 3.3 Batch Multi-Select(AC-13)

\`\`\`tsx
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const [lastClickedIdx, setLastClickedIdx] = useState<number | null>(null);

const handleItemClick = (item, idx, e: React.MouseEvent) => {
  if (e.shiftKey && lastClickedIdx !== null) {
    const [start, end] = [Math.min(lastClickedIdx, idx), Math.max(lastClickedIdx, idx)];
    const rangeIds = sortedItems.slice(start, end + 1).map(i => i.id);
    setSelectedIds(prev => new Set([...prev, ...rangeIds]));
  } else if (e.ctrlKey || e.metaKey) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(item.id) ? next.delete(item.id) : next.add(item.id);
      return next;
    });
  } else {
    setSelectedIds(new Set([item.id]));
  }
  setLastClickedIdx(idx);
};

useEffect(() => {
  const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedIds(new Set()); };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, []);

const handleBatchDelete = async () => {
  const ids = Array.from(selectedIds);
  // Guard: any reference blocks entire batch(AC-7 flow)
  const refs = ids.filter(id => usedAssetIds.has(id));
  if (refs.length > 0) {
    setConfirmDialog({
      type: 'blocked',
      title: \`\${refs.length} 張圖片正被畫布使用,請先從畫布移除後再刪除\`,
      onlyCancel: true,
    });
    return;
  }
  // 批次刪除(逐一 POST)
  for (const id of ids) {
    await fetch(\`/MemberAsset/DeleteAsset?id=\${id}\`, { method: 'POST', ... });
  }
};
\`\`\`

### 3.4 Drag-to-Upload(AC-14)

\`\`\`tsx
const [isDragging, setIsDragging] = useState(false);

const handleDragOver = (e: React.DragEvent) => {
  e.preventDefault();
  setIsDragging(true);
};
const handleDragLeave = () => setIsDragging(false);
const handleDrop = async (e: React.DragEvent) => {
  e.preventDefault();
  setIsDragging(false);
  const files = Array.from(e.dataTransfer.files).slice(0, 20);
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    await handleFileUpload(file); // 沿用 handleFileChange pipeline
  }
};

<div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
  {isDragging && <div className="editor-gallery-drop-overlay">拖放圖片至此上傳</div>}
  {/* gallery items */}
</div>
\`\`\`

## Skill Invocation Order(dev-story 啟動時建議)

1. \`pcpt-editor-arch\` v1.13.0 — 讀 §3b Asset 3-Layer Model 確認 L1/L2/L3 分層
2. \`pcpt-editor-data-features\` v1.2.0 — 讀 §6 ImagePanel Gallery Feature Spec
3. \`pcpt-design-system\` v1.8.0 — 讀 §4c ImagePanel deprecated 警示(不可再加 tablist)
4. \`pcpt-testing-patterns\` — Vitest + @testing-library/react 慣例
5. \`pcpt-tooltip\` — hover lightbox 相關可複用 pattern
6. \`pcpt-zustand-patterns\` — projectStore 不 persist 原則 BR-010
7. \`pcpt-type-canonical\` — AssetReference / AssetItemViewModel 型別
8. \`ui-ux-pro-max\` — Chrome MCP live verification 前置`;

// ============================================================
// ENHANCED testing_strategy
// ============================================================
const enhancedTesting = story.testing_strategy + `

---

## Test File Structure

\`\`\`
src/components/Editor/panels/
├── ImagePanel.test.tsx        (主要 25-30 tests)
└── ImagePanelHoverLightbox.test.tsx  (新,3-5 tests)
\`\`\`

## Vitest Test Name 清單(對照 15 AC)

### Phase 1 — Tier 0(10 tests)

- \`AC1_NoTablistRendered_SingleGalleryList\` — DOM assert 不含 role=tablist
- \`AC2_PanelMount_AutoLoadGallery_FiresFetch\` — mount 觸發 GetAssets
- \`AC2_FetchFail_ShowsErrorRetry\` — 失敗顯示 retry
- \`AC3_UploadSuccess_PrependToGalleryItems_ScrollTop_HighlightClass\` — optimistic
- \`AC3_HighlightRemoved_After2Seconds\` — setTimeout 驗證
- \`AC4_EditorImageGrid_ThreeColumnsAspectRatio\` — class + style
- \`AC5_StorageQuota_DisplaysUsedAndMax_Correctly\` — 163.2/1024 MB
- \`AC5_QuotaBar_ColorChangesByThreshold\` — <70 primary / 70-90 warn / >90 error
- \`AC6_EmptyState_NoItems_ShowsFriendlyMessage\` — 0 items
- \`AC7_Delete_WithCanvasReference_ShowsGuardDialog_BlocksBackend\`
- \`AC7_Delete_NoReference_SecondConfirm_CallsBackendDELETE_RemovesFromList_SyncsL2\`
- \`AC8_V1CanvasJson_DispatchesMigrationToast_OncePerSession\`

### Phase 2 — Tier 1(3 tests)

- \`AC9_SearchInput_Debounced200ms_FilterByFilename_CaseInsensitive\`
- \`AC9_NoMatchingResults_ShowsEmptyStateVariant\`
- \`AC10_SortDropdown_FourOptions_WritesToLocalStorage\`

### Phase 3 — Tier 2(9 tests)

- \`AC11_Hover500ms_LightboxPortalRenders_InDocumentBody\`
- \`AC11_HoverLeave_LightboxClosesImmediately\`
- \`AC11_KeyboardFocus_DoesNotTriggerLightbox\`
- \`AC12_CanvasAssetReferenced_BadgeDisplays_UsageCountCorrect\`
- \`AC12_NoReference_NoBadge\`
- \`AC13_CtrlClick_TogglesSelection\`
- \`AC13_ShiftClick_RangeSelection\`
- \`AC13_BatchDelete_AnyReferenceBlocksEntireBatch\`
- \`AC13_Escape_ClearsSelection\`
- \`AC14_DragOverPanel_ShowsDropOverlay\`
- \`AC14_DropFiles_TriggersUploadPipeline\`
- \`AC15_UsageCountSort_ByCanvasReferenceCount_DESC\`

### Compatibility(3-5 tests)

- \`IDD_COM_003_AnnotationCount_AtLeastSix\`
- \`IDD_COM_001_NoNewIsFreeUserAdded\`
- \`ThumbnailUrlFail_OnErrorFallbackPlaceholder\`
- \`DeleteButton_StopPropagation_DoesNotTriggerAddAsset\`

## Mock Strategy

\`\`\`tsx
// vitest setup
vi.mock('../../../services/AssetManager', () => ({
  uploadFile: vi.fn().mockResolvedValue({ success: true, asset: mockAsset }),
  useAssetManager: () => ({ uploadFile: vi.fn(), ... }),
}));

// Canvas mock (AC-7, AC-12, AC-13, AC-15)
const mockCanvas = {
  getObjects: vi.fn().mockReturnValue([]),
  on: vi.fn(),
  off: vi.fn(),
};
vi.mock('../../../hooks/editor/useCanvas', () => ({ useCanvas: () => mockCanvas }));

// Fetch mock (AC-2, AC-7)
global.fetch = vi.fn((url) => {
  if (url.includes('/MemberAsset/GetAssets')) {
    return Promise.resolve({ ok: true, json: () => ({ items: mockGalleryItems }) });
  }
  if (url.includes('/MemberAsset/DeleteAsset')) {
    return Promise.resolve({ ok: true });
  }
});

// PHYC_CONTEXT mock (AC-5)
global.window.PHYC_CONTEXT = {
  storageUsedBytes: 163202560,
  maxStorageBytes: 1073741824,
};

// LocalStorage mock (AC-10)
const localStorageMock = { getItem: vi.fn(), setItem: vi.fn() };
Object.defineProperty(window, 'localStorage', { value: localStorageMock });
\`\`\`

## Chrome MCP evaluate_script Templates

\`\`\`js
// AC-1 Tab 移除驗證
mcp__chrome-devtools__evaluate_script({
  function: \`() => {
    const tablist = document.querySelector('[role=tablist][data-testid=image-panel-tablist]');
    const tabs = document.querySelectorAll('.editor-panel-tab');
    return { tablistExists: !!tablist, tabCount: tabs.length };
  }\`
});
// Expected: { tablistExists: false, tabCount: 0 }

// AC-2 Auto-load 驗證
mcp__chrome-devtools__evaluate_script({
  function: \`() => {
    const grid = document.querySelector('.editor-image-grid');
    const items = grid?.querySelectorAll('[data-asset-id]').length;
    return { gridExists: !!grid, itemCount: items };
  }\`
});
// Expected after 500ms: { gridExists: true, itemCount: >0 }

// AC-4 3 欄驗證
mcp__chrome-devtools__evaluate_script({
  function: \`() => {
    const grid = document.querySelector('.editor-image-grid');
    const cs = getComputedStyle(grid);
    return { gridTemplateColumns: cs.gridTemplateColumns };
  }\`
});
// Expected: "repeat(3, 1fr)" or equivalent

// AC-12 Usage Badge
mcp__chrome-devtools__evaluate_script({
  function: \`(assetId) => {
    const item = document.querySelector(\\\`[data-asset-id="\\\${assetId}"]\\\`);
    const badge = item?.querySelector('.editor-image-item__usage-badge');
    return { hasBadge: !!badge, ariaLabel: badge?.getAttribute('aria-label') };
  }\`,
  args: ['asset-42']
});
// Expected: { hasBadge: true, ariaLabel: '本畫布正在使用' }
\`\`\`

## Test Account Matrix

| Plan | Email | Password | 用途 |
|:---:|-------|----------|------|
| Free (A1) | A1@gmail.com | After1229 | IDD-COM-001 compliance(全功能可見) |
| Professional (A4) | A4@gmail.com | After1229 | Tier 0-2 完整功能 live verify |

## Regression Baseline Command

\`\`\`bash
cd src/Platform/App.Web/ClientApp
npm run test -- src/components/Editor/ --run
# Expected: 192+/192+ passing
\`\`\``;

// ============================================================
// ENHANCED definition_of_done
// ============================================================
const enhancedDoD = story.definition_of_done + `

### Pre-commit Gate(每次 git commit 前)

- [ ] \`powershell -ExecutionPolicy Bypass -File scripts/check-hygiene.ps1\` PASS
- [ ] 無 LF/CRLF warning(或屬既有設定)
- [ ] 未 stage 與本 Story 無關的檔案(e.g., 專案開發環境資料清理分析.md)
- [ ] Commit message 遵循 \`feat(epic-eft): Wn#m eft-imagepanel-gallery-unified ...\` 格式

### Skill-Sync Gate(code change 涉及 pcpt-* 時)

- [ ] \`node .context-db/scripts/skill-sync-check.js --story eft-imagepanel-gallery-unified\`(若存在)
- [ ] 受影響 Skill frontmatter version + last_synced_epic 更新
- [ ] 三引擎同步(.claude / .gemini / .agent)

### Skill-IDD Sync Gate

- [ ] \`node .context-db/scripts/skill-idd-sync-check.js --changed-files <file_list>\`
- [ ] IDD-COM-001 forbidden_changes 未違反(無新增 isFreeUser gate)
- [ ] IDD-COM-003 annotations 至少 6 處保留

### Depth Gate 重跑(dev-story 結束前)

- [ ] \`node .claude/skills/pcpt-create-story-depth-gate/scripts/run-depth-gate.js eft-imagepanel-gallery-unified\`
- [ ] Exit code 0 或 1 with justified --accept-warn
- [ ] D5 Iteration Pollution PASS(code 修改後 file:line 行號可能漂移)
- [ ] D7 Self-Write Verification PASS

### Atomic Commit Criteria

- [ ] 1 commit = 1 完整 Phase(Phase 1 / 2 / 3 可分開 ship,也可合併單 commit)
- [ ] Test file 與 code 同 commit(不可 test 獨立 commit)
- [ ] CSS 與 TSX 同 commit(不可 CSS 後補)

### tasks-backfill-verify(dev-story + code-review 各獨立執行)

- [ ] dev-story 結束 \`/tasks-backfill-verify eft-imagepanel-gallery-unified\`(自證)
- [ ] code-review 結束再次 \`/tasks-backfill-verify\`(對抗重新 Read 每個 file:line)
- [ ] DB tasks 欄位全部 ✅(file:line)+ 0 ⬜
- [ ] DB file_list 更新(實際修改的檔案)

### Workflow Execution Log

- [ ] \`log_workflow({workflow_type:'dev-story', status:'completed', story_id, duration_ms, model:'claude-opus-4-6'})\`
- [ ] \`log_workflow({workflow_type:'code-review', status:'completed', ...})\`
- [ ] DevConsole /stories 顯示 Recent Activity`;

// ============================================================
// ENHANCED risk_assessment
// ============================================================
const enhancedRisk = story.risk_assessment + `

---

## Risk Trigger Conditions + Rollback Decision Tree

| Risk | Trigger Signal(dev 階段偵測) | Red Flag(CR 階段偵測) | Rollback Trigger |
|------|-------------------------------|------------------------|------------------|
| L2 state 下游破壞 | \`vitest run src/utils/sanitizeBase64Assets.test.ts\` FAIL | grep \`uploadedAssets\` / \`uploadedImages\` 發現被刪除 | 立即 \`git revert\` |
| GetAssets 首開 lag | Chrome Perf Tab 首開 > 1s | Live verify 使用者感知卡頓 | 非 rollback 條件(accept) |
| Canvas usage 效能降低 | React DevTools Profiler render > 16ms | Live verify 拖曳延遲 | 降級 MVP(移除 AC-15 usage sort) |
| 舊 v1 使用者混淆 | QA 實測開舊專案 confused | 客服反饋 | 非 rollback(強化 toast 文案) |
| Scope creep | Tier 2 進度 < 50% 且時間過半 | CR 發現 Tier 2 AC 部分 FIXED | Ship Phase 1+2,Phase 3 獨立 Story |
| Drag-to-upload 跨瀏覽器 | Firefox/Safari 手動測試 FAIL | Live verify Chrome 以外 browser | 降級 Chrome-only + 文案提示 |
| 批次刪除 race | 單元測試 race 模擬 FAIL | Live verify 多圖同時刪除錯誤 | toast 失敗回滾邏輯強化 |
| Lightbox 定位 edge | viewport 邊界手動測試 flicker | Live verify 右側螢幕邊緣異常 | fallback 左側 + offset 調整 |

## Rollback Decision Tree

\`\`\`
CR 發現問題
  ├─ Tier 0(AC-1~8)FAIL → STOP CR → dev 修復 → 重跑 CR
  ├─ Tier 1(AC-9~10)FAIL → 可 DEFERRED 單獨 TD(priority=2)
  └─ Tier 2(AC-11~15)FAIL → 可 DEFERRED 分離 Story(eft-imagepanel-tier2-split)

Live verify 發現問題
  ├─ Persist 破綻(re-open 清單空)→ ROLLBACK 立即 git revert
  ├─ Gating violation(A1 看不到功能)→ ROLLBACK 立即 git revert
  ├─ IDD-COM-003 annotation 丟失 → Hot fix commit(不 rollback)
  └─ Tier 2 edge case → Hot fix commit 或 DEFERRED
\`\`\``;

// ============================================================
// ENHANCED rollback_plan
// ============================================================
const enhancedRollback = story.rollback_plan + `

---

## Phase-Level Independent Rollback

若 dev-story 分 Phase ship(多 commit):

### Phase 1 Only(Tier 0 基礎重構)Rollback

\`\`\`bash
# 假設 Phase 1 commit = abc123
git revert abc123
# → 恢復 R5 Tab Switcher 設計
# → Vitest R5 tests 自動失效(test file 也被 revert)
\`\`\`

### Phase 2 Only(Tier 1 Search/Sort)Rollback

\`\`\`bash
# 保留 Phase 1 + 2(Tier 0+1),移除 Tier 1
git revert <Phase 2 commit>
# → Gallery 單一清單保留,search/sort 移除
# → Tier 1 tests 同步 revert
\`\`\`

### Phase 3 Only(Tier 2 Advanced)Rollback

\`\`\`bash
# 保留 Phase 1 + 2 + 3 基礎,Phase 3 獨立 revert
git revert <Phase 3 commit>
# → Ship Tier 0+1,Tier 2 移除
# → 後續可獨立 Story 重做 Tier 2
\`\`\`

## Database Rollback Verification

本 Story **無 DB schema 變更**,rollback 無 migration 風險。驗證:

\`\`\`bash
# 確認無新 Migration
Glob pattern="src/**/Migrations/**_Gallery*.cs" → 應為 0 檔
# 確認 MemberAsset schema 未變
SELECT * FROM __EFMigrationsHistory ORDER BY applied_at DESC LIMIT 5;
# → Latest migration 應早於本 Story date
\`\`\`

## L2 State 保護 Verification

Rollback 後確認 L2 state 未受影響:

\`\`\`bash
grep -n "uploadedAssets\\[" src/Platform/App.Web/ClientApp/src/ -r
# → sanitizeBase64Assets.ts / useSideSwitcher.ts / CanvasJsonSerializer.ts 應仍引用

grep -n "addUploadedAsset\\|removeUploadedAsset" src/Platform/App.Web/ClientApp/src/stores/projectStore.ts
# → L338-359 / L362-367 應存在
\`\`\`

## Partial Ship Strategy

若時間/資源受限,**推薦 Ship 順序**:

1. **MVP(必 ship)**: Phase 1 Tier 0(AC-1~8)— 核心 Gallery-first SSoT + delete guard
2. **Strongly Recommended**: Phase 1 + 2(含 search / sort)
3. **Nice-to-have**: Phase 3 Tier 2(可分離 \`eft-imagepanel-tier2-split\` Story)

Phase 3 各 AC 可獨立 gradual ship(AC-11 lightbox → AC-12 badge → AC-13 batch → AC-14 drag → AC-15 usage sort)`;

// ============================================================
// ENHANCED dev_notes(append 新章節)
// ============================================================
const enhancedDevNotes = story.dev_notes + `

---

## Pre-Dev Checklist(啟動前 5 分鐘驗證)

### 環境驗證

- [ ] \`cd src/Platform/App.Web/ClientApp && npm run test -- src/components/Editor/ --run\` → 192/192 PASS(baseline)
- [ ] \`dotnet run --project src/Platform/App.Web\` 啟動後端 https://localhost:7135
- [ ] \`cd src/Platform/App.Web/ClientApp && npm run dev\` 啟動 vite http://localhost:5173
- [ ] 登入 A4@gmail.com(Professional Plan)確認 MemberAsset API 可用
- [ ] \`curl -k https://localhost:7135/MemberAsset/GetAssets\` 回應 JSON 有 items

### Skill 載入

- [ ] Read \`.claude/skills/pcpt-editor-arch/SKILL.md\` §3b Asset 3-Layer Model
- [ ] Read \`.claude/skills/pcpt-editor-data-features/SKILL.md\` §6 ImagePanel Gallery
- [ ] Read \`.claude/skills/pcpt-design-system/SKILL.md\` §4c deprecated 警示
- [ ] Read \`.claude/skills/pcpt-testing-patterns/SKILL.md\`(若存在)Vitest pattern

### ADR / IDD 確認

- [ ] Read \`docs/technical-decisions/ADR-EDITOR-IMAGE-PANEL-GALLERY-SSOT.md\` Decision + FORBIDDEN 7 條
- [ ] \`mcp__pcpt-context__get_intentional_decision({idd_id:"IDD-COM-001"})\` forbidden_changes
- [ ] \`mcp__pcpt-context__get_intentional_decision({idd_id:"IDD-COM-003"})\` forbidden_changes

## IDD Compliance Grep Commands

\`\`\`bash
# IDD-COM-003 — ImagePanel Free plan 可開啟(至少 6 處 [Intentional: IDD-COM-003] annotation 保留)
grep -c "Intentional: IDD-COM-003" src/Platform/App.Web/ClientApp/src/components/Editor/panels/ImagePanel.tsx
# Expected: ≥6

# IDD-COM-001 — Free plan editor 全開放(無新增 isFreeUser gate)
grep -nE "isFreeUser|isLocked" src/Platform/App.Web/ClientApp/src/components/Editor/panels/ImagePanel.tsx
# Expected: 0 matches(annotation 字串除外)

# Gallery-first SSoT Forbidden(Tab Switcher 反模式)
grep -nE "role=\\"tablist\\"|editor-panel-tablist|activeTab" src/Platform/App.Web/ClientApp/src/components/Editor/panels/ImagePanel.tsx
# Expected: 0 matches(已移除)
\`\`\`

## TDD Execution Commands

\`\`\`bash
# RED 階段(1 test 失敗)
npm run test -- src/components/Editor/panels/ImagePanel.test.tsx --run --reporter=verbose -t "AC1_NoTablist"

# GREEN 階段(verify single test pass)
# (modify ImagePanel.tsx → remove tablist)
npm run test -- src/components/Editor/panels/ImagePanel.test.tsx --run -t "AC1_NoTablist"

# REFACTOR 階段(全 suite 驗證無 regression)
npm run test -- src/components/Editor/ --run
\`\`\`

## DevConsole 查詢

開發中隨時可查:
- Story 狀態:\`http://localhost:5181/stories/eft-imagepanel-gallery-unified\`
- Epic 進度:\`http://localhost:5181/epics/epic-eft\`
- 相關 IDD:\`http://localhost:5181/intentional-decisions?filter=IDD-COM\`

## Known Pitfalls(從 R5 學到)

1. **useState vs Zustand 重複** — galleryItems 用 useState 而非 Zustand(local panel state),L2 state 才用 Zustand
2. **canvas.on listener cleanup** — 務必在 useEffect return 清理,避免 memory leak
3. **Portal 定位 useLayoutEffect** — 非 useEffect(避免 flicker)
4. **LocalStorage SSR-safe** — \`typeof window !== 'undefined'\`(雖然本 app SPA 但 defensive)
5. **Debounce cleanup** — setTimeout clearTimeout 成對
6. **Fetch AbortController**(選配)— panel unmount 時 abort in-flight request

## Chrome MCP 預設環境注意

- SSL self-signed certificate 需信任(Alan 環境已設,新視窗可能需 Chrome accept once)
- Chrome MCP evaluate_script 不支援 async/await(用 Promise.then 或 IIFE)
- Screenshot 存入 \`docs/implementation-artifacts/reviews/epic-eft/eft-imagepanel-gallery-unified-*.png\``;

// ============================================================
// Write patch + run upsert-story.js --merge
// ============================================================
const patch = {
  story_id: 'eft-imagepanel-gallery-unified',
  implementation_approach: enhancedImplementation,
  testing_strategy: enhancedTesting,
  definition_of_done: enhancedDoD,
  risk_assessment: enhancedRisk,
  rollback_plan: enhancedRollback,
  dev_notes: enhancedDevNotes,
  updated_at: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).replace(' ', 'T') + '+08:00',
};

// 直接 UPDATE(比 --inline 更可靠,避免 JSON escape 巨大內容)
const updateStmt = db.prepare(`
  UPDATE stories
  SET implementation_approach = @implementation_approach,
      testing_strategy = @testing_strategy,
      definition_of_done = @definition_of_done,
      risk_assessment = @risk_assessment,
      rollback_plan = @rollback_plan,
      dev_notes = @dev_notes,
      updated_at = @updated_at
  WHERE story_id = @story_id
`);

const result = updateStmt.run(patch);
console.log('Update result:', result);

// 驗證
const updated = db.prepare(
  "SELECT length(implementation_approach) AS ia_len, length(testing_strategy) AS ts_len, length(definition_of_done) AS dod_len, length(risk_assessment) AS ra_len, length(rollback_plan) AS rp_len, length(dev_notes) AS dn_len FROM stories WHERE story_id = 'eft-imagepanel-gallery-unified'"
).get();
console.log('Post-enrichment lengths:', updated);

db.close();
