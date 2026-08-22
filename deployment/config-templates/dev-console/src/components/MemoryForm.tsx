// ============================================================
// MemoryForm.tsx — 新增/編輯 Modal 表單
// AC-7: title, content, category, tags 欄位
// ============================================================
import { useState, useEffect } from 'react';
import type { ContextEntry, TechEntry, MemoryType } from '../types/memory.js';
import { CONTEXT_CATEGORIES, TECH_CATEGORIES } from '../types/memory.js';

interface MemoryFormProps {
  open: boolean;
  type: MemoryType;
  initialData?: Partial<ContextEntry | TechEntry>;
  onSubmit: (data: Partial<ContextEntry | TechEntry>) => void;
  onCancel: () => void;
}

export default function MemoryForm({
  open,
  type,
  initialData,
  onSubmit,
  onCancel,
}: MemoryFormProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');
  const [tags, setTags] = useState('');

  useEffect(() => {
    if (open) {
      setTitle(initialData?.title ?? '');
      setCategory(initialData?.category ?? 'general');
      setTags(initialData?.tags ?? '');
      if (type === 'context') {
        setContent((initialData as Partial<ContextEntry>)?.content ?? '');
      } else {
        setContent((initialData as Partial<TechEntry>)?.outcome ?? '');
      }
    }
  }, [open, initialData, type]);

  if (!open) return null;

  const categories = type === 'context' ? CONTEXT_CATEGORIES : TECH_CATEGORIES;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: Partial<ContextEntry | TechEntry> =
      type === 'context'
        ? { title, content, category, tags }
        : { title, outcome: content, category, tags };
    onSubmit(data);
  }

  return (
    <div className="dialog-overlay" role="dialog" aria-modal="true" aria-label="編輯記錄">
      <div className="dialog dialog--form">
        <h2 className="dialog__title">
          {initialData?.id ? '編輯記錄' : '新增記錄'}（{type === 'context' ? 'Context' : 'Tech'}）
        </h2>
        <form onSubmit={handleSubmit} className="memory-form">
          <label className="memory-form__label">
            標題 *
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
              className="memory-form__input"
            />
          </label>
          <label className="memory-form__label">
            {type === 'context' ? 'Content' : 'Outcome'} *
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              rows={6}
              className="memory-form__textarea"
            />
          </label>
          <label className="memory-form__label">
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="memory-form__select"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="memory-form__label">
            Tags（逗號分隔）
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="memory-form__input"
            />
          </label>
          <div className="dialog__actions">
            <button type="button" className="dialog__btn dialog__btn--cancel" onClick={onCancel}>
              取消
            </button>
            <button type="submit" className="dialog__btn dialog__btn--primary">
              {initialData?.id ? '儲存' : '新增'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
