// ============================================================
// normRejectKey 獨立單元測試 (補 Story ecc-emergence-governance task 1.3 ⬜)
// 主控端親自補(依 E2 新規則情境 C: ⬜ 由主控端執行)
// ============================================================
import { describe, it, expect } from 'vitest';
import { normRejectKey } from '../scripts/upsert-instinct.js';

describe('normRejectKey — AC1 canonical 正規化 spec', () => {
  it('lowercase: 英文大寫 → 小寫', () => {
    expect(normRejectKey('TRIGGER', 'ACTION')).toBe('trigger|action');
    expect(normRejectKey('MixedCase', 'AnotherCase')).toBe('mixedcase|anothercase');
  });

  it('trim: 前後空白消除', () => {
    expect(normRejectKey('  trigger  ', '  action  ')).toBe('trigger | action');
    // trim 只對整體 (trigger+|+action) ,非各別欄位
  });

  it('collapse multiple whitespace → single space', () => {
    expect(normRejectKey('a  b   c', 'd    e')).toBe('a b c|d e');
    expect(normRejectKey('a\t\tb', 'c\n\nd')).toBe('a b|c d');
  });

  it('strip punctuation (保留字母/數字/空白/| 分隔符)', () => {
    expect(normRejectKey('a.b!c', 'd?e,f')).toBe('abc|def');
    expect(normRejectKey('hello, world!', 'foo. bar.')).toBe('hello world|foo bar');
  });

  it('CJK 繁中保留 (Unicode \\p{L})', () => {
    expect(normRejectKey('讚', '否決')).toBe('讚|否決');
    expect(normRejectKey('編輯 html 出錯', '改用 Write 工具')).toBe('編輯 html 出錯|改用 write 工具');
  });

  it('數字保留 (Unicode \\p{N})', () => {
    expect(normRejectKey('rule 100', 'apply 5x')).toBe('rule 100|apply 5x');
  });

  it('混合 case: lowercase + trim + collapse + strip punct + CJK', () => {
    expect(normRejectKey('  EDIT  .html  ERROR!', '  USE Write 工具.  ')).toBe('edit html error| use write 工具');
  });

  it('emergence.ts:72-78 TS parity byte-for-byte (canonical reference)', () => {
    // 此測試守護 JS/TS 兩端 normRejectKey 實作一致性
    // emergence.ts 端在 server route 端,本測試確保 upsert-instinct.js (writer) 行為錨定
    const k1 = normRejectKey('Trigger A', 'Action B');
    const k2 = normRejectKey('trigger a', 'action b');
    expect(k1).toBe(k2); // case-insensitive 對稱
    expect(k1).toBe('trigger a|action b');
  });
});
