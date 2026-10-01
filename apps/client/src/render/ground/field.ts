// Ground field: the baked terrain heightfield plus a distance-to-road map, decoded once per track from the .vis, as
// the shared input of the GPU clipmap terrain and the GPU grass (render only; the sim never reads it).
// - trackc emits the terrain slot as a regular lattice (packages/trackc/src/terrain.ts `terrainToRender`), so the
//   slot folds back into a height grid. heightAt reproduces the baked triangles exactly (same diagonal, barycentric
//   interpolation), so anything placed with it sits on the rendered ground, not on a smoothed approximation.
// - The road map tells grass where not to grow: metres to the nearest drivable or wall triangle near the ground.
// Built once at load; the per-query functions allocate nothing (they run per blade / per prop in hot loops).
import * as THREE from 'three/webgpu';
import { CVIS_MAGIC, CVIS_VERSION, readContainer } from '@cr/sim';
import type { VisMeta } from '../track/TrackView.ts';

/**
 * Distance (m) to the nearest road / kerb / shoulder / plaza / start line / pad / wall triangle near the ground.
 * Row-major, `nz` rows of `nx`; `dist[iz*nx+ix]` is the value at the CELL CENTRE (x0+(ix+0.5)·cell, z0+(iz+0.5)·cell),
 * which is where a linearly filtered texture with uv = (p − x0) / (n·cell) puts its texel centres.
 */
export interface RoadField { cell: number; x0: number; z0: number; nx: number; nz: number; dist: Float32Array }

export interface GroundTextures { height: THREE.DataTexture; shade: THREE.DataTexture; road: THREE.DataTexture; present: THREE.DataTexture }

/**
 * The baked terrain split (trackc terrainToRender), which every consumer must reproduce: cell (ix,iz) has corners
 * a=(ix,iz) b=(ix+1,iz) c=(ix,iz+1) d=(ix+1,iz+1) and two triangles along the b–c diagonal. With local coords
 * tx,tz ∈ [0,1]: lower (a,c,b) where tx+tz ≤ 1, h = ha + (hb−ha)·tx + (hc−ha)·tz; upper (b,c,d) where tx+tz > 1,
 * h = hd + (hc−hd)·(1−tx) + (hb−hd)·(1−tz).
 */
export interface GroundField {
  /** false when the track has no terrain slot (terrain=none sea tracks): lattice arrays are empty, `road` still valid */
  ok: boolean;
  /** terrain lattice: (nx+1)·(nz+1) vertices, vertex (ix,iz) at (x0+cell·ix, z0+cell·iz) up to float32 rounding */
  cell: number; x0: number; z0: number; nx: number; nz: number;
  /** lattice heights (row-major by iz), NaN where no baked vertex exists */
  height: Float32Array;
  /** lattice vertex-colour shade (luma of the baked rgb, 0..1), 1 where no baked vertex exists */
  shade: Float32Array;
  /** per cell (nx·nz): 1 when both baked triangles of the cell exist */
  present: Uint8Array;
  road: RoadField;
  /**
   * The baked terrain surface: the split above, interpolated between the vertices' stored float32 coordinates (so a
   * baked vertex reads back its own height exactly); NaN outside the lattice or on a missing triangle.
   */
  heightAt(x: number, z: number): number;
  /** unit face normal (y up) of the baked triangle under (x, z); (0, 1, 0) where heightAt is NaN */
  normalAt(x: number, z: number, out: { x: number; y: number; z: number }): { x: number; y: number; z: number };
  /** bilinear road distance (m), clamped at the grid edge; +Infinity outside the road grid */
  roadDistAt(x: number, z: number): number;
  /**
   * GPU copies, created on first call and cached. Lattice textures are (nx+1)×(nz+1), texel (ix,iz) = vertex (ix,iz):
   * height R32F Nearest (R32F is not filterable on WebGL2: shaders `.load()` it and interpolate with the split
   * above), shade R8 Linear. road R8 Linear (road.nx×road.nz, value = clamp(dist/64)·255). present R8 Nearest
   * (nx×nz, 255 where present so a normalised read gives 1). Without terrain the lattice textures are 1×1 dummies.
   */
  textures(): GroundTextures;
}

/**
 * Slot materials that keep grass away: every surface a kart drives on (road includes F3 plazas, which bake into road
 * slots), plus walls, so grass never grows through a barrier. Not terrain, not underside (deck bottoms, side skirts
 * and kill planes) and not water.
 */
export const ROAD_MATERIALS: ReadonlySet<string> = new Set(['road', 'kerb', 'shoulder', 'startline', 'boostpad', 'wall']);

/**
 * A road or wall triangle stamps the road map only when its vertical span, measured from the terrain under each of
 * its vertices, overlaps ±DECK_REACH m: decks higher than that leave the ground below them free for grass (bridges,
 * flyovers), as do roads deep below it. Triangles off the terrain (no baked ground under any vertex) always count.
 */
export const DECK_REACH = 6;

/** Road distances saturate here in the road texture (R8: 0..255 ↔ 0..64 m). */
export const ROAD_TEX_RANGE = 64;

/** Road grid budget: 1 m cells unless the area is huge, then coarser in 0.25 m steps. */
const ROAD_MAX_CELLS = 4_000_000;
/** Road grid margin around the drivable footprint when there is no terrain rectangle to cover. */
const ROAD_PAD = ROAD_TEX_RANGE;
/** "No road anywhere" distance: finite, because a 0 bilinear weight times Infinity is NaN. */
const NO_ROAD = 1e6;
/** Lattice sanity cap (vertices); a broken slot must not allocate gigabytes. */
const MAX_LATTICE = 16_000_000;
/** Lattice-border tolerance in cells (≈ 1 mm at 8 m cells): float32 positions vs. the inferred x0 + nx·cell. */
const EDGE = 1e-4;
const SQRT2 = Math.SQRT2, SQRT5 = Math.sqrt(5);
/** Unstamped cells of the chamfer work grid (cell units). */
const BIG = 1e9;

interface Lattice { cell: number; x0: number; z0: number; nx: number; nz: number }

/** Sorted distinct values (within `tol`) of one coordinate of every vertex: welded tile-edge duplicates collapse. */
function distinct(slots: Float32Array[], axis: number, tol: number): Float64Array {
  let n = 0;
  for (const p of slots) n += p.length / 3;
  const all = new Float64Array(n);
  let k = 0;
  for (const p of slots) for (let v = axis; v < p.length; v += 3) { const x = p[v]!; if (Number.isFinite(x)) all[k++] = x; }
  const s = all.subarray(0, k).sort();
  let m = 0;
  for (let i = 0; i < s.length; i++) if (m === 0 || s[i]! - s[m - 1]! > tol) s[m++] = s[i]!;
  return s.subarray(0, m);
}

/**
 * Lattice step along one axis from its distinct coordinates: the median gap is the first guess (robust to a stray
 * vertex), then each coordinate refines it as span / steps, so float32 rounding of single gaps never accumulates
 * across a 2 km terrain. Returns 0 when there is no usable spacing.
 */
function axisStep(xs: Float64Array): number {
  if (xs.length < 2) return 0;
  const gaps = new Float64Array(xs.length - 1);
  for (let i = 1; i < xs.length; i++) gaps[i - 1] = xs[i]! - xs[i - 1]!;
  gaps.sort();
  let step = gaps[gaps.length >> 1]!;
  if (!(step > 1e-3)) return 0;
  for (let i = 1; i < xs.length; i++) {
    const k = Math.round((xs[i]! - xs[0]!) / step);
    if (k > 0) step = (xs[i]! - xs[0]!) / k;
  }
  return step;
}

function inferLattice(slots: Float32Array[]): Lattice | null {
  const xs = distinct(slots, 0, 1e-3), zs = distinct(slots, 2, 1e-3);
  const sx = axisStep(xs), sz = axisStep(zs);
  if (!sx || !sz || Math.abs(sx - sz) > 0.01 * sx) return null; // trackc's lattice is square; anything else is not ours
  const spanX = xs[xs.length - 1]! - xs[0]!, spanZ = zs[zs.length - 1]! - zs[0]!;
  const nx = Math.round(spanX / sx), nz = Math.round(spanZ / sz);
  if (nx < 1 || nz < 1 || (nx + 1) * (nz + 1) > MAX_LATTICE) return null;
  return { cell: (spanX + spanZ) / (nx + nz), x0: xs[0]!, z0: zs[0]!, nx, nz };
}

/**
 * Same hole filling as track/repair.ts `repairTerrain` (which TrackView applies to the rendered mesh in place), on the
 * lattice: up to 8 passes where every hole takes the mean of its finite 8-neighbours (pass-synchronous), then the
 * lowest finite height. The field therefore matches the rendered terrain whether or not TrackView ran first.
 */
function repairLattice(height: Float32Array, exists: Uint8Array, nx: number, nz: number): void {
  const W = nx + 1;
  let holes: number[] = [];
  let minY = Infinity;
  for (let i = 0; i < height.length; i++) {
    if (exists[i] === 1) holes.push(i);
    else if (exists[i] === 2 && height[i]! < minY) minY = height[i]!;
  }
  if (!holes.length) return;
  const fill: number[] = [];
  for (let pass = 0; pass < 8 && holes.length; pass++) {
    const left: number[] = [];
    fill.length = 0;
    for (const i of holes) {
      const ix = i % W, iz = (i - ix) / W;
      let sum = 0, n = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const jx = ix + dx, jz = iz + dz;
        if (jx < 0 || jz < 0 || jx > nx || jz > nz) continue;
        const y = height[jz * W + jx]!;
        if (y === y) { sum += y; n++; }
      }
      if (n) fill.push(i, sum / n); else left.push(i);
    }
    for (let k = 0; k < fill.length; k += 2) height[fill[k]!] = fill[k + 1]!;
    holes = left;
  }
  for (const i of holes) height[i] = Number.isFinite(minY) ? minY : 0;
}

interface LatticeBuild extends Lattice { height: Float32Array; shade: Float32Array; exists: Uint8Array; halves: Uint8Array; colX: Float64Array; rowZ: Float64Array }

// The build loops live in small functions of their own: the field is built once per track load, i.e. always cold,
// and V8 compiles a small hot function far sooner than one loop inside a large closure-heavy builder.

/** Writes each terrain vertex into its lattice slot (height, shade, column / row coordinate); returns vertex →
 *  lattice index, −1 when off the lattice. The first finite height of welded duplicates wins. */
function addVertices(L: LatticeBuild, pos: Float32Array, col: Float32Array): Int32Array {
  const { cell, x0, z0, nx, nz, height, shade, exists, colX, rowZ } = L;
  const W = nx + 1, inv = 1 / cell, tol = 0.1 * cell, nvs = pos.length / 3, hasCol = col.length >= pos.length;
  const vl = new Int32Array(nvs);
  for (let v = 0; v < nvs; v++) {
    const x = pos[v * 3]!, y = pos[v * 3 + 1]!, z = pos[v * 3 + 2]!;
    const fx = (x - x0) * inv, fz = (z - z0) * inv;
    const ix = Math.round(fx), iz = Math.round(fz);
    if (!(ix >= 0 && iz >= 0 && ix <= nx && iz <= nz) || Math.abs(fx - ix) * cell > tol || Math.abs(fz - iz) * cell > tol) { vl[v] = -1; continue; }
    const li = iz * W + ix;
    vl[v] = li;
    if (colX[ix] !== colX[ix]) colX[ix] = x;
    if (rowZ[iz] !== rowZ[iz]) rowZ[iz] = z;
    if (exists[li] === 2) continue;
    if (y === y && y !== Infinity && y !== -Infinity) { height[li] = y; exists[li] = 2; } else exists[li] = 1;
    if (hasCol) {
      const l = 0.2126 * col[v * 3]! + 0.7152 * col[v * 3 + 1]! + 0.0722 * col[v * 3 + 2]!;
      shade[li] = l > 0 ? (l < 1 ? l : 1) : 0;
    }
  }
  return vl;
}

/**
 * Which half of which cell each triangle is (terrainToRender: a=(ix,iz) b=(ix+1,iz) c=(ix,iz+1) d=(ix+1,iz+1),
 * triangles (a,c,b) and (b,c,d), i.e. split along the b–c diagonal). Only the corners are trusted, not the vertex
 * order; a triangle of the other diagonal (a–d) or spanning more than one cell is ignored, so it never reads as
 * present.
 */
function addTriangles(L: LatticeBuild, idx: Uint32Array, vl: Int32Array): void {
  const { nx, halves } = L;
  const W = nx + 1;
  for (let t = 0; t < idx.length; t += 3) {
    const la = vl[idx[t]!]!, lb = vl[idx[t + 1]!]!, lc = vl[idx[t + 2]!]!;
    if (la < 0 || lb < 0 || lc < 0) continue;
    const ax = la % W, az = (la - ax) / W, bx = lb % W, bz = (lb - bx) / W, cx = lc % W, cz = (lc - cx) / W;
    const mx = Math.min(ax, bx, cx), mz = Math.min(az, bz, cz);
    if (Math.max(ax, bx, cx) - mx !== 1 || Math.max(az, bz, cz) - mz !== 1) continue;
    // corner bits: a=1, b=2, c=4, d=8
    const corners = (1 << (ax - mx + 2 * (az - mz))) | (1 << (bx - mx + 2 * (bz - mz))) | (1 << (cx - mx + 2 * (cz - mz)));
    const ci = mz * nx + mx;
    if (corners === 7) halves[ci] = halves[ci]! | 1;
    else if (corners === 14) halves[ci] = halves[ci]! | 2;
  }
}

/**
 * Stamps one road-material slot into the work grid, skipping triangles out of reach of the ground (DECK_REACH;
 * `ground` is null without terrain). Returns the number of newly stamped cells.
 */
function stampSlot(work: Float32Array, PW: number, nx: number, nz: number, pos: Float32Array, idx: Uint32Array, ox: number, oz: number, inv: number, ground: ((x: number, z: number) => number) | null): number {
  let stamped = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const va = idx[t]! * 3, vb = idx[t + 1]! * 3, vc = idx[t + 2]! * 3;
    const ax = pos[va]!, ay = pos[va + 1]!, az = pos[va + 2]!, bx = pos[vb]!, by = pos[vb + 1]!, bz = pos[vb + 2]!, cx = pos[vc]!, cy = pos[vc + 1]!, cz = pos[vc + 2]!;
    if (!Number.isFinite(ax + ay + az + bx + by + bz + cx + cy + cz)) continue;
    if (ground) {
      // vertical span relative to the ground under each vertex
      let lo = Infinity, hi = -Infinity;
      const ga = ground(ax, az), gb = ground(bx, bz), gc = ground(cx, cz);
      if (ga === ga) { const d = ay - ga; if (d < lo) lo = d; if (d > hi) hi = d; }
      if (gb === gb) { const d = by - gb; if (d < lo) lo = d; if (d > hi) hi = d; }
      if (gc === gc) { const d = cy - gc; if (d < lo) lo = d; if (d > hi) hi = d; }
      if (lo <= hi && (lo > DECK_REACH || hi < -DECK_REACH)) continue;
    }
    stamped += stampTriangle(work, PW, nx, nz, (ax - ox) * inv, (az - oz) * inv, (bx - ox) * inv, (bz - oz) * inv, (cx - ox) * inv, (cz - oz) * inv);
  }
  return stamped;
}

export function buildGroundField(vis: ArrayBuffer): GroundField {
  const c = readContainer(vis, CVIS_MAGIC, CVIS_VERSION);
  const meta = c.meta as VisMeta;
  const terrainPos: Float32Array[] = [], terrainIdx: Uint32Array[] = [], terrainCol: Float32Array[] = [];
  const roadPos: Float32Array[] = [], roadIdx: Uint32Array[] = [];
  meta.slots.forEach((slot, j) => {
    const pos = c.arrays.get(`s${j}.pos`) as Float32Array | undefined, idx = c.arrays.get(`s${j}.idx`) as Uint32Array | undefined;
    if (!pos || !idx || !idx.length) return;
    if (slot.material === 'terrain') { terrainPos.push(pos); terrainIdx.push(idx); terrainCol.push((c.arrays.get(`s${j}.col`) as Float32Array | undefined) ?? new Float32Array(0)); }
    else if (ROAD_MATERIALS.has(slot.material)) { roadPos.push(pos); roadIdx.push(idx); }
  });

  // ---------------------------------------------------------------------------------------------- terrain lattice
  const lat = terrainPos.length ? inferLattice(terrainPos) : null;
  const ok = lat !== null;
  const cell = lat?.cell ?? 1, x0 = lat?.x0 ?? 0, z0 = lat?.z0 ?? 0, nx = lat?.nx ?? 0, nz = lat?.nz ?? 0;
  const W = nx + 1, inv = 1 / cell;
  const NV = ok ? W * (nz + 1) : 0, NC = ok ? nx * nz : 0;
  const height = new Float32Array(NV).fill(NaN), shade = new Float32Array(NV).fill(1);
  const present = new Uint8Array(NC);
  /** per cell: bit 1 = lower triangle (a,c,b) baked, bit 2 = upper triangle (b,c,d) baked */
  const halves = new Uint8Array(NC);
  // The stored float32 x of lattice column ix (and z of row iz): heightAt interpolates between the coordinates the
  // triangles really have, not x0 + cell·ix, which differs by float32 rounding (≈ 3e-5 m at 500 m; on a 10:1 cliff
  // face that alone is 3e-4 m of height). Every vertex of a column shares one x (trackc computes x0 + ix·cell).
  const colX = new Float64Array(ok ? W : 0).fill(NaN), rowZ = new Float64Array(ok ? nz + 1 : 0).fill(NaN);
  const colInv = new Float64Array(ok ? nx : 0), rowInv = new Float64Array(ok ? nz : 0);
  if (ok) {
    // 0 = no vertex, 1 = vertex with a non-finite height (repaired below), 2 = vertex with a height
    const L: LatticeBuild = { cell, x0, z0, nx, nz, height, shade, exists: new Uint8Array(NV), halves, colX, rowZ };
    for (let s = 0; s < terrainPos.length; s++) addTriangles(L, terrainIdx[s]!, addVertices(L, terrainPos[s]!, terrainCol[s]!));
    const exists = L.exists;
    repairLattice(height, exists, nx, nz);
    for (let i = 0; i < NC; i++) present[i] = halves[i] === 3 ? 1 : 0;
    for (let i = 0; i <= nx; i++) if (colX[i] !== colX[i]) colX[i] = x0 + i * cell;
    for (let i = 0; i <= nz; i++) if (rowZ[i] !== rowZ[i]) rowZ[i] = z0 + i * cell;
    for (let i = 0; i < nx; i++) colInv[i] = 1 / (colX[i + 1]! - colX[i]!);
    for (let i = 0; i < nz; i++) rowInv[i] = 1 / (rowZ[i + 1]! - rowZ[i]!);
  }
  const xLo = ok ? colX[0]! - EDGE * cell : 0, xHi = ok ? colX[nx]! + EDGE * cell : 0, zLo = ok ? rowZ[0]! - EDGE * cell : 0, zHi = ok ? rowZ[nz]! + EDGE * cell : 0;

  // Locates (x, z) on the lattice: writes the cell, the lattice index of its corner a and the local coords into
  // `loc` (no allocation per query). False outside the lattice (EDGE tolerance) or on a missing triangle, and for
  // NaN input (every comparison fails). Points on the diagonal belong to the lower triangle; both agree there.
  const loc = { ix: 0, iz: 0, a: 0, tx: 0, tz: 0, upper: false };
  const locate = (x: number, z: number): boolean => {
    if (!(x >= xLo && x <= xHi && z >= zLo && z <= zHi)) return false;
    let ix = Math.floor((x - x0) * inv), iz = Math.floor((z - z0) * inv);
    if (ix < 0) ix = 0; else if (ix >= nx) ix = nx - 1;
    if (iz < 0) iz = 0; else if (iz >= nz) iz = nz - 1;
    // the uniform guess can land one column off right at a column line (float32 vs uniform spacing)
    if (ix > 0 && x < colX[ix]!) ix--; else if (ix < nx - 1 && x > colX[ix + 1]!) ix++;
    if (iz > 0 && z < rowZ[iz]!) iz--; else if (iz < nz - 1 && z > rowZ[iz + 1]!) iz++;
    const tx = (x - colX[ix]!) * colInv[ix]!, tz = (z - rowZ[iz]!) * rowInv[iz]!;
    const upper = tx + tz > 1;
    if (!(halves[iz * nx + ix]! & (upper ? 2 : 1))) return false;
    loc.ix = ix; loc.iz = iz; loc.a = iz * W + ix; loc.tx = tx; loc.tz = tz; loc.upper = upper;
    return true;
  };
  const heightAt = (x: number, z: number): number => {
    if (!ok || !locate(x, z)) return NaN;
    const a = loc.a, hb = height[a + 1]!, hc = height[a + W]!;
    if (!loc.upper) { const ha = height[a]!; return ha + (hb - ha) * loc.tx + (hc - ha) * loc.tz; }
    const hd = height[a + W + 1]!;
    return hd + (hc - hd) * (1 - loc.tx) + (hb - hd) * (1 - loc.tz);
  };
  const normalAt = (x: number, z: number, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } => {
    if (!ok || !locate(x, z)) { out.x = 0; out.y = 1; out.z = 0; return out; }
    const a = loc.a, hb = height[a + 1]!, hc = height[a + W]!;
    // the plane's slopes: (a,c,b) from a's edges, (b,c,d) from d's; the normal is (−∂h/∂x, 1, −∂h/∂z) normalised,
    // which is the y-up orientation of the baked winding
    let sx: number, sz: number;
    if (!loc.upper) { const ha = height[a]!; sx = hb - ha; sz = hc - ha; } else { const hd = height[a + W + 1]!; sx = hd - hc; sz = hd - hb; }
    sx *= colInv[loc.ix]!; sz *= rowInv[loc.iz]!;
    const l = Math.sqrt(sx * sx + 1 + sz * sz);
    out.x = -sx / l; out.y = 1 / l; out.z = -sz / l;
    return out;
  };

  // ---------------------------------------------------------------------------------------------- road distance
  let rx0: number, rz0: number, spanW: number, spanH: number;
  if (ok) { rx0 = x0; rz0 = z0; spanW = nx * cell; spanH = nz * cell; }
  else {
    // no terrain rectangle to cover: the drivable footprint (∪ the track bounds) plus the texture's saturation range
    const b = meta.bounds;
    let lx = Infinity, lz = Infinity, hx = -Infinity, hz = -Infinity;
    if (b && b.length >= 6 && b.every(Number.isFinite)) { lx = b[0]!; lz = b[2]!; hx = b[3]!; hz = b[5]!; }
    for (const p of roadPos) for (let v = 0; v < p.length; v += 3) {
      const x = p[v]!, z = p[v + 2]!;
      if (x < lx) lx = x; if (x > hx) hx = x; if (z < lz) lz = z; if (z > hz) hz = z;
    }
    if (!(hx >= lx && hz >= lz)) { lx = hx = lz = hz = 0; }
    rx0 = lx - ROAD_PAD; rz0 = lz - ROAD_PAD; spanW = hx - lx + 2 * ROAD_PAD; spanH = hz - lz + 2 * ROAD_PAD;
  }
  let rc = 1;
  while (Math.ceil(spanW / rc - 1e-6) * Math.ceil(spanH / rc - 1e-6) > ROAD_MAX_CELLS) rc += 0.25;
  const rnx = Math.max(1, Math.ceil(spanW / rc - 1e-6)), rnz = Math.max(1, Math.ceil(spanH / rc - 1e-6));
  // working grid with a 2-cell border so the 5×5 chamfer mask needs no bounds checks
  const PW = rnx + 4, PH = rnz + 4;
  const work = new Float32Array(PW * PH).fill(BIG);
  const rinv = 1 / rc;
  let stamped = 0;
  for (let s = 0; s < roadPos.length; s++) stamped += stampSlot(work, PW, rnx, rnz, roadPos[s]!, roadIdx[s]!, rx0, rz0, rinv, ok ? heightAt : null);
  const dist = new Float32Array(rnx * rnz);
  if (stamped) chamfer(work, PW, rnx, rnz, dist, rc);
  else dist.fill(NO_ROAD);
  const road: RoadField = { cell: rc, x0: rx0, z0: rz0, nx: rnx, nz: rnz, dist };
  // same border tolerance as the lattice, so every baked terrain vertex reads a finite distance
  const rx1 = rx0 + rnx * rc + EDGE * cell, rz1 = rz0 + rnz * rc + EDGE * cell, rxa = rx0 - EDGE * cell, rza = rz0 - EDGE * cell;
  const roadDistAt = (x: number, z: number): number => {
    if (!(x >= rxa && x <= rx1 && z >= rza && z <= rz1)) return Infinity;
    let fx = (x - rx0) * rinv - 0.5, fz = (z - rz0) * rinv - 0.5;
    // clamp to the outer cell centres (what ClampToEdge sampling does on the GPU)
    if (fx < 0) fx = 0; else if (fx > rnx - 1) fx = rnx - 1;
    if (fz < 0) fz = 0; else if (fz > rnz - 1) fz = rnz - 1;
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const ix1 = ix + 1 < rnx ? ix + 1 : ix, iz1 = iz + 1 < rnz ? iz + 1 : iz;
    const r0 = iz * rnx, r1 = iz1 * rnx;
    const d0 = dist[r0 + ix]! + (dist[r0 + ix1]! - dist[r0 + ix]!) * tx, d1 = dist[r1 + ix]! + (dist[r1 + ix1]! - dist[r1 + ix]!) * tx;
    return d0 + (d1 - d0) * tz;
  };

  let tex: GroundTextures | null = null;
  const textures = (): GroundTextures => {
    if (tex) return tex;
    const lw = ok ? W : 1, lh = ok ? nz + 1 : 1;
    const hData = ok ? height : new Float32Array([NaN]);
    const sData = new Uint8Array(lw * lh).fill(255);
    if (ok) for (let i = 0; i < NV; i++) sData[i] = Math.round(shade[i]! * 255);
    const rData = new Uint8Array(rnx * rnz);
    for (let i = 0; i < rData.length; i++) { const d = dist[i]! / ROAD_TEX_RANGE; rData[i] = d >= 1 ? 255 : Math.round(d * 255); }
    const pw = ok ? nx : 1, ph = ok ? nz : 1;
    const pData = new Uint8Array(pw * ph);
    if (ok) for (let i = 0; i < NC; i++) pData[i] = present[i] ? 255 : 0;
    tex = {
      height: dataTexture(hData, lw, lh, THREE.FloatType, THREE.NearestFilter, 'ground.height'),
      shade: dataTexture(sData, lw, lh, THREE.UnsignedByteType, THREE.LinearFilter, 'ground.shade'),
      road: dataTexture(rData, rnx, rnz, THREE.UnsignedByteType, THREE.LinearFilter, 'ground.road'),
      present: dataTexture(pData, pw, ph, THREE.UnsignedByteType, THREE.NearestFilter, 'ground.present'),
    };
    return tex;
  };

  return { ok, cell, x0, z0, nx, nz, height, shade, present, road, heightAt, normalAt, roadDistAt, textures };
}

function dataTexture(data: Float32Array | Uint8Array, w: number, h: number, type: THREE.TextureDataType, filter: typeof THREE.NearestFilter | typeof THREE.LinearFilter, name: string): THREE.DataTexture {
  const t = new THREE.DataTexture(data, w, h, THREE.RedFormat, type, THREE.UVMapping, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping, filter, filter);
  t.name = name;
  t.flipY = false;
  t.generateMipmaps = false;
  t.unpackAlignment = 1; // R8 rows are not 4-byte multiples
  t.needsUpdate = true;
  return t;
}

/**
 * Conservative rasterisation of one triangle (grid units, already offset to the grid origin) into the padded work
 * grid: every cell its xz footprint touches is set to 0. Per row, the triangle's x-extent inside the row's slab is
 * the extent of its edges clipped to the slab (a convex polygon's extremes are clipped-edge endpoints), so slivers,
 * vertical wall faces (zero area) and diagonal strips all mark exactly the cells they cross. Returns cells marked.
 */
function stampTriangle(work: Float32Array, PW: number, nx: number, nz: number, ax: number, az: number, bx: number, bz: number, cx: number, cz: number): number {
  const zlo = Math.min(az, bz, cz), zhi = Math.max(az, bz, cz);
  if (zhi < 0 || zlo > nz || Math.max(ax, bx, cx) < 0 || Math.min(ax, bx, cx) > nx) return 0;
  const r0 = Math.max(0, Math.floor(zlo)), r1 = Math.min(nz - 1, Math.floor(zhi));
  let n = 0;
  for (let r = r0; r <= r1; r++) {
    span.lo = Infinity; span.hi = -Infinity;
    clipEdge(ax, az, bx, bz, r, r + 1);
    clipEdge(bx, bz, cx, cz, r, r + 1);
    clipEdge(cx, cz, ax, az, r, r + 1);
    if (!(span.lo <= span.hi)) continue;
    const c0 = Math.max(0, Math.floor(span.lo)), c1 = Math.min(nx - 1, Math.floor(span.hi));
    const o = (r + 2) * PW + 2;
    for (let k = c0; k <= c1; k++) { if (work[o + k] !== 0) { work[o + k] = 0; n++; } }
  }
  return n;
}

/** x-extent accumulator of stampTriangle's current row (module scratch: no allocation per triangle). */
const span = { lo: 0, hi: 0 };

/** Widens `span` by the x-range of segment p→q clipped to the slab lo ≤ z ≤ hi. */
function clipEdge(px: number, pz: number, qx: number, qz: number, lo: number, hi: number): void {
  let ta: number, tb: number;
  if (pz === qz) { if (pz < lo || pz > hi) return; ta = 0; tb = 1; }
  else {
    const k = 1 / (qz - pz), t0 = (lo - pz) * k, t1 = (hi - pz) * k;
    if (t0 < t1) { ta = t0 > 0 ? t0 : 0; tb = t1 < 1 ? t1 : 1; } else { ta = t1 > 0 ? t1 : 0; tb = t0 < 1 ? t0 : 1; }
    if (ta > tb) return;
  }
  const xa = px + (qx - px) * ta, xb = px + (qx - px) * tb;
  if (xa < span.lo) span.lo = xa; if (xa > span.hi) span.hi = xa;
  if (xb < span.lo) span.lo = xb; if (xb > span.hi) span.hi = xb;
}

/**
 * Two-pass 5×5 chamfer distance transform (steps 1, √2, √5) in cell units over the padded grid. The knight moves
 * cut the worst-case overestimate of the 3×3 (1, √2) mask from ~8 % to ~2.5 %, which keeps grass falloff bands
 * round instead of octagonal. The backward pass finalises each cell, so it also writes the unpadded output in metres
 * (no separate copy over the grid).
 */
function chamfer(d: Float32Array, PW: number, nx: number, nz: number, out: Float32Array, cell: number): void {
  for (let iz = 0; iz < nz; iz++) chamferRow(d, PW, (iz + 2) * PW + 2, nx, 1, null, 0, cell);
  for (let iz = nz - 1; iz >= 0; iz--) chamferRow(d, PW, (iz + 2) * PW + 2 + nx - 1, nx, -1, out, iz * nx + nx - 1, cell);
}

/**
 * One row of a chamfer pass, walking `s` = +1 (forward: rows above are final) or −1 (backward: rows below are
 * final). The mask's eight earlier neighbours are kept in a sliding window (left cell, five of the previous row,
 * two of the row before that), so each cell costs two loads instead of eight; a row is a small hot function the JIT
 * optimises within the first rows. Backward rows also emit the output (metres; NO_ROAD where nothing was stamped).
 */
function chamferRow(d: Float32Array, PW: number, i0: number, n: number, s: number, out: Float32Array | null, o0: number, cell: number): void {
  const u0 = i0 - s * PW, uu0 = i0 - 2 * s * PW;
  let left = d[i0 - s]!;
  let a0 = d[u0 - 2 * s]!, a1 = d[u0 - s]!, a2 = d[u0]!, a3 = d[u0 + s]!;
  let b0 = d[uu0 - s]!, b1 = d[uu0]!;
  for (let k = 0; k < n; k++) {
    const i = i0 + s * k;
    const a4 = d[u0 + s * (k + 2)]!, b2 = d[uu0 + s * (k + 1)]!;
    let v = d[i]!;
    if (v !== 0) {
      let w = left + 1; if (w < v) v = w;
      w = a2 + 1; if (w < v) v = w;
      w = a1 + SQRT2; if (w < v) v = w;
      w = a3 + SQRT2; if (w < v) v = w;
      w = a0 + SQRT5; if (w < v) v = w;
      w = a4 + SQRT5; if (w < v) v = w;
      w = b0 + SQRT5; if (w < v) v = w;
      w = b2 + SQRT5; if (w < v) v = w;
      d[i] = v;
    }
    if (out) out[o0 + s * k] = v >= BIG ? NO_ROAD : v * cell;
    left = v; a0 = a1; a1 = a2; a2 = a3; a3 = a4; b0 = b1; b1 = b2;
  }
}
