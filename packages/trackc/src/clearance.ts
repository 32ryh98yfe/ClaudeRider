// Exact convex clipping of decorative geometry against the volume above the actual drivable triangles.
// Uses triangle interiors and complete polygons, not samples/vertices of the obstacle. All work is bake-time.
import { sampleAt, type TrackModel } from './paths.ts';
import type { Content } from './content.ts';
import { ROLE } from './mesh.ts';
import { TriSoup } from './soup.ts';
import type { RenderBuilder, RenderSlot } from './render.ts';
import type { TerrainField } from './terrain.ts';

interface Plane { x: number; y: number; z: number; d: number }
interface Volume { planes: Plane[]; bounds: number[]; path: number; station: number }
export interface ClearanceConflict { path: number; s: number; lowerY: number }
const CELL = 16, EPS = 1e-8;
const key = (x: number, z: number): string => `${x}:${z}`;
const dot = (p: Plane, v: readonly number[]): number => p.x * v[0]! + p.y * v[1]! + p.z * v[2]! - p.d;

function split(poly: number[][], plane: Plane): { inside: number[][]; outside: number[][] } {
  const inside: number[][] = [], outside: number[][] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!, da = dot(plane, a), db = dot(plane, b);
    (da <= EPS ? inside : outside).push(a);
    if ((da < -EPS && db > EPS) || (da > EPS && db < -EPS)) {
      const t = da / (da - db), v = a.map((n, k) => n + (b[k]! - n) * t);
      inside.push(v); outside.push(v);
    }
  }
  return { inside, outside };
}
function bounds(poly: readonly (readonly number[])[]): number[] {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const v of poly) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k]!, v[k]!); b[k + 3] = Math.max(b[k + 3]!, v[k]!); }
  return b;
}
const overlaps = (a: number[], b: number[]): boolean => a[0]! <= b[3]! && a[3]! >= b[0]! && a[1]! <= b[4]! && a[4]! >= b[1]! && a[2]! <= b[5]! && a[5]! >= b[2]!;
function remaining(poly: number[][], v: Volume, requireArea = true): number[][] {
  let p = poly;
  for (const plane of v.planes) { p = split(p, plane).inside; if (p.length < 3) return []; }
  if (!requireArea) return p;
  for (let i = 1; i + 1 < p.length; i++) {
    const a = p[0]!, b = p[i]!, c = p[i + 1]!;
    const ax = b[0]! - a[0]!, ay = b[1]! - a[1]!, az = b[2]! - a[2]!, bx = c[0]! - a[0]!, by = c[1]! - a[1]!, bz = c[2]! - a[2]!;
    const x = ay * bz - az * by, y = az * bx - ax * bz, z = ax * by - ay * bx;
    if (x * x + y * y + z * z > 1e-14) return p;
  }
  return [];
}

export class DrivingClearance {
  private cells = new Map<string, Volume[]>();
  readonly count: number;
  private bottom: number;
  private radius: number;
  constructor(ground: TriSoup, height = 3.1, bottom = -0.3, radius = 0) {
    this.bottom = bottom; this.radius = radius;
    let count = 0;
    for (let t = 0; t < ground.count; t++) {
      if (ground.role[t] === ROLE.KILL) continue;
      const vertices = [ground.vert(t, 0), ground.vert(t, 1), ground.vert(t, 2)];
      if (this.add(vertices, ground.path[t]!, vertices.reduce((s, v) => s + v[6]!, 0) / 3, height)) count++;
    }
    this.count = count;
  }

  /** Also accepts virtual swept route cells (jumps, rails and portal approaches) from the compiler. */
  add(vertices: number[][], path: number, station: number, height = 3.1, extrusion?: readonly [number, number, number]): boolean {
    const [a, b, c] = vertices as [number[], number[], number[]];
    const ex = b[0]! - a[0]!, ey = b[1]! - a[1]!, ez = b[2]! - a[2]!;
    const fx = c[0]! - a[0]!, fy = c[1]! - a[1]!, fz = c[2]! - a[2]!;
    let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
    const length = Math.hypot(nx, ny, nz); if (length < 1e-8) return false;
    nx /= length; ny /= length; nz /= length;
    // Adjacent ground faces share their vertex normals. Extruding each face along its own normal opens thin
    // wedge-shaped gaps at bends/profile seams; a kart sphere can hit the leftover decorative slivers. Build the
    // convex hull of matching bottom/top vertices instead, so neighboring volumes overlap along their shared face.
    const points: number[][] = [], directions: number[][] = [];
    for (const v of vertices) {
      let vx = extrusion?.[0] ?? v[3] ?? nx, vy = extrusion?.[1] ?? v[4] ?? ny, vz = extrusion?.[2] ?? v[5] ?? nz;
      let l = Math.hypot(vx, vy, vz);
      if (l < 0.1) { vx = nx; vy = ny; vz = nz; l = 1; }
      vx /= l; vy /= l; vz /= l; directions.push([vx, vy, vz]);
      points.push([v[0]! + vx * this.bottom, v[1]! + vy * this.bottom, v[2]! + vz * this.bottom], [v[0]! + vx * height, v[1]! + vy * height, v[2]! + vz * height]);
    }
    // Minkowski expansion covers the real wall sphere, including overhanging road edges. Interpolated ground
    // normals are renormalized by the runtime; account for that centre offset rather than leaving corner seams.
    let minDot = 1;
    for (let i = 0; i < directions.length; i++) for (let j = i + 1; j < directions.length; j++) minDot = Math.min(minDot, directions[i]![0]! * directions[j]![0]! + directions[i]![1]! * directions[j]![1]! + directions[i]![2]! * directions[j]![2]!);
    const expansion = this.radius > 0 ? this.radius + 0.005 + 0.6 * (1 - Math.sqrt(Math.max(0, (1 + 2 * minDot) / 3))) : 0.0005;
    const planes: Plane[] = [], seen = new Set<string>();
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) for (let k = j + 1; k < points.length; k++) {
      const a = points[i]!, b = points[j]!, c = points[k]!;
      const ax = b[0]! - a[0]!, ay = b[1]! - a[1]!, az = b[2]! - a[2]!, bx = c[0]! - a[0]!, by = c[1]! - a[1]!, bz = c[2]! - a[2]!;
      let x = ay * bz - az * by, y = az * bx - ax * bz, z = ax * by - ay * bx;
      const length = Math.hypot(x, y, z); if (length < 1e-9) continue;
      x /= length; y /= length; z /= length;
      let d = x * a[0]! + y * a[1]! + z * a[2]!, lo = 0, hi = 0;
      for (const p of points) { const v = x * p[0]! + y * p[1]! + z * p[2]! - d; lo = Math.min(lo, v); hi = Math.max(hi, v); }
      if (lo < -1e-7 && hi > 1e-7) continue;
      if (hi > 1e-7) { x = -x; y = -y; z = -z; d = -d; }
      const key = `${Math.round(x * 1e8)},${Math.round(y * 1e8)},${Math.round(z * 1e8)},${Math.round(d * 1e7)}`;
      if (seen.has(key)) continue; seen.add(key);
      planes.push({ x, y, z, d: d + expansion });
    }
    if (planes.length < 4) return false;
    const bb = bounds(points); for (let k = 0; k < 3; k++) { bb[k]! -= expansion; bb[k + 3]! += expansion; }
    // Offset planes of an acute triangular corner can meet arbitrarily far away. Axis bounds cap this safe
    // over-approximation at the sphere's true reach while retaining the entire swept body volume.
    planes.push({ x: -1, y: 0, z: 0, d: -bb[0]! }, { x: 1, y: 0, z: 0, d: bb[3]! }, { x: 0, y: -1, z: 0, d: -bb[1]! }, { x: 0, y: 1, z: 0, d: bb[4]! }, { x: 0, y: 0, z: -1, d: -bb[2]! }, { x: 0, y: 0, z: 1, d: bb[5]! });
    const volume: Volume = { planes, bounds: bb, path, station };
    for (let x = Math.floor(bb[0]! / CELL); x <= Math.floor(bb[3]! / CELL); x++) for (let z = Math.floor(bb[2]! / CELL); z <= Math.floor(bb[5]! / CELL); z++) {
      const k = key(x, z); let list = this.cells.get(k); if (!list) { list = []; this.cells.set(k, list); } list.push(volume);
    }
    return true;
  }

  private candidates(bb: number[]): Volume[] {
    const seen = new Set<Volume>(), out: Volume[] = [];
    for (let x = Math.floor(bb[0]! / CELL); x <= Math.floor(bb[3]! / CELL); x++) for (let z = Math.floor(bb[2]! / CELL); z <= Math.floor(bb[5]! / CELL); z++) {
      for (const v of this.cells.get(key(x, z)) ?? []) if (!seen.has(v)) { seen.add(v); if (overlaps(bb, v.bounds)) out.push(v); }
    }
    return out;
  }

  nearBounds(bb: number[], horizontal = 2, vertical = 2): boolean {
    const expanded = [bb[0]! - horizontal, bb[1]! - vertical, bb[2]! - horizontal, bb[3]! + horizontal, bb[4]! + vertical, bb[5]! + horizontal];
    return this.candidates(expanded).length > 0;
  }

  conflict(poly: number[][]): ClearanceConflict | null {
    for (const v of this.candidates(bounds(poly))) if (remaining(poly, v).length >= 3) return { path: v.path, s: v.station, lowerY: v.bounds[1]! };
    return null;
  }

  /** Subtracts the union of road volumes. Attributes are interpolated, preserving UVs, colour and normals. */
  clip(poly: number[][]): number[][][] {
    let pieces = [poly];
    for (const v of this.candidates(bounds(poly))) {
      const next: number[][][] = [];
      for (const original of pieces) {
        // Do not preserve microscopic clipping slivers inside the volume. Their double-precision area may be
        // tiny, but f32 storage can turn them into a visible/contacting triangle several centimetres long.
        if (!overlaps(bounds(original), v.bounds) || remaining(original, v, false).length < 3) { next.push(original); continue; }
        let inside = original;
        for (const plane of v.planes) {
          const cut = split(inside, plane);
          if (cut.outside.length >= 3) next.push(cut.outside);
          inside = cut.inside;
          if (inside.length < 3) break;
        }
      }
      pieces = next;
      if (!pieces.length) break;
    }
    return pieces;
  }

  clipSlot(rb: RenderBuilder, slot: RenderSlot): number {
    const { pos, nrm, uv, col, idx, triChunk } = slot;
    slot.pos = []; slot.nrm = []; slot.uv = []; slot.col = []; slot.idx = []; slot.triChunk = [];
    let modified = 0;
    for (let t = 0; t < idx.length; t += 3) {
      const triangle = [0, 1, 2].map(k => { const i = idx[t + k]!; return [pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!, nrm[i * 3]!, nrm[i * 3 + 1]!, nrm[i * 3 + 2]!, uv[i * 2]!, uv[i * 2 + 1]!, col[i * 3]!, col[i * 3 + 1]!, col[i * 3 + 2]!]; });
      const pieces = this.clip(triangle);
      if (pieces.length !== 1 || pieces[0] !== triangle) modified++;
      for (const polygon of pieces) for (let k = 1; k + 1 < polygon.length; k++) rb.tri(slot, triChunk[t / 3]!, polygon[0]!, polygon[k]!, polygon[k + 1]!);
    }
    return modified;
  }

  /** Keep the terrain lattice (also used by GPU terrain) intact; lower entire intersecting cells below all roads. */
  lowerTerrain(tf: TerrainField): number {
    const { nx, nz, cell, x0, z0, H } = tf, width = nx + 1;
    let adjusted = 0;
    for (let pass = 0; pass < 12; pass++) {
      let changed = 0;
      for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
        const ids = [z * width + x, z * width + x + 1, (z + 1) * width + x, (z + 1) * width + x + 1];
        const p = ids.map((i, k) => [x0 + (x + (k & 1)) * cell, H[i]!, z0 + (z + (k >> 1)) * cell]);
        const a = this.conflict([p[0]!, p[2]!, p[1]!]), b = this.conflict([p[1]!, p[2]!, p[3]!]);
        if (!a && !b) continue;
        const y = Math.min(a?.lowerY ?? Infinity, b?.lowerY ?? Infinity) - 0.4;
        for (const i of ids) if (H[i]! > y) { H[i] = y; changed++; }
      }
      adjusted += changed;
      if (!changed) return adjusted;
    }
    throw new Error('Terrain clearance did not converge; inspect stacked road volumes');
  }
}

/** Flight corridor uses both declared launch-speed endpoints and the real ballistic launch tangent. Rail paths
 * carry their own body corridor even though they do not contribute ordinary ground triangles. Warp exits already
 * belong to ground volumes; invisible transit spans deliberately add no physical road. */
export function addRouteClearance(clearance: DrivingClearance, model: TrackModel, content: Content): void {
  for (const jump of content.jumps) {
    const path = model.paths[jump.path]!, lip = sampleAt(path, jump.lipS);
    const width = lip.w / 2 + Math.max(lip.shL, lip.shR) + 0.05;
    const sample = (distance: number): { left: number[]; right: number[]; high: number } => {
      const ground = sampleAt(path, jump.lipS + distance);
      const t0 = distance / Math.max(1, jump.vMin), t1 = distance / Math.max(1, jump.vMax);
      const y0 = lip.y + lip.ty * distance - 14 * t0 * t0, y1 = lip.y + lip.ty * distance - 14 * t1 * t1;
      const low = Math.max(ground.y, Math.min(y0, y1)), high = Math.max(low, y0, y1);
      const x = lip.x + lip.tx * distance, z = lip.z + lip.tz * distance;
      return { left: [x - lip.rx * width, low, z - lip.rz * width], right: [x + lip.rx * width, low, z + lip.rz * width], high: high - low };
    };
    const end = jump.landS1 - jump.lipS;
    for (let s = 0; s < end; s += 1) {
      const a = sample(s), b = sample(Math.min(end, s + 1)), height = Math.max(a.high, b.high) + 2.3;
      clearance.add([a.left, b.left, a.right], jump.path, jump.lipS + s, height, [0, 1, 0]);
      clearance.add([a.right, b.left, b.right], jump.path, jump.lipS + s, height, [0, 1, 0]);
    }
  }
  for (const path of model.paths) if (path.kind === 'rail') for (let s = 0; s < path.length; s += 1) {
    const a = sampleAt(path, s), b = sampleAt(path, Math.min(path.length, s + 1));
    const point = (p: typeof a, side: number): number[] => [p.x + p.rx * side * (p.w / 2 + 0.9), p.y + p.ry * side * (p.w / 2 + 0.9), p.z + p.rz * side * (p.w / 2 + 0.9), p.ux, p.uy, p.uz, p.s, side];
    clearance.add([point(a, -1), point(b, -1), point(a, 1)], path.index, s, 2.3);
    clearance.add([point(a, 1), point(b, -1), point(b, 1)], path.index, s, 2.3);
  }
}
