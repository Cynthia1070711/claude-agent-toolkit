// ============================================================
// Memory.tsx — Memory 頁面主組件
// AC-6/7: 搜尋/瀏覽模式切換、Type Tab、Category Chip、CRUD
// ============================================================
import { useState, useCallback, useEffect } from 'react';
import type { ContextEntry, TechEntry, MemoryType } from '../types/memory.js';
import { CONTEXT_CATEGORIES, TECH_CATEGORIES } from '../types/memory.js';
import SearchBar from '../components/SearchBar.js';
import Pagination from '../components/Pagination.js';
import Toast, { type ToastMessage } from '../components/Toast.js';
import ConfirmDialog from '../components/ConfirmDialog.js';
import MemoryCard from '../components/MemoryCard.js';
import MemoryForm from '../components/MemoryForm.js';
import {
  searchMemory,
  browseMemory,
  createMemory,
  updateMemory,
  deleteMemory,
} from '../services/memoryApi.js';
import ExportButton from '../components/ExportButton.js';
import '../styles/memory.css';

type ViewMode = 'search' | 'browse';

function genId() {
  return `${Date.now()}-${Math.random()}`;
}

export default function Memory() {
  const [mode, setMode] = useState<ViewMode>('browse');
  const [type, setType] = useState<MemoryType>('context');
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [items, setItems] = useState<(ContextEntry | TechEntry)[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [lastQuery, setLastQuery] = useState('');

  // Toast
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const addToast = (message: string, kind: 'success' | 'error' = 'success') =>
    setToasts((prev) => [...prev, { id: genId(), type: kind, message }]);
  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // CRUD state
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Partial<ContextEntry | TechEntry> | undefined>(
    undefined,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  // ── 初始載入（browse 模式自動載入第一頁）──
  useEffect(() => {
    if (!initialLoaded && mode === 'browse') {
      setInitialLoaded(true);
      handleBrowse(1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 搜尋 ──────────────────────────────────────────────────────
  async function handleSearch(query: string) {
    setLastQuery(query);
    if (!query || query.trim().length < 3) {
      setItems([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    try {
      const result = await searchMemory(query, type, category);
      setItems(result.items as (ContextEntry | TechEntry)[]);
      setTotal(result.total);
      setPage(1);
    } catch (err) {
      addToast(`搜尋失敗：${(err as Error).message}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  // ── 瀏覽 ──────────────────────────────────────────────────────
  async function handleBrowse(p = page, overrideType?: MemoryType) {
    setLoading(true);
    try {
      const result = await browseMemory(overrideType ?? type, category, p);
      setItems(result.items as (ContextEntry | TechEntry)[]);
      setTotal(result.total);
      setPage(p);
    } catch (err) {
      addToast(`讀取失敗：${(err as Error).message}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  function handleModeChange(m: ViewMode) {
    setMode(m);
    setItems([]);
    setTotal(0);
    setPage(1);
    if (m === 'browse') handleBrowse(1);
  }

  function handleTypeChange(t: MemoryType) {
    setType(t);
    setItems([]);
    setTotal(0);
    setPage(1);
    setCategory(undefined);
    if (mode === 'browse') {
      handleBrowse(1, t);
    }
  }

  function handleCategoryChange(cat: string | undefined) {
    setCategory(cat);
    setItems([]);
    setTotal(0);
    setPage(1);
    if (mode === 'search' && lastQuery.trim().length >= 3) {
      handleSearch(lastQuery);
    } else if (mode === 'browse') {
      handleBrowse(1);
    }
  }

  function handlePageChange(p: number) {
    setPage(p);
    handleBrowse(p);
  }

  // ── CRUD handlers ──────────────────────────────────────────────
  function handleEditOpen(item: ContextEntry | TechEntry) {
    setEditTarget(item);
    setFormOpen(true);
  }

  function handleNewOpen() {
    setEditTarget(undefined);
    setFormOpen(true);
  }

  async function handleFormSubmit(data: Partial<ContextEntry | TechEntry>) {
    try {
      if (editTarget?.id) {
        await updateMemory(type, editTarget.id, data);
        addToast('更新成功');
      } else {
        await createMemory(type, data);
        addToast('新增成功');
      }
      setFormOpen(false);
      if (mode === 'browse') handleBrowse(page);
      else if (lastQuery.trim().length >= 3) handleSearch(lastQuery);
    } catch (err) {
      addToast(`操作失敗：${(err as Error).message}`, 'error');
    }
  }

  function handleDeleteOpen(id: number) {
    setDeleteTargetId(id);
    setConfirmOpen(true);
  }

  async function handleDeleteConfirm() {
    if (!deleteTargetId) return;
    try {
      await deleteMemory(type, deleteTargetId);
      addToast('刪除成功');
      setItems((prev) => prev.filter((it) => it.id !== deleteTargetId));
      setTotal((t) => t - 1);
    } catch (err) {
      addToast(`刪除失敗：${(err as Error).message}`, 'error');
    } finally {
      setConfirmOpen(false);
      setDeleteTargetId(null);
    }
  }

  const categories = type === 'context' ? CONTEXT_CATEGORIES : TECH_CATEGORIES;

  return (
    <div className="memory-page">
      <Toast toasts={toasts} onDismiss={dismissToast} />

      {/* Header */}
      <div className="memory-page__header">
        <h1 className="memory-page__title">Memory 記憶庫</h1>
        <div className="memory-page__mode-switch">
          <button
            type="button"
            className={`mode-btn ${mode === 'search' ? 'mode-btn--active' : ''}`}
            onClick={() => handleModeChange('search')}
          >
            搜尋
          </button>
          <button
            type="button"
            className={`mode-btn ${mode === 'browse' ? 'mode-btn--active' : ''}`}
            onClick={() => handleModeChange('browse')}
          >
            瀏覽
          </button>
        </div>
        <ExportButton defaultType={type} defaultCategory={category} />
        <button type="button" className="memory-page__add-btn" onClick={handleNewOpen}>
          + 新增
        </button>
      </div>

      {/* Type Tabs */}
      <div className="memory-page__tabs">
        <button
          type="button"
          className={`tab-btn ${type === 'context' ? 'tab-btn--active' : ''}`}
          onClick={() => handleTypeChange('context')}
        >
          Context
        </button>
        <button
          type="button"
          className={`tab-btn ${type === 'tech' ? 'tab-btn--active' : ''}`}
          onClick={() => handleTypeChange('tech')}
        >
          Tech
        </button>
      </div>

      {/* Category Chips */}
      <div className="memory-page__chips">
        <button
          type="button"
          className={`chip ${!category ? 'chip--active' : ''}`}
          onClick={() => handleCategoryChange(undefined)}
        >
          全部
        </button>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            className={`chip ${category === c ? 'chip--active' : ''}`}
            onClick={() => handleCategoryChange(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Search Bar（只在搜尋模式顯示）*/}
      {mode === 'search' && <SearchBar onSearch={handleSearch} />}

      {/* Results */}
      {loading ? (
        <p className="memory-page__loading">載入中…</p>
      ) : items.length === 0 ? (
        <p className="memory-page__empty">
          {mode === 'search' ? '輸入 3 個以上字元開始搜尋' : '尚無記錄'}
        </p>
      ) : (
        <div className="memory-page__list">
          {items.map((item) => (
            <MemoryCard
              key={item.id}
              item={item}
              type={type}
              onEdit={handleEditOpen}
              onDelete={handleDeleteOpen}
            />
          ))}
        </div>
      )}

      {/* Pagination（瀏覽模式才顯示） */}
      {mode === 'browse' && (
        <Pagination page={page} pageSize={20} total={total} onPageChange={handlePageChange} />
      )}

      {/* CRUD Modal */}
      <MemoryForm
        open={formOpen}
        type={type}
        initialData={editTarget}
        onSubmit={handleFormSubmit}
        onCancel={() => setFormOpen(false)}
      />

      {/* Delete Dialog */}
      <ConfirmDialog
        open={confirmOpen}
        title="確認刪除"
        message="此操作不可復原，確定要刪除此記錄嗎？"
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setConfirmOpen(false);
          setDeleteTargetId(null);
        }}
      />
    </div>
  );
}
