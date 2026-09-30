// Track zones (11-track-spec §10, 10-sim-spec §13.2): (path, s, u) boxes that override the surface, scale the
// target speed (conveyors), kill, forbid items, or change gravity; kill planes may instead carry a world-space
// (x, z) AABB with a `belowY` plane (.ctrk v2). Pure lookups on baked data; allocation-free.
import type { SurfaceDef } from '@cr/content';
import type { KartState, TrackLoc } from '../core/state.ts';
import type { BakedTrack, GravityOut } from '../track/BakedTrack.ts';
import { SFLAG, type ZoneBaked } from '../track/format.ts';

const ZK = { conveyor: 1, surface: 2, kill: 3, noItem: 4, camera: 5, gravity: 6 } as const;
const G_WORLD = 28;

/**
 * True when `loc` lies inside the zone's (s, u) box. On closed paths a box may be written past the lap end
 * (s1 > L, the trackc convention) or wrap (s1 < s0).
 */
export function inZone(z: Readonly<ZoneBaked>, loc: Readonly<TrackLoc>, T: BakedTrack): boolean {
  if (z.path !== loc.path || z.aabb || loc.u < z.u0 || loc.u > z.u1) return false;
  const s = loc.s;
  if (z.s1 < z.s0) return s >= z.s0 || s <= z.s1;
  if (s >= z.s0 && s <= z.s1) return true;
  const pm = T.path(loc.path);
  return pm.closed && s + pm.length >= z.s0 && s + pm.length <= z.s1;
}

function kindCode(z: Readonly<ZoneBaked>): number { return ZK[z.kind] ?? 0; }

/** Surface under the kart after `surface` zone overrides (the ground triangle's surface otherwise). */
export function effectiveSurface(k: Readonly<KartState>, track: BakedTrack, byCode: ReadonlyArray<SurfaceDef | undefined>, fallback: SurfaceDef): SurfaceDef {
  const zs = track.zones;
  for (let i = 0; i < zs.length; i++) {
    const z = zs[i]!;
    if (kindCode(z) === ZK.surface && z.surf !== undefined && inZone(z, k.race.loc, track)) {
      const d = byCode[z.surf];
      if (d) return d;
    }
  }
  return byCode[k.body.surf] ?? fallback;
}

/** Target-speed multiplier from conveyor surfaces and conveyor zones (1 = none). */
export function conveyorMul(k: Readonly<KartState>, track: BakedTrack, def: Readonly<SurfaceDef>): number {
  let m = def.conveyor ?? 1;
  const zs = track.zones;
  for (let i = 0; i < zs.length; i++) {
    const z = zs[i]!;
    if (kindCode(z) === ZK.conveyor && inZone(z, k.race.loc, track)) m *= z.speedMul ?? 1;
  }
  return m;
}

/**
 * Kill zones: an (s, u) box (optionally only below its `belowY` plane), or a kill plane — a world (x, z) AABB, or
 * the whole track when the box is empty, below `belowY` (lava lakes, voids).
 */
export function inKillZone(k: Readonly<KartState>, track: BakedTrack): boolean {
  const zs = track.zones, b = k.body;
  for (let i = 0; i < zs.length; i++) {
    const z = zs[i]!;
    if (kindCode(z) !== ZK.kill) continue;
    if (z.aabb) {
      const a = z.aabb;
      if (b.px >= a[0] && b.px <= a[2] && b.pz >= a[1] && b.pz <= a[3] && (z.belowY === undefined || b.py < z.belowY)) return true;
    } else if (z.s1 > z.s0 || z.s1 < z.s0) {
      if (inZone(z, k.race.loc, track) && (z.belowY === undefined || b.py < z.belowY)) return true;
    } else if (z.belowY !== undefined && b.py < z.belowY) return true;
  }
  return false;
}

/**
 * Items may not place boxes or hazards here, and drops inside fizzle (lane L2 consumes this). True inside a
 * `noItem` zone or on a sample flagged NO_ITEM.
 */
export function isNoItem(track: BakedTrack, loc: Readonly<TrackLoc>): boolean {
  const zs = track.zones;
  for (let i = 0; i < zs.length; i++) { const z = zs[i]!; if (kindCode(z) === ZK.noItem && inZone(z, loc, track)) return true; }
  return (sampleFlags(track, loc.path, loc.s) & SFLAG.NO_ITEM) !== 0;
}

const FS = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 };
/** Sample flags at (path, s): the track's own query when it has one (.ctrk v2), else the nearest frame sample. */
export function sampleFlags(track: BakedTrack, path: number, s: number): number {
  if (track.flagsAt) return track.flagsAt(path, s);
  track.frameAt(path, s, FS);
  return FS.flags;
}

/**
 * Gravity at the kart: the sample's gravity mode (track.gravityAt, which also reads per-span low-g scales), then a
 * `gravity` zone override. v2 zones carry `gravMode` / `gravScale`; older fixtures store the mode in `surf` and the
 * scale in `speedMul`.
 */
export function gravityFor(track: BakedTrack, loc: Readonly<TrackLoc>, out: GravityOut): void {
  track.gravityAt(loc, out);
  const zs = track.zones;
  for (let i = 0; i < zs.length; i++) {
    const z = zs[i]!;
    if (kindCode(z) !== ZK.gravity || !inZone(z, loc, track)) continue;
    const mode = z.gravMode ?? z.surf ?? 0;
    if (mode === 1) {
      track.frameAt(loc.path, loc.s, FS);
      out.x = -FS.ux * G_WORLD; out.y = -FS.uy * G_WORLD; out.z = -FS.uz * G_WORLD; out.scale = 1;
    } else {
      const sc = mode === 2 ? (z.gravScale ?? z.speedMul ?? 0.4) : 1;
      out.x = 0; out.y = -G_WORLD * sc; out.z = 0; out.scale = sc;
    }
    return;
  }
}
