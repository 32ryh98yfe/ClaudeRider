// Item-mode bot suite (12-items-spec §11, E thresholds): 8 bots (driver + item brain) finish ≥ 6/8, nobody is stuck
// > 5 s, projectiles stay finite and on the route, and across a seeded batch every item is used and every effect
// applied at least once.
import { describe, expect, it } from 'vitest';
import { EFFECT_IDS, ITEM_IDS } from '@cr/content';
import { runItemRace, MEADOW, RING, type ItemRaceOptions } from './items-rig.ts';

const BATCH: ItemRaceOptions[] = [
  { track: MEADOW, teams: 'solo', seed: 1, tiers: ['pro', 'racer', 'legend', 'rookie'] },
  { track: RING, teams: 'solo', seed: 2, tiers: ['racer'] },
  { track: MEADOW, teams: 'squad', seed: 3, tiers: ['pro'] },
  { track: RING, teams: 'duo', seed: 4, tiers: ['pro', 'racer', 'legend', 'rookie'] },
  { track: MEADOW, teams: 'duo', seed: 5, tiers: ['racer'], itemSet: 'chaos' },
  { track: RING, teams: 'solo', seed: 6, tiers: ['pro'], itemSet: 'light' },
];

describe('item-mode bot races', () => {
  const uses = new Map<string, number>(), hits = new Map<string, number>();
  const rows: string[] = [];
  for (const o of BATCH) {
    it(`${o.track!.split('/')[1]} ${o.teams} ${o.itemSet ?? 'standard'} seed ${o.seed}: ≥ 6/8 finish, nobody stuck > 5 s, projectiles sane`, () => {
      const r = runItemRace(o);
      for (const [k, v] of r.uses) uses.set(k, (uses.get(k) ?? 0) + v);
      for (const [k, v] of r.hits) hits.set(k, (hits.get(k) ?? 0) + v);
      rows.push(`${o.track!.split('/')[1]} ${o.teams} seed ${o.seed}: finishers ${r.finishers}/8, max stuck ${r.maxStuck} ticks, uses ${[...r.uses.values()].reduce((a, b) => a + b, 0)}, hits ${[...r.hits.values()].reduce((a, b) => a + b, 0)}`);
      expect(r.race.w.phase).toBe(4);
      expect(r.finishers).toBeGreaterThanOrEqual(6);
      expect(r.maxStuck).toBeLessThanOrEqual(300);
      expect(r.nanProjectiles).toBe(0);
      expect(r.offTrackProjectiles).toBe(0);
      for (const k of r.race.w.karts) expect(Number.isFinite(k.body.px + k.body.py + k.body.pz + k.body.vx + k.body.vy + k.body.vz), `slot ${k.slot}`).toBe(true);
    });
  }

  it('across the batch every item is used and every effect applied at least once', () => {
    const unusedItems = ITEM_IDS.filter((id) => !uses.get(id));
    const unappliedEffects = EFFECT_IDS.filter((id) => !hits.get(id));
    console.log(rows.join('\n'));
    console.log('item uses:', [...uses.entries()].sort().map(([k, v]) => `${k} ${v}`).join(', '));
    console.log('effect hits:', [...hits.entries()].sort().map(([k, v]) => `${k} ${v}`).join(', '));
    expect(unusedItems).toEqual([]);
    expect(unappliedEffects).toEqual([]);
  });
});
