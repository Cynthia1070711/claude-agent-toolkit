// ============================================================
// Channel.matrix.test.tsx — 簽收矩陣四態 + 自格 + 動態軌欄 + 逾時底色（ccb-3-devconsole-channel-page）
// jsdom 不套用外部 CSS，getComputedStyle 對 channel.css 規則恆回空字串（KB-frontend-002）—
// 逾時底色成對 / overflow-x / tabular-nums 一律走靜態讀 channel.css 原始碼比對，非 getComputedStyle。
// 真實 computed style 驗證留給 Chrome MCP live（AC16）。
// ============================================================
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ReadMatrix from '../../components/channel/ReadMatrix';
import type { ReadMatrixResult } from '../../types/channel';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TRACKS = ['前台軌', '後台軌', 'azure佈署軌', '賦能軌', 'unspecified'];

function makeResult(overrides: Partial<ReadMatrixResult> = {}): ReadMatrixResult {
  return {
    tracks: TRACKS,
    rows: [
      {
        msg_id: 1, thread_id: 't-1', thread_ordinal: 12, seq: 1, from_track: '前台軌',
        to_tracks: ['broadcast'], msg_type: 'decision', channel: 'general', topic: '裁定:TZ 全域策略',
        must_read: 1, created_at: new Date().toISOString(),
        cells: {
          前台軌: { state: 'self' },
          後台軌: { state: 'signed', read_at: '2026-07-28T00:00:00+08:00' },
          azure佈署軌: { state: 'unsigned' },
          賦能軌: { state: 'observed', read_at: '2026-07-28T00:00:00+08:00' },
          unspecified: { state: 'not-addressed' },
        },
      },
    ],
    truncated: false,
    ...overrides,
  };
}

describe('ReadMatrix', () => {
  it('軌欄預設取自 result.tracks（spec §4.5）—— 不傳 tracks prop 仍完整渲染欄位', () => {
    render(<ReadMatrix result={makeResult()} />);
    expect(screen.getAllByRole('columnheader')).toHaveLength(TRACKS.length + 1);
    expect(screen.getByRole('columnheader', { name: 'unspecified' })).toBeInTheDocument();
  });

  it('BR033_CellTooltip_HasTitleAttribute: 每格帶 hover tooltip，signed 含簽收時間', () => {
    render(<ReadMatrix result={makeResult()} tracks={TRACKS} />);
    const signedCell = screen.getByLabelText(/後台軌 已簽/);
    expect(signedCell).toHaveAttribute('title');
    expect(signedCell.getAttribute('title')).toMatch(/已簽 · /);
    expect(screen.getByLabelText(/前台軌 發訊軌/)).toHaveAttribute('title', expect.stringContaining('不計入未簽統計'));
    expect(screen.getByLabelText(/賦能軌 旁聽/).getAttribute('title')).toMatch(/非收件對象,已旁聽/);
  });

  it('BR029_Matrix_UsesSemanticTable: 語意 <table> + columnheader 數 = tracks.length + 1', () => {
    render(<ReadMatrix result={makeResult()} tracks={TRACKS} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader')).toHaveLength(TRACKS.length + 1);
  });

  it('BR030_FifthTrack_AppearsAsDynamicColumn: 第 5 欄存在且套 track-col--5', () => {
    render(<ReadMatrix result={makeResult()} tracks={TRACKS} />);
    const headers = screen.getAllByRole('columnheader');
    const fifthTrackHeader = headers.find((h) => h.textContent === 'unspecified');
    expect(fifthTrackHeader).toBeDefined();
    expect(fifthTrackHeader).toHaveClass('channel-track-col--5');
  });

  it('BR031_BroadcastRow_FourStatesPlusSelf: 自格 ◇ + 已簽 ✅ + 未簽 ⬜ + 旁聽 👁 四態齊全', () => {
    render(<ReadMatrix result={makeResult()} tracks={TRACKS} />);
    const cells = screen.getAllByRole('cell');
    const texts = cells.map((c) => c.textContent);
    expect(texts).toContain('◇');
    expect(texts).toContain('✅');
    expect(texts).toContain('⬜');
    expect(texts).toContain('👁');
  });

  it('BR033_CellTooltip_CarriesAriaLabel: 四態 aria-label 分別含對應中文語意', () => {
    render(<ReadMatrix result={makeResult()} tracks={TRACKS} />);
    expect(screen.getByLabelText(/前台軌 發訊軌/)).toBeInTheDocument();
    expect(screen.getByLabelText(/後台軌 已簽/)).toBeInTheDocument();
    expect(screen.getByLabelText(/azure佈署軌 未簽/)).toBeInTheDocument();
    expect(screen.getByLabelText(/賦能軌 旁聽/)).toBeInTheDocument();
  });

  it('>24h 未簽格套 overdue class 且 aria-label 含「逾時 N 小時」', () => {
    const overdueTs = new Date(Date.now() - 30 * 3600 * 1000).toISOString();
    render(<ReadMatrix result={makeResult({ rows: [{ ...makeResult().rows[0]!, created_at: overdueTs }] })} tracks={TRACKS} />);
    const cell = screen.getByLabelText(/azure佈署軌 未簽 逾時 \d+ 小時/);
    expect(cell).toHaveClass('channel-matrix-cell--overdue');
  });

  it('未逾時的 unsigned cell 不套 overdue class', () => {
    render(<ReadMatrix result={makeResult()} tracks={TRACKS} />);
    const cell = screen.getByLabelText(/azure佈署軌 未簽$/);
    expect(cell).not.toHaveClass('channel-matrix-cell--overdue');
  });

  it('AC12：截斷提示文案存在', () => {
    render(<ReadMatrix result={makeResult({ truncated: true })} tracks={TRACKS} />);
    expect(screen.getByText(/僅顯示最近 200 則/)).toBeInTheDocument();
  });

  it('rows 為空時顯示區塊級空狀態文案', () => {
    render(<ReadMatrix result={{ tracks: TRACKS, rows: [], truncated: false }} tracks={TRACKS} />);
    expect(screen.getByText(/近期無簽收資料/)).toBeInTheDocument();
  });
});

describe('channel.css 靜態原始碼驗證（KB-frontend-002：jsdom 不套外部 CSS，改讀原始碼）', () => {
  const cssSrc = fs.readFileSync(path.resolve(__dirname, '../../styles/channel.css'), 'utf8');

  it('BR040_ChannelCss_HasZeroBareHex: 零裸 hex 色碼', () => {
    const matches = cssSrc.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(matches).toEqual([]);
  });

  it('BR040_ChannelCss_HasZeroBareHex: 含 tabular-nums 與 --dvc-font-mono', () => {
    expect(cssSrc).toContain('tabular-nums');
    expect(cssSrc).toContain('var(--dvc-font-mono)');
  });

  it('BR032_OverdueUnsigned_PairsBgAndText: --dvc-warn-decay-bg 與 --dvc-warn-decay-text 於同一規則區塊成對出現（照 emergence.css:605-618 形）', () => {
    const bgCount = (cssSrc.match(/--dvc-warn-decay-bg/g) ?? []).length;
    const textCount = (cssSrc.match(/--dvc-warn-decay-text/g) ?? []).length;
    expect(bgCount).toBeGreaterThanOrEqual(1);
    expect(textCount).toBeGreaterThanOrEqual(1);
    // text 覆蓋須用 !important 強制套用所有後代（emergence.css 同型 bug 修復範式）
    expect(cssSrc).toMatch(/--dvc-warn-decay-text\)\s*!important/);
  });

  it('AC15：矩陣容器套 overflow-x: auto（靜態規則存在）', () => {
    const ruleMatch = cssSrc.match(/\.channel-matrix-wrap\s*\{[^}]*\}/);
    expect(ruleMatch).not.toBeNull();
    expect(ruleMatch![0]).toMatch(/overflow-x:\s*auto/);
  });

  it('prefers-reduced-motion 存在且關閉 channel-row--new 動畫', () => {
    expect(cssSrc).toContain('prefers-reduced-motion');
    const reducedBlock = cssSrc.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.channel-row--new\s*\{[^}]*\}/);
    expect(reducedBlock).not.toBeNull();
    expect(reducedBlock![0]).toMatch(/animation:\s*none/);
  });
});
