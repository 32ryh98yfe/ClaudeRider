// Unlocks (13-modes-rules §12): level gates from content files, shop prices, free rewards, purchases; medals; art slots.
import { describe, expect, it } from 'vitest';
import { ITEM_IDS, loadContent } from '@cr/content';
import { allUnlocks, buy, canBuy, isOwned, nextUnlock, unlockDef, unlockedBetween } from '../src/meta/unlocks.ts';
import { medalFor, medalTimes, fmtTicks, fmtDelta } from '../src/meta/medals.ts';
import { migrateSave } from '../src/meta/save.ts';
import { allKeys } from '../src/i18n/index.ts';
import { hasItemIcon, itemIconSvg } from '../src/ui/icons/itemIcons.ts';

describe('unlock catalogue', () => {
  it('characters and karts follow the §12.1 / §12.2 level tables', () => {
    const want: Record<string, number> = { clay: 1, pixel: 1, turbo: 3, anchor: 6, rune: 9, nova: 12, kage: 15, bisque: 18, frost: 21, glitch: 25, bolt: 30, duke: 35 };
    for (const [id, lv] of Object.entries(want)) expect(unlockDef(`character.${id}`)?.level, id).toBe(lv);
    const karts: Record<string, number> = { pebble: 1, clay_comet: 4, arrowhead: 8, tugboat: 12, glacier_sled: 16, neon_blade: 20, jet_kettle: 24, crown_cruiser: 30 };
    for (const [id, lv] of Object.entries(karts)) expect(unlockDef(`kart.${id}`)?.level, id).toBe(lv);
    for (const k of loadContent().karts.all) expect(unlockDef(`kart.${k.id}`)?.price).toBe(0);
  });
  it('cosmetic prices match §12.3 and free rewards cost nothing', () => {
    const price: Record<string, [number, number]> = {
      'livery.stripes': [1, 0], 'livery.sparkle': [2, 0], 'palette.midnight': [5, 300], 'livery.checker': [7, 500], 'palette.parchment': [10, 300], 'flame.violet': [13, 800],
      'palette.sage': [14, 300], 'livery.flames': [17, 700], 'palette.sky': [19, 300], 'livery.circuit': [22, 900], 'flame.teal': [23, 800], 'livery.wave': [27, 900],
      'livery.filigree': [32, 1200], 'flame.gold': [33, 1000], 'livery.aurora': [38, 1200], 'emote.pack2': [40, 1000], 'flame.white': [43, 1200], 'livery.chrome': [45, 1500],
      'livery.legend': [50, 0], 'title.legend': [50, 0],
    };
    for (const [id, [lv, p]] of Object.entries(price)) { const u = unlockDef(id); expect(u?.level, id).toBe(lv); expect(u?.price, id).toBe(p); }
  });
  it('every unlock has a name in both locales', () => {
    const ko = new Set(allKeys('ko')), en = new Set(allKeys('en'));
    for (const u of allUnlocks()) { expect(ko.has(u.nameKey), u.nameKey).toBe(true); expect(en.has(u.nameKey), u.nameKey).toBe(true); }
  });
  it('purchases: locked → notEnough → ok → owned', () => {
    const s = migrateSave({ v: 1 });
    const checker = unlockDef('livery.checker')!;
    expect(canBuy(checker, s)).toBe('locked');
    s.progress.level = 7;
    expect(canBuy(checker, s)).toBe('notEnough');
    s.progress.sparks = 600;
    expect(buy(checker, s)).toBe('ok');
    expect(s.progress.sparks).toBe(100);
    expect(isOwned(checker, s)).toBe(true);
    expect(buy(checker, s)).toBe('owned');
    expect(isOwned(unlockDef('character.turbo')!, s)).toBe(true); // free at level 3
  });
  it('reports unlocks crossed by a level-up and the next reward', () => {
    expect(unlockedBetween(2, 4).map((u) => u.id).sort()).toEqual(['character.turbo', 'kart.clay_comet']);
    expect(nextUnlock(1)?.level).toBe(2);
    expect(nextUnlock(50)).toBeUndefined();
  });
});

describe('Time Attack medals', () => {
  it('thresholds 103 / 108 / 115 % of the reference race', () => {
    expect(medalTimes(6000)).toEqual({ gold: 6180, silver: 6480, bronze: 6900 });
    expect(medalFor(6100, 6000)).toBe('gold');
    expect(medalFor(6400, 6000)).toBe('silver');
    expect(medalFor(6900, 6000)).toBe('bronze');
    expect(medalFor(7000, 6000)).toBeNull();
    expect(medalFor(null, 6000)).toBeNull();
  });
  it('formats ticks and deltas', () => {
    expect(fmtTicks(0)).toBe('--:--.---');
    expect(fmtTicks(3723)).toBe('1:02.050');
    expect(fmtDelta(-30)).toBe('−0.500');
    expect(fmtDelta(6)).toBe('+0.100');
  });
});

describe('item icons', () => {
  it('ship an original icon for each of the 18 item ids', () => {
    for (const id of ITEM_IDS) { expect(hasItemIcon(id), id).toBe(true); expect(itemIconSvg(id)).toContain('<svg'); }
  });
});
