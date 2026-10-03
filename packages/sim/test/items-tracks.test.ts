// Item-mode bot suite on every shipped track (12-items-spec §11, E "Races"): each track in the content manifest whose
// DSL exists in this checkout runs one 8-bot item race (Pro/Racer field, ≤ 2 laps to bound CI time) — ≥ 6/8
// finishers, nobody stuck > 5 s, projectiles finite and on the route, and the track has item boxes.
// World lanes' tracks join automatically on merge.
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BakedTrack, WorldState } from '@cr/sim';
import { frameScratch, pathCovers, pathS, sMainOf } from '../src/items/route.ts';
import { SFLAG } from '../src/track/format.ts';
import { spawnProjectile } from '../src/items/projectiles.ts';
import { runRace } from '../src/ai/balance.ts';
import { runItemRace } from './items-rig.ts';
import { bakedTrack, getContent } from './rig.ts';
import { flatPlane } from './fixtures/kits.ts';
import { place, racingRig } from './util.ts';

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
/** Orbital's three features have guaranteed scripted shots below; its three random
 * races still check completion and every projectile's geometry independently. */
const MUST_HOME: Record<string, number> = { skyway_interchange: HELIX, cascade_slalom: HELIX };

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

describe('controlled homing routes', () => {
  it('an airborne launch eases down without a one-metre height snap', () => {
    const track = flatPlane().track;
    const rig = racingRig(track, { mode: 'item', slots: [{}, {}] });
    place(rig, 0, { s: 300, h: 8, speed: 0 });
    place(rig, 1, { s: 500, speed: 0 });
    const shot = spawnProjectile(rig.w, rig.ctx, getContent().items.get('prompt_missile'), 0, 1);
    const initialHeight = shot.h;
    const probe = homingProbe(track);
    probe.tick(rig.w);
    for (let tick = 0; tick < 20; tick++) { rig.tick(); probe.tick(rig.w); }
    expect(initialHeight).toBeGreaterThan(8);
    expect(shot.h).toBeLessThan(2);
    expect(probe.out.maxStepH).toBeLessThan(1);
  });

  it.each([['inverted loop', LOOP], ['low-gravity tube', ZERO_G], ['docking helix', HELIX]] as const)('a guaranteed Orbital shot traverses the %s and still meets its target', (_name, feature) => {
    const track = bakedTrack('orbital_nexus/orbital_express');
    const frame = frameScratch();
    const ai = { lineU: 0, vLim: 0, kappa: 0, turnAhead40: 0, driftZone: 0, width: 0 };
    let first = -1, last = -1, spanStart = -1;
    // Locate the actual feature from baked frames, without coupling
    // the test to a particular station number or an AI's item-use random seed.
    for (let s = 0; s < track.path(0).length; s++) {
      track.frameAt(0, s, frame);
      track.aiAt(0, s, ai);
      // The loop also carries rotated gravity and a pitched tangent. Exclude
      // RMF from the other searches so three distinct spans must be exercised.
      const rmf = (frame.flags & SFLAG.RMF) !== 0;
      const matches = feature === LOOP ? frame.uy < 0.5
        : feature === ZERO_G ? !rmf && (frame.flags & SFLAG.GRAV_MASK) !== 0
          : !rmf && Math.abs(frame.ty) > 0.03 && Math.abs(ai.kappa) > 1 / 45;
      if (matches) { if (spanStart < 0) spanStart = s; }
      else if (spanStart >= 0) {
        // Isolated tessellation transitions can satisfy the slope/curvature
        // predicate for one sample. Use the longest real feature span.
        if (s - 1 - spanStart > last - first) { first = spanStart; last = s - 1; }
        spanStart = -1;
      }
    }
    expect(last - first).toBeGreaterThan(10);
    const rig = racingRig(track, { mode: 'item', slots: [{}, {}] });
    place(rig, 0, { s: first - 30, speed: 0 });
    place(rig, 1, { s: last + 50, speed: 0 });
    const shot = spawnProjectile(rig.w, rig.ctx, getContent().items.get('prompt_missile'), 0, 1);
    const shotId = shot.id, probe = homingProbe(track);
    for (let tick = 0; tick < 500 && rig.w.projectiles.length; tick++) { rig.tick(); probe.tick(rig.w); }
    expect((probe.out.tags.get(shotId) ?? 0) & feature).toBe(feature);
    expect(rig.events.filter((event) => event.t === 'projImpact' && event.obj === shotId)).toHaveLength(1);
    expect(rig.events.some((event) => event.t === 'itemFizzle' && event.obj === shotId)).toBe(false);
    expect(probe.out.maxStepH).toBeLessThan(1);
    expect(probe.out.maxMiss).toBeLessThan(1.5);
  });
});

describe('headless item-combat opt-in', () => {
  it('enables actual item use and opponent hits while retaining the legacy pace-only default', () => {
    const setup = {
      track: bakedTrack('clayhill_village/meadow_loop'), content: getContent(), mode: 'item' as const,
      bots: Array.from({ length: 8 }, () => ({ tier: 'pro' as const })), seed: 4242, laps: 1, lookahead: 8,
    };
    const driving = runRace(setup), combat = runRace({ ...setup, itemCombat: true });
    expect(driving.itemsUsed).toBe(0);
    expect(driving.combatEffectHits).toBe(0);
    expect(combat.itemsUsed).toBeGreaterThan(10);
    expect(combat.effectHits).toBeGreaterThan(0);
    expect(combat.combatEffectHits).toBeGreaterThan(0);
    expect(combat.karts.filter((kart) => kart.finished).length).toBeGreaterThanOrEqual(6);
  });
});

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
      const must = MUST_HOME[id] ?? 0;
      let landed = 0;
      const homing = (race: typeof r.race, pr: ReturnType<typeof homingProbe>, seed: number): void => {
        const impact = new Set<number>(), fizzle = new Set<number>();
        for (const e of race.events) { if (e.t === 'projImpact') impact.add(e.obj); if (e.t === 'itemFizzle') fizzle.add(e.obj); }
        let featImpacts = 0, featFizzles = 0;
        for (const [objId, bits] of pr.out.tags) {
          if (!bits) continue;
          if (impact.has(objId)) { landed |= bits; featImpacts++; }
          if (fizzle.has(objId)) featFizzles++;
        }
        expect(featFizzles, `fizzles after crossing a feature (seed ${seed})`).toBeLessThanOrEqual(Math.max(1, featImpacts / 10));
        expect(pr.out.maxStepH, `per-tick height snap (m, seed ${seed})`).toBeLessThan(1);
        expect(pr.out.maxMiss, `distance to target one tick before impact (m, seed ${seed})`).toBeLessThan(1.5);
      };
      homing(r.race, probe, 31);
      // feature coverage needs a homing shot fired across each feature that also lands, which a single race does not
      // always produce (where the bots fire depends on how the race unfolds): up to two more races top it up
      for (let seed = 32; seed <= 33 && (id === 'orbital_express' || (landed & must) !== must); seed++) {
        const pr = homingProbe(track!);
        const extra = runItemRace({ track: rel, seed, tiers: ['pro', 'racer'], laps: Math.min(2, track!.laps) }, undefined, pr.tick);
        expect(extra.race.w.phase).toBe(4);
        expect(extra.finishers).toBeGreaterThanOrEqual(6);
        expect(extra.maxStuck).toBeLessThanOrEqual(300);
        expect(extra.nanProjectiles).toBe(0);
        expect(extra.offTrackProjectiles).toBe(0);
        homing(extra.race, pr, seed);
      }
      expect(landed & must, 'features crossed by a landing homing projectile').toBe(must);
    });
  }
});
