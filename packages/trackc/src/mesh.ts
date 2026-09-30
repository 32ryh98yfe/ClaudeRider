// Builds collision meshes (ground + walls) and render slots (road, kerbs, shoulders, walls, terrain, decals) from samples.
import { SURFACE_IDS } from '@cr/content';
import type { Geometry, Sample, WallDef } from './geometry.ts';

export interface CollisionMesh { pos: number[]; nrm: number[]; idx: number[]; surf: number[]; flg: number[] }
export interface RenderSlot { name: string; material: string; pos: number[]; nrm: number[]; uv: number[]; col: number[]; idx: number[]; chunks: { i0: number; n: number; bbox: number[] }[] }

export interface PadRegion { s0: number; s1: number; u0: number; u1: number; kind: 'boost' | 'jump' }

const SURF = (id: (typeof SURFACE_IDS)[number]): number => SURFACE_IDS.indexOf(id) + 1;

function newSlot(name: string, material: string): RenderSlot { return { name, material, pos: [], nrm: [], uv: [], col: [], idx: [], chunks: [] }; }

/** Pointwise position at lateral offset u (+ right) and height h above the sample. */
function at(S: Sample, u: number, h: number): [number, number, number] {
  return [S.x + S.rx * u + S.ux * h, S.y + S.ry * u + S.uy * h, S.z + S.rz * u + S.uz * h];
}

function roadCols(w: number): number[] {
  const nc = Math.max(2, Math.ceil(w / 2.5));
  const out: number[] = [];
  for (let k = 0; k <= nc; k++) out.push(-w / 2 + (k * w) / nc);
  return out;
}

function sStepIndices(n: number, every: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i += every) out.push(i);
  if (out[out.length - 1] !== n - 1) out.push(n - 1);
  return out;
}

export function buildCollision(g: Geometry, pads: PadRegion[], sMainOf: (s: number) => number): { ground: CollisionMesh; walls: CollisionMesh } {
  const S = g.samples;
  const ground: CollisionMesh = { pos: [], nrm: [], idx: [], surf: [], flg: [] };
  const walls: CollisionMesh = { pos: [], nrm: [], idx: [], surf: [], flg: [] };
  const rows = sStepIndices(S.length, 2);
  // ground: fixed column count per row (max over track) so rows connect; columns scale with local width
  const maxW = Math.max(...S.map((s) => s.w));
  const baseCols = roadCols(maxW).length;
  const colsAt = (smp: Sample): number[] => {
    const wl = smp.w / 2;
    const cols: number[] = [];
    cols.push(-wl - Math.max(0.01, smp.shoulder));
    for (let k = 0; k < baseCols; k++) cols.push(-wl + (k * smp.w) / (baseCols - 1));
    cols.push(wl + Math.max(0.01, smp.shoulder));
    return cols;
  };
  const ncol = baseCols + 2;
  for (const ri of rows) {
    const smp = S[ri]!;
    for (const u of colsAt(smp)) {
      const p = at(smp, u, 0);
      ground.pos.push(p[0], p[1], p[2]);
      ground.nrm.push(smp.ux, smp.uy, smp.uz);
    }
  }
  for (let r = 0; r < rows.length - 1; r++) {
    const a = S[rows[r]!]!, b = S[rows[r + 1]!]!;
    const sMid = (a.s + b.s) / 2, sm = sMainOf(sMid);
    for (let c = 0; c < ncol - 1; c++) {
      const i00 = r * ncol + c, i01 = r * ncol + c + 1, i10 = (r + 1) * ncol + c, i11 = (r + 1) * ncol + c + 1;
      // CCW seen from above: (A, B=right neighbour, C=forward)
      ground.idx.push(i00, i01, i10, i01, i11, i10);
      const shoulderQuad = c === 0 || c === ncol - 2;
      let surf = shoulderQuad ? a.shoulderSurf : a.surf;
      if (!shoulderQuad) {
        const colsA = colsAt(a);
        const uMid = (colsA[c]! + colsA[c + 1]!) / 2;
        for (const p of pads) if (sm >= p.s0 && sm <= p.s1 && uMid >= p.u0 && uMid <= p.u1) surf = p.kind === 'boost' ? SURF('boost_pad') : SURF('jump_pad');
      }
      ground.surf.push(surf, surf);
      ground.flg.push(0, 0);
    }
  }
  // walls: vertical strips facing the road, from 0.6 m below ground up to the wall height
  const addWall = (side: -1 | 1): void => {
    let start = -1;
    const flush = (i0: number, i1: number): void => {
      if (i1 <= i0) return;
      const base = walls.pos.length / 3;
      const seq = rows.filter((ri) => ri >= i0 && ri <= i1);
      for (const ri of seq) {
        const smp = S[ri]!;
        const wd: WallDef = side < 0 ? smp.wallL : smp.wallR;
        const u = side * (smp.w / 2 + smp.shoulder);
        const lo = at(smp, u, -0.6), hi = at(smp, u, Math.max(0.6, wd.h));
        walls.pos.push(lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]);
        walls.nrm.push(-side * smp.rx, -side * smp.ry, -side * smp.rz, -side * smp.rx, -side * smp.ry, -side * smp.rz);
      }
      for (let k = 0; k < seq.length - 1; k++) {
        const a0 = base + k * 2, a1 = a0 + 1, b0 = a0 + 2, b1 = a0 + 3;
        walls.idx.push(a0, b0, a1, a1, b0, b1);
        walls.surf.push(0, 0); walls.flg.push(0, 0);
      }
    };
    for (const ri of rows) {
      const smp = S[ri]!;
      const wd = side < 0 ? smp.wallL : smp.wallR;
      const solid = wd.type !== 'none' && wd.type !== 'curb';
      if (solid && start < 0) start = ri;
      if (!solid && start >= 0) { flush(start, ri); start = -1; }
    }
    if (start >= 0) flush(start, rows[rows.length - 1]!);
  };
  addWall(-1); addWall(1);
  return { ground, walls };
}

// ------------------------------------------------------------------------------------------------ render
export function buildRender(g: Geometry, pads: PadRegion[], sMainOf: (s: number) => number, lineS: number, seed: number): RenderSlot[] {
  const S = g.samples;
  const road = newSlot('road', 'road'), kerb = newSlot('kerb', 'kerb'), shoulder = newSlot('shoulder', 'shoulder');
  const wall = newSlot('wall', 'wall'), line = newSlot('startline', 'startline'), pad = newSlot('pad', 'boostpad'), under = newSlot('underside', 'underside');
  const CH = 50; // chunk length (m)
  const rows = sStepIndices(S.length, 1);
  const chunkOf = (s: number): number => Math.floor(s / CH);
  const pushChunk = (slot: RenderSlot, chunk: number, i0: number, bbox: number[]): void => {
    const last = slot.chunks[slot.chunks.length - 1];
    if (last && (last as { chunk?: number }).chunk === chunk) { last.n = slot.idx.length - last.i0; mergeBox(last.bbox, bbox); return; }
    slot.chunks.push(Object.assign({ i0, n: slot.idx.length - i0, bbox }, { chunk }));
  };

  // road ribbon (1 m rows), uv.x across road 0..1, uv.y = s / 4
  const roadStrip = (slot: RenderSlot, uFrom: (smp: Sample) => number, uTo: (smp: Sample) => number, cols: number, h: number, vScale: number, colFn: (smp: Sample, t: number) => [number, number, number], filter?: (smp: Sample) => boolean): void => {
    let prevRowBase = -1, prevOk = false;
    for (const ri of rows) {
      const smp = S[ri]!;
      const ok = filter ? filter(smp) : true;
      const base = slot.pos.length / 3;
      for (let c = 0; c <= cols; c++) {
        const t = c / cols;
        const u = uFrom(smp) + (uTo(smp) - uFrom(smp)) * t;
        const p = at(smp, u, h);
        slot.pos.push(p[0], p[1], p[2]);
        slot.nrm.push(smp.ux, smp.uy, smp.uz);
        slot.uv.push(t, smp.s / vScale);
        const cc = colFn(smp, t);
        slot.col.push(cc[0], cc[1], cc[2]);
      }
      if (prevRowBase >= 0 && ok && prevOk) {
        const i0 = slot.idx.length;
        for (let c = 0; c < cols; c++) {
          const a = prevRowBase + c, b = prevRowBase + c + 1, d = base + c, e = base + c + 1;
          slot.idx.push(a, b, d, b, e, d);
        }
        const bb = bboxOf(slot.pos, prevRowBase, base + cols);
        pushChunk(slot, chunkOf(smp.s), i0, bb);
      }
      prevRowBase = base; prevOk = ok;
    }
  };
  const edgeAO = (smp: Sample, t: number): [number, number, number] => {
    const nearL = smp.wallL.type !== 'none' && smp.shoulder < 0.5 ? Math.max(0, 1 - t * 12) : 0;
    const nearR = smp.wallR.type !== 'none' && smp.shoulder < 0.5 ? Math.max(0, 1 - (1 - t) * 12) : 0;
    const ao = 1 - 0.35 * Math.max(nearL, nearR);
    return [ao, ao, ao];
  };
  roadStrip(road, (s) => -s.w / 2, (s) => s.w / 2, 8, 0.0, 4, edgeAO);
  // kerbs on corners (|curvature| > 1/70), on both edges, 1.1 m wide, slightly raised
  const isCorner = (s: Sample): boolean => Math.abs(s.curv) > 1 / 70;
  roadStrip(kerb, (s) => -s.w / 2, (s) => -s.w / 2 + 1.1, 1, 0.03, 2, () => [1, 1, 1], isCorner);
  roadStrip(kerb, (s) => s.w / 2 - 1.1, (s) => s.w / 2, 1, 0.03, 2, () => [1, 1, 1], isCorner);
  roadStrip(shoulder, (s) => -s.w / 2 - s.shoulder, (s) => -s.w / 2, 1, -0.01, 6, () => [1, 1, 1], (s) => s.shoulder > 0.2);
  roadStrip(shoulder, (s) => s.w / 2, (s) => s.w / 2 + s.shoulder, 1, -0.01, 6, () => [1, 1, 1], (s) => s.shoulder > 0.2);
  // underside skirt (so elevated roads look solid)
  roadStrip(under, (s) => -s.w / 2 - s.shoulder, (s) => s.w / 2 + s.shoulder, 1, -0.6, 8, () => [0.55, 0.55, 0.55]);
  flipWinding(under);

  // walls: inner face + top + outer face per side
  for (const side of [-1, 1] as const) {
    let prev = -1, prevOk = false;
    for (const ri of rows) {
      const smp = S[ri]!;
      const wd = side < 0 ? smp.wallL : smp.wallR;
      const ok = wd.type !== 'none' && wd.type !== 'invisible' && wd.type !== 'curb';
      const h = Math.max(0.5, wd.h);
      const u0 = side * (smp.w / 2 + smp.shoulder), u1 = u0 + side * 0.45;
      const base = wall.pos.length / 3;
      const pts: [number, number][] = [[u0, -0.6], [u0, h], [u1, h], [u1, -0.6]];
      const nrms = [[-side, 0], [0, 1], [0, 1], [side, 0]];
      pts.forEach(([u, hh], i) => {
        const p = at(smp, u, hh);
        wall.pos.push(p[0], p[1], p[2]);
        const [nr, nu] = nrms[i]!;
        wall.nrm.push(smp.rx * nr! + smp.ux * nu!, smp.ry * nr! + smp.uy * nu!, smp.rz * nr! + smp.uz * nu!);
        wall.uv.push(i / 3, smp.s / 3);
        const tint = wd.type === 'rock' ? 0.8 : wd.type === 'building' ? 0.9 : 1;
        wall.col.push(tint, tint, tint);
      });
      if (prev >= 0 && ok && prevOk) {
        const i0 = wall.idx.length;
        for (let q = 0; q < 3; q++) {
          const a = prev + q, b = prev + q + 1, d = base + q, e = base + q + 1;
          if (side > 0) wall.idx.push(a, b, d, b, e, d); else wall.idx.push(a, d, b, b, d, e);
        }
        pushChunk(wall, chunkOf(smp.s), i0, bboxOf(wall.pos, prev, base + 3));
      }
      prev = base; prevOk = ok;
    }
  }

  // start/finish line decal (2 m deep)
  const lineIdx = S.findIndex((s) => s.s >= lineS);
  if (lineIdx >= 0) {
    const a = S[Math.max(0, lineIdx - 1)]!, b = S[Math.min(S.length - 1, lineIdx + 1)]!;
    const base = 0;
    for (const smp of [a, b]) for (const t of [0, 1]) {
      const p = at(smp, -smp.w / 2 + t * smp.w, 0.035);
      line.pos.push(p[0], p[1], p[2]); line.nrm.push(smp.ux, smp.uy, smp.uz); line.uv.push(t, smp === a ? 0 : 1); line.col.push(1, 1, 1);
    }
    line.idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    line.chunks.push({ i0: 0, n: 6, bbox: bboxOf(line.pos, 0, 3) });
  }
  // boost / jump pads
  for (const pd of pads) {
    const i0s = S.findIndex((s) => sMainOf(s.s) >= pd.s0);
    const i1s = S.findIndex((s) => sMainOf(s.s) >= pd.s1);
    if (i0s < 0 || i1s < 0 || i1s <= i0s) continue;
    const base = pad.pos.length / 3;
    for (let i = i0s; i <= i1s; i++) {
      const smp = S[i]!;
      for (const t of [0, 1]) {
        const p = at(smp, pd.u0 + (pd.u1 - pd.u0) * t, 0.04);
        pad.pos.push(p[0], p[1], p[2]); pad.nrm.push(smp.ux, smp.uy, smp.uz); pad.uv.push(t, (i - i0s) / (i1s - i0s)); pad.col.push(pd.kind === 'boost' ? 1 : 0, 0, 0);
      }
    }
    const i0 = pad.idx.length;
    for (let k = 0; k < i1s - i0s; k++) { const a = base + k * 2; pad.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    pad.chunks.push({ i0, n: pad.idx.length - i0, bbox: bboxOf(pad.pos, base, pad.pos.length / 3 - 1) });
  }
  void seed;
  return [road, kerb, shoulder, wall, under, line, pad].filter((s) => s.idx.length > 0);
}

function flipWinding(s: RenderSlot): void {
  for (let i = 0; i < s.idx.length; i += 3) { const t = s.idx[i + 1]!; s.idx[i + 1] = s.idx[i + 2]!; s.idx[i + 2] = t; }
  for (let i = 0; i < s.nrm.length; i++) s.nrm[i] = -s.nrm[i]!;
}

function bboxOf(pos: number[], v0: number, v1: number): number[] {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let v = v0; v <= v1; v++) {
    for (let k = 0; k < 3; k++) { const x = pos[v * 3 + k]!; if (x < b[k]!) b[k] = x; if (x > b[k + 3]!) b[k + 3] = x; }
  }
  return b;
}
function mergeBox(a: number[], b: number[]): void {
  for (let k = 0; k < 3; k++) { if (b[k]! < a[k]!) a[k] = b[k]!; if (b[k + 3]! > a[k + 3]!) a[k + 3] = b[k + 3]!; }
}

// ------------------------------------------------------------------------------------------------ terrain
/** Heightfield around the track: gentle noise, flattened under/near the road so it never pokes through. */
export function buildTerrain(g: Geometry, bounds: number[], noise: (x: number, z: number) => number, amp: number, cell = 8, margin = 180): RenderSlot {
  const t = newSlot('terrain', 'terrain');
  const x0 = bounds[0]! - margin, z0 = bounds[2]! - margin, x1 = bounds[3]! + margin, z1 = bounds[5]! + margin;
  const nx = Math.ceil((x1 - x0) / cell), nz = Math.ceil((z1 - z0) / cell);
  const S = g.samples;
  // coarse lookup of track samples for distance queries
  const grid = new Map<string, number[]>();
  const GC = 24;
  S.forEach((s, i) => { const k = `${Math.floor(s.x / GC)},${Math.floor(s.z / GC)}`; let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(i); });
  const baseY = Math.min(...S.map((s) => s.y));
  for (let iz = 0; iz <= nz; iz++) for (let ix = 0; ix <= nx; ix++) {
    const x = x0 + ix * cell, z = z0 + iz * cell;
    let best = Infinity, bestY = baseY, bestW = 8;
    const gx = Math.floor(x / GC), gz = Math.floor(z / GC);
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const l = grid.get(`${gx + dx},${gz + dz}`);
      if (!l) continue;
      for (const i of l) { const s = S[i]!; const d = Math.hypot(s.x - x, s.z - z); if (d < best) { best = d; bestY = s.y; bestW = s.w / 2 + s.shoulder; } }
    }
    const natural = baseY - 1.5 + noise(x, z) * amp * Math.min(1, Math.max(0, (best - bestW - 10) / 60));
    const edge = bestW + 3;
    let y: number;
    if (best < edge) y = Math.min(bestY - 0.35, natural);
    else if (best < edge + 30) { const tt = (best - edge) / 30; const sm = tt * tt * (3 - 2 * tt); y = (bestY - 0.35) * (1 - sm) + natural * sm; y = Math.min(y, best < edge + 6 ? bestY - 0.3 : Infinity); }
    else y = natural;
    t.pos.push(x, y, z);
    t.nrm.push(0, 1, 0);
    t.uv.push(x / 16, z / 16);
    const shade = 0.85 + 0.15 * noise(x * 3.1, z * 3.1);
    t.col.push(shade, shade, shade);
  }
  // normals from heights
  const H = (ix: number, iz: number): number => t.pos[(Math.min(nz, Math.max(0, iz)) * (nx + 1) + Math.min(nx, Math.max(0, ix))) * 3 + 1]!;
  for (let iz = 0; iz <= nz; iz++) for (let ix = 0; ix <= nx; ix++) {
    const dx = H(ix + 1, iz) - H(ix - 1, iz), dz = H(ix, iz + 1) - H(ix, iz - 1);
    const n = [-dx, 2 * cell, -dz]; const l = Math.hypot(n[0]!, n[1]!, n[2]!);
    const o = (iz * (nx + 1) + ix) * 3;
    t.nrm[o] = n[0]! / l; t.nrm[o + 1] = n[1]! / l; t.nrm[o + 2] = n[2]! / l;
  }
  const CHN = 12;
  for (let cz = 0; cz < nz; cz += CHN) for (let cx = 0; cx < nx; cx += CHN) {
    const i0 = t.idx.length;
    for (let iz = cz; iz < Math.min(nz, cz + CHN); iz++) for (let ix = cx; ix < Math.min(nx, cx + CHN); ix++) {
      const a = iz * (nx + 1) + ix, b = a + 1, c = a + (nx + 1), d = c + 1;
      t.idx.push(a, c, b, b, c, d);
    }
    const bb = [x0 + cx * cell, Infinity, z0 + cz * cell, x0 + Math.min(nx, cx + CHN) * cell, -Infinity, z0 + Math.min(nz, cz + CHN) * cell];
    for (let iz = cz; iz <= Math.min(nz, cz + CHN); iz++) for (let ix = cx; ix <= Math.min(nx, cx + CHN); ix++) { const y = H(ix, iz); if (y < bb[1]!) bb[1] = y; if (y > bb[4]!) bb[4] = y; }
    t.chunks.push({ i0, n: t.idx.length - i0, bbox: bb });
  }
  return t;
}
