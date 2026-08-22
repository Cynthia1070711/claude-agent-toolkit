// ============================================================
// StoryDetail.tsx — Story 詳情頁面（DB-first 結構化卡片佈局）
// DVS-06 AC-6 + DVS-07 UX 升級
// ============================================================
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { StructuredStoryDetail } from '../types/stories.js';
import { fetchStoryDetail } from '../services/storyApi.js';
import { useI18n } from '../i18n/I18nProvider.js';
import 'highlight.js/styles/github-dark.css';
import '../styles/story-detail.css';

/** 狀態 → CSS class 映射 */
function getStatusClass(status: string | null): string {
  switch (status) {
    case 'backlog': return 'status--backlog';
    case 'ready-for-dev': return 'status--ready';
    case 'in-progress': return 'status--dev';
    case 'review': return 'status--review';
    case 'done': return 'status--done';
    default: return 'status--backlog';
  }
}

function getStatusLabel(status: string | null, t: ReturnType<typeof useI18n>['t']): string {
  switch (status) {
    case 'backlog': return t.kanban.backlog;
    case 'ready-for-dev': return t.kanban.readyForDev;
    case 'in-progress': return t.kanban.inProgress;
    case 'review': return t.kanban.review;
    case 'done': return t.kanban.done;
    default: return status ?? '—';
  }
}

/** 安全解析 JSON 陣列 */
function tryParseArray(text: string | null): unknown[] | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** 格式化日期時間（含時分秒）*/
function fmtDate(dt: string | null): string {
  if (!dt) return '—';
  // ISO 8601: 2026-03-14T10:30:00+08:00 → 2026-03-14 10:30:00
  const match = dt.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
  if (match) return `${match[1]} ${match[2]}`;
  // fallback: 只有日期部分
  return dt.split('T')[0] ?? dt;
}

export default function StoryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();

  const [detail, setDetail] = useState<StructuredStoryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);

    fetchStoryDetail(id)
      .then(data => setDetail(data))
      .catch(err => setError(err instanceof Error ? err.message : t.storyDetail.loadFailed))
      .finally(() => setLoading(false));
  }, [id, t]);

  return (
    <div className="dvc-story-detail">
      {/* ── 頂部導航 ── */}
      <div className="dvc-story-topbar">
        <button
          className="dvc-story-back-btn"
          onClick={() => navigate('/stories')}
          type="button"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 12L6 8l4-4" />
          </svg>
          {t.storyDetail.backToKanban}
        </button>
        {detail && (
          <div className="dvc-story-breadcrumb">
            <span className="dvc-story-breadcrumb-epic">{detail.epic_id}</span>
            <span className="dvc-story-breadcrumb-sep">/</span>
            <span className="dvc-story-breadcrumb-id">{detail.story_id}</span>
          </div>
        )}
      </div>

      {loading && <div className="dvc-story-loading">{t.storyDetail.loading}</div>}

      {!loading && error && (
        <div className="dvc-story-error">
          <div className="dvc-story-error-text">{error}</div>
        </div>
      )}

      {!loading && detail && (
        <div className="dvc-story-layout">
          {/* ═══ 左側 Sidebar ═══ */}
          <aside className="dvc-story-sidebar">
            {/* 標題卡 */}
            <div className="dvc-story-header-card">
              <div className="dvc-story-header-id">{detail.story_id}</div>
              <h1 className="dvc-story-header-title">{detail.title}</h1>
            </div>

            {/* 狀態卡 */}
            <div className="dvc-story-info-card">
              <div className="dvc-story-info-label">{t.storyDetail.statusLabel}</div>
              <div className={`dvc-story-status-pill ${getStatusClass(detail.status)}`}>
                <span className="dvc-story-status-dot" />
                {getStatusLabel(detail.status, t)}
              </div>
            </div>

            {/* 屬性表 */}
            <div className="dvc-story-props-card">
              {detail.complexity && (
                <div className="dvc-story-prop-row">
                  <span className="dvc-story-prop-label">{t.storyDetail.complexity}</span>
                  <span className={`dvc-story-prop-badge complexity--${detail.complexity}`}>{detail.complexity}</span>
                </div>
              )}
              {detail.priority && (
                <div className="dvc-story-prop-row">
                  <span className="dvc-story-prop-label">{t.storyDetail.priorityLabel}</span>
                  <span className={`dvc-story-prop-badge priority--${detail.priority}`}>{detail.priority}</span>
                </div>
              )}
              {detail.story_type && (
                <div className="dvc-story-prop-row">
                  <span className="dvc-story-prop-label">{t.storyDetail.typeLabel}</span>
                  <span className="dvc-story-prop-value">{detail.story_type}</span>
                </div>
              )}
              {detail.epic_id && (
                <div className="dvc-story-prop-row">
                  <span className="dvc-story-prop-label">Epic</span>
                  <span className="dvc-story-prop-value">{detail.epic_id}</span>
                </div>
              )}
              {detail.dependencies && (
                <div className="dvc-story-prop-row">
                  <span className="dvc-story-prop-label">{t.storyDetail.depsLabel}</span>
                  <span className="dvc-story-prop-value">{detail.dependencies}</span>
                </div>
              )}
              {detail.tags && (
                <div className="dvc-story-prop-row">
                  <span className="dvc-story-prop-label">Tags</span>
                  <span className="dvc-story-prop-value">{detail.tags}</span>
                </div>
              )}
            </div>

            {/* 階段時間軸卡（Agent + 時間整合）*/}
            <div className="dvc-story-timeline-card">
              <div className="dvc-story-info-label">{t.storyDetail.phaseTimeline}</div>

              {/* Story 建立日期 */}
              {detail.created_at && (
                <div className="dvc-story-phase-footer">
                  <span className="dvc-story-phase-time-label">{t.storyDetail.createdAt}</span>
                  <span className="dvc-story-phase-time-value">{fmtDate(detail.created_at)}</span>
                </div>
              )}

              {/* Create 階段 */}
              {(detail.create_agent || detail.create_started_at) && (
                <div className="dvc-story-phase">
                  <div className="dvc-story-phase-header">
                    <span className="dvc-story-phase-name">Create</span>
                    {detail.create_agent && (
                      <span className="dvc-story-agent-badge">{detail.create_agent}</span>
                    )}
                  </div>
                  <div className="dvc-story-phase-times">
                    {detail.create_started_at && (
                      <div className="dvc-story-phase-time">
                        <span className="dvc-story-phase-time-label">{t.storyDetail.startedAt}</span>
                        <span className="dvc-story-phase-time-value">{fmtDate(detail.create_started_at)}</span>
                      </div>
                    )}
                    {detail.create_completed_at && (
                      <div className="dvc-story-phase-time">
                        <span className="dvc-story-phase-time-label">{t.storyDetail.completedAt}</span>
                        <span className="dvc-story-phase-time-value">{fmtDate(detail.create_completed_at)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Dev 階段 */}
              {(detail.dev_agent || detail.started_at) && (
                <div className="dvc-story-phase">
                  <div className="dvc-story-phase-header">
                    <span className="dvc-story-phase-name">Dev</span>
                    {detail.dev_agent && (
                      <span className="dvc-story-agent-badge">{detail.dev_agent}</span>
                    )}
                  </div>
                  <div className="dvc-story-phase-times">
                    {detail.started_at && (
                      <div className="dvc-story-phase-time">
                        <span className="dvc-story-phase-time-label">{t.storyDetail.startedAt}</span>
                        <span className="dvc-story-phase-time-value">{fmtDate(detail.started_at)}</span>
                      </div>
                    )}
                    {detail.completed_at && (
                      <div className="dvc-story-phase-time">
                        <span className="dvc-story-phase-time-label">{t.storyDetail.completedAt}</span>
                        <span className="dvc-story-phase-time-value">{fmtDate(detail.completed_at)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Review 階段 */}
              {(detail.review_agent || detail.review_started_at || detail.review_completed_at) && (
                <div className="dvc-story-phase">
                  <div className="dvc-story-phase-header">
                    <span className="dvc-story-phase-name">Review</span>
                    {detail.review_agent && (
                      <span className="dvc-story-agent-badge">{detail.review_agent}</span>
                    )}
                  </div>
                  <div className="dvc-story-phase-times">
                    {detail.review_started_at && (
                      <div className="dvc-story-phase-time">
                        <span className="dvc-story-phase-time-label">{t.storyDetail.startedAt}</span>
                        <span className="dvc-story-phase-time-value">{fmtDate(detail.review_started_at)}</span>
                      </div>
                    )}
                    {detail.review_completed_at && (
                      <div className="dvc-story-phase-time">
                        <span className="dvc-story-phase-time-label">{t.storyDetail.completedAt}</span>
                        <span className="dvc-story-phase-time-value">{fmtDate(detail.review_completed_at)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 最後更新 */}
              {detail.updated_at && (
                <div className="dvc-story-phase-footer">
                  <span className="dvc-story-phase-time-label">{t.storyDetail.updatedAt}</span>
                  <span className="dvc-story-phase-time-value">{fmtDate(detail.updated_at)}</span>
                </div>
              )}
            </div>

            {/* CR 結果卡 */}
            {detail.cr_score !== null && (
              <div className="dvc-story-cr-card">
                <div className="dvc-story-cr-score">
                  <span className="dvc-story-cr-label">CR Score</span>
                  <span className="dvc-story-cr-value">{detail.cr_score}</span>
                </div>
                {detail.test_count !== null && (
                  <div className="dvc-story-cr-row">
                    <span>Tests</span>
                    <span>{detail.test_count}</span>
                  </div>
                )}
                {detail.cr_issues_total !== null && (
                  <div className="dvc-story-cr-row">
                    <span>Issues</span>
                    <span>{detail.cr_issues_fixed ?? 0} fixed / {detail.cr_issues_deferred ?? 0} deferred / {detail.cr_issues_total} total</span>
                  </div>
                )}
              </div>
            )}

            {/* SDD Spec 卡 */}
            {detail.sdd_spec && (
              <div className="dvc-story-spec-card">
                <div className="dvc-story-spec-title">{t.storyDetail.sddSpec}</div>
                <div className="dvc-story-spec-path">{detail.sdd_spec}</div>
              </div>
            )}
          </aside>

          {/* ═══ 右側主內容 ═══ 每個區塊根據 section_sources 標記 'db' / 'md' */}
          <main className="dvc-story-content">
            {detail.user_story && (
              <ContentCard
                title={t.storyDetail.sectionStory}
                content={detail.user_story}
                source={detail.section_sources?.user_story}
              />
            )}
            {detail.background && (
              <ContentCard
                title={t.storyDetail.sectionBackground}
                content={detail.background}
                source={detail.section_sources?.background}
              />
            )}
            {detail.acceptance_criteria && (
              <ACCard
                title={t.storyDetail.sectionAC}
                raw={detail.acceptance_criteria}
                source={detail.section_sources?.acceptance_criteria}
              />
            )}
            {detail.tasks && (
              <TasksCard
                title={t.storyDetail.sectionTasks}
                raw={detail.tasks}
                source={detail.section_sources?.tasks}
              />
            )}
            {detail.pipeline_notes && (
              <ContentCard title="⚠️ Pipeline Notes (READ-ONLY)" content={detail.pipeline_notes} />
            )}
            {detail.dev_notes && (
              <ContentCard
                title={t.storyDetail.sectionDevNotes}
                content={detail.dev_notes}
                source={detail.section_sources?.dev_notes}
              />
            )}
            {detail.implementation_approach && (
              <ContentCard
                title={t.storyDetail.sectionApproach}
                content={detail.implementation_approach}
                source={detail.section_sources?.implementation_approach}
              />
            )}
            {detail.testing_strategy && (
              <ContentCard
                title={t.storyDetail.sectionTesting}
                content={detail.testing_strategy}
                source={detail.section_sources?.testing_strategy}
              />
            )}
            {detail.required_skills && (
              <ContentCard
                title={t.storyDetail.sectionSkills}
                content={detail.required_skills}
                source={detail.section_sources?.required_skills}
              />
            )}
            {(detail.file_list || detail.affected_files) && (
              <ContentCard
                title={t.storyDetail.sectionFiles}
                content={detail.file_list ?? detail.affected_files ?? ''}
                mono
                source={detail.section_sources?.file_list}
              />
            )}
            {detail.cr_summary && (
              <ContentCard title={t.storyDetail.sectionCR} content={detail.cr_summary} />
            )}
            {detail.report_content && (
              <div className="dvc-story-section-card">
                <div className="dvc-story-section-title">
                  📄 審查報告
                  {detail.report_path && (
                    <span className="dvc-story-report-path" style={{ fontSize: '0.75rem', fontWeight: 400, marginLeft: '0.5rem', opacity: 0.6 }}>
                      {detail.report_path}
                    </span>
                  )}
                </div>
                <div className="dvc-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                    {detail.report_content}
                  </ReactMarkdown>
                </div>
              </div>
            )}
            {/* file-based raw markdown fallback — 僅當所有結構化欄位皆空時顯示 */}
            {!detail.user_story && !detail.acceptance_criteria && !detail.tasks &&
             detail.source_type === 'file' && detail.markdown_content && (
              <div className="dvc-markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                  {detail.markdown_content}
                </ReactMarkdown>
              </div>
            )}
            {!detail.user_story && !detail.acceptance_criteria && !detail.tasks && !detail.markdown_content && (
              <div className="dvc-story-empty">
                <div>{t.storyDetail.noContent}</div>
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}

// ── 資料來源 Badge ──
// 'md' → 顯示灰色 [md] 標記提醒資料來自 .md fallback (DB 該欄位為空)
// 'db' → 不顯示(預設 DB 為 primary source)
// 'empty' → 不顯示(caller 應該略過 render)
function SourceBadge({ source }: { source?: 'db' | 'md' | 'empty' }) {
  if (source !== 'md') return null;
  return (
    <span
      className="dvc-section-source-badge"
      title="此區塊資料從 .md 檔案讀取 — DB 對應欄位為空或 NULL (DB-first fallback)"
      style={{
        marginLeft: '0.5rem',
        fontSize: '0.65rem',
        fontWeight: 600,
        padding: '0.1rem 0.35rem',
        borderRadius: '3px',
        background: 'rgba(148, 163, 184, 0.2)',
        color: '#94a3b8',
        border: '1px solid rgba(148, 163, 184, 0.4)',
        textTransform: 'uppercase',
        verticalAlign: 'middle',
        letterSpacing: '0.02em',
      }}
    >
      md
    </span>
  );
}

// ── 通用內容卡片 ──
function ContentCard({
  title,
  content,
  mono,
  source,
}: {
  title: string;
  content: string;
  mono?: boolean;
  source?: 'db' | 'md' | 'empty';
}) {
  return (
    <section className="dvc-section-card">
      <h2 className="dvc-section-title">
        {title}
        <SourceBadge source={source} />
      </h2>
      <div className={`dvc-section-body${mono ? ' is-mono' : ''}`}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
          {content}
        </ReactMarkdown>
      </div>
    </section>
  );
}

// ── AC 卡片（結構化解析）──
function ACCard({ title, raw, source }: { title: string; raw: string; source?: 'db' | 'md' | 'empty' }) {
  const items = tryParseArray(raw);
  return (
    <section className="dvc-section-card">
      <h2 className="dvc-section-title">
        {title}
        <SourceBadge source={source} />
      </h2>
      <div className="dvc-section-body">
        {items ? (
          <div className="dvc-ac-list">
            {items.map((ac, i) => {
              if (typeof ac === 'string') {
                return <div key={i} className="dvc-ac-item"><ReactMarkdown remarkPlugins={[remarkGfm]}>{ac}</ReactMarkdown></div>;
              }
              const obj = ac as Record<string, string>;
              return (
                <div key={i} className="dvc-ac-item">
                  <div className="dvc-ac-header">
                    {obj.id && <span className="dvc-ac-id">{obj.id}</span>}
                    <span className="dvc-ac-title">{obj.title ?? obj.description ?? ''}</span>
                    {obj.verifies && <span className="dvc-ac-verify">[{obj.verifies}]</span>}
                  </div>
                  {(obj.given || obj.when || obj.then) && (
                    <div className="dvc-ac-gwt">
                      {obj.given && <div><strong>Given</strong> {obj.given}</div>}
                      {obj.when && <div><strong>When</strong> {obj.when}</div>}
                      {obj.then && <div><strong>Then</strong> {obj.then}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{raw}</ReactMarkdown>
        )}
      </div>
    </section>
  );
}

// ── Tasks 卡片（結構化解析）──
function TasksCard({ title, raw, source }: { title: string; raw: string; source?: 'db' | 'md' | 'empty' }) {
  const items = tryParseArray(raw);
  return (
    <section className="dvc-section-card">
      <h2 className="dvc-section-title">
        {title}
        <SourceBadge source={source} />
      </h2>
      <div className="dvc-section-body">
        {items ? (
          <ul className="dvc-task-list">
            {items.map((t, i) => {
              const text = typeof t === 'string' ? t : (t as Record<string, string>).title ?? JSON.stringify(t);
              return <li key={i} className="dvc-task-item">{text}</li>;
            })}
          </ul>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{raw}</ReactMarkdown>
        )}
      </div>
    </section>
  );
}
