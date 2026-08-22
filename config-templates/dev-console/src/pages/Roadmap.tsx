// ============================================================
// Roadmap.tsx — /roadmap 推進地圖投影頁（tdb-1-track-plan-roadmap）
// 三 lane 欄(manual/dispatch/reconcile)純計算投影 + KPI 列 + PlanCard。
// hover/focus 暫停重排；?lane= 白名單回退；track_plan 空表顯示遷移引導(非「全數收口」)。
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchRoadmap } from '../services/roadmapApi.js';
import { usePolling } from '../hooks/usePolling.js';
import { useSilentRetryError } from '../hooks/useSilentRetryError.js';
import KpiCard, { KpiCardSkeleton } from '../components/KpiCard.js';
import {
  LANES, LANE_LABELS, GATE_LABELS, GATE_ICONS,
  type Lane, type RoadmapCard, type RoadmapResult,
} from '../types/roadmap.js';
import '../styles/roadmap.css';

const POLL_MS = 30000;

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isLane(v: string | null): v is Lane {
  return v === 'manual' || v === 'dispatch' || v === 'reconcile';
}

function PlanCard({ card, isNew }: { card: RoadmapCard; isNew: boolean }) {
  const priorityClass = card.priority ? `dvc-badge-priority-${card.priority}` : '';
  const complexityClass = card.complexity ? `dvc-badge-complexity-${card.complexity}` : '';
  const gateNote = card.gate_note || card.unlock_note;

  return (
    <Link
      to={`/stories/${card.story_id}`}
      className={`dvc-plan-card dvc-plan-card--gate-${card.gate}${card.priority === 'P0' ? ' dvc-plan-card--p0' : ''}${isNew ? ' dvc-plan-card--glow' : ''}`}
      aria-label={`${card.title} — ${GATE_LABELS[card.gate]}${card.unplanned ? '（未排程）' : ''}`}
    >
      <div className="dvc-plan-card__row1">
        <span className="dvc-plan-card__gate-icon" aria-hidden="true">{GATE_ICONS[card.gate]}</span>
        <span className="dvc-plan-card__gate-label">{GATE_LABELS[card.gate]}</span>
        {card.priority && <span className={`dvc-badge ${priorityClass}`}>{card.priority}</span>}
        {card.complexity && <span className={`dvc-badge ${complexityClass}`}>{card.complexity}</span>}
        {card.unplanned && <span className="dvc-badge dvc-plan-card__unplanned-badge">未排程</span>}
      </div>
      <div className="dvc-plan-card__title">{card.title_short}</div>
      <div className="dvc-plan-card__meta">
        <span className="dvc-plan-card__story-id">{card.story_id}</span>
        {card.seq !== null && <span className="dvc-plan-card__seq">#{card.seq}</span>}
        {card.unlock_leverage > 0 && (
          <span className="dvc-plan-card__leverage" title="解鎖槓桿：多少張待推卡依賴此卡">⚡ {card.unlock_leverage}</span>
        )}
      </div>
      {gateNote && <div className="dvc-plan-card__gate-note">{gateNote}</div>}
      {/* [tdb-1 CR F7] deps_raw = resolver 對該卡 dependencies 全 token 未解析且無 unlock_note 的告警。
          原先此欄位只存在於 API payload 而頁面從不渲染 —— 一旦未來新增卡片的 dependencies 寫法
          超出 resolver 表達力，gate 會靜默落到 unlocked 而操作者零信號。此處以文字（非僅色彩）呈現。
          自由文字走 React 預設跳脫渲染（AC12 的原始 HTML 注入禁令仍成立）。 */}
      {card.deps_raw && (
        <div className="dvc-plan-card__deps-warn">⚠ 依賴未解析:{card.deps_raw}</div>
      )}
      {card.children_progress && (
        <div className="dvc-plan-card__children">
          <div className="dvc-plan-card__children-bar">
            <div
              className="dvc-plan-card__children-fill"
              style={{ width: card.children_progress.total > 0 ? `${(card.children_progress.done / card.children_progress.total) * 100}%` : '0%' }}
            />
          </div>
          <span className="dvc-plan-card__children-label">{card.children_progress.done}/{card.children_progress.total} 子卡完成</span>
        </div>
      )}
    </Link>
  );
}

function LaneColumn({ lane, cards, newIds }: { lane: Lane; cards: RoadmapCard[]; newIds: Set<string> }) {
  return (
    <div className="dvc-plan-lane" data-lane={lane}>
      <div className="dvc-plan-lane__header">
        <span className="dvc-plan-lane__title">{LANE_LABELS[lane]}</span>
        <span className="dvc-kanban-col-badge">{cards.length}</span>
      </div>
      <div className="dvc-plan-lane__cards">
        {cards.length === 0 ? (
          <div className="dvc-plan-lane__empty">本軌暫無待推卡</div>
        ) : (
          cards.map((c) => <PlanCard key={c.story_id} card={c} isNew={newIds.has(c.story_id)} />)
        )}
      </div>
    </div>
  );
}

export default function Roadmap() {
  const [searchParams] = useSearchParams();
  const laneParam = searchParams.get('lane');
  const laneFilter = isLane(laneParam) ? laneParam : null;

  const [data, setData] = useState<RoadmapResult | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const isHoveringRef = useRef(false);
  const pendingDataRef = useRef<RoadmapResult | null>(null);
  const prevGeneratedAtRef = useRef<string | null>(null);
  const err = useSilentRetryError();

  const applyResult = useCallback((result: RoadmapResult) => {
    const prevGeneratedAt = prevGeneratedAtRef.current;
    if (prevGeneratedAt) {
      const fresh = new Set<string>();
      for (const laneGroup of result.lanes) {
        for (const c of laneGroup.cards) {
          if (c.gate_since > prevGeneratedAt) fresh.add(c.story_id);
        }
      }
      setNewIds(fresh);
    }
    prevGeneratedAtRef.current = result.generated_at;
    setData(result);
  }, []);

  const load = useCallback(async () => {
    try {
      const result = await fetchRoadmap();
      if (isHoveringRef.current) {
        pendingDataRef.current = result;
      } else {
        applyResult(result);
      }
      err.reportSuccess();
    } catch (e) {
      err.reportFailure(describeError(e));
    }
  }, [applyResult, err]);

  const { refresh } = usePolling(load, { intervalMs: POLL_MS, enabled: true });

  const handleMouseLeave = useCallback((e: Event) => {
    // [tdb-1 CR F4] mouseenter/mouseleave 不冒泡，故監聽以 capture 掛在容器上才收得到卡片層事件；
    // 但這代表「卡片 A → 卡片 B」的移動也會先觸發 A 的 mouseleave —— 若直接恢復重排，游標仍在
    // 欄內卻發生順序跳動，正是 BR052 要防的抖動。以 relatedTarget 是否仍在容器內判定是否為
    // 「真正離開」。jsdom 的 fireEvent.mouseLeave 預設 relatedTarget=null，故既有測試行為不變。
    const related = (e as MouseEvent).relatedTarget as Node | null;
    const container = document.getElementById('dvc-plan-lanes');
    if (related && container && container.contains(related)) return;

    isHoveringRef.current = false;
    if (pendingDataRef.current) {
      applyResult(pendingDataRef.current);
      pendingDataRef.current = null;
    }
  }, [applyResult]);

  const handleMouseEnter = useCallback(() => {
    isHoveringRef.current = true;
  }, []);

  useEffect(() => {
    const el = document.getElementById('dvc-plan-lanes');
    if (!el) return;
    el.addEventListener('mouseenter', handleMouseEnter, true);
    el.addEventListener('mouseleave', handleMouseLeave, true);
    return () => {
      el.removeEventListener('mouseenter', handleMouseEnter, true);
      el.removeEventListener('mouseleave', handleMouseLeave, true);
    };
    // data 入 deps：#dvc-plan-lanes 要等首次載入成功才存在於 DOM，
    // 若僅依 handleMouseEnter/handleMouseLeave（皆穩定參照）此 effect 只在 mount 時跑一次，
    // 那時容器尚未渲染，之後 data 從 null 變為結果也不會重跑 → 監聽永遠掛不上。
  }, [handleMouseEnter, handleMouseLeave, data]);

  const lanesToRender = laneFilter ? LANES.filter((l) => l === laneFilter) : LANES;
  const isEmpty = data !== null && data.kpi.total === 0;

  return (
    <div className="dvc-roadmap">
      <div className="dvc-page-header">
        <h1>🗺️ 推進地圖</h1>
        <button className="dvc-btn-refresh" onClick={refresh} aria-label="重新整理">⟳ 重新整理</button>
      </div>

      {err.error && (
        <div className="dvc-error-block">
          <p>{err.error}</p>
          <button onClick={refresh}>重試</button>
        </div>
      )}

      {!data && !err.error && (
        <div className="dvc-kpi-row">
          {Array.from({ length: 4 }).map((_, i) => <KpiCardSkeleton key={i} />)}
        </div>
      )}

      {data && (
        <>
          <div className="dvc-kpi-row">
            <KpiCard icon="📋" label="總排程數" value={data.kpi.total} />
            <KpiCard icon="✅" label="已完成" value={data.kpi.done} />
            <KpiCard icon="⏳" label="待推進" value={data.kpi.pending} />
            <KpiCard icon="🔄" label="進行中" value={data.kpi.inflight} />
            {data.kpi.unplanned > 0 && <KpiCard icon="❓" label="未排程" value={data.kpi.unplanned} />}
          </div>

          {isEmpty ? (
            <div className="dvc-plan-empty-guide">
              <p>track_plan 尚未初始化 —— 請執行一次性遷移建立排程資料：</p>
              <code>node .context-db/scripts/migrate-track-plan.js --report</code>
            </div>
          ) : (
            <div id="dvc-plan-lanes" className="dvc-plan-lanes" data-lane-count={lanesToRender.length}>
              {lanesToRender.map((lane) => (
                <LaneColumn
                  key={lane}
                  lane={lane}
                  cards={data.lanes.find((l) => l.lane === lane)?.cards || []}
                  newIds={newIds}
                />
              ))}
            </div>
          )}

          <p className="dvc-plan-footer-note">排程調整請走 CLI:<code>node .context-db/scripts/upsert-track-plan.js</code>（本頁唯讀）</p>
        </>
      )}
    </div>
  );
}
