// ============================================================
// Pagination.tsx — 分頁控制
// AC-8: 上一頁 / 下一頁 / 頁碼 / 總記錄數 / 當前頁範圍
// ============================================================

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize);
  const start = Math.min((page - 1) * pageSize + 1, total);
  const end = Math.min(page * pageSize, total);

  if (total === 0) return null;

  return (
    <div className="pagination">
      <span className="pagination__info">
        {start}–{end} / 共 {total} 筆
      </span>
      <div className="pagination__controls">
        <button
          type="button"
          className="pagination__btn"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="上一頁"
        >
          ‹
        </button>
        <span className="pagination__page">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          className="pagination__btn"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="下一頁"
        >
          ›
        </button>
      </div>
    </div>
  );
}
