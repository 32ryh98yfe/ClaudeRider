// Physics fixtures (10-sim-spec §14, 50-test-plan §5): flat plane, straight corridor and corner kits. They are
// built in code rather than in the track DSL so every dimension is exact and independent of trackc's tessellation.
import type { SurfaceId } from '@cr/content';
import { SFLAG, type ZoneBaked } from '@cr/sim';
import { arcLen, buildFixture, flatProfile, newMesh, rmfFrames, surf, sweep, turtle, wallStrip, type Fixture, type ProfilePt, type Seg } from './builder.ts';

const cache = new Map<string, Fixture>();
const memo = (key: string, make: () => Fixture): Fixture => { let f = cache.get(key); if (!f) { f = make(); cache.set(key, f); } return f; };

/** Flat plane 1 km wide along +x (start line at x = 0, main path from x = −100). No walls. */
export function flatPlane(): Fixture {
  return memo('flat', () => {
    const F = turtle([{ len: 2600 }], { x: -100, ds: 1 });
    const ground = newMesh();
    sweep(ground, F, () => flatProfile(-500, 500, 50), { every: 10 });
    return buildFixture({ id: 'flat', paths: [{ kind: 'main', closed: false, frames: F, wL: 500, wR: 500 }], ground, lineAt: 100 });
  });
}

/** Straight corridor `width` m wide (walls at ±width/2, 1 m high) along +x. */
export function corridor(width = 16, len = 1600): Fixture {
  return memo(`corridor${width}`, () => {
    const F = turtle([{ len }], { x: -100, ds: 1 });
    const ground = newMesh(), walls = newMesh();
    sweep(ground, F, () => flatProfile(-width / 2 - 2, width / 2 + 2, 8), { every: 4 });
    wallStrip(walls, F, () => -width / 2, -0.6, 1.0, { every: 4 });
    wallStrip(walls, F, () => width / 2, -0.6, 1.0, { every: 4 });
    return buildFixture({ id: 'corridor', paths: [{ kind: 'main', closed: false, frames: F, wL: width / 2, wR: width / 2 }], ground, walls, lineAt: 100 });
  });
}

/**
 * 20 m straight along +x whose road is `surfId` between s = `from` and `to` (asphalt elsewhere), with optional
 * zones. Surface codes are per ground quad; zones use main-path (s, u) boxes.
 */
export function strip(surfId: SurfaceId, o: { from?: number; to?: number; zones?: ZoneBaked[]; key?: string; len?: number } = {}): Fixture {
  const from = o.from ?? 100, to = o.to ?? 1100, len = o.len ?? 1300;
  return memo(`strip:${surfId}:${from}:${to}:${o.key ?? ''}`, () => {
    const F = turtle([{ len }], { x: -100, ds: 1 });
    const ground = newMesh();
    const code = surf(surfId), asphalt = surf('asphalt');
    sweep(ground, F, () => flatProfile(-12, 12, 8), { every: 1, quad: (i) => [i >= from && i < to ? code : asphalt, 0] });
    return buildFixture({ id: `strip_${surfId}`, paths: [{ kind: 'main', closed: false, frames: F, wL: 12, wR: 12 }], ground, lineAt: 100, zones: o.zones ?? [] });
  });
}

export interface JumpKit extends Fixture { lipS: number; landS0: number; landS1: number; lipY: number; landY: number }

/**
 * Jump (gap-3 Magma worked example): flat to s = 200, an 8° ramp to the lip at s = 212 (1.69 m high), a 14 m gap,
 * then a landing deck `drop` metres below the start level. `declared` adds the JumpBaked record and JUMP flags.
 */
export function jumpKit(drop = 2, declared = true): JumpKit {
  const lip0 = 200, lipS = 212, landS0 = 226, landS1 = 266;
  const t8 = Math.tan((8 * Math.PI) / 180), lipY = (lipS - lip0) * t8;
  const gapSlope = (-drop - lipY) / (landS0 - lipS);
  const y = (s: number): number => (s < lip0 ? 0 : s <= lipS ? (s - lip0) * t8 : s < landS0 ? lipY + gapSlope * (s - lipS) : -drop);
  const slope = (s: number): number => (s < lip0 ? 0 : s <= lipS ? t8 : s < landS0 ? gapSlope : 0);
  // frame i sits at plan distance i − 100 from the line; path s is the 3D arc length (the gap's drop adds to it)
  const F = turtle([{ len: 700 }], { x: -100, ds: 1, y: (s) => y(s - 100), slope: (s) => slope(s - 100) });
  const S = arcLen(F), at = (plan: number): number => S[100 + plan]!;
  const f = memo(`jump${drop}${declared}`, () => {
    const ground = newMesh();
    // the gap has samples (progress continues) but no ground
    sweep(ground, F, () => flatProfile(-9, 9, 6), { every: 1, skip: (i) => i - 100 >= lipS && i - 100 < landS0 });
    const walls = newMesh();
    wallStrip(walls, F, () => -9, -0.6, 1.0, { every: 1, to: 100 + lipS });
    wallStrip(walls, F, () => 9, -0.6, 1.0, { every: 1, to: 100 + lipS });
    wallStrip(walls, F, () => -9, -0.6, 1.0, { every: 1, from: 100 + landS0 });
    wallStrip(walls, F, () => 9, -0.6, 1.0, { every: 1, from: 100 + landS0 });
    return buildFixture({
      id: 'jump', paths: [{ kind: 'main', closed: false, frames: F, wL: 9, wR: 9, flags: (i) => (declared && i - 100 >= lipS && i - 100 <= landS1 ? SFLAG.JUMP : 0) }],
      ground, walls, lineAt: 100, killY: -drop - 15,
      jumps: declared ? [{ path: 0, lipS: at(lipS), landS0: at(landS0), landS1: at(landS1), vMin: 25, vMax: 46 }] : [],
    });
  });
  return Object.assign(f, { lipS: at(lipS), landS0: at(landS0), landS1: at(landS1), lipY, landY: -drop });
}

export interface HalfpipeKit extends Fixture { floor: number; radius: number; maxDeg: number; profile: ProfilePt[] }

/** Halfpipe: a 12 m flat floor, circular walls of radius 8 m rising to `maxDeg` on both sides, lips on top. */
export function halfpipe(maxDeg = 60): HalfpipeKit {
  const floor = 6, R = 8, n = 12;
  const prof: ProfilePt[] = [];
  const side = (sg: number): ProfilePt[] => Array.from({ length: n }, (_, j) => {
    const th = (((n - j) / n) * maxDeg * Math.PI) / 180;
    return { u: sg * (floor + R * Math.sin(th)), h: R * (1 - Math.cos(th)), nu: -sg * Math.sin(th), nh: Math.cos(th) };
  });
  prof.push(...side(-1));
  for (let k = 0; k <= 6; k++) prof.push({ u: -floor + (2 * floor * k) / 6, h: 0, nu: 0, nh: 1 });
  prof.push(...side(1).reverse());
  const f = memo(`halfpipe${maxDeg}`, () => {
    const F = turtle([{ len: 900 }], { x: -100, ds: 1 });
    const ground = newMesh(), walls = newMesh();
    sweep(ground, F, () => prof, { every: 2 });
    const top = floor + R * Math.sin((maxDeg * Math.PI) / 180), topH = R * (1 - Math.cos((maxDeg * Math.PI) / 180));
    wallStrip(walls, F, () => -top, topH - 0.6, topH + 2.5, { every: 2 });
    wallStrip(walls, F, () => top, topH - 0.6, topH + 2.5, { every: 2 });
    return buildFixture({ id: 'halfpipe', paths: [{ kind: 'main', closed: false, frames: F, wL: top, wR: top }], ground, walls, lineAt: 100 });
  });
  return Object.assign(f, { floor, radius: R, maxDeg, profile: prof });
}

export interface LoopKit extends Fixture { loopS0: number; loopS1: number; radius: number }

/**
 * Vertical loop (R = 12 m) with a lateral shift of 14 m so entry and exit do not overlap, between a 150 m approach
 * and a 250 m exit. Rotation-minimizing frames throughout; track gravity (−U·28) on the loop and 10 m either side.
 */
export function loopKit(R = 12, shift = 14): LoopKit {
  const approach = 150, exit = 250;
  const pts: { x: number; y: number; z: number }[] = [];
  for (let s = 0; s < approach; s += 0.5) pts.push({ x: s - approach, y: 0, z: 0 });
  const loopLen = Math.hypot(2 * Math.PI * R, shift), nL = Math.round(loopLen / 0.5);
  for (let k = 0; k < nL; k++) { const th = (2 * Math.PI * k) / nL; pts.push({ x: R * Math.sin(th), y: R * (1 - Math.cos(th)), z: (shift * k) / nL }); }
  for (let s = 0; s <= exit; s += 0.5) pts.push({ x: s, y: 0, z: shift });
  const iLoop0 = Math.round(approach / 0.5), iLoop1 = iLoop0 + nL;
  const f = memo(`loop${R}_${shift}`, () => {
    const F = rmfFrames(pts, { x: 0, y: 1, z: 0 }, [iLoop0, iLoop1]);
    const ground = newMesh(), walls = newMesh();
    sweep(ground, F, () => flatProfile(-7, 7, 6), { every: 1 });
    wallStrip(walls, F, () => -7, -0.6, 1.0, { every: 1 });
    wallStrip(walls, F, () => 7, -0.6, 1.0, { every: 1 });
    const s0 = approach, s1 = approach + loopLen;
    return buildFixture({
      id: 'loop', paths: [{ kind: 'main', closed: false, frames: F, wL: 7, wR: 7, flags: (_i, s) => (s >= s0 - 10 && s <= s1 + 10 ? (1 << SFLAG.GRAV_SHIFT) | SFLAG.RMF : 0) }],
      ground, walls, lineAt: 20,
    });
  });
  return Object.assign(f, { loopS0: approach, loopS1: approach + loopLen, radius: R });
}

export interface HelixKit extends Fixture { radius: number; rise: number; turns: number; deckY(x: number, z: number): number[] }

/** Stacked decks: a helix of radius 40 m, `rise` metres per turn (≥ 8 m separation), 12 m road with walls. */
export function helixKit(rise = 10, turns = 2.5, radius = 40): HelixKit {
  const f = memo(`helix${rise}_${turns}`, () => {
    const L = 2 * Math.PI * radius * turns;
    const segs: Seg[] = [{ len: 60 }, { r: radius, deg: 360 * turns, dir: 'L' }, { len: 60 }];
    const F = turtle(segs, { ds: 1, y: (s) => (s < 60 ? 0 : s < 60 + L ? ((s - 60) / (2 * Math.PI * radius)) * rise : rise * turns) });
    const ground = newMesh(), walls = newMesh();
    sweep(ground, F, () => flatProfile(-6, 6, 6), { every: 1 });
    wallStrip(walls, F, () => -6, -0.6, 1.0, { every: 1 });
    wallStrip(walls, F, () => 6, -0.6, 1.0, { every: 1 });
    return buildFixture({ id: 'helix', paths: [{ kind: 'main', closed: false, frames: F, wL: 6, wR: 6 }], ground, walls, lineAt: 20 });
  });
  const cx = 60, cz = -radius; // centre of the left-turning helix entered at (60, 0) heading +x
  return Object.assign(f, {
    radius, rise, turns,
    /** Deck heights above (x, z), bottom first. */
    deckY(x: number, z: number): number[] {
      // (x − cx, z − cz) = R·(sin ψ, cos ψ) where ψ is the heading turned so far
      let a = Math.atan2(x - cx, z - cz);
      if (a < 0) a += 2 * Math.PI;
      const out: number[] = [];
      for (let k = 0; k <= turns; k++) { const frac = (a + 2 * Math.PI * k) / (2 * Math.PI); if (frac <= turns) out.push(frac * rise); }
      return out;
    },
  });
}

export interface CornerKit extends Fixture { arcStart: number; arcEnd: number; width: number; rc: number; deg: number }

/**
 * Corner kit (gap-2 corner harness): 200 m approach, one arc of radius `rc` turning `deg` (left), 260 m exit,
 * on a `width` m road with walls at the road edges.
 */
export function cornerKit(rc: number, deg: number, width = 12): CornerKit {
  const key = `corner${rc}_${deg}_${width}`;
  const f = memo(key, () => {
    const segs: Seg[] = [{ len: 200 }, { r: rc, deg, dir: 'L' }, { len: 260 }];
    const F = turtle(segs, { ds: 0.5 });
    const ground = newMesh(), walls = newMesh();
    sweep(ground, F, () => flatProfile(-width / 2 - 1.5, width / 2 + 1.5, 6), { every: 1 });
    wallStrip(walls, F, () => -width / 2, -0.6, 1.0, { every: 1 });
    wallStrip(walls, F, () => width / 2, -0.6, 1.0, { every: 1 });
    return buildFixture({ id: key, paths: [{ kind: 'main', closed: false, frames: F, wL: width / 2, wR: width / 2 }], ground, walls, lineAt: 10 });
  });
  const arcLen = (rc * deg * Math.PI) / 180;
  return Object.assign(f, { arcStart: 200, arcEnd: 200 + arcLen, width, rc, deg });
}
