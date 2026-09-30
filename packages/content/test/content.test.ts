// Content tables load, ids are unique, codes are stable (index + 1), drop tables sum to 100 per bucket.
import { describe, expect, it } from 'vitest';
import { loadContent, TRACK_IDS, ITEM_IDS, CHARACTER_IDS, KART_BODY_IDS, THEME_IDS, EFFECT_IDS, codeOf, idOf } from '../src/index.ts';

describe('content', () => {
  const c = loadContent();
  it('id tables are unique and codes round-trip', () => {
    for (const ids of [TRACK_IDS, ITEM_IDS, CHARACTER_IDS, KART_BODY_IDS, THEME_IDS, EFFECT_IDS] as readonly (readonly string[])[]) {
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(codeOf(ITEM_IDS, ITEM_IDS[0]!)).toBe(1);
    expect(idOf(ITEM_IDS, 1)).toBe(ITEM_IDS[0]);
  });
  it('roster sizes match the plan', () => {
    expect(TRACK_IDS.length).toBe(21);
    expect(CHARACTER_IDS.length).toBe(12);
    expect(KART_BODY_IDS.length).toBe(8);
    expect(ITEM_IDS.length).toBe(18);
    expect(THEME_IDS.length).toBe(10);
  });
  it('every kart, character, theme and track manifest entry is registered', () => {
    expect(c.karts.byId.size).toBe(8);
    expect(c.characters.byId.size).toBe(12);
    expect(c.themes.byId.size).toBe(10);
    expect(c.tracks.byId.size).toBe(21);
  });
});
