// ============================================================
// Emergence.tsx — ECC 湧現迴路頁面 (ecc-emergence-ui-v2 重構)
// 4 池架構 orchestrator + 既有 Funnel/Layer12/Trends/HITL 子區
// ============================================================
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  fetchPipeline, fetchInstincts, putInstinctLike, postInstinctReject,
  fetchLayer12, fetchEvolveCandidates, postCandidateReject,
  putInstinctDislike, putInstinctRestore,
  fetchRejectedInstincts, fetchGeneratedSkills,
  putSkillPause, deleteGeneratedSkill,
} from '../services/emergenceApi.js';
import type {
  InstinctCard, EmergenceFunnel, Layer12Observation, TrendsView,
  EvolveCandidate, EvolveCandidatesResponse,
  GeneratedSkill, RejectedInstinct, PoolKey,
} from '../types/emergence.js';
import { formatTimestamp } from '../lib/naturalLanguage.js';
import { useI18n } from '../i18n/I18nProvider.js';
import PoolSection from '../components/PoolSection.js';
import InstinctCardV2 from '../components/InstinctCardV2.js';
import SkillCard from '../components/SkillCard.js';
import CandidateCardV2 from '../components/CandidateCardV2.js';
import RejectedCard from '../components/RejectedCard.js';
import InstinctDetailModal from '../components/InstinctDetailModal.js';
import CandidateDetailModal from '../components/CandidateDetailModal.js';
import EmergenceRecentList from '../components/EmergenceRecentList.js';
import LiveObservationsPanel from '../components/LiveObservationsPanel.js';
import { classifyInstinct } from '../lib/poolClassifier.js';
import '../styles/emergence.css';

// ── Funnel helpers ────────────────────────────────────────
const FUNNEL_ICONS = ['📥', '⚗️', '🧬', '🚫'];
function pct(n: number, d: number) { return d === 0 ? '0%' : ((n / d) * 100).toFixed(1) + '%'; }

export function deriveTrends(instincts: InstinctCard[]): TrendsView {
  const ranking = [...instincts].sort((a, b) => (b.adoption_score ?? 0) - (a.adoption_score ?? 0) || b.confidence - a.confidence);
  const decaying = instincts.filter(i => i.confidence < 0.3 || i.decay_at != null);
  const timeline = [...instincts].sort((a, b) => (b.last_seen ?? '').localeCompare(a.last_seen ?? ''));
  return { ranking, decaying, timeline };
}

function FunnelSection({ funnel }: { funnel: EmergenceFunnel }) {
  const stages = [
    { icon: FUNNEL_ICONS[0], value: funnel.observations.total, label: '原始觀測', sub: `${funnel.observations.processed} 已蒸餾` },
    { icon: FUNNEL_ICONS[1], value: pct(funnel.observations.processed, funnel.observations.total), label: '蒸餾完成率', sub: `${funnel.observations.processed} / ${funnel.observations.total}` },
    { icon: FUNNEL_ICONS[2], value: funnel.instincts.total, label: '湧現 Instinct', sub: `${funnel.instincts.approved} 已驗 · ${funnel.instincts.needsEvidence} 待佐` },
    { icon: FUNNEL_ICONS[3], value: funnel.rejected.total, label: '否決', sub: `轉化率 ${pct(funnel.instincts.total, funnel.observations.total)}` },
  ];
  return (
    <div className="emergence-funnel">
      {stages.map((s, i) => (
        <div key={i} style={{ display: 'contents' }}>
          <div className="emergence-funnel__stage">
            <span className="emergence-funnel__stage-icon">{s.icon}</span>
            <span className="emergence-funnel__stage-value">{s.value}</span>
            <span className="emergence-funnel__stage-label">{s.label}</span>
            <span className="emergence-funnel__stage-sub">{s.sub}</span>
          </div>
          {i < stages.length - 1 && <div className="emergence-funnel__arrow">→</div>}
        </div>
      ))}
    </div>
  );
}

function Layer12Section({ data, onSelect }: { data: Layer12Observation | null; onSelect?: (trigger: string, action: string) => void }) {  // BUG 4 fix: onSelect
  if (!data) return null;
  const gaugePct = Math.round(data.pct * 100);
  const clickable = !!onSelect;
  return (
    <div className="emergence-layer12">
      <h2 className="emergence-layer12__title">🧿 Layer 12 注入觀測</h2>
      <div className="emergence-layer12__gauge-row">
        <span>字元用量</span>
        <div className="emergence-layer12__gauge"><div className="emergence-layer12__gauge-fill" style={{ width: `${gaugePct}%` }} /></div>
        <span>{data.used} / {data.cap}（{gaugePct}%）</span>
      </div>
      {data.injected.length === 0 ? <p className="emergence-layer12__empty">目前無符合條件的 instinct 注入</p> : (
        <ul className="emergence-layer12__list">
          {data.injected.map((item, i) => (
            <li
              key={i}
              className="emergence-layer12__item"
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={() => onSelect?.(item.trigger, item.action)}
              onKeyDown={(e) => { if (clickable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect!(item.trigger, item.action); } }}
              style={clickable ? { cursor: 'pointer' } : undefined}
              aria-label={clickable ? `查看詳情：${item.trigger}` : undefined}
            >
              <span className="emergence-layer12__score">採用 {item.score}</span>
              <span className="emergence-layer12__trigger">{item.trigger}</span>
              <span className="emergence-layer12__arrow">→</span>
              <span className="emergence-layer12__action">{item.action}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TrendsSection({ trends, onSelect }: { trends: TrendsView; onSelect?: (card: InstinctCard) => void }) {  // BUG 4 fix: onSelect 3 blocks 都可點
  const clickable = !!onSelect;
  const liProps = (inst: InstinctCard) => clickable ? {
    role: 'button' as const, tabIndex: 0, style: { cursor: 'pointer' as const },
    onClick: () => onSelect!(inst),
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect!(inst); } },
    'aria-label': `查看詳情：${inst.trigger}`,
  } : {};
  return (
    <div className="emergence-trends">
      <h2 className="emergence-trends__title">📊 採納/衰減趨勢</h2>
      <div className="emergence-trends__blocks">
        <div className="emergence-trends__block">
          <div className="emergence-trends__block-title">採納排行</div>
          <ul className="emergence-trends__list">
            {trends.ranking.slice(0, 8).map(inst => (
              <li key={inst.id} className="emergence-trends__item" {...liProps(inst)}>
                <span className="emergence-trends__score">{inst.adoption_score ?? 0}/5</span>
                <span className="emergence-trends__label">{inst.trigger}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="emergence-trends__block emergence-trends__block--decaying">
          <div className="emergence-trends__block-title">⚠ 衰退警示</div>
          {trends.decaying.length === 0 ? <p className="emergence-trends__empty">無衰退本能</p> : (
            <ul className="emergence-trends__list">
              {trends.decaying.map(inst => (
                <li key={inst.id} className="emergence-trends__item" {...liProps(inst)}>
                  <span className="emergence-trends__conf">{Math.round(inst.confidence * 100)}%</span>
                  <span className="emergence-trends__label">{inst.trigger}</span>
                  {inst.decay_at && <span className="emergence-trends__decay-at">{formatTimestamp(inst.decay_at)}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="emergence-trends__block">
          <div className="emergence-trends__block-title">最近活動時間線</div>
          <ul className="emergence-trends__list">
            {trends.timeline.slice(0, 8).map(inst => (
              <li key={inst.id} className="emergence-trends__item" {...liProps(inst)}>
                <span className="emergence-trends__time">{formatTimestamp(inst.last_seen)}</span>
                <span className="emergence-trends__label">{inst.trigger}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function HITLModal({ candidate, skillCapStatus, onClose }: { candidate: EvolveCandidate; skillCapStatus: EvolveCandidatesResponse['skillCapStatus'] | null; onClose: () => void }) {
  const isSkill = candidate.type === 'skill';
  const skillSample = isSkill
    ? `Skill(skill="saas-to-skill")\n// Mode A Create — domain: ${candidate.domain} | avg_confidence: ${Math.round(candidate.avg_confidence * 100)}%`
    : `Skill(skill="hooks-mechanization")\n// 7-step playbook — domain: ${candidate.domain} | avg_confidence: ${Math.round(candidate.avg_confidence * 100)}%`;
  const capWarn = skillCapStatus && isSkill ? skillCapStatus.phycoolCount >= 100 ? 'block' : skillCapStatus.phycoolCount >= 95 ? 'warn' : null : null;
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="emergence-hitl__backdrop" onClick={() => onClose()}>
      <div className="emergence-hitl__modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="HITL 生成引導">
        <div className="emergence-hitl__header"><h3 className="emergence-hitl__title">⚠️ HITL 生成引導 — 需手動字面調用 Skill tool</h3></div>
        {isSkill && skillCapStatus && (
          <div className={`emergence-hitl__cap-check${capWarn === 'block' ? ' emergence-hitl__cap-check--block' : capWarn === 'warn' ? ' emergence-hitl__cap-check--warn' : ''}`}>
            <div className="emergence-hitl__cap-title">📊 Skill Cap 自檢</div>
            <div>phycool-*: {skillCapStatus.phycoolCount} / {skillCapStatus.phycoolCap}</div>
            {capWarn === 'block' && <div className="emergence-hitl__cap-alert emergence-hitl__cap-alert--block">🚫 Skill Cap 已滿</div>}
            {capWarn === 'warn' && <div className="emergence-hitl__cap-alert emergence-hitl__cap-alert--warn">⚠ Skill Cap 接近上限</div>}
          </div>
        )}
        <div className="emergence-hitl__sample">
          <pre className="emergence-hitl__sample-code">{skillSample}</pre>
          <button className="emergence-hitl__copy-btn" onClick={() => navigator.clipboard?.writeText(skillSample).catch(() => undefined)}>📋 複製</button>
        </div>
        <div className="emergence-hitl__warning">本系統絕不自動寫檔。請複製上方指令至主對話視窗手動執行。</div>
        <div className="emergence-hitl__footer"><button className="emergence-hitl__close-btn" onClick={onClose}>我已了解 · 關閉</button></div>
      </div>
    </div>
  );
}

// ── Main Page Orchestrator ────────────────────────────────
export default function Emergence() {
  const { t } = useI18n();
  const [funnel, setFunnel] = useState<EmergenceFunnel | null>(null);
  const [instincts, setInstincts] = useState<InstinctCard[]>([]);
  const [generatedSkills, setGeneratedSkills] = useState<GeneratedSkill[]>([]);
  const [rejectedInstincts, setRejectedInstincts] = useState<RejectedInstinct[]>([]);
  const [layer12, setLayer12] = useState<Layer12Observation | null>(null);
  const [evolveCandidates, setEvolveCandidates] = useState<EvolveCandidatesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 4 池摺疊狀態 — 初始僅觀察池展開
  const [collapsed, setCollapsed] = useState<Record<PoolKey, boolean>>({ skill: false, candidate: false, observe: false, rejected: false });  // BUG 2a fix: 全展開 預設都顯示一排
  // Modal 狀態 (singleton)
  const [modalCard, setModalCard] = useState<InstinctCard | null>(null);
  const [modalCandidate, setModalCandidate] = useState<EvolveCandidate | null>(null);  // BUG 5 fix
  const [hitlCandidate, setHitlCandidate] = useState<EvolveCandidate | null>(null);
  // 治理進行中狀態
  const [likingIds, setLikingIds] = useState<Record<string, boolean>>({});
  const [dislikingIds, setDislikingIds] = useState<Record<string, boolean>>({});
  const [rejectingIds, setRejectingIds] = useState<Record<string, boolean>>({});
  const [restoringIds, setRestoringIds] = useState<Record<string, boolean>>({});
  const [pausingIds, setPausingIds] = useState<Record<number, boolean>>({});
  const [deletingIds, setDeletingIds] = useState<Record<number, boolean>>({});

  const loadData = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const [pipelineData, instinctsData, skillsData, rejectedData] = await Promise.all([
        fetchPipeline(), fetchInstincts(), fetchGeneratedSkills(), fetchRejectedInstincts(),
      ]);
      setFunnel(pipelineData); setInstincts(instinctsData);
      setGeneratedSkills(skillsData); setRejectedInstincts(rejectedData);
    } catch { setError('資料載入失敗，請確認後端服務是否運行。'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadData();
    fetchLayer12().then(setLayer12).catch(console.error);
    fetchEvolveCandidates().then(setEvolveCandidates).catch(console.error);
  }, [loadData]);

  // Pool 分類
  const generatedClusterIds = useMemo(() => new Set(generatedSkills.map(s => s.instinct_cluster_id)), [generatedSkills]);
  const evolveCandidateIds = useMemo(() => new Set((evolveCandidates?.candidates ?? []).flatMap(c => c.member_ids)), [evolveCandidates]);
  const observeInstincts = useMemo(() => instincts.filter(i => classifyInstinct(i, generatedClusterIds, evolveCandidateIds) === 'observe'), [instincts, generatedClusterIds, evolveCandidateIds]);

  const trends = instincts.length > 0 ? deriveTrends(instincts) : null;
  const togglePool = (key: PoolKey) => setCollapsed(p => ({ ...p, [key]: !p[key] }));

  const handleLike = async (id: string) => {
    setLikingIds(p => ({ ...p, [id]: true }));
    try {
      const r = await putInstinctLike(id);
      setInstincts(p => p.map(i => i.id === id ? { ...i, confidence: r.confidence, machine_star: Math.round(r.confidence * 10), decay_at: null } : i));
    } catch (e) { console.error(e); }
    finally { setLikingIds(p => ({ ...p, [id]: false })); }
  };
  const handleDislike = async (id: string) => {
    setDislikingIds(p => ({ ...p, [id]: true }));
    try {
      const r = await putInstinctDislike(id);
      setInstincts(p => p.map(i => i.id === id ? { ...i, confidence: r.confidence, machine_star: Math.round(r.confidence * 10) } : i));
    } catch (e) { console.error(e); }
    finally { setDislikingIds(p => ({ ...p, [id]: false })); }
  };
  const handleReject = async (id: string, reason: string) => {
    setRejectingIds(p => ({ ...p, [id]: true }));
    try {
      await postInstinctReject(id, reason);
      setInstincts(p => p.map(i => i.id === id ? { ...i, verifier_status: 'rejected' } : i));
      loadData();
    } catch (e) { console.error(e); }
    finally { setRejectingIds(p => ({ ...p, [id]: false })); }
  };
  // 候選否決 — 批次否決成員 instinct(閉環 P1 redundant 偵測 → 否決池)
  const handleCandidateReject = async (candidate: EvolveCandidate, reason: string) => {
    try {
      await postCandidateReject(candidate.member_ids, reason);
      loadData();
    } catch (e) { console.error(e); }
  };
  const handleRestore = async (id: string) => {
    setRestoringIds(p => ({ ...p, [id]: true }));
    try {
      await putInstinctRestore(id);
      loadData();
    } catch (e) { console.error(e); }
    finally { setRestoringIds(p => ({ ...p, [id]: false })); }
  };
  const handleSkillPause = async (id: number) => {
    setPausingIds(p => ({ ...p, [id]: true }));
    try { await putSkillPause(id); loadData(); } catch (e) { console.error(e); }
    finally { setPausingIds(p => ({ ...p, [id]: false })); }
  };
  const handleSkillDelete = async (id: number) => {
    setDeletingIds(p => ({ ...p, [id]: true }));
    try { await deleteGeneratedSkill(id); loadData(); } catch (e) { console.error(e); }
    finally { setDeletingIds(p => ({ ...p, [id]: false })); }
  };

  const modalSkill = modalCard ? generatedSkills.find(s => s.instinct_cluster_id === modalCard.id) ?? null : null;

  return (
    <div className="emergence-page">
      <div className="emergence-page__header">
        <h1>🧬 {t.nav.emergence}</h1>
        <p className="emergence-page__subtitle">ECC 機器自產直覺 · 4 池架構 + 治理 UI</p>
      </div>

      {loading && <div className="emergence-page__loading">載入中…</div>}
      {error && <div className="emergence-page__error">{error}</div>}

      {!loading && !error && funnel && <FunnelSection funnel={funnel} />}
      {!loading && !error && (
        <div className="emergence-recent-row">
          <EmergenceRecentList instincts={instincts} onSelect={setModalCard} />
          <LiveObservationsPanel />
        </div>
      )}

      {/* ⚙️ 技能池 */}
      {/* [bwu-12] emptyText 移至 prop(非 children 三元式)—— PoolSection.tsx:41-49 只在 count>0 時渲染
          children,count===0 時走它自己的 emptyText/'暫無資料' fallback,故原寫在 children 內的空態文字
          對 count===0 情境是無法觸及的死碼(4 池同型,一併修正)。
          [bwu-12 CR F4] 文案取自 i18n 而非硬編字面值:i18n/{zh-TW,en}.ts 的 emergence.pools.*.emptyHint
          早已宣告這四段文案(且在此之前零消費端 —— 與上述死碼同源的第二層)。硬編 zh-TW 會使本頁四個
          空態在 en 語系永久顯示中文,並讓 en.ts:308-311 的翻譯繼續是死條目。*/}
      {!loading && !error && (
        <PoolSection poolKey="skill" icon="⚙️" title="技能池" count={generatedSkills.length} collapsed={collapsed.skill} onToggle={() => togglePool('skill')} emptyText={t.emergence.pools.skill.emptyHint}>
          <div className="emergence-wall">
            {generatedSkills.map(s => <SkillCard key={s.id} skill={s} onPause={handleSkillPause} onDelete={handleSkillDelete} pausing={pausingIds[s.id]} deleting={deletingIds[s.id]} />)}
          </div>
        </PoolSection>
      )}

      {/* 🧬 候選池 */}
      {!loading && !error && (
        <PoolSection poolKey="candidate" icon="🧬" title="候選池" count={evolveCandidates?.candidates.length ?? 0} collapsed={collapsed.candidate} onToggle={() => togglePool('candidate')} emptyText={t.emergence.pools.candidate.emptyHint}>
          <div className="emergence-wall">
            {(evolveCandidates?.candidates ?? []).map((c, i) => <CandidateCardV2 key={i} candidate={c} onGenerate={setHitlCandidate} onReject={handleCandidateReject} onOpenModal={setModalCandidate} />)}
          </div>
        </PoolSection>
      )}

      {/* 👀 觀察池 */}
      {!loading && !error && (
        <PoolSection poolKey="observe" icon="👀" title="觀察池" count={observeInstincts.length} collapsed={collapsed.observe} onToggle={() => togglePool('observe')} emptyText={t.emergence.pools.observe.emptyHint}>
          <div className="emergence-wall">
            {observeInstincts.map(card => (
              <InstinctCardV2 key={card.id} card={card}
                onLike={handleLike} onDislike={handleDislike} onReject={handleReject}
                onOpenModal={setModalCard}
                liking={likingIds[card.id]} disliking={dislikingIds[card.id]} rejecting={rejectingIds[card.id]}
              />
            ))}
          </div>
        </PoolSection>
      )}

      {/* ❌ 否決池 */}
      {!loading && !error && (
        <PoolSection poolKey="rejected" icon="❌" title="否決池" count={rejectedInstincts.length} collapsed={collapsed.rejected} onToggle={() => togglePool('rejected')} emptyText={t.emergence.pools.rejected.emptyHint}>
          <div className="emergence-wall">
            {rejectedInstincts.map(r => <RejectedCard key={r.id} rejected={r} onRestore={handleRestore} restoring={restoringIds[String(r.id)]} />)}
          </div>
        </PoolSection>
      )}

      {!loading && !error && <Layer12Section data={layer12} onSelect={(t, a) => {
        const inst = instincts.find(c => c.trigger === t && c.action === a);
        if (inst) setModalCard(inst);
      }} />}
      {!loading && !error && trends && <TrendsSection trends={trends} onSelect={setModalCard} />}

      {/* Modals */}
      {modalCard && <InstinctDetailModal card={modalCard} generatedSkill={modalSkill} onClose={() => setModalCard(null)} />}
      {modalCandidate && <CandidateDetailModal candidate={modalCandidate} onClose={() => setModalCandidate(null)} onGenerate={setHitlCandidate} />}
      {hitlCandidate && <HITLModal candidate={hitlCandidate} skillCapStatus={evolveCandidates?.skillCapStatus ?? null} onClose={() => setHitlCandidate(null)} />}
    </div>
  );
}
