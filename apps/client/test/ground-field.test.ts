/// <reference types="node" />
// Ground field (foundation of the GPU clipmap terrain and GPU grass): on every baked track the lattice reproduces
// each terrain triangle exactly (same diagonal split), normals match the faces, and the road distance map covers the
// terrain, is zero on near-ground road/wall triangles and never undercuts the true distance. Synthetic slots cover
// NaN repair parity with TrackView, missing cells and the elevated-deck rule.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { CVIS_MAGIC, CVIS_VERSION, readContainer, toArrayBuffer, writeContainer, type TypedArray } from '@cr/sim';
import { buildGroundField, DECK_REACH, ROAD_MATERIALS, ROAD_TEX_RANGE, type GroundField } from '../src/render/ground/field.ts';
import { repairTerrain } from '../src/render/track/repair.ts';

const DIR = new URL('../public/tracks/', import.meta.url);
const FILES = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.vis')).sort() : [];

interface Slot { name: string; material: string; pos: Float32Array; idx: Uint32Array }
interface Loaded { id: string; buf: ArrayBuffer; meta: { theme?: Record<string, string>; line: { x: number; z: number } }; slots: Slot[]; field: GroundField; ms: number }

const cache = new Map<string, Loaded>();
function load(file: string): Loaded {
  let l = cache.get(file);
  if (!l) {
    const buf = toArrayBuffer(readFileSync(new URL(file, DIR)));
    const c = readContainer(buf, CVIS_MAGIC, CVIS_VERSION);
    const meta = c.meta as Loaded['meta'] & { slots: { name: string; material: string }[] };
    const slots = meta.slots.map((s, j) => ({ name: s.name, material: s.material, pos: c.arrays.get(`s${j}.pos`) as Float32Array, idx: c.arrays.get(`s${j}.idx`) as Uint32Array }));
    const t0 = performance.now();
    const field = buildGroundField(buf);
    const ms = performance.now() - t0;
    l = { id: file.replace(/\.vis$/, ''), buf, meta, slots, field, ms };
    cache.set(file, l);
  }
  return l;
}

/** mulberry32: deterministic points, so a failure reproduces */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const terrainSlots = (l: Loaded): Slot[] => l.slots.filter((s) => s.material === 'terrain');
const roadSlots = (l: Loaded): Slot[] => l.slots.filter((s) => ROAD_MATERIALS.has(s.material));

/** The documented DECK_REACH rule, restated from the outside: the triangle's span above the ground overlaps ±6 m. */
function nearGround(f: GroundField, p: Float32Array, a: number, b: number, c: number): boolean {
  if (!f.ok) return true;
  let lo = Infinity, hi = -Infinity;
  for (const v of [a, b, c]) {
    const g = f.heightAt(p[v * 3]!, p[v * 3 + 2]!);
    if (Number.isNaN(g)) continue;
    const d = p[v * 3 + 1]! - g;
    lo = Math.min(lo, d); hi = Math.max(hi, d);
  }
  return !(lo <= hi && (lo > DECK_REACH || hi < -DECK_REACH));
}

/** xz distance from point to segment / triangle (0 inside) */
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
function triDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number, cx: number, cz: number): number {
  const d1 = (bx - ax) * (pz - az) - (bz - az) * (px - ax), d2 = (cx - bx) * (pz - bz) - (cz - bz) * (px - bx), d3 = (ax - cx) * (pz - cz) - (az - cz) * (px - cx);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  if (!(neg && pos) && (d1 || d2 || d3)) return 0;
  return Math.min(segDist(px, pz, ax, az, bx, bz), segDist(px, pz, bx, bz, cx, cz), segDist(px, pz, cx, cz, ax, az));
}

if (FILES.length === 0) describe.skip('ground field on every baked track (needs `pnpm bake`)', () => { it('has baked tracks', () => {}); });
else describe('ground field on every baked track', () => {
  const withTerrain = FILES.filter((f) => terrainSlots(load(f)).length > 0);
  const without = FILES.filter((f) => terrainSlots(load(f)).length === 0);

  it('finds terrain on most tracks and builds every field quickly', () => {
    expect(withTerrain.length).toBeGreaterThan(10);
    const rows = FILES.map((f) => { const l = load(f); return `${l.id.padEnd(22)} ${l.ms.toFixed(1).padStart(7)} ms  ok=${l.field.ok}  lattice ${l.field.nx}×${l.field.nz}@${l.field.cell.toFixed(3)}  road ${l.field.road.nx}×${l.field.road.nz}@${l.field.road.cell}`; });
    console.log(`[ground-field] build times\n${rows.join('\n')}`);
    for (const f of FILES) expect(load(f).ms, f).toBeLessThan(2000);
  });

  it.each(withTerrain)('%s: heightAt is the exact baked surface (vertices and random interior points)', (file) => {
    const l = load(file), f = l.field;
    expect(f.ok).toBe(true);
    const r = rng(0x5eed + file.length);
    let maxV = 0, maxP = 0, nanV = 0, nanP = 0, nV = 0, nP = 0, tris = 0;
    for (const s of terrainSlots(l)) {
      const p = s.pos;
      for (let t = 0; t < s.idx.length; t += 3) {
        const a = s.idx[t]! * 3, b = s.idx[t + 1]! * 3, c = s.idx[t + 2]! * 3;
        tris++;
        for (const v of [a, b, c]) {
          if (!Number.isFinite(p[v + 1]!)) continue; // repaired on load; parity is covered by the synthetic test
          const h = f.heightAt(p[v]!, p[v + 2]!);
          nV++;
          if (Number.isNaN(h)) nanV++; else maxV = Math.max(maxV, Math.abs(h - p[v + 1]!));
        }
        for (let k = 0; k < 3; k++) {
          // uniform barycentric sample of the baked triangle; its plane height is the reference
          const r1 = Math.sqrt(r()), r2 = r(), wa = 1 - r1, wb = r1 * (1 - r2), wc = r1 * r2;
          const x = wa * p[a]! + wb * p[b]! + wc * p[c]!, y = wa * p[a + 1]! + wb * p[b + 1]! + wc * p[c + 1]!, z = wa * p[a + 2]! + wb * p[b + 2]! + wc * p[c + 2]!;
          const h = f.heightAt(x, z);
          nP++;
          if (Number.isNaN(h)) nanP++; else maxP = Math.max(maxP, Math.abs(h - y));
        }
      }
    }
    expect(nanV, 'vertices without a height').toBe(0);
    expect(nanP, 'interior points without a height').toBe(0);
    expect(maxV, `max vertex error over ${nV}`).toBeLessThan(1e-4);
    expect(maxP, `max interior error over ${nP}`).toBeLessThan(1e-4);
    // every baked triangle is one half of a present cell (trackc bakes the full rectangle today)
    let present = 0;
    for (let i = 0; i < f.present.length; i++) present += f.present[i]!;
    expect(present * 2).toBe(tris);
    expect(f.height.length).toBe((f.nx + 1) * (f.nz + 1));
    expect(Number.isNaN(f.heightAt(f.x0 - 1, f.z0 + 1))).toBe(true);
    expect(Number.isNaN(f.heightAt(f.x0 + 1, f.z0 + f.nz * f.cell + 1))).toBe(true);
  });

  it.each(withTerrain)('%s: normalAt is the baked face normal', (file) => {
    const l = load(file), f = l.field;
    const n = { x: 0, y: 0, z: 0 };
    let minDot = 1, maxLen = 0;
    for (const s of terrainSlots(l)) {
      const p = s.pos;
      for (let t = 0; t < s.idx.length; t += 3) {
        const a = s.idx[t]! * 3, b = s.idx[t + 1]! * 3, c = s.idx[t + 2]! * 3;
        const e1x = p[b]! - p[a]!, e1y = p[b + 1]! - p[a + 1]!, e1z = p[b + 2]! - p[a + 2]!, e2x = p[c]! - p[a]!, e2y = p[c + 1]! - p[a + 1]!, e2z = p[c + 2]! - p[a + 2]!;
        let gx = e1y * e2z - e1z * e2y, gy = e1z * e2x - e1x * e2z, gz = e1x * e2y - e1y * e2x;
        const gl = Math.hypot(gx, gy, gz) * Math.sign(gy || 1);
        gx /= gl; gy /= gl; gz /= gl;
        f.normalAt((p[a]! + p[b]! + p[c]!) / 3, (p[a + 2]! + p[b + 2]! + p[c + 2]!) / 3, n);
        maxLen = Math.max(maxLen, Math.abs(Math.hypot(n.x, n.y, n.z) - 1));
        minDot = Math.min(minDot, n.x * gx + n.y * gy + n.z * gz);
      }
    }
    expect(minDot).toBeGreaterThan(0.999);
    expect(maxLen).toBeLessThan(1e-9);
  });

  it.each(FILES)('%s: road distance covers the ground, is 0 on near-ground road triangles and tracks the true distance', (file) => {
    const l = load(file), f = l.field, R = f.road;
    expect(R.nx * R.nz).toBeLessThanOrEqual(4_000_000);
    expect(R.dist.length).toBe(R.nx * R.nz);
    if (f.ok) {
      expect(R.x0).toBeLessThanOrEqual(f.x0 + 1e-6);
      expect(R.z0).toBeLessThanOrEqual(f.z0 + 1e-6);
      expect(R.x0 + R.nx * R.cell).toBeGreaterThanOrEqual(f.x0 + f.nx * f.cell - 1e-6);
      expect(R.z0 + R.nz * R.cell).toBeGreaterThanOrEqual(f.z0 + f.nz * f.cell - 1e-6);
      for (const [x, z] of [[f.x0, f.z0], [f.x0 + f.nx * f.cell, f.z0], [f.x0, f.z0 + f.nz * f.cell], [f.x0 + f.nx * f.cell, f.z0 + f.nz * f.cell]] as const) expect(Number.isFinite(f.roadDistAt(x, z))).toBe(true);
    }
    expect(f.roadDistAt(R.x0 - 1, R.z0 + 1)).toBe(Infinity);
    // near-ground triangles: the cell under the centroid is stamped, the bilinear value stays within a cell
    const tris: number[] = []; // flattened ax,az,bx,bz,cx,cz,near
    let near = 0, high = 0, unstamped = 0, maxCentroid = 0;
    for (const s of roadSlots(l)) {
      const p = s.pos;
      for (let t = 0; t < s.idx.length; t += 3) {
        const a = s.idx[t]!, b = s.idx[t + 1]!, c = s.idx[t + 2]!;
        const ng = nearGround(f, p, a, b, c);
        tris.push(p[a * 3]!, p[a * 3 + 2]!, p[b * 3]!, p[b * 3 + 2]!, p[c * 3]!, p[c * 3 + 2]!, ng ? 1 : 0);
        if (!ng) { high++; continue; }
        near++;
        const x = (p[a * 3]! + p[b * 3]! + p[c * 3]!) / 3, z = (p[a * 3 + 2]! + p[b * 3 + 2]! + p[c * 3 + 2]!) / 3;
        const ix = Math.floor((x - R.x0) / R.cell), iz = Math.floor((z - R.z0) / R.cell);
        if (ix < 0 || iz < 0 || ix >= R.nx || iz >= R.nz) continue;
        if (R.dist[iz * R.nx + ix] !== 0) unstamped++;
        maxCentroid = Math.max(maxCentroid, f.roadDistAt(x, z));
      }
    }
    expect(near).toBeGreaterThan(100);
    expect(unstamped, 'near-ground triangles whose centroid cell is not stamped').toBe(0);
    expect(maxCentroid).toBeLessThanOrEqual(1.5 * R.cell);
    // spot checks against the exact xz distance: never below it (minus the raster cell), and within the chamfer
    // overestimate of it when the nearest triangle is one that stamps (near the ground)
    const r = rng(0xf1e1d + file.length);
    let far = 0, maxRatio = 0;
    for (let k = 0; k < 160; k++) {
      let x: number, z: number;
      if (f.ok) { x = f.x0 + Math.floor(r() * (f.nx + 1)) * f.cell; z = f.z0 + Math.floor(r() * (f.nz + 1)) * f.cell; }
      else { x = R.x0 + r() * R.nx * R.cell; z = R.z0 + r() * R.nz * R.cell; }
      let best = Infinity, bestNear = false, nv2 = Infinity;
      for (let i = 0; i < tris.length; i += 7) {
        const ax = tris[i]!, az = tris[i + 1]!, bx = tris[i + 2]!, bz = tris[i + 3]!, cx = tris[i + 4]!, cz = tris[i + 5]!;
        const da = (x - ax) * (x - ax) + (z - az) * (z - az), db = (x - bx) * (x - bx) + (z - bz) * (z - bz), dc = (x - cx) * (x - cx) + (z - cz) * (z - cz);
        if (da < nv2) nv2 = da; if (db < nv2) nv2 = db; if (dc < nv2) nv2 = dc;
        if (Math.min(ax, bx, cx) - x > best || x - Math.max(ax, bx, cx) > best || Math.min(az, bz, cz) - z > best || z - Math.max(az, bz, cz) > best) continue;
        const d = triDist(x, z, ax, az, bx, bz, cx, cz);
        if (d < best || (d === best && tris[i + 6] === 1)) { best = d; bestNear = tris[i + 6] === 1; }
      }
      const got = f.roadDistAt(x, z);
      expect(got, `(${x.toFixed(1)}, ${z.toFixed(1)}) true ${best.toFixed(2)}`).toBeGreaterThanOrEqual(best - 1.5 * R.cell);
      if (bestNear) { expect(got).toBeLessThanOrEqual(1.06 * best + 1.5 * R.cell); if (best > 10) maxRatio = Math.max(maxRatio, got / best); }
      if (nv2 > 30 * 30) { far++; expect(got).toBeGreaterThan(0); }
    }
    if (f.ok) expect(far).toBeGreaterThan(20);
    console.log(`[ground-field] ${l.id}: ${near} near-ground road/wall tris, ${high} elevated skipped, centroid max ${maxCentroid.toFixed(2)} m, far spot checks ${far}, max dist/true ${maxRatio.toFixed(3)}`);
  });

  it.each(without)('%s: no terrain slot → ok=false, empty lattice, road still valid', (file) => {
    const l = load(file), f = l.field;
    expect(l.meta.theme?.terrain).toBe('none');
    expect(f.ok).toBe(false);
    expect(f.height.length).toBe(0);
    expect(f.present.length).toBe(0);
    expect(Number.isNaN(f.heightAt(l.meta.line.x, l.meta.line.z))).toBe(true);
    expect(f.normalAt(0, 0, { x: 9, y: 9, z: 9 })).toEqual({ x: 0, y: 1, z: 0 });
    expect(f.roadDistAt(l.meta.line.x, l.meta.line.z)).toBeLessThan(1.5);
    const tx = f.textures();
    expect([tx.height.image.width, tx.height.image.height, tx.present.image.width]).toEqual([1, 1, 1]);
  });

  it('terrain=none tracks are exactly the tracks without a terrain slot', () => {
    for (const f of FILES) expect(load(f).meta.theme?.terrain === 'none', f).toBe(without.includes(f));
  });

  it('textures(): formats, sizes and encodings', () => {
    const l = load(withTerrain[0]!), f = l.field, R = f.road;
    const t = f.textures();
    expect(f.textures()).toBe(t); // cached
    const all = [t.height, t.shade, t.road, t.present];
    for (const x of all) { expect(x.format).toBe(THREE.RedFormat); expect(x.flipY).toBe(false); expect(x.generateMipmaps).toBe(false); expect(x.version).toBeGreaterThan(0); }
    expect(t.height.type).toBe(THREE.FloatType);
    expect([t.height.magFilter, t.height.minFilter, t.present.magFilter, t.present.minFilter]).toEqual([THREE.NearestFilter, THREE.NearestFilter, THREE.NearestFilter, THREE.NearestFilter]);
    expect([t.shade.magFilter, t.shade.minFilter, t.road.magFilter, t.road.minFilter]).toEqual([THREE.LinearFilter, THREE.LinearFilter, THREE.LinearFilter, THREE.LinearFilter]);
    for (const x of [t.shade, t.road, t.present]) expect(x.type).toBe(THREE.UnsignedByteType);
    expect([t.height.image.width, t.height.image.height, t.shade.image.width, t.shade.image.height]).toEqual([f.nx + 1, f.nz + 1, f.nx + 1, f.nz + 1]);
    expect([t.present.image.width, t.present.image.height, t.road.image.width, t.road.image.height]).toEqual([f.nx, f.nz, R.nx, R.nz]);
    expect(t.height.image.data).toBe(f.height);
    const rd = t.road.image.data as Uint8Array;
    for (let i = 0; i < rd.length; i += 997) expect(rd[i]).toBe(Math.round(Math.min(1, R.dist[i]! / ROAD_TEX_RANGE) * 255));
    expect((t.present.image.data as Uint8Array)[0]).toBe(f.present[0] ? 255 : 0);
    for (const x of all) x.dispose();
  });
});

// ------------------------------------------------------------------------------------------------ synthetic slots
interface SynthOpts { nx: number; nz: number; cell: number; x0: number; z0: number; h: (ix: number, iz: number) => number; drop?: (ix: number, iz: number, upper: boolean) => boolean; roads?: number[][][] }

/** A .vis with a terrain slot emitted like trackc terrainToRender (unwelded: every triangle has its own vertices). */
function synthVis(o: SynthOpts): { buf: ArrayBuffer; pos: Float32Array; nrm: Float32Array } {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const V = (ix: number, iz: number): void => { pos.push(o.x0 + ix * o.cell, o.h(ix, iz), o.z0 + iz * o.cell); col.push(0.5, 0.5, 0.5); };
  for (let iz = 0; iz < o.nz; iz++) for (let ix = 0; ix < o.nx; ix++) {
    if (!o.drop?.(ix, iz, false)) { const b = pos.length / 3; V(ix, iz); V(ix, iz + 1); V(ix + 1, iz); idx.push(b, b + 1, b + 2); }
    if (!o.drop?.(ix, iz, true)) { const b = pos.length / 3; V(ix + 1, iz); V(ix, iz + 1); V(ix + 1, iz + 1); idx.push(b, b + 1, b + 2); }
  }
  const nv = pos.length / 3;
  const nrm = new Float32Array(nv * 3);
  for (let v = 0; v < nv; v++) nrm[v * 3 + 1] = 1;
  const slots = [{ name: 'terrain', material: 'terrain', chunks: [] }];
  const P = Float32Array.from(pos);
  const arrays: [string, TypedArray][] = [['s0.pos', P], ['s0.nrm', nrm], ['s0.uv', new Float32Array(nv * 2)], ['s0.col', Float32Array.from(col)], ['s0.idx', Uint32Array.from(idx)]];
  if (o.roads?.length) {
    const rp: number[] = [], ri: number[] = [];
    for (const tri of o.roads) { const b = rp.length / 3; for (const v of tri) rp.push(v[0]!, v[1]!, v[2]!); ri.push(b, b + 1, b + 2); }
    slots.push({ name: 'road:asphalt', material: 'road', chunks: [] });
    const n = rp.length / 3;
    arrays.push(['s1.pos', Float32Array.from(rp)], ['s1.nrm', new Float32Array(n * 3)], ['s1.uv', new Float32Array(n * 2)], ['s1.col', new Float32Array(n * 3)], ['s1.idx', Uint32Array.from(ri)]);
  }
  const meta = { id: 'synth', themeId: 'x', name: 'synth', slots, props: [], bounds: [o.x0, 0, o.z0, o.x0 + o.nx * o.cell, 0, o.z0 + o.nz * o.cell], line: { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 1, w: 10 }, theme: {}, lapLength: 0 };
  return { buf: toArrayBuffer(writeContainer(CVIS_MAGIC, CVIS_VERSION, meta, arrays)), pos: P, nrm };
}

describe('ground field on synthetic slots', () => {
  // the ix·iz term makes cells non-planar (a sum of 1-D terms is split-independent)
  const bumpy = (ix: number, iz: number): number => 3 * Math.sin(ix * 0.7) + 2 * Math.cos(iz * 1.3) + ix * 0.3 + 0.4 * ix * iz;

  it('infers an off-origin lattice and keeps the b–c split (a non-planar cell tells the diagonals apart)', () => {
    const o = { nx: 11, nz: 7, cell: 8, x0: -37.25, z0: 12.5, h: bumpy };
    const f = buildGroundField(synthVis(o).buf);
    expect([f.ok, f.nx, f.nz, f.x0, f.z0]).toEqual([true, 11, 7, -37.25, 12.5]);
    expect(f.cell).toBeCloseTo(8, 9);
    // the cell centre lies on the b–c diagonal: the mean of b and c, not of a and d
    const x = o.x0 + 3.5 * o.cell, z = o.z0 + 2.5 * o.cell;
    expect(f.heightAt(x, z)).toBeCloseTo((bumpy(4, 2) + bumpy(3, 3)) / 2, 5);
    expect(Math.abs((bumpy(3, 2) + bumpy(4, 3)) / 2 - (bumpy(4, 2) + bumpy(3, 3)) / 2)).toBeGreaterThan(0.01);
  });

  it('non-finite heights are filled exactly like TrackView repairTerrain', () => {
    const hole = (ix: number, iz: number): number => ((ix >= 3 && ix <= 6 && iz >= 2 && iz <= 4) || (ix === 0 && iz === 0) ? NaN : bumpy(ix, iz));
    const s = synthVis({ nx: 9, nz: 6, cell: 8, x0: 100.5, z0: -60, h: hole });
    const f = buildGroundField(s.buf);
    const pos = s.pos.slice(), nrm = s.nrm.slice();
    expect(repairTerrain(pos, nrm)).toBeGreaterThan(0);
    let max = 0;
    for (let v = 0; v < pos.length; v += 3) max = Math.max(max, Math.abs(f.heightAt(pos[v]!, pos[v + 2]!) - pos[v + 1]!));
    expect(max).toBeLessThan(1e-4);
    for (let i = 0; i < f.height.length; i++) expect(Number.isFinite(f.height[i]!)).toBe(true);
  });

  it('missing triangles clear `present` and read NaN only on their half', () => {
    const drop = (ix: number, iz: number, upper: boolean): boolean => (ix === 2 && iz === 2) || (ix === 4 && iz === 1 && upper);
    const o = { nx: 6, nz: 5, cell: 4, x0: 0, z0: 0, h: bumpy, drop };
    const f = buildGroundField(synthVis(o).buf);
    expect(f.present[2 * 6 + 2]).toBe(0);
    expect(f.present[1 * 6 + 4]).toBe(0);
    expect(f.present[0]).toBe(1);
    expect(Number.isNaN(f.heightAt(2.5 * 4, 2.5 * 4))).toBe(true);
    expect(Number.isNaN(f.heightAt(4.8 * 4, 1.8 * 4))).toBe(true); // upper half of (4,1)
    expect(Number.isFinite(f.heightAt(4.2 * 4, 1.2 * 4))).toBe(true); // lower half of (4,1) is still baked
    expect(f.normalAt(2.5 * 4, 2.5 * 4, { x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('a deck more than DECK_REACH above the ground does not stamp the road map; one at ground level does', () => {
    const flat = (): number => 0;
    const low = [[[20, 0.2, 20], [30, 0.2, 20], [20, 0.2, 30]]];
    const deck = [[[150, DECK_REACH + 4, 150], [160, DECK_REACH + 4, 150], [150, DECK_REACH + 4, 160]]];
    const f = buildGroundField(synthVis({ nx: 25, nz: 25, cell: 8, x0: 0, z0: 0, h: flat, roads: [...low, ...deck] }).buf);
    expect(f.roadDistAt(23, 23)).toBe(0);
    const d = f.roadDistAt(153, 153);
    const expected = Math.hypot(153 - 25, 153 - 25); // to the low triangle's hypotenuse midpoint region
    expect(d).toBeGreaterThan(expected * 0.9);
    // and the straight-line distance east of the low triangle is metric (chamfer error ≤ 6 %)
    expect(f.roadDistAt(30 + 40.5, 20.5)).toBeGreaterThan(39);
    expect(f.roadDistAt(30 + 40.5, 20.5)).toBeLessThan(42.5);
  });
});
