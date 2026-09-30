// ko/en key parity (100%) and placeholder parity.
import { describe, expect, it } from 'vitest';
import { allKeys, t, locale, josa } from '../src/i18n/index.ts';

describe('i18n', () => {
  it('ko and en have identical key sets', () => {
    const ko = new Set(allKeys('ko')), en = new Set(allKeys('en'));
    expect([...ko].filter((k) => !en.has(k)), 'missing in en').toEqual([]);
    expect([...en].filter((k) => !ko.has(k)), 'missing in ko').toEqual([]);
  });
  it('placeholders match between locales', () => {
    const ph = (s: string): string => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const k of allKeys('ko')) {
      locale.value = 'ko'; const a = t(k);
      locale.value = 'en'; const b = t(k);
      expect(ph(b), k).toBe(ph(a));
    }
    locale.value = 'ko';
  });
  it('josa picks particles by final consonant', () => {
    expect(josa('클로드', '이/가')).toBe('클로드가');
    expect(josa('초원 순환로', '을/를')).toBe('초원 순환로를');
    expect(josa('링', '은/는')).toBe('링은');
  });
});
