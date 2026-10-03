// Render geometry for the .vis file. Every slot is one (material, variant) pair; its triangles are grouped by chunk
// (≈ 50 m of path, or a terrain tile) so the client can cull per chunk. Backward compatible with the M1 TrackView:
// `material` is always one of the M1 keys (road, kerb, shoulder, wall, underside, terrain, startline, boostpad) and
// `variant` names the specialised look (docs/design/contract-requests/L4-vis-v2.md).
import { SURFACE_IDS } from '@cr/content';
import { sampleAt, SURF, type PathModel, type TrackModel } from './paths.ts';
import type { Content } from './content.ts';
import { profileHeight } from './content.ts';
import { ROLE } from './mesh.ts';
import { TriSoup, VS, type WallQuad } from './soup.ts';
import { canonicalF32, canonicalNumber } from './canonical.ts';

export const CHUNK_LEN = 50;

export interface RenderSlot {
  name: string; material: string; variant: string;
  pos: number[]; nrm: number[]; uv: number[]; col: number[]; idx: number[];
  triChunk: number[];      // chunk id per triangle (sorted at finalise)
  chunks: { i0: number; n: number; bbox: number[]; chunk: number }[];
  lod1?: { i0: number; n: number; chunk: number }[];
  idx1?: number[];
}

export interface ChunkInfo { id: number; path: number; s0: number; s1: number; kind: 'track' | 'terrain' | 'area' | 'misc'; bbox: number[] }

export class RenderBuilder {
  slots = new Map<string, RenderSlot>();
  chunks: ChunkInfo[] = [];
  private chunkKey = new Map<string, number>();

  slot(material: string, variant: string): RenderSlot {
    const name = variant && variant !== material ? `${material}:${variant}` : material;
    let s = this.slots.get(name);
    if (!s) { s = { name, material, variant, pos: [], nrm: [], uv: [], col: [], idx: [], triChunk: [], chunks: [] }; this.slots.set(name, s); }
    return s;
  }
  chunkOf(path: number, s: number, kind: ChunkInfo['kind'] = 'track'): number {
    const k = Math.max(0, Math.floor(s / CHUNK_LEN));
    const key = `${kind}:${path}:${k}`;
    let id = this.chunkKey.get(key);
    if (id === undefined) {
      id = this.chunks.length; this.chunkKey.set(key, id);
      this.chunks.push({ id, path, s0: k * CHUNK_LEN, s1: (k + 1) * CHUNK_LEN, kind, bbox: [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity] });
    }
    return id;
  }
  tileChunk(ix: number, iz: number): number {
    const key = `terrain:${ix}:${iz}`;
    let id = this.chunkKey.get(key);
    if (id === undefined) {
      id = this.chunks.length; this.chunkKey.set(key, id);
      this.chunks.push({ id, path: -1, s0: ix, s1: iz, kind: 'terrain', bbox: [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity] });
    }
    return id;
  }
  /** Appends one triangle (3 × [x,y,z,nx,ny,nz,u,v,r,g,b]). */
  tri(sl: RenderSlot, chunk: number, a: number[], b: number[], c: number[]): void {
    const base = sl.pos.length / 3;
    for (const v of [a, b, c]) {
      sl.pos.push(v[0]!, v[1]!, v[2]!); sl.nrm.push(v[3]!, v[4]!, v[5]!); sl.uv.push(v[6]!, v[7]!); sl.col.push(v[8]!, v[9]!, v[10]!);
      const bb = this.chunks[chunk]!.bbox;
      if (v[0]! < bb[0]!) bb[0] = v[0]!; if (v[1]! < bb[1]!) bb[1] = v[1]!; if (v[2]! < bb[2]!) bb[2] = v[2]!;
      if (v[0]! > bb[3]!) bb[3] = v[0]!; if (v[1]! > bb[4]!) bb[4] = v[1]!; if (v[2]! > bb[5]!) bb[5] = v[2]!;
    }
    sl.idx.push(base, base + 1, base + 2);
    sl.triChunk.push(chunk);
  }
  /** Like tri(), but picks the winding whose geometric normal agrees with the vertices' shading normals. */
  triAuto(sl: RenderSlot, chunk: number, a: number[], b: number[], c: number[]): void {
    const e1x = b[0]! - a[0]!, e1y = b[1]! - a[1]!, e1z = b[2]! - a[2]!, e2x = c[0]! - a[0]!, e2y = c[1]! - a[1]!, e2z = c[2]! - a[2]!;
    const gx = e1y * e2z - e1z * e2y, gy = e1z * e2x - e1x * e2z, gz = e1x * e2y - e1y * e2x;
    const nx = a[3]! + b[3]! + c[3]!, ny = a[4]! + b[4]! + c[4]!, nz = a[5]! + b[5]! + c[5]!;
    if (gx * nx + gy * ny + gz * nz >= 0) this.tri(sl, chunk, a, b, c); else this.tri(sl, chunk, a, c, b);
  }
  /** Sorts each slot's triangles by chunk, welds exact duplicates, and fills the chunk ranges. */
  finalise(): RenderSlot[] {
    const out: RenderSlot[] = [];
    for (const sl of [...this.slots.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      // Weld the attributes the file actually stores. Raw double-string keys can split the same float32
      // vertex differently on ARM64 and x64, changing indices and LOD topology without changing its geometry.
      for (const attribute of [sl.pos, sl.col]) for (let i = 0; i < attribute.length; i++) attribute[i] = Math.fround(attribute[i]!);
      for (let i = 0; i < sl.nrm.length; i++) sl.nrm[i] = canonicalF32(sl.nrm[i]!);
      // UV subtraction at a pad boundary can amplify sub-picometre station residuals near zero.
      for (let i = 0; i < sl.uv.length; i++) sl.uv[i] = canonicalF32(canonicalNumber(sl.uv[i]!));
      const nt = sl.idx.length / 3;
      const order = Array.from({ length: nt }, (_, i) => i).sort((p, q) => sl.triChunk[p]! - sl.triChunk[q]! || p - q);
      const map = new Map<string, number>();
      const pos: number[] = [], nrm: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
      const chunks: RenderSlot['chunks'] = [];
      for (const t of order) {
        const ch = sl.triChunk[t]!;
        let last = chunks[chunks.length - 1];
        if (!last || last.chunk !== ch) { last = { i0: idx.length, n: 0, bbox: [...this.chunks[ch]!.bbox], chunk: ch }; chunks.push(last); }
        for (let k = 0; k < 3; k++) {
          const v = sl.idx[t * 3 + k]!;
          const key = `${sl.pos[v * 3]},${sl.pos[v * 3 + 1]},${sl.pos[v * 3 + 2]},${sl.nrm[v * 3]},${sl.nrm[v * 3 + 1]},${sl.nrm[v * 3 + 2]},${sl.uv[v * 2]},${sl.uv[v * 2 + 1]},${sl.col[v * 3]},${sl.col[v * 3 + 1]},${sl.col[v * 3 + 2]}|${ch}`;
          let i = map.get(key);
          if (i === undefined) {
            i = pos.length / 3; map.set(key, i);
            pos.push(sl.pos[v * 3]!, sl.pos[v * 3 + 1]!, sl.pos[v * 3 + 2]!); nrm.push(sl.nrm[v * 3]!, sl.nrm[v * 3 + 1]!, sl.nrm[v * 3 + 2]!);
            uv.push(sl.uv[v * 2]!, sl.uv[v * 2 + 1]!); col.push(sl.col[v * 3]!, sl.col[v * 3 + 1]!, sl.col[v * 3 + 2]!);
          }
          idx.push(i);
        }
        last.n += 3;
      }
      // per-chunk bbox of this slot only
      for (const c of chunks) {
        const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
        for (let q = c.i0; q < c.i0 + c.n; q++) { const v = idx[q]!; for (let k = 0; k < 3; k++) { const x = pos[v * 3 + k]!; if (x < bb[k]!) bb[k] = x; if (x > bb[k + 3]!) bb[k + 3] = x; } }
        c.bbox = bb;
      }
      out.push({ ...sl, pos, nrm, uv, col, idx, triChunk: [], chunks });
    }
    return out;
  }
}

// ------------------------------------------------------------------------------------------------ tints
/** Vertex tint per surface so an M1 client (one road material) still tells surfaces apart. */
const TINT: Record<string, [number, number, number]> = {
  asphalt: [1, 1, 1], stone: [1.05, 1.03, 1.0], cobble: [1.08, 1.02, 0.95], dirt: [1.25, 1.0, 0.75], sand: [1.45, 1.3, 0.95], gravel: [1.2, 1.15, 1.08],
  ice: [1.2, 1.4, 1.6], snow: [1.7, 1.75, 1.8], grass: [1, 1, 1], wet: [0.8, 0.85, 0.95], wood: [1.3, 1.0, 0.7], metal: [1.15, 1.18, 1.22],
  conveyor_fwd: [0.9, 1.1, 1.25], conveyor_back: [1.25, 0.95, 0.85], lava: [2.0, 0.7, 0.3], basalt: [0.7, 0.68, 0.7], obsidian: [0.55, 0.5, 0.65],
  glass: [1.2, 1.35, 1.45], rail: [1.1, 1.1, 1.1], boost_pad: [1, 1, 1], jump_pad: [1, 1, 1],
};
export const surfName = (code: number): string => SURFACE_IDS[code - 1] ?? 'asphalt';
const WALL_TINT: Record<string, number> = { rock: 0.8, building: 0.9, parapet: 0.95, planter: 0.85, pillar: 0.9, fence: 1, barrier: 1, gore: 1, cliff: 0.75 };

// ------------------------------------------------------------------------------------------------ ground → slots
export function groundToRender(rb: RenderBuilder, m: TrackModel, c: Content, ground: TriSoup, kerbs: TriSoup, ao: (x: number, y: number, z: number) => number): void {
  const V = ground.v;
  for (let t = 0; t < ground.count; t++) {
    const surf = ground.surf[t]!, role = ground.role[t]!, path = ground.path[t]!;
    if (role === ROLE.KILL) continue; // kill floors are collision only; KILL planes render their own surface
    const sn = surfName(surf);
    const o = t * 3 * VS;
    const sMid = (V[o + 6]! + V[o + VS + 6]! + V[o + 2 * VS + 6]!) / 3;
    const chunk = role === ROLE.AREA ? rb.chunkOf(1000 + path, 0, 'area') : role === ROLE.KILL ? rb.chunkOf(2000 + path, sMid, 'misc') : rb.chunkOf(path, sMid);
    let sl: RenderSlot;
    let uvf: (s: number, d: number, x: number, z: number) => [number, number];
    if (sn === 'boost_pad' || sn === 'jump_pad') {
      sl = rb.slot('boostpad', sn === 'jump_pad' ? 'jump' : 'boost');
      const dc = (V[o + 7]! + V[o + VS + 7]! + V[o + 2 * VS + 7]!) / 3;
      const pd = c.pads.find((p) => p.path === path && sMid >= p.s0 - 0.5 && sMid <= p.s1 + 0.5 && dc >= p.d0 - 0.1 && dc <= p.d1 + 0.1);
      uvf = pd ? (s, d) => [(d - pd.d0) / (pd.d1 - pd.d0), (s - pd.s0) / (pd.s1 - pd.s0)] : (s, d) => [d, s];
    } else if (role === ROLE.KILL) {
      sl = rb.slot('underside', `kill_${sn === 'lava' ? 'lava' : 'void'}`);
      uvf = (_s, _d, x, z) => [x / 8, z / 8];
    } else if (role === ROLE.SHOULDER) {
      sl = rb.slot('shoulder', sn);
      uvf = (s, d) => [d / 4, s / 6];
    } else if (role === ROLE.AREA) {
      sl = rb.slot('road', sn);
      uvf = (_s, _d, x, z) => [x / 12, z / 4];
    } else {
      sl = rb.slot('road', sn);
      const pm = m.paths[path]!;
      uvf = (s, d) => { const smp = sampleAt(pm, s); return [0.5 + d / Math.max(1, smp.w), s / 4]; };
    }
    const tint = TINT[sn] ?? [1, 1, 1];
    const vs: number[][] = [];
    for (let k = 0; k < 3; k++) {
      const q = o + k * VS;
      const [u, v] = uvf(V[q + 6]!, V[q + 7]!, V[q]!, V[q + 2]!);
      const a = ao(V[q]!, V[q + 1]!, V[q + 2]!);
      vs.push([V[q]!, V[q + 1]!, V[q + 2]!, V[q + 3]!, V[q + 4]!, V[q + 5]!, u, v, tint[0] * a, tint[1] * a, tint[2] * a]);
    }
    rb.tri(sl, chunk, vs[0]!, vs[1]!, vs[2]!);
  }
  const K = kerbs.v;
  const ks = rb.slot('kerb', 'kerb');
  for (let t = 0; t < kerbs.count; t++) {
    const o = t * 3 * VS;
    const sMid = (K[o + 6]! + K[o + VS + 6]! + K[o + 2 * VS + 6]!) / 3;
    const chunk = rb.chunkOf(kerbs.path[t]!, sMid);
    const vs: number[][] = [];
    for (let k = 0; k < 3; k++) { const q = o + k * VS; vs.push([K[q]!, K[q + 1]!, K[q + 2]!, K[q + 3]!, K[q + 4]!, K[q + 5]!, 0.5, K[q + 6]! / 2, 1, 1, 1]); }
    rb.tri(ks, chunk, vs[0]!, vs[1]!, vs[2]!);
  }
}

/** Walls with thickness (inner face, top, outer face); u runs 0..1 around the profile, v = s / 3. */
export function wallsToRender(rb: RenderBuilder, walls: WallQuad[], ao: (x: number, y: number, z: number) => number): void {
  const T = 0.45;
  // smooth shading on bends: a wall corner shared by quads of the same kind gets the average of their outward
  // vectors, so curved walls stop reading as a plank fence (one flat normal per 1–2 m quad). Corners sharper than
  // ≈ 37° (plaza corners, wall ends) keep the quad's flat normal, so hard edges stay crisp. Render only: .ctrk walls
  // and collision are untouched.
  const key = (k: string, p: ArrayLike<number>): string => `${k}|${Math.round(p[0]! * 20)},${Math.round(p[1]! * 20)},${Math.round(p[2]! * 20)}`;
  const acc = new Map<string, [number, number, number]>();
  for (const w of walls) {
    if (!w.render) continue;
    for (const p of [w.a0, w.b0]) {
      const k = key(w.kind, p), v = acc.get(k) ?? [0, 0, 0];
      v[0] += w.out[0]; v[1] += w.out[1]; v[2] += w.out[2]; acc.set(k, v);
    }
  }
  const outAt = (w: WallQuad, p: ArrayLike<number>): number[] => {
    const v = acc.get(key(w.kind, p)), o = w.out;
    const l = v ? Math.hypot(v[0], v[1], v[2]) : 0;
    if (l < 1e-6) return [o[0], o[1], o[2]];
    const n = [v![0] / l, v![1] / l, v![2] / l];
    return n[0]! * o[0] + n[1]! * o[1] + n[2]! * o[2] > 0.8 ? n : [o[0], o[1], o[2]];
  };
  for (const w of walls) {
    if (!w.render) continue;
    const sl = rb.slot('wall', w.kind === 'barrier' ? 'barrier' : w.kind);
    const chunk = w.kind === 'gore' ? rb.chunkOf(3000 + w.path, 0, 'misc') : rb.chunkOf(w.path, (w.sa + w.sb) / 2);
    const tint = WALL_TINT[w.kind] ?? 1;
    const o = w.out;
    const off = (p: [number, number, number], d: number): number[] => [p[0] + o[0] * d, p[1] + o[1] * d, p[2] + o[2] * d];
    const a0 = w.a0, a1 = w.a1, b0 = w.b0, b1 = w.b1;
    const A0o = off(a0, T), A1o = off(a1, T), B0o = off(b0, T), B1o = off(b1, T);
    const ux = a1[0] - a0[0], uy = a1[1] - a0[1], uz = a1[2] - a0[2];
    const ul = Math.hypot(ux, uy, uz) || 1;
    const up = [ux / ul, uy / ul, uz / ul];
    const V = (p: ArrayLike<number>, n: ArrayLike<number>, u: number, v: number): number[] => { const a = ao(p[0]!, p[1]!, p[2]!) * tint; return [p[0]!, p[1]!, p[2]!, n[0]!, n[1]!, n[2]!, u, v, a, a, a]; };
    const inN = [-o[0], -o[1], -o[2]];
    const va = w.sa / 3, vb = w.sb / 3;
    // winding: faces visible from their normal side; the side sign flips the along-path direction
    // nA / nB: the shading normals at the row-A and row-B ends; the winding test below still uses the face normal n
    const quad = (p00: ArrayLike<number>, p01: ArrayLike<number>, p10: ArrayLike<number>, p11: ArrayLike<number>, n: ArrayLike<number>, u0: number, u1: number, nA: ArrayLike<number> = n, nB: ArrayLike<number> = n): void => {
      const q0 = V(p00, nA, u0, va), q1 = V(p01, nA, u1, va), q2 = V(p10, nB, u0, vb), q3 = V(p11, nB, u1, vb);
      // choose the orientation whose geometric normal agrees with n
      const e1 = [q2[0]! - q0[0]!, q2[1]! - q0[1]!, q2[2]! - q0[2]!], e2 = [q1[0]! - q0[0]!, q1[1]! - q0[1]!, q1[2]! - q0[2]!];
      const gx = e1[1]! * e2[2]! - e1[2]! * e2[1]!, gy = e1[2]! * e2[0]! - e1[0]! * e2[2]!, gz = e1[0]! * e2[1]! - e1[1]! * e2[0]!;
      if (gx * n[0]! + gy * n[1]! + gz * n[2]! >= 0) { rb.tri(sl, chunk, q0, q2, q1); rb.tri(sl, chunk, q1, q2, q3); }
      else { rb.tri(sl, chunk, q0, q1, q2); rb.tri(sl, chunk, q1, q3, q2); }
    };
    const oA = outAt(w, a0), oB = outAt(w, b0);
    quad(a0, a1, b0, b1, inN, 0, 0.33, [-oA[0]!, -oA[1]!, -oA[2]!], [-oB[0]!, -oB[1]!, -oB[2]!]);
    quad(a1, A1o, b1, B1o, up, 0.33, 0.66);
    quad(A1o, A0o, B1o, B0o, o, 0.66, 1, oA, oB);
  }
}

/** Underside strip (−0.6 m, flipped) and side skirts so elevated ribbons read as solid. */
export function undersideToRender(rb: RenderBuilder, m: TrackModel, p: PathModel, rows: number[], skirtDepth: (x: number, y: number, z: number) => number): void {
  if (p.kind === 'rail') return;
  const sl = rb.slot('underside', 'underside');
  for (let r = 0; r + 1 < rows.length; r++) {
    const sa = rows[r]!, sb = rows[r + 1]!;
    const A = sampleAt(p, sa), B = sampleAt(p, sb), mid = sampleAt(p, (sa + sb) / 2);
    if (mid.jumpPart === 2 || mid.warp) continue;
    const chunk = rb.chunkOf(p.index, (sa + sb) / 2);
    const E = (q: typeof A, side: -1 | 1, h: number): number[] => {
      const d = side * (q.w / 2 + (side < 0 ? q.shL : q.shR));
      const hh = profileHeight(m.profiles.get(q.prof), q, d) + h;
      return [q.x + q.rx * d + q.ux * hh, q.y + q.ry * d + q.uy * hh, q.z + q.rz * d + q.uz * hh];
    };
    const col = 0.55;
    const V = (p3: number[], n: number[], u: number, v: number): number[] => [p3[0]!, p3[1]!, p3[2]!, n[0]!, n[1]!, n[2]!, u, v, col, col, col];
    const dn = [-mid.ux, -mid.uy, -mid.uz];
    const aL = E(A, -1, -0.6), aR = E(A, 1, -0.6), bL = E(B, -1, -0.6), bR = E(B, 1, -0.6);
    rb.tri(sl, chunk, V(aL, dn, 0, sa / 8), V(bL, dn, 0, sb / 8), V(aR, dn, 1, sa / 8));
    rb.tri(sl, chunk, V(aR, dn, 1, sa / 8), V(bL, dn, 0, sb / 8), V(bR, dn, 1, sb / 8));
    // side skirts from the surface edge down to −skirt (deeper where the road stands above the terrain)
    for (const side of [-1, 1] as const) {
      const n = [side * mid.rx, side * mid.ry, side * mid.rz];
      const ta = E(A, side, 0), tb = E(B, side, 0);
      const da = Math.max(0.6, skirtDepth(ta[0]!, ta[1]!, ta[2]!)), db = Math.max(0.6, skirtDepth(tb[0]!, tb[1]!, tb[2]!));
      const ba = [ta[0]!, ta[1]! - da, ta[2]!], bb = [tb[0]!, tb[1]! - db, tb[2]!];
      if (side < 0) { rb.tri(sl, chunk, V(ta, n, 0, sa / 4), V(ba, n, 1, sa / 4), V(tb, n, 0, sb / 4)); rb.tri(sl, chunk, V(tb, n, 0, sb / 4), V(ba, n, 1, sa / 4), V(bb, n, 1, sb / 4)); }
      else { rb.tri(sl, chunk, V(ta, n, 0, sa / 4), V(tb, n, 0, sb / 4), V(ba, n, 1, sa / 4)); rb.tri(sl, chunk, V(tb, n, 0, sb / 4), V(bb, n, 1, sb / 4), V(ba, n, 1, sa / 4)); }
    }
  }
}

/** Start/finish line decal (2 m deep, 3.5 cm above the road). */
export function startLineToRender(rb: RenderBuilder, m: TrackModel): void {
  const main = m.paths[0]!;
  const s = m.lineS;
  const sl = rb.slot('startline', 'startline');
  const chunk = rb.chunkOf(0, Math.max(0, s));
  const A = sampleAt(main, s - 1), B = sampleAt(main, s + 1);
  const P = (q: typeof A, t: number, v: number): number[] => {
    const d = -q.w / 2 + t * q.w, h = profileHeight(m.profiles.get(q.prof), q, d) + 0.035;
    return [q.x + q.rx * d + q.ux * h, q.y + q.ry * d + q.uy * h, q.z + q.rz * d + q.uz * h, q.ux, q.uy, q.uz, t, v, 1, 1, 1];
  };
  rb.tri(sl, chunk, P(A, 0, 0), P(A, 1, 0), P(B, 0, 1));
  rb.tri(sl, chunk, P(A, 1, 0), P(B, 1, 1), P(B, 0, 1));
}

export { SURF };
