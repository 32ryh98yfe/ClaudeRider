// Item-mode bot suite on every shipped track (12-items-spec §11, E "Races"): each track in the content manifest whose
// DSL exists in this checkout runs one 8-bot item race (Pro/Racer field) — ≥ 6/8 finishers, nobody stuck > 5 s,
// projectiles finite and on the route, and the track has item boxes. World lanes' tracks join automatically on merge.
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runItemRace } from './items-rig.ts';
import { bakedTrack, getContent } from './rig.ts';

const ROOT = new URL('../../../', import.meta.url);
const tracks = getContent().tracks.all
  .filter((t) => t.modes.includes('item') && existsSync(new URL(`tracks/${t.themeId}/${t.id}.ctd`, ROOT)))
  .map((t) => `${t.themeId}/${t.id}`);

describe('item-mode races on every track', () => {
  it('finds the shipped tracks', () => { expect(tracks.length).toBeGreaterThanOrEqual(2); });
  for (const rel of tracks) {
    it(`${rel.split('/')[1]}: item boxes, ≥ 6/8 finish, nobody stuck > 5 s, projectiles sane`, () => {
      expect(bakedTrack(rel).boxes.length, 'item rows').toBeGreaterThan(0);
      const r = runItemRace({ track: rel, seed: 31, tiers: ['pro', 'racer'] });
      expect(r.race.w.phase).toBe(4);
      expect(r.finishers).toBeGreaterThanOrEqual(6);
      expect(r.maxStuck).toBeLessThanOrEqual(300);
      expect(r.nanProjectiles).toBe(0);
      expect(r.offTrackProjectiles).toBe(0);
      expect([...r.uses.values()].reduce((a, b) => a + b, 0)).toBeGreaterThan(20);
    });
  }
});
