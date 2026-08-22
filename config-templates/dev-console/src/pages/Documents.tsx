// ============================================================
// Documents.tsx — 文檔瀏覽 + FTS5 搜尋頁面
// CMI-4: Document Browser（分類卡片導航 + 搜尋 + 內容預覽）
// Party Mode 改進: 分類映射 / VS Code 開啟 / 模糊搜尋高亮 / 相關文檔
// ============================================================
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useI18n } from '../i18n/I18nProvider.js';
import {
  browseDocuments,
  searchDocuments,
  getDocumentContent,
  type DocIndexEntry,
  type DocSearchChunk,
  type DocBrowseResult,
} from '../services/documentsApi.js';
import {
  CATEGORY_GROUPS,
  getGroupForCategory,
  getDbCategoriesForGroup,
} from '../config/documentCategories.js';
import '../styles/documents.css';

type ViewState =
  | { mode: 'browse' }
  | { mode: 'search'; query: string }
  | { mode: 'detail'; docId: number };

// ── 關鍵字高亮工具 ──
function highlightText(text: string, query: string): (string | JSX.Element)[] {
  if (!query || query.length < 2) return [text];
  // 取出搜尋關鍵字（以空格分割），建立正規表達式
  const keywords = query.split(/\s+/).filter((k) => k.length >= 2);
  if (keywords.length === 0) return [text];
  const pattern = new RegExp(`(${keywords.map(escapeRegExp).join('|')})`, 'gi');
  const parts = text.split(pattern);
  return parts.map((part, i) =>
    pattern.test(part) ? (
      <mark key={i} className="doc-highlight">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default function Documents() {
  const { t } = useI18n();

  // State
  const [view, setView] = useState<ViewState>({ mode: 'browse' });
  const [browseData, setBrowseData] = useState<DocBrowseResult | null>(null);
  const [searchResults, setSearchResults] = useState<DocSearchChunk[]>([]);
  const [detailDoc, setDetailDoc] = useState<DocIndexEntry | null>(null);
  const [detailContent, setDetailContent] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');

  // 計算分類群組統計
  const groupStats = useMemo(() => {
    const rawCategories = browseData?.categories ?? [];
    return CATEGORY_GROUPS.map((group) => {
      const count = rawCategories
        .filter((c) => group.dbCategories.includes(c.category))
        .reduce((sum, c) => sum + c.count, 0);
      return { ...group, count };
    }).filter((g) => g.count > 0);
  }, [browseData?.categories]);

  // 載入文檔列表
  const loadBrowse = useCallback(async (cat?: string, p = 1) => {
    setLoading(true);
    setError(null);
    try {
      const data = await browseDocuments(cat, p, 20);
      setBrowseData(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // 初始載入（不帶 category 篩選）
  useEffect(() => {
    loadBrowse();
  }, [loadBrowse]);

  // 搜尋
  async function handleSearch(query: string) {
    if (query.trim().length < 2) return;
    setView({ mode: 'search', query });
    setLoading(true);
    setError(null);
    try {
      // 將 selectedGroup 展開為多個 DB categories（取第一個作為 API 參數）
      const cat = selectedGroup
        ? getDbCategoriesForGroup(selectedGroup).join(',')
        : undefined;
      const data = await searchDocuments(query, cat, 20);
      setSearchResults(data.items);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // 查看文檔詳情
  async function handleViewDoc(docId: number) {
    setView({ mode: 'detail', docId });
    setLoading(true);
    setError(null);
    try {
      const data = await getDocumentContent(docId);
      setDetailDoc(data.doc);
      setDetailContent(data.content);
      if (data.error && !data.content) {
        setError(data.error);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // 返回列表
  function handleBack() {
    setView({ mode: 'browse' });
    setDetailDoc(null);
    setDetailContent(null);
    setError(null);
  }

  // 分類群組切換
  function handleGroupChange(groupKey: string | undefined) {
    setSelectedGroup(groupKey);
    setPage(1);
    if (!groupKey) {
      loadBrowse(undefined, 1);
    } else {
      // 多個 DB categories 以逗號分隔傳給 API
      const dbCats = getDbCategoriesForGroup(groupKey);
      loadBrowse(dbCats[0], 1); // 單 category 篩選（後端目前僅支援單一值）
    }
  }

  // 分頁
  function handlePageChange(p: number) {
    setPage(p);
    const cat = selectedGroup
      ? getDbCategoriesForGroup(selectedGroup)[0]
      : undefined;
    loadBrowse(cat, p);
  }

  // 搜尋 Enter
  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      const q = searchInput.trim();
      if (q.length >= 2) handleSearch(q);
    }
  }

  // 清除搜尋
  function handleClearSearch() {
    setSearchInput('');
    setView({ mode: 'browse' });
    setSearchResults([]);
    const cat = selectedGroup
      ? getDbCategoriesForGroup(selectedGroup)[0]
      : undefined;
    loadBrowse(cat, 1);
  }

  // VS Code 開啟（使用 URI scheme）
  function handleOpenInVsCode(docPath: string) {
    // docPath 是相對路徑，需要組合專案根目錄
    // 後端 config.projectRoot 的值在前端不可用，用 window.location 推斷
    // 直接使用 vscode:// 協議，路徑部分用原始相對路徑即可
    const encodedPath = encodeURIComponent(docPath);
    window.open(`vscode://file/${encodedPath}`, '_self');
  }

  const totalPages = browseData ? Math.ceil(browseData.total / browseData.pageSize) : 0;
  const searchQuery = view.mode === 'search' ? view.query : '';

  // 分類群組名稱映射
  const groupLabelMap: Record<string, string> = {
    requirements: t.documents.catRequirements,
    technical: t.documents.catTechnical,
    analysis: t.documents.catAnalysis,
    knowledge: t.documents.catKnowledge,
    workflow: t.documents.catWorkflow,
    other: t.documents.catOther,
  };

  // ── 文檔詳情 ──
  if (view.mode === 'detail') {
    return (
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, color: 'var(--dvc-text-primary)' }}>
          {t.documents.title}
        </h1>
        <div className="doc-detail">
          <div className="doc-detail__toolbar">
            <button className="doc-detail__back" onClick={handleBack}>
              ← {t.documents.backToList}
            </button>
            {detailDoc && (
              <button
                className="doc-vscodebtn"
                onClick={() => handleOpenInVsCode(detailDoc.path)}
                title={t.documents.openInVsCode}
              >
                <span className="doc-vscodebtn__icon">⟨/⟩</span>
                {t.documents.openInVsCode}
              </button>
            )}
          </div>
          {loading ? (
            <div className="doc-status">{t.common.search}…</div>
          ) : error ? (
            <div className="doc-status" style={{ color: 'var(--dvc-status-error)' }}>
              {error}
            </div>
          ) : (
            <>
              {detailDoc && (
                <>
                  <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--dvc-text-primary)', marginBottom: 8 }}>
                    {detailDoc.title}
                  </h2>
                  <div className="doc-detail__meta">
                    {detailDoc.category && (
                      <span className="doc-item__badge">
                        {groupLabelMap[getGroupForCategory(detailDoc.category)] ?? detailDoc.category}
                      </span>
                    )}
                    <span>{detailDoc.chunk_count} {t.documents.chunks}</span>
                    <span>{detailDoc.total_tokens.toLocaleString()} {t.documents.tokens}</span>
                    <span style={{ fontFamily: 'var(--dvc-font-mono)' }}>{detailDoc.path}</span>
                  </div>
                </>
              )}
              {detailContent ? (
                <pre className="doc-detail__content">{detailContent}</pre>
              ) : (
                <div className="doc-status">{t.common.noData}</div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ── 列表 / 搜尋 ──
  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, color: 'var(--dvc-text-primary)' }}>
        {t.documents.title}
      </h1>

      {/* 分類群組卡片 */}
      {groupStats.length > 0 && (
        <div className="doc-group-cards">
          <button
            className={`doc-group-card ${!selectedGroup ? 'doc-group-card--active' : ''}`}
            onClick={() => handleGroupChange(undefined)}
          >
            <span className="doc-group-card__icon">📚</span>
            <span className="doc-group-card__label">{t.documents.allCategories}</span>
            <span className="doc-group-card__count">
              {browseData?.total ?? 0}
            </span>
          </button>
          {groupStats.map((g) => (
            <button
              key={g.key}
              className={`doc-group-card ${selectedGroup === g.key ? 'doc-group-card--active' : ''}`}
              onClick={() => handleGroupChange(g.key)}
            >
              <span className="doc-group-card__icon">{g.icon}</span>
              <span className="doc-group-card__label">{groupLabelMap[g.key] ?? g.key}</span>
              <span className="doc-group-card__count">{g.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* 搜尋列 */}
      <div className="doc-search-bar">
        <input
          className="doc-search-input"
          type="text"
          placeholder={t.documents.searchPlaceholder}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
        <button
          className="doc-search-btn"
          onClick={() => searchInput.trim().length >= 2 && handleSearch(searchInput.trim())}
        >
          {t.common.search}
        </button>
        {view.mode === 'search' && (
          <button className="doc-chip" onClick={handleClearSearch}>
            {t.common.close}
          </button>
        )}
      </div>

      {error && (
        <div style={{ color: 'var(--dvc-status-error)', marginBottom: 12, fontSize: 13 }}>
          {t.documents.loadError}: {error}
        </div>
      )}

      {loading ? (
        <div className="doc-status">載入中…</div>
      ) : view.mode === 'search' ? (
        /* ── 搜尋結果（Chunk 卡片 + 高亮）── */
        <>
          <div className="doc-total-bar">
            <span>{t.documents.searchResults.replace('{count}', String(searchResults.length))}</span>
          </div>
          {searchResults.length === 0 ? (
            <div className="doc-status">{t.documents.noResults}</div>
          ) : (
            <div className="doc-list">
              {searchResults.map((chunk) => (
                <div key={chunk.id} className="doc-chunk">
                  <div className="doc-chunk__heading">
                    {highlightText(chunk.heading_path, searchQuery)}
                  </div>
                  <div className="doc-chunk__content">
                    {highlightText(chunk.content, searchQuery)}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--dvc-text-muted)' }}>
                    {chunk.token_count} {t.documents.tokens}
                    {chunk.score != null && ` | score: ${chunk.score.toFixed(2)}`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        /* ── 文檔目錄瀏覽 ── */
        <>
          <div className="doc-total-bar">
            <span>{t.documents.totalDocs.replace('{count}', String(browseData?.total ?? 0))}</span>
          </div>
          {!browseData || browseData.items.length === 0 ? (
            <div className="doc-status">{t.documents.noResults}</div>
          ) : (
            <>
              <div className="doc-list">
                {browseData.items.map((doc) => (
                  <div key={doc.id} className="doc-item" onClick={() => handleViewDoc(doc.id)}>
                    <div>
                      <div className="doc-item__title">{doc.title}</div>
                      <div className="doc-item__path">{doc.path}</div>
                    </div>
                    {doc.category && (
                      <span className="doc-item__badge">
                        {groupLabelMap[getGroupForCategory(doc.category)] ?? doc.category}
                      </span>
                    )}
                    <span className="doc-item__stat">
                      {doc.chunk_count} {t.documents.chunks}
                    </span>
                    <span className="doc-item__stat">
                      {doc.total_tokens.toLocaleString()} {t.documents.tokens}
                    </span>
                  </div>
                ))}
              </div>

              {/* 分頁 */}
              {totalPages > 1 && (
                <div className="doc-pagination">
                  <button disabled={page <= 1} onClick={() => handlePageChange(page - 1)}>
                    ←
                  </button>
                  <span className="doc-pagination__info">
                    {page} / {totalPages}
                  </span>
                  <button disabled={page >= totalPages} onClick={() => handlePageChange(page + 1)}>
                    →
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
