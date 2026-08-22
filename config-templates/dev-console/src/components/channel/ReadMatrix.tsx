// ============================================================
// ReadMatrix.tsx — 簽收矩陣（ccb-3-devconsole-channel-page AC4/AC8/AC9/AC12）
// 語意 <table> + sticky thead/首欄 + 動態軌欄 + 五字形四態 + 自格 + >24h 逾時底色。
// ============================================================
import type { CellState, ReadMatrixResult } from '../../types/channel.js';
import { hoursSince, isOverdue24h } from '../../lib/channelTime.js';
import { formatTimestamp } from '../../lib/naturalLanguage.js';

interface ReadMatrixProps {
  result: ReadMatrixResult | null;
  /** 選填覆寫；預設取 result.tracks（spec §4.5，與 rows[].cells 的 key 集合同源）。 */
  tracks?: string[];
}

const GLYPH: Record<CellState, string> = {
  self: '◇',
  signed: '✅',
  unsigned: '⬜',
  observed: '👁',
  'not-addressed': '—',
};

const STATE_LABEL: Record<CellState, string> = {
  self: '發訊軌',
  signed: '已簽',
  unsigned: '未簽',
  observed: '旁聽',
  'not-addressed': '非收件',
};

function trackColClass(index: number): string {
  return `channel-track-col--${Math.min(index + 1, 5)}`;
}

/** BR-033：signed→簽收時間 / unsigned→逾時時長 / observed→非收件已旁聽 / self→發訊軌。 */
function buildCellAriaLabel(track: string, cell: { state: CellState; read_at?: string }, createdAt: string): string {
  let label = `${track} ${STATE_LABEL[cell.state]}`;
  if (cell.state === 'unsigned') {
    const h = hoursSince(createdAt);
    if (h > 24) label += ` 逾時 ${h} 小時`;
  } else if ((cell.state === 'signed' || cell.state === 'observed') && cell.read_at) {
    label += ` ${formatTimestamp(cell.read_at)}`;
  }
  return label;
}

/** hover tooltip 文字（BR-033 明列 tooltip 為需求，aria-label 只服務螢幕閱讀器）。 */
function buildCellTitle(track: string, cell: { state: CellState; read_at?: string }, createdAt: string): string {
  switch (cell.state) {
    case 'self':
      return `${track}:發訊軌(不計入未簽統計)`;
    case 'signed':
      return `${track}:已簽${cell.read_at ? ` · ${formatTimestamp(cell.read_at)}` : ''}`;
    case 'unsigned': {
      const h = hoursSince(createdAt);
      return `${track}:未簽${h > 24 ? ` · 已逾時 ${h} 小時` : ` · ${h} 小時前發出`}`;
    }
    case 'observed':
      return `${track}:非收件對象,已旁聽${cell.read_at ? ` · ${formatTimestamp(cell.read_at)}` : ''}`;
    default:
      return `${track}:非收件對象`;
  }
}

export default function ReadMatrix({ result, tracks: tracksOverride }: ReadMatrixProps) {
  if (!result) return <p className="channel-list-empty">載入中…</p>;
  if (result.rows.length === 0) return <p className="channel-list-empty">近期無簽收資料 · 可縮小 days 篩選或清除頻道過濾</p>;
  const tracks = tracksOverride ?? result.tracks ?? [];

  return (
    <div>
      <div className="channel-matrix-wrap">
        <table className="channel-matrix">
          <thead>
            <tr>
              <th scope="col" className="channel-matrix__corner">訊息</th>
              {tracks.map((t, i) => (
                <th key={t} scope="col" className={trackColClass(i)}>
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.msg_id}>
                <th scope="row" className="channel-matrix__row-head">
                  {row.must_read === 1 && <span aria-hidden="true">🔴 </span>}
                  #{row.thread_ordinal}-{row.seq} {row.topic}
                </th>
                {tracks.map((t, i) => {
                  const cell = row.cells[t] ?? { state: 'not-addressed' as CellState };
                  const overdue = cell.state === 'unsigned' && isOverdue24h(row.created_at);
                  const cls = [
                    'channel-matrix-cell',
                    `channel-matrix-cell--${cell.state}`,
                    trackColClass(i),
                    overdue ? 'channel-matrix-cell--overdue' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <td
                      key={t}
                      className={cls}
                      title={buildCellTitle(t, cell, row.created_at)}
                      aria-label={buildCellAriaLabel(t, cell, row.created_at)}
                    >
                      {GLYPH[cell.state]}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.truncated && <p className="channel-matrix__truncated-notice">僅顯示最近 200 則,縮小 days 篩選</p>}
    </div>
  );
}
