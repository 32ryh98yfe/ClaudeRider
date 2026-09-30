// LOD1 index buffers for the .vis (`s{j}.idx1` + `slots[j].lod1` ranges, ≤ 40% of the LOD0 triangles), drawn by
// the renderer for chunks beyond ~150 m. Index-only: LOD1 reuses the LOD0 vertex buffer, so it costs 4 bytes per
// kept index and no attributes. Per (slot, chunk) vertex clustering: every vertex snaps to the first vertex seen in
// its grid cell, triangles that collapse or flip are dropped, duplicates removed. Vertices whose position also
// occurs in another chunk are locked, so a LOD1 chunk still meets its LOD0 neighbour without a crack.
// Thin decal-like slots (kerbs, start line, pads, portals) are dropped entirely at LOD1.
import type { RenderSlot } from './render.ts';

export interface Lod1 { idx1: number[]; ranges: { i0: number; n: number; chunk: number }[]; ratio: number }

const DROP = new Set(['kerb', 'startline', 'boostpad', 'portal']);
const CELLS = [3, 4.5, 6.75, 10, 15];
const TARGET = 0.4;

export function buildLod1(sl: RenderSlot): Lod1 {
  const idx1: number[] = [], ranges: Lod1['ranges'] = [];
  const lod0 = sl.idx.length / 3;
  if (DROP.has(sl.material) || lod0 === 0) {
    for (const c of sl.chunks) ranges.push({ i0: 0, n: 0, chunk: c.chunk });
    return { idx1, ranges, ratio: 0 };
  }
  const P = sl.pos, N = sl.nrm;
  const pkey = (v: number): string => `${Math.round(P[v * 3]! * 100)},${Math.round(P[v * 3 + 1]! * 100)},${Math.round(P[v * 3 + 2]! * 100)}`;
  // positions shared between chunks of this slot are chunk seams: lock those vertices
  const owner = new Map<string, number>(), seam = new Set<string>();
  for (const c of sl.chunks) for (let q = c.i0; q < c.i0 + c.n; q++) {
    const k = pkey(sl.idx[q]!), o = owner.get(k);
    if (o === undefined) owner.set(k, c.chunk); else if (o !== c.chunk) seam.add(k);
  }
  const locked = new Uint8Array(P.length / 3);
  if (seam.size) for (let v = 0; v < locked.length; v++) if (seam.has(pkey(v))) locked[v] = 1;
  for (const c of sl.chunks) {
    const nT = c.n / 3;
    let best: number[] = [];
    for (const cell of CELLS) {
      const rep = new Map<number, number>(), out: number[] = [], seen = new Set<string>();
      const snap = (v: number): number => {
        if (locked[v]) return v;
        // exact integer key (cells stay within ±2^15 horizontally and ±2^10 vertically for any real track)
        const k = (Math.floor(P[v * 3]! / cell) + 32768) + 65536 * ((Math.floor(P[v * 3 + 2]! / cell) + 32768) + 65536 * (Math.floor(P[v * 3 + 1]! / cell) + 1024));
        const r = rep.get(k);
        if (r !== undefined) return r;
        rep.set(k, v);
        return v;
      };
      for (let t = 0; t < nT; t++) {
        const q = c.i0 + t * 3, a0 = sl.idx[q]!, b0 = sl.idx[q + 1]!, c0 = sl.idx[q + 2]!;
        const a = snap(a0), b = snap(b0), cc = snap(c0);
        if (a === b || b === cc || a === cc) continue;
        // keep the original facing: the snapped triangle's normal must agree with the vertex normals
        const e1x = P[b * 3]! - P[a * 3]!, e1y = P[b * 3 + 1]! - P[a * 3 + 1]!, e1z = P[b * 3 + 2]! - P[a * 3 + 2]!;
        const e2x = P[cc * 3]! - P[a * 3]!, e2y = P[cc * 3 + 1]! - P[a * 3 + 1]!, e2z = P[cc * 3 + 2]! - P[a * 3 + 2]!;
        const gx = e1y * e2z - e1z * e2y, gy = e1z * e2x - e1x * e2z, gz = e1x * e2y - e1y * e2x;
        // against both the original and the kept vertices' normals, with a margin so f32 rounding cannot flip it
        const gl = Math.hypot(gx, gy, gz);
        const faces = (i: number, j: number, k: number): boolean => {
          const nx = N[i * 3]! + N[j * 3]! + N[k * 3]!, ny = N[i * 3 + 1]! + N[j * 3 + 1]! + N[k * 3 + 1]!, nz = N[i * 3 + 2]! + N[j * 3 + 2]! + N[k * 3 + 2]!;
          return gx * nx + gy * ny + gz * nz > 0.05 * gl * Math.hypot(nx, ny, nz);
        };
        if (!faces(a0, b0, c0) || !faces(a, b, cc)) continue;
        const k = [a, b, cc].sort((x, y) => x - y).join(',');
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(a, b, cc);
      }
      best = out;
      if (out.length / 3 <= TARGET * nT) break;
    }
    ranges.push({ i0: idx1.length, n: best.length, chunk: c.chunk });
    for (const v of best) idx1.push(v);
  }
  return { idx1, ranges, ratio: idx1.length / 3 / lod0 };
}
