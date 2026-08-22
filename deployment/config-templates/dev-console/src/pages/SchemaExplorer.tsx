// ============================================================
// SchemaExplorer.tsx — DB Schema 瀏覽頁
// Phase 4+5: 表結構 + 資料列瀏覽 + i18n + loading/empty/error state
// ============================================================
import { useState, useEffect } from 'react';
import {
  fetchTables,
  fetchTableDetail,
  fetchTableRows,
  type TableInfo,
  type TableDetail,
  type TableRows,
} from '../services/schemaApi.js';
import SearchBar from '../components/SearchBar.js';
import Pagination from '../components/Pagination.js';
import { useI18n } from '../i18n/I18nProvider.js';
import '../styles/schema.css';

export default function SchemaExplorer() {
  const { t } = useI18n();
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<TableDetail | null>(null);
  const [rowData, setRowData] = useState<TableRows | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setTablesLoading(true);
    setTablesError(null);
    fetchTables()
      .then(setTables)
      .catch((err) => {
        console.error(err);
        setTablesError(err?.message ?? 'Failed to load tables');
      })
      .finally(() => setTablesLoading(false));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    Promise.all([
      fetchTableDetail(selected),
      fetchTableRows(selected, 1, 20),
    ])
      .then(([d, r]) => {
        setDetail(d);
        setRowData(r);
        setPage(1);
      })
      .catch((err) => {
        console.error(err);
        setTablesError(err?.message ?? 'Failed to load table detail');
      })
      .finally(() => setLoading(false));
  }, [selected]);

  const handlePageChange = (p: number) => {
    if (!selected) return;
    setPage(p);
    fetchTableRows(selected, p, 20).then(setRowData).catch(console.error);
  };

  const filtered = tables.filter(t =>
    t.name.toLowerCase().includes(filter.toLowerCase())
  );

  const totalRows = tables.reduce((sum, t) => sum + t.row_count, 0);

  return (
    <div className="schema-page">
      <div className="schema-page__header">
        <h1>{t.schema.title}</h1>
        <div className="schema-page__stats">
          {tablesLoading ? (
            <span className="schema-page__stat">{t.schema.loading}</span>
          ) : (
            <>
              <span className="schema-page__stat">{tables.length} {t.schema.tables}</span>
              <span className="schema-page__stat">{totalRows.toLocaleString()} {t.schema.totalRows}</span>
            </>
          )}
        </div>
      </div>

      {tablesError && (
        <div className="schema-page__error-toast" role="alert">
          {tablesError}
        </div>
      )}

      <div className="schema-page__layout">
        <aside className="schema-page__sidebar">
          <SearchBar onSearch={setFilter} placeholder={t.schema.filterPlaceholder} />
          {tablesLoading ? (
            <div className="schema-page__sidebar-loading">{t.schema.loading}</div>
          ) : filtered.length === 0 ? (
            <div className="schema-page__sidebar-empty">{t.common.noData}</div>
          ) : (
            <ul className="schema-page__table-list">
              {filtered.map(t => (
                <li
                  key={t.name}
                  className={`schema-page__table-item ${selected === t.name ? 'schema-page__table-item--active' : ''}`}
                  onClick={() => setSelected(t.name)}
                >
                  <span className="schema-page__table-name">{t.name}</span>
                  <span className="schema-page__table-count">{t.row_count.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main className="schema-page__content">
          {!selected && (
            <div className="schema-page__empty">{t.schema.selectPrompt}</div>
          )}

          {selected && loading && (
            <div className="schema-page__empty">{t.schema.loading}</div>
          )}

          {selected && !loading && detail && (
            <>
              <h2>
                {detail.name}
                <span className="schema-page__row-badge">
                  {detail.row_count.toLocaleString()} {t.schema.rows}
                </span>
              </h2>

              <section className="schema-page__columns">
                <h3>{t.schema.columns} ({detail.columns.length})</h3>
                <table className="schema-page__col-table">
                  <thead>
                    <tr>
                      <th>{t.schema.colName}</th>
                      <th>{t.schema.colType}</th>
                      <th>{t.schema.colPk}</th>
                      <th>{t.schema.colNotNull}</th>
                      <th>{t.schema.colDefault}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.columns.map(c => (
                      <tr key={c.cid}>
                        <td className="schema-page__col-name">{c.name}</td>
                        <td>{c.type || 'ANY'}</td>
                        <td>{c.pk ? '🔑' : ''}</td>
                        <td>{c.notnull ? 'YES' : ''}</td>
                        <td>{c.dflt_value ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              {detail.indexes.length > 0 && (
                <section className="schema-page__indexes">
                  <h3>{t.schema.indexes} ({detail.indexes.length})</h3>
                  <ul>
                    {detail.indexes.map((idx, i) => (
                      <li key={i}>
                        <code>{idx.name}</code>
                        {idx.unique ? (
                          <span className="schema-page__badge schema-page__badge--unique">UNIQUE</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {rowData && (
                <section className="schema-page__rows">
                  <h3>{t.schema.data}</h3>
                  {rowData.rows.length === 0 ? (
                    <div className="schema-page__empty">{t.schema.noData}</div>
                  ) : (
                    <>
                      <div className="schema-page__table-wrapper">
                        <table className="schema-page__data-table">
                          <thead>
                            <tr>
                              {Object.keys(rowData.rows[0]).map(k => (
                                <th key={k}>{k}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rowData.rows.map((row, i) => (
                              <tr key={i}>
                                {Object.values(row).map((v, j) => (
                                  <td key={j} className="schema-page__cell">
                                    {v === null ? (
                                      <em>null</em>
                                    ) : typeof v === 'object' ? (
                                      JSON.stringify(v)
                                    ) : (
                                      String(v).slice(0, 120)
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <Pagination
                        page={page}
                        pageSize={20}
                        total={rowData.total}
                        onPageChange={handlePageChange}
                      />
                    </>
                  )}
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
