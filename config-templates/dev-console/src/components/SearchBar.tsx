// ============================================================
// SearchBar.tsx — 搜尋欄（input + clear + Enter 觸發）
// AC-6: 搜尋欄支援 Enter 觸發、清除按鈕
// ============================================================
import { useState, KeyboardEvent } from 'react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  initialValue?: string;
}

export default function SearchBar({
  onSearch,
  placeholder = '搜尋記憶庫（>= 3 字元）…',
  initialValue = '',
}: SearchBarProps) {
  const [value, setValue] = useState(initialValue);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') onSearch(value);
  }

  function handleClear() {
    setValue('');
    onSearch('');
  }

  return (
    <div className="search-bar">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="search-bar__input"
        aria-label="搜尋"
      />
      {value && (
        <button
          type="button"
          className="search-bar__clear"
          onClick={handleClear}
          aria-label="清除搜尋"
        >
          ✕
        </button>
      )}
      <button
        type="button"
        className="search-bar__btn"
        onClick={() => onSearch(value)}
      >
        搜尋
      </button>
    </div>
  );
}
