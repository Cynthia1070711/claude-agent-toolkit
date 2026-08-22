// ============================================================
// Khoj γ-4 / γ-6 回歸保護測試
// (ADR-KHOJ-CHUNKING-001 · D1d finding follow-up：補可重跑 test artifact)
// ============================================================
// 背景：9 域落地驗證 D1d finding 指出 γ-4~6 功能已落地且正確，
//        但「9/9 + 14/14 + 11/11」為 ad-hoc 手測，無入版控的可重跑 test artifact
//        → 缺回歸保護 (severity medium)。本檔補齊。
//
// 待測純函式 (CLI entry guard 後 export，import 不觸發 main()):
//   γ-4 splitByPunctuation / chunkDocument / estimateTokens
//       → .context-db/scripts/sync-documents.js
//   γ-6 parseDateExpr
//       → .context-db/server.js
//
// γ-5 (chunk-level MD5 dedup, sync-documents.js:287-338) 評估：
//   該邏輯封裝於 upsertDocument 內的 db.transaction()，
//   緊耦合 better-sqlite3 真實 DB + document_chunks/document_embeddings schema，
//   非可獨立 import 的純函式，且未 export。要測需建臨時 sqlite + 完整 schema seed，
//   屬整合測試範疇 (對齊既有 severity-canonical.test.js 的 in-memory DB 範式)，
//   超出本「純函式回歸保護」scope。誠實標註：本檔不納入 γ-5，留待整合測試另立。
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  splitByPunctuation,
  chunkDocument,
  estimateTokens,
} from '../scripts/sync-documents.js';
import { parseDateExpr } from '../server.js';

// ────────────────────────────────────────────────────────────
// γ-4：splitByPunctuation — zh-TW 句末標點 + 換行次級切塊
// (ADR-KHOJ-CHUNKING-001 §A RecursiveCharacterTextSplitter 蒸餾)
// estimateTokens = Math.ceil(len/4)，故 maxTokens=N → content 長度 > 4N 才觸發切塊
// ────────────────────────────────────────────────────────────
describe('γ-4 splitByPunctuation — zh-TW 標點次級切塊', () => {
  it('未超過 maxTokens：原樣返回單塊 (同一物件 reference)', () => {
    const chunk = { heading_path: 'T', content: '短內容', chunk_index: 0 };
    const out = splitByPunctuation(chunk, 100);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(chunk); // 同一 reference，未複製
  });

  it('全形句末標點 (。！？；) 切塊', () => {
    const sentence = '內容內容內容內容內容內容內容內容內容內容。'; // len 11
    const content = sentence.repeat(5); // 5 句
    const chunk = { heading_path: 'H', content, chunk_index: 0 };
    const out = splitByPunctuation(chunk, 4); // 每句 ~3 tokens，2 句即超 4
    expect(out.length).toBeGreaterThan(1);
    // 每塊皆以全形句號收尾 (切點落在標點 lookbehind 後)
    for (const p of out) {
      expect(p.content.endsWith('。')).toBe(true);
    }
  });

  it('半形標點 (!?;) 同樣切塊', () => {
    const content = '英數內容english123!更多內容content456?還有內容more789;最後段final。';
    const chunk = { heading_path: 'H', content, chunk_index: 0 };
    const out = splitByPunctuation(chunk, 4); // 強制切塊
    expect(out.length).toBeGreaterThan(1);
    // 半形標點亦為合法切點：重組後零非空白字元遺失 (見零丟失測試)
    const joined = out.map((p) => p.content).join('');
    expect(joined.replace(/\s/g, '')).toBe(content.replace(/\s/g, ''));
  });

  it('無句末標點但有換行：以換行作次級切點', () => {
    const line = '沒有句末標點的一行文字內容內容內容內容\n'; // len 21
    const content = line.repeat(6);
    const chunk = { heading_path: 'NL', content, chunk_index: 0 };
    const out = splitByPunctuation(chunk, 8);
    expect(out.length).toBeGreaterThan(1);
    const joined = out.map((p) => p.content).join('');
    expect(joined.replace(/\s/g, '')).toBe(content.replace(/\s/g, ''));
  });

  it('零字元丟失：切塊重組後非空白內容完全一致', () => {
    const sentence = '資料內容內容內容內容內容內容內容內容內容。';
    const content = sentence.repeat(8);
    const chunk = { heading_path: 'Z', content, chunk_index: 0 };
    const out = splitByPunctuation(chunk, 5);
    const joined = out.map((p) => p.content).join('');
    // 句子間無前後空白時，原樣重組亦完全相等
    expect(joined).toBe(content);
  });

  it('無標點可切：容錯原樣返回單塊 (同一 reference)', () => {
    const content = '這是一段沒有任何句末標點也沒有換行的長文字'.repeat(5);
    const chunk = { heading_path: 'F', content, chunk_index: 2 };
    const out = splitByPunctuation(chunk, 1); // 即使 maxTokens 極小仍無法切
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(chunk); // 容錯：原物件返回
  });

  it('chunk_index 在次級切塊中保留 (不在此階段重編號)', () => {
    const sentence = '內容內容內容內容內容內容內容內容內容內容。';
    const chunk = { heading_path: 'H', content: sentence.repeat(5), chunk_index: 7 };
    const out = splitByPunctuation(chunk, 4);
    expect(out.length).toBeGreaterThan(1);
    // splitByPunctuation 保留來源 chunk_index；重編號是 chunkDocument 職責
    for (const p of out) {
      expect(p.chunk_index).toBe(7);
      expect(p.heading_path).toBe('H');
    }
  });
});

// ────────────────────────────────────────────────────────────
// γ-4：chunkDocument — heading 切塊 + 次級切塊 + chunk_index 重編號
// ────────────────────────────────────────────────────────────
describe('γ-4 chunkDocument — 分段策略整合', () => {
  it('whole 策略：整篇一塊，chunk_index=0', () => {
    const out = chunkDocument('整篇內容', '標題', 'whole');
    expect(out).toEqual([
      { heading_path: '標題', content: '整篇內容', chunk_index: 0 },
    ]);
  });

  it('h2 無 H2 標題時 fallback 整篇一塊', () => {
    const out = chunkDocument('# 標題\n\n沒有任何二級標題的內文內容', '標題', 'h2');
    expect(out).toHaveLength(1);
    expect(out[0].chunk_index).toBe(0);
  });

  it('h2 + 超長段落次級切塊後 chunk_index 連續重編號 0..n-1 (確保 (doc_id, chunk_index) 唯一)', () => {
    const longSection =
      '## 大段\n' + '句子內容內容內容內容內容內容內容內容。'.repeat(900); // 遠超 2000 tokens
    const doc =
      '# 標題\n\n## A\n短內容短內容短內容短內容短內容短內容短內容短\n\n' + longSection;
    const chunks = chunkDocument(doc, '標題', 'h2');
    expect(chunks.length).toBeGreaterThan(1);
    const idxs = chunks.map((c) => c.chunk_index);
    // 連續且從 0 起、無重複
    expect(idxs).toEqual(idxs.map((_, i) => i));
  });
});

// ────────────────────────────────────────────────────────────
// γ-4：estimateTokens — 切塊門檻的基準函式
// ────────────────────────────────────────────────────────────
describe('γ-4 estimateTokens — token 估算 (Math.ceil(len/4))', () => {
  it('依字串長度 /4 向上取整', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('a')).toBe(1); // ceil(1/4)=1
    expect(estimateTokens('abcd')).toBe(1); // ceil(4/4)=1
    expect(estimateTokens('abcde')).toBe(2); // ceil(5/4)=2
  });
});

// ────────────────────────────────────────────────────────────
// γ-6：parseDateExpr — 自然語言日期 → ISO Asia/Taipei (+08:00)
// (ADR-KHOJ-CHUNKING-001 §C DateFilter 蒸餾)
// 結果相對「今天」計算，故測試以相同錨點重算 expected，非硬編日期。
// ────────────────────────────────────────────────────────────
const ISO_TW = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/;

// 與實作一致的台灣時區「今天 00:00」錨點 (server.js:1117-1118)
function twToday() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  d.setHours(0, 0, 0, 0);
  return d;
}
const p2 = (n) => String(n).padStart(2, '0');
function fmt(d, isEnd = false) {
  const x = new Date(d);
  if (isEnd) x.setHours(23, 59, 59, 0);
  return `${x.getFullYear()}-${p2(x.getMonth() + 1)}-${p2(x.getDate())}T${p2(x.getHours())}:${p2(x.getMinutes())}:${p2(x.getSeconds())}+08:00`;
}
function shiftDays(days) {
  const d = twToday();
  d.setDate(d.getDate() + days);
  return d;
}

describe('γ-6 parseDateExpr — 自然語言 → ISO UTC+8', () => {
  it('空值返回 null', () => {
    expect(parseDateExpr('')).toBeNull();
    expect(parseDateExpr(null)).toBeNull();
    expect(parseDateExpr(undefined)).toBeNull();
  });

  it('已是 ISO 日期：原樣返回 (容錯 passthrough)', () => {
    expect(parseDateExpr('2026-05-01')).toBe('2026-05-01');
    expect(parseDateExpr('2026-05-01T12:30:00+08:00')).toBe('2026-05-01T12:30:00+08:00');
  });

  it('無法解析的自然語言：原樣返回 (容錯)', () => {
    expect(parseDateExpr('火星時間')).toBe('火星時間');
  });

  it('所有可解析表達式皆輸出 +08:00 ISO 格式', () => {
    for (const expr of ['今天', '昨天', '前天', '本週', '上週', '本月', '上月', '近七天', '近三十天']) {
      expect(parseDateExpr(expr)).toMatch(ISO_TW);
    }
  });

  it('今天 / 今日 → 台灣今天 00:00:00', () => {
    const expected = fmt(twToday());
    expect(parseDateExpr('今天')).toBe(expected);
    expect(parseDateExpr('今日')).toBe(expected);
  });

  it('昨天 → 今天 -1 天；前天 → 今天 -2 天', () => {
    expect(parseDateExpr('昨天')).toBe(fmt(shiftDays(-1)));
    expect(parseDateExpr('前天')).toBe(fmt(shiftDays(-2)));
  });

  it('本週 → 回推至本週週一 (台灣以週一為週起點)', () => {
    const tw = twToday();
    const dow = (tw.getDay() + 6) % 7; // 0=Mon..6=Sun
    expect(parseDateExpr('本週')).toBe(fmt(shiftDays(-dow)));
    // 結果落在週一 (getDay()===1) 或本身即週一時 dow=0
    const monday = new Date(shiftDays(-dow));
    expect(monday.getDay()).toBe(1);
  });

  it('上週 → 本週週一再回推 7 天', () => {
    const tw = twToday();
    const dow = (tw.getDay() + 6) % 7;
    expect(parseDateExpr('上週')).toBe(fmt(shiftDays(-dow - 7)));
  });

  it('本月 → 當月 1 號', () => {
    const tw = twToday();
    const expected = fmt(new Date(tw.getFullYear(), tw.getMonth(), 1));
    expect(parseDateExpr('本月')).toBe(expected);
  });

  it('上月 → 上個月 1 號', () => {
    const tw = twToday();
    const expected = fmt(new Date(tw.getFullYear(), tw.getMonth() - 1, 1));
    expect(parseDateExpr('上月')).toBe(expected);
  });

  it('近七天 → 今天 -7 天；近三十天 → 今天 -30 天', () => {
    expect(parseDateExpr('近七天')).toBe(fmt(shiftDays(-7)));
    expect(parseDateExpr('近三十天')).toBe(fmt(shiftDays(-30)));
  });

  it('isEnd=true：時間取 23:59:59 (date_to 當天結束)', () => {
    const result = parseDateExpr('今天', true);
    expect(result).toBe(fmt(twToday(), true));
    expect(result.endsWith('T23:59:59+08:00')).toBe(true);
  });

  it('isEnd=false (預設)：時間取 00:00:00 (date_from 當天起始)', () => {
    expect(parseDateExpr('今天', false).endsWith('T00:00:00+08:00')).toBe(true);
  });

  it('同義詞別名映射一致 (本週=本周=這週；近七天=近 7 天)', () => {
    expect(parseDateExpr('本周')).toBe(parseDateExpr('本週'));
    expect(parseDateExpr('這週')).toBe(parseDateExpr('本週'));
    expect(parseDateExpr('近 7 天')).toBe(parseDateExpr('近七天'));
    expect(parseDateExpr('近 30 天')).toBe(parseDateExpr('近三十天'));
  });
});
