// Item-mode bot suite on every shipped track (12-items-spec §11, E "Races"): each track in the content manifest whose
// DSL exists in this checkout runs one 8-bot item race (Pro/Racer field, ≤ 2 laps to bound CI time) — ≥ 6/8
// finishers, nobody stuck > 5 s, projectiles finite and on the route, and the track has item boxes.
// World lanes' tracks join automatically on merge.
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BakedTrack } from '@cr/sim';
import { runItemRace } from './items-rig.ts';
import { bakedTrack, getContent } from './rig.ts';

const ROOT = new URL('../../../', import.meta.url);
const tracks = getContent().tracks.all
  .filter((t) => t.modes.includes('item') && existsSync(new URL(`tracks/${t.themeId}/${t.id}.ctd`, ROOT)))
  .map((t) => `${t.themeId}/${t.id}`);

/**
 * Known world-lane gaps (not L2's to fix): these are checked only once they bake and have item rows, so the suite
 * starts guarding them automatically when the owning lane lands the fix.
 */
const KNOWN_GAPS: Record<string, string> = {
  manor_catacombs: 'no ITEMS rows yet (L7)',
  rainline_blvd: 'does not bake yet (L6)',
};

function load(rel: string): BakedTrack | null {
  try { return bakedTrack(rel); } catch { return null; }
}

// L4's F1 fixture (shortcut branch, noItem zone): projectiles must follow targets onto the branch. Present once the
// F1 track features are merged; skipped before that.
const F1 = 'tracks/_test/f1_branch.ctd';
describe('item routes on the F1 branch fixture', () => {
  it.skipIf(!existsSync(new URL(F1, ROOT)))('an item race on f1_branch: finishers, sane projectiles, some riding the branch', () => {
    const rel = '_test/f1_branch';
    const track = bakedTrack(rel);
    expect(track.nPaths).toBeGreaterThan(1);
    let onBranch = 0;
    const r = runItemRace({ track: rel, seed: 41, tiers: ['pro', 'legend'], laps: 2 }, 60 * 60 * 6, (w) => { for (const p of w.projectiles) if (p.path !== 0) onBranch++; });
    expect(r.finishers).toBeGreaterThanOrEqual(6);
    expect(r.maxStuck).toBeLessThanOrEqual(300);
    expect(r.nanProjectiles).toBe(0);
    expect(r.offTrackProjectiles).toBe(0);
    expect(onBranch).toBeGreaterThan(0);
  });
});

describe('item-mode races on every track', () => {
  it('finds the shipped tracks', () => { expect(tracks.length).toBeGreaterThanOrEqual(2); });
  for (const rel of tracks) {
    const id = rel.split('/')[1]!;
    it(`${id}: item boxes, ≥ 6/8 finish, nobody stuck > 5 s, projectiles sane`, () => {
      const gap = KNOWN_GAPS[id];
      const track = gap ? load(rel) : bakedTrack(rel);
      if (gap && (!track || track.boxes.length === 0)) { console.warn(`[items] ${id} skipped: ${gap}`); return; }
      expect(track!.boxes.length, 'item rows').toBeGreaterThan(0);
      const r = runItemRace({ track: rel, seed: 31, tiers: ['pro', 'racer'], laps: Math.min(2, track!.laps) });
      expect(r.race.w.phase).toBe(4);
      expect(r.finishers).toBeGreaterThanOrEqual(6);
      expect(r.maxStuck).toBeLessThanOrEqual(300);
      expect(r.nanProjectiles).toBe(0);
      expect(r.offTrackProjectiles).toBe(0);
      expect([...r.uses.values()].reduce((a, b) => a + b, 0)).toBeGreaterThan(10);
    });
  }
});
