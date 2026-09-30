// Potentially-visible sets for the .vis: one bitset of chunk ids per `step` metres of main-line progress (sMain),
// read by TrackVis.visibleChunks(s). For each progress sample the chase camera (5 m behind, 2.5 m up) is placed on
// every path that covers that progress (main line and branches), and a chunk is visible if it lies within `near`, or
// within `far` and one of its test points (bbox centre and top corners, 1 m above the top) is not blocked by the
// static scene (terrain, road, walls). It is omnidirectional (look-back works) and conservative (no frustum).
// The same pass measures V20's worst visible static set for the Low tier (`lowFar`, a 120° forward cone), with LOD0
// inside `lodNear` and LOD1 beyond, draw calls counted per slot as TrackView's static merge groups (see slotGroups).
import { DoubleSide, Ray, Vector3 } from 'three';
import type { MeshBVH } from 'three-mesh-bvh';
import { sampleAt, type TrackModel } from './paths.ts';
import type { RenderSlot } from './render.ts';

export interface PvsOptions { step: number; near: number; far: number; lodNear: number; merge: number; fovCos: number; lowFar: number }
/** far = the High tier's far plane (the bitset serves every tier); V20 counts the Low tier: far 600 m, 6-chunk merges
 *  (must equal TrackView's Low `mergeChunks`, RaceRenderer)
 *  (apps/client quality.ts / RaceRenderer), a 120° cone for the ~100° horizontal FOV plus chunk extents. */
export const DEFAULT_PVS: PvsOptions = { step: 10, near: 120, far: 1000, lodNear: 150, merge: 6, fovCos: 0.5, lowFar: 600 };

export interface PvsChunk { id: number; bbox: number[]; groups: { slot: number; n: number }[]; tris: number; lod1Tris: number }
export interface PvsResult {
  bits: Uint8Array; bytes: number; step: number; worst: { draws: number; tris: number; s: number };
  /** draws per slot name at the worst sample (what to cut first) */
  worstBySlot: Record<string, number>; meanVisible: number; ms: number;
}

export function buildPvs(m: TrackModel, chunks: readonly PvsChunk[], slots: readonly RenderSlot[], bvh: MeshBVH, o: PvsOptions = DEFAULT_PVS): PvsResult {
  const t0 = Date.now();
  const maxId = chunks.reduce((a, c) => Math.max(a, c.id), 0);
  const bytes = Math.ceil((maxId + 1) / 8);
  const nS = Math.max(1, Math.ceil(m.lapLength / o.step));
  const bits = new Uint8Array(nS * bytes);
  const ray = new Ray(new Vector3(), new Vector3());
  const pts: number[][] = chunks.map((c) => {
    const [x0, , z0, x1, y1, z1] = c.bbox as [number, number, number, number, number, number];
    const y = y1 + 1;
    return [(x0 + x1) / 2, y, (z0 + z1) / 2, x0, y, z0, x1, y, z0, x0, y, z1, x1, y, z1];
  });
  // slot → chunk order, for the draw-run count
  // TrackView groups each slot's chunk ranges once, at load: runs of ≤ merge ranges that are contiguous in the index
  // buffer and of chunk kind 'track' (terrain tiles, plaza and misc chunks stay single). A group is one draw call
  // whenever any of its chunks is in view, so V20 counts groups, not runs of visible chunks.
  const kindOf = new Map<number, string>();
  for (const c of chunks) kindOf.set(c.id, (c as { kind?: string }).kind ?? 'track');
  const slotGroups: number[][][] = slots.map((sl) => {
    const groups: number[][] = [];
    let end = -1, lastKind = '', ids: number[] | null = null;
    for (const ch of sl.chunks) {
      const kind = kindOf.get(ch.chunk) ?? 'track';
      if (ids && sl.material !== 'terrain' && kind === 'track' && lastKind === 'track' && end === ch.i0 && ids.length < o.merge) { ids.push(ch.chunk); end = ch.i0 + ch.n; continue; }
      ids = [ch.chunk]; groups.push(ids); end = ch.i0 + ch.n; lastKind = kind;
    }
    return groups;
  });
  const worst = { draws: 0, tris: 0, s: 0 };
  const worstBySlot: Record<string, number> = {};
  let visSum = 0;
  const vis = new Uint8Array(maxId + 1), front = new Uint8Array(maxId + 1);
  for (let k = 0; k < nS; k++) {
    const sMain = k * o.step;
    vis.fill(0); front.fill(0);
    for (const p of m.paths) {
      if (p.kind === 'rail') continue;
      // this path's own s for that progress: main maps directly; others through their affine sMain
      let s: number;
      if (p.kind === 'main') s = m.closed ? sMain : sMain + m.lineS;
      else {
        const a = p.samples[0]!.sMain, b = p.samples[p.samples.length - 1]!.sMain;
        if (!(sMain >= Math.min(a, b) && sMain <= Math.max(a, b)) || b === a) continue;
        s = ((sMain - a) / (b - a)) * p.length;
      }
      const q = sampleAt(p, Math.max(0, s - 5));
      const cx = q.x + q.ux * 2.5, cy = q.y + q.uy * 2.5, cz = q.z + q.uz * 2.5;
      chunks.forEach((c, ci) => {
        const P = pts[ci]!;
        const dx0 = P[0]! - cx, dz0 = P[2]! - cz;
        // distance to the bbox in plan
        const [x0, , z0, x1, , z1] = c.bbox as [number, number, number, number, number, number];
        const ex = Math.max(x0 - cx, 0, cx - x1), ez = Math.max(z0 - cz, 0, cz - z1), d = Math.hypot(ex, ez);
        if (d > o.far) return;
        let seen = d <= o.near;
        for (let t = 0; t < 5 && !seen; t++) {
          const tx = P[t * 3]! - cx, ty = P[t * 3 + 1]! - cy, tz = P[t * 3 + 2]! - cz, tl = Math.hypot(tx, ty, tz);
          if (tl < 1e-6) { seen = true; break; }
          ray.origin.set(cx, cy, cz); ray.direction.set(tx / tl, ty / tl, tz / tl);
          if (!bvh.raycastFirst(ray, DoubleSide, 0, tl - 1.5)) seen = true;
        }
        if (!seen) return;
        vis[c.id] = 1;
        // V20: inside a 120° cone ahead (plan), or the chunk the camera stands in
        const dl = Math.hypot(dx0, dz0), tl2 = Math.hypot(q.tx, q.tz) || 1;
        if (d <= o.lowFar && (d === 0 || dl < 1e-6 || (dx0 * q.tx + dz0 * q.tz) / (dl * tl2) >= o.fovCos)) front[c.id] = 1;
      });
    }
    let nVis = 0;
    for (let id = 0; id <= maxId; id++) if (vis[id]) { bits[k * bytes + (id >> 3)]! |= 1 << (id & 7); nVis++; }
    visSum += nVis;
    // worst visible static set (Low tier): tris by LOD, draws = per-slot merge groups with any chunk in view
    let tris = 0, draws = 0;
    const cam = sampleAt(m.paths[0]!, m.closed ? sMain : sMain + m.lineS);
    for (const c of chunks) if (front[c.id]) {
      const [x0, , z0, x1, , z1] = c.bbox as [number, number, number, number, number, number];
      const d = Math.hypot(Math.max(x0 - cam.x, 0, cam.x - x1), Math.max(z0 - cam.z, 0, cam.z - z1));
      tris += d <= o.lodNear ? c.tris : c.lod1Tris;
    }
    const bySlot: number[] = [];
    slotGroups.forEach((groups) => {
      let n = 0;
      for (const g of groups) { for (const id of g) if (front[id]) { n++; break; } }
      bySlot.push(n); draws += n;
    });
    if (draws > worst.draws) {
      worst.draws = draws; worst.s = sMain;
      for (const k of Object.keys(worstBySlot)) delete worstBySlot[k];
      bySlot.forEach((n, j) => { if (n) worstBySlot[slots[j]!.name] = n; });
    }
    if (tris > worst.tris) worst.tris = tris;
  }
  return { bits, bytes, step: o.step, worst, worstBySlot, meanVisible: visSum / nS, ms: Date.now() - t0 };
}
