// ============================================================
// ExportButton.tsx — 記憶庫匯出按鈕（格式 + 類型 + 分類選擇）
// AC-3: 格式 JSON/CSV + 類型 Context/Tech + category 篩選
// ============================================================
import { useState } from 'react';
import type { MemoryType } from '../types/memory.js';
import { CONTEXT_CATEGORIES, TECH_CATEGORIES } from '../types/memory.js';
import type { ExportFormat } from '../services/exportApi.js';
import { buildExportUrl } from '../services/exportApi.js';

interface ExportButtonProps {
  /** 當前 Memory 頁面選中的 type（作為預設值） */
  defaultType?: MemoryType;
  /** 當前 Memory 頁面選中的 category（作為預設值） */
  defaultCategory?: string;
}

export default function ExportButton({ defaultType = 'context', defaultCategory }: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('json');
  const [type, setType] = useState<MemoryType>(defaultType);
  const [category, setCategory] = useState<string>(defaultCategory ?? '');
  const [loading, setLoading] = useState(false);

  const categories = type === 'context' ? CONTEXT_CATEGORIES : TECH_CATEGORIES;

  function handleTypeChange(t: MemoryType) {
    setType(t);
    setCategory('');
  }

  function handleExport() {
    setLoading(true);
    const url = buildExportUrl({
      type,
      format,
      category: category || undefined,
    });
    // 觸發瀏覽器下載
    window.open(url, '_blank');
    setTimeout(() => {
      setLoading(false);
      setOpen(false);
    }, 800);
  }

  return (
    <div className="export-btn-wrapper">
      <button
        type="button"
        className="export-btn"
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        aria-label="匯出記憶庫資料"
      >
        {loading ? '⏳ 匯出中…' : '⬇ 匯出'}
      </button>

      {open && !loading && (
        <div className="export-panel" role="dialog" aria-label="匯出設定">
          <div className="export-panel__row">
            <label className="export-panel__label">格式</label>
            <div className="export-panel__options">
              {(['json', 'csv'] as ExportFormat[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`export-panel__opt ${format === f ? 'export-panel__opt--active' : ''}`}
                  onClick={() => setFormat(f)}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="export-panel__row">
            <label className="export-panel__label">類型</label>
            <div className="export-panel__options">
              {(['context', 'tech'] as MemoryType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`export-panel__opt ${type === t ? 'export-panel__opt--active' : ''}`}
                  onClick={() => handleTypeChange(t)}
                >
                  {t === 'context' ? 'Context' : 'Tech'}
                </button>
              ))}
            </div>
          </div>

          <div className="export-panel__row">
            <label className="export-panel__label">分類</label>
            <select
              className="export-panel__select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">全部</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="export-panel__actions">
            <button
              type="button"
              className="export-panel__confirm"
              onClick={handleExport}
            >
              確認匯出
            </button>
            <button
              type="button"
              className="export-panel__cancel"
              onClick={() => setOpen(false)}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
