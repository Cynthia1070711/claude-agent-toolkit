// ============================================================
// Channel.tsx — /channel 頁面主體（ccb-3-devconsole-channel-page）
// URL 為單一真值來源（tab/channel/q/category/must_read/page/days/thread，8 參數，03 章 §一）。
// APG tablist 手動啟動（方向鍵只移焦點，Enter/Space 才切換 — 對齊 AC9，刻意偏離 Workers.tsx 自動啟動）。
// ============================================================
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  fetchChannelStats,
  fetchChannelBoards,
  fetchChannelThreads,
  fetchChannelSearch,
  fetchChannelReadMatrix,
} from '../services/channelApi.js';
import type { ChannelStats, ChannelBoard, ThreadListResult, ReadMatrixResult } from '../types/channel.js';
import type { ChannelTabId } from '../types/channel.js';
import { usePolling } from '../hooks/usePolling.js';
import { useSilentRetryError } from '../hooks/useSilentRetryError.js';
import BoardCard from '../components/channel/BoardCard.js';
import { ChannelFilterChips, AppliedFilterChips } from '../components/channel/ChannelChips.js';
import ThreadList from '../components/channel/ThreadList.js';
import ThreadTimeline from '../components/channel/ThreadTimeline.js';
import ReadMatrix from '../components/channel/ReadMatrix.js';
import SearchBar from '../components/SearchBar.js';
import Pagination from '../components/Pagination.js';
import '../styles/channel.css';

const POLL_MS = 30000;
const TABS: { id: ChannelTabId; label: string }[] = [
  { id: 'live', label: '通話中' },
  { id: 'archive', label: '封存查詢' },
  { id: 'matrix', label: '簽收矩陣' },
];

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default function Channel() {
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get('tab');
  const tab: ChannelTabId = tabParam === 'archive' || tabParam === 'matrix' ? tabParam : 'live';
  const channel = searchParams.get('channel') ?? '';
  const q = searchParams.get('q') ?? '';
  const category = searchParams.get('category') ?? '';
  const mustRead = searchParams.get('must_read') === '1';
  const page = Math.max(Number(searchParams.get('page') ?? '1') || 1, 1);
  const days = Math.max(Number(searchParams.get('days') ?? '7') || 7, 1);
  const threadId = searchParams.get('thread');

  const [stats, setStats] = useState<ChannelStats | null>(null);
  const [boards, setBoards] = useState<ChannelBoard[]>([]);
  const [liveResult, setLiveResult] = useState<ThreadListResult | null>(null);
  const [archiveResult, setArchiveResult] = useState<ThreadListResult | null>(null);
  const [matrixResult, setMatrixResult] = useState<ReadMatrixResult | null>(null);
  const [auto, setAuto] = useState(true);
  const [highlightBoardId, setHighlightBoardId] = useState<string | null>(null);

  const boardsErr = useSilentRetryError();
  const tabDataErr = useSilentRetryError();

  const loadStats = useCallback(async () => {
    try {
      setStats(await fetchChannelStats());
    } catch {
      // 統計失敗不擴散至其餘區塊，KPI chip 自然顯示 0（既有預設）
    }
  }, []);

  const loadBoards = useCallback(async () => {
    try {
      const r = await fetchChannelBoards();
      setBoards(r.items);
      boardsErr.reportSuccess();
    } catch (err) {
      boardsErr.reportFailure(describeError(err));
    }
  }, [boardsErr]);

  const loadTabData = useCallback(async () => {
    try {
      if (tab === 'live') {
        // 帶 page/pageSize：開放話題實測 44 筆 > 單頁量，不分頁會讓超出首頁的話題在 UI 無路徑可達（BR-013/AC2）。
        setLiveResult(
          await fetchChannelThreads({ state: 'open', channel: channel || undefined, category: category || undefined, must_read: mustRead || undefined, page, pageSize: 50 }),
        );
      } else if (tab === 'archive') {
        setArchiveResult(
          await fetchChannelSearch({ q, channel: channel || undefined, category: category || undefined, must_read: mustRead || undefined, page, pageSize: 50 }),
        );
      } else {
        setMatrixResult(await fetchChannelReadMatrix({ days, limit: 200, channel: channel || undefined, category: category || undefined }));
      }
      tabDataErr.reportSuccess();
    } catch (err) {
      tabDataErr.reportFailure(describeError(err));
    }
  }, [tab, channel, category, mustRead, q, page, days, tabDataErr]);

  const loadAll = useCallback(async () => {
    await Promise.allSettled([loadStats(), loadBoards(), loadTabData()]);
  }, [loadStats, loadBoards, loadTabData]);

  // BR-005/BR-006：page>1 時自動暫停輪詢，回 page=1 自動恢復。
  // 條件不再綁定 tab —— Tab1 自本次 CR 起同樣分頁，append-only 資料與 offset 分頁的位移衝突對兩個分頁一致成立。
  const pollingEnabled = auto && page <= 1 && !threadId;
  const { fetchedAt, refresh } = usePolling(loadAll, { intervalMs: POLL_MS, enabled: pollingEnabled });

  function updateParams(updates: Record<string, string | null>, resetPage = true) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
      }
      if (resetPage) next.set('page', '1');
      return next;
    });
  }

  // ── APG tablist：roving tabindex + Home/End + 手動啟動（Enter/Space 才切換）──
  const [focusedTabId, setFocusedTabId] = useState<ChannelTabId>(tab);
  const tabRefs = useRef<Partial<Record<ChannelTabId, HTMLButtonElement | null>>>({});
  useEffect(() => { setFocusedTabId(tab); }, [tab]);

  function activateTab(id: ChannelTabId) {
    setFocusedTabId(id);
    updateParams({ tab: id });
  }

  function handleTabKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activateTab(TABS[index]!.id);
      return;
    }
    let nextIndex: number | null = null;
    if (e.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = TABS.length - 1;
    if (nextIndex === null) return;
    e.preventDefault();
    const nextId = TABS[nextIndex]!.id;
    setFocusedTabId(nextId);
    tabRefs.current[nextId]?.focus();
  }

  function selectThread(id: string) {
    updateParams({ thread: id }, false);
  }
  function backFromThread() {
    updateParams({ thread: null }, false);
  }
  function scrollToBoard(boardId: string) {
    document.getElementById(`board-card-${boardId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightBoardId(boardId);
    setTimeout(() => setHighlightBoardId(null), 2000);
  }

  const openTabLabel = stats ? `${TABS[0]!.label} ${stats.open_threads}` : TABS[0]!.label;

  // 看板區在時間軸檢視同樣渲染 —— MsgBlock 的 board_id ref chip 只在時間軸出現，
  // 若該檢視不掛任何 <BoardCard>，scrollToBoard 的 getElementById 恆為 null，
  // BR-020/AC7「捲至看板卡 + 2s 高亮」結構上不可能成立（BR-010 亦要求看板常駐）。
  const boardsRegion = boardsErr.error ? (
    <div className="channel-block-error">
      <p>看板載入失敗:{boardsErr.error}</p>
      <button type="button" onClick={loadBoards}>重試</button>
    </div>
  ) : (
    <div className="channel-boards-row">
      {boards.map((b) => (
        <BoardCard key={b.board_id} board={b} highlighted={highlightBoardId === b.board_id} />
      ))}
    </div>
  );

  if (threadId) {
    return (
      <div className="channel-page">
        {boardsRegion}
        <ThreadTimeline threadId={threadId} onBack={backFromThread} onNavigateBoard={scrollToBoard} onNavigateThread={selectThread} />
        <McpFallbackNotice />
      </div>
    );
  }

  return (
    <div className="channel-page">
      <div className="channel-page__header">
        <h1>💬 頻道</h1>
        <div className="channel-page__poll-controls">
          {fetchedAt && <span className="channel-page__fetched-at">最後更新 {fetchedAt}</span>}
          {tab === 'archive' && page > 1 && <span className="channel-poll-paused-chip">翻頁中已暫停 ▶</span>}
          <label className="channel-page__auto-toggle">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            自動 {POLL_MS / 1000}s
          </label>
          <button type="button" onClick={refresh}>🔄 重新整理</button>
        </div>
      </div>

      {boardsRegion}

      <ChannelFilterChips activeChannel={channel} onChannelChange={(c) => updateParams({ channel: c || null })} stats={stats} />

      <div role="tablist" aria-label="頻道分頁" className="channel-tablist">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => { tabRefs.current[t.id] = el; }}
            role="tab"
            id={`channel-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`channel-panel-${t.id}`}
            tabIndex={focusedTabId === t.id ? 0 : -1}
            className="channel-tab"
            onClick={() => activateTab(t.id)}
            onKeyDown={(e) => handleTabKeyDown(e, i)}
          >
            {t.id === 'live' ? openTabLabel : t.label}
          </button>
        ))}
      </div>

      {tabDataErr.error && (
        <div className="channel-block-error">
          <p>資料載入失敗:{tabDataErr.error}</p>
          <button type="button" onClick={loadTabData}>重試</button>
        </div>
      )}

      {tab === 'live' && (
        <div role="tabpanel" id="channel-panel-live" aria-labelledby="channel-tab-live" className="channel-tabpanel">
          <ThreadList
            items={liveResult?.items ?? []}
            mode="live"
            onSelectThread={selectThread}
            emptyMessage={liveResult ? '目前無通話中話題' : '載入中…'}
          />
          {liveResult && liveResult.total > 0 && (
            <Pagination page={page} pageSize={liveResult.pageSize} total={liveResult.total} onPageChange={(p) => updateParams({ page: String(p) }, false)} />
          )}
        </div>
      )}

      {tab === 'archive' && (
        <div role="tabpanel" id="channel-panel-archive" aria-labelledby="channel-tab-archive" className="channel-tabpanel">
          <div className="channel-search-controls">
            <SearchBar key={q} initialValue={q} onSearch={(val) => updateParams({ q: val || null })} placeholder="搜尋全文……" />
            <select
              className="channel-category-select"
              value={category}
              onChange={(e) => updateParams({ category: e.target.value || null })}
              aria-label="依分類過濾"
            >
              <option value="">⟨category ▾⟩</option>
              {/* 選項來自 DB 全量 DISTINCT（stats.categories，BR-026）。取自當前頁 items 會讓下拉
                  只剩該頁出現過的值；選定某 category 後結果集收斂，下拉更會塌成單一選項而無法直接改選。 */}
              {(stats?.categories ?? []).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <label className="channel-must-read-toggle">
              <input type="checkbox" checked={mustRead} onChange={(e) => updateParams({ must_read: e.target.checked ? '1' : null })} />
              🔴 必讀
            </label>
            <button type="button" onClick={() => updateParams({ q: null, category: null, must_read: null })}>清除篩選</button>
          </div>
          <AppliedFilterChips
            category={category}
            mustRead={mustRead}
            onClearCategory={() => updateParams({ category: null })}
            onClearMustRead={() => updateParams({ must_read: null })}
          />
          <ThreadList
            items={archiveResult?.items ?? []}
            mode="archive"
            onSelectThread={selectThread}
            emptyMessage={archiveResult ? '無符合篩選條件的話題' : '載入中…'}
          />
          {archiveResult && archiveResult.total > 0 && (
            <Pagination page={page} pageSize={archiveResult.pageSize} total={archiveResult.total} onPageChange={(p) => updateParams({ page: String(p) }, false)} />
          )}
        </div>
      )}

      {tab === 'matrix' && (
        <div role="tabpanel" id="channel-panel-matrix" aria-labelledby="channel-tab-matrix" className="channel-tabpanel">
          {/* 軌欄取自 read-matrix 自身回傳的 tracks（spec §4.5）。原先取自 stats.tracks，
              而 loadStats 的 catch 是靜默的 —— /stats 失敗時矩陣會渲染 0 欄且無任何錯誤提示，
              rows[].cells 資料明明在卻完全不顯示（違反 BR-038 區塊級錯誤隔離）。 */}
          <ReadMatrix result={matrixResult} />
        </div>
      )}

      <McpFallbackNotice />
    </div>
  );
}

function McpFallbackNotice() {
  return (
    <details className="channel-fallback-notice">
      <summary>⚠ MCP 不可用時的緊急 fallback 規則</summary>
      <p>
        若 <code>phycool-context</code> MCP server 暫時無法連線,暫將待發訊息內容記在自己的 scratchpad / dev_notes,待 MCP 恢復後照常呼叫
        <code> post_ctrl_message</code> 補發即可(晚幾分鐘補發不影響語意)。<strong>禁止</strong>在此期間手寫已凍結的舊格式聊天室 .md 檔。若懷疑資料落差,可執行
        <code> node .context-db/scripts/import-ctrl-channel.js --report</code> 重新對帳(此 script 冪等,re-import 不會產生重複列)。
      </p>
    </details>
  );
}
