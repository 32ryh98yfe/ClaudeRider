// Item-mode bot suite on every shipped track (12-items-spec §11, E "Races"): each track in the content manifest whose
// DSL exists in this checkout runs one 8-bot item race (Pro/Racer field, ≤ 2 laps to bound CI time) — ≥ 6/8
// finishers, nobody stuck > 5 s, projectiles finite and on the route, and the track has item boxes.
// World lanes' tracks join automatically on merge.
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BakedTrack, WorldState } from '@cr/sim';
import { frameScratch, pathCovers, pathS, sMainOf } from '../src/items/route.ts';
import { SFLAG } from '../src/track/format.ts';
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

/** Route features a homing projectile can cross (bit per feature), read from the route frame it flies on. */
const LOOP = 1, ZERO_G = 2, HELIX = 4;
/** Features the seed-31 race must carry at least one impacting homing projectile through. */
const MUST_HOME: Record<string, number> = { orbital_express: LOOP | ZERO_G | HELIX, skyway_interchange: HELIX, cascade_slalom: HELIX };

/**
 * Per-tick probe of every projectile: which features its route point is in, the largest per-tick change of its height
 * over the route (a snap), and its distance to the target on the tick before impact.
 */
function homingProbe(T: BakedTrack) {
  const F = frameScratch(), AI = { lineU: 0, vLim: 0, kappa: 0, turnAhead40: 0, driftZone: 0, width: 0 };
  const tags = new Map<number, number>(), lastH = new Map<number, number>();
  const out = { tags, maxStepH: 0, maxMiss: 0 };
  const tick = (w: WorldState): void => {
    for (const p of w.projectiles) {
      if (p.phase > 1) continue;
      const sm = sMainOf(T, p.s), path = pathCovers(T, p.path, sm) ? p.path : 0, s = pathS(T, path, sm);
      T.frameAt(path, s, F);
      T.aiAt(path, s, AI);
      let bits = tags.get(p.id) ?? 0;
      if (F.uy < 0.5) bits |= LOOP;
      if ((F.flags & SFLAG.GRAV_MASK) !== 0) bits |= ZERO_G;
      if (Math.abs(F.ty) > 0.03 && Math.abs(AI.kappa) > 1 / 45) bits |= HELIX;
      tags.set(p.id, bits);
      const h = (p.px - F.px) * F.ux + (p.py - F.py) * F.uy + (p.pz - F.pz) * F.uz;
      const prev = lastH.get(p.id);
      if (p.phase === 0 && prev !== undefined) out.maxStepH = Math.max(out.maxStepH, Math.abs(h - prev));
      lastH.set(p.id, h);
      if (p.phase === 1 && w.tick === p.impact - 1) {
        const b = w.karts[p.target]!.body;
        out.maxMiss = Math.max(out.maxMiss, Math.hypot(p.px - b.px, p.py - b.py, p.pz - b.pz));
      }
    }
  };
  return { out, tick };
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
      const probe = homingProbe(track!);
      const r = runItemRace({ track: rel, seed: 31, tiers: ['pro', 'racer'], laps: Math.min(2, track!.laps) }, undefined, probe.tick);
      expect(r.race.w.phase).toBe(4);
      expect(r.finishers).toBeGreaterThanOrEqual(6);
      expect(r.maxStuck).toBeLessThanOrEqual(300);
      expect(r.nanProjectiles).toBe(0);
      expect(r.offTrackProjectiles).toBe(0);
      expect([...r.uses.values()].reduce((a, b) => a + b, 0)).toBeGreaterThan(10);
      // homing through loops / zero-g / helices: projectiles that crossed a feature still land, glide (no snaps
      // over 1 m per tick, including mid-air launches) and meet the target
      const impact = new Set<number>(), fizzle = new Set<number>();
      for (const e of r.race.events) { if (e.t === 'projImpact') impact.add(e.obj); if (e.t === 'itemFizzle') fizzle.add(e.obj); }
      let landed = 0, featImpacts = 0, featFizzles = 0;
      for (const [objId, bits] of probe.out.tags) {
        if (!bits) continue;
        if (impact.has(objId)) { landed |= bits; featImpacts++; }
        if (fizzle.has(objId)) featFizzles++;
      }
      const must = MUST_HOME[id] ?? 0;
      expect(landed & must, 'features crossed by a landing homing projectile').toBe(must);
      expect(featFizzles, 'fizzles after crossing a feature').toBeLessThanOrEqual(Math.max(1, featImpacts / 10));
      expect(probe.out.maxStepH, 'per-tick height snap (m)').toBeLessThan(1);
      expect(probe.out.maxMiss, 'distance to target one tick before impact (m)').toBeLessThan(1.5);
    });
  }
});
