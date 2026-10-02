// Terrain heightfield around the track (render only). Near roads the terrain tucks under the LOWEST deck that covers
// a point (stacked decks never get terrain poking through the lower one), falls away under jump gaps, open ledges
// with kill planes and rails, and blends into noise hills farther out.
import type { PathModel, TrackModel } from './paths.ts';
import type { Content } from './content.ts';
import type { RenderBuilder } from './render.ts';

export interface TerrainField { height(x: number, z: number): number; cell: number; x0: number; z0: number; nx: number; nz: number; H: Float64Array }

interface Pt { x: number; z: number; y: number; half: number; drop: boolean }

export function buildTerrainField(m: TrackModel, c: Content, bounds: number[], noise: (x: number, z: number) => number, amp: number, extra: { x: number; z: number; y: number }[] = [], cell = 8, margin = 180): TerrainField {
  const pts: Pt[] = extra.map((e) => ({ x: e.x, z: e.z, y: e.y, half: 3, drop: false }));
  const addPath = (p: PathModel): void => {
    for (let i = 0; i < p.samples.length; i += 1) {
      const s = p.samples[i]!;
      const open = s.wallL.type === 'none' || s.wallR.type === 'none';
      const drop = s.jumpPart === 2 || p.kind === 'rail' || !!s.warp || (!!s.kill && open);
      pts.push({ x: s.x, z: s.z, y: s.y, half: s.w / 2 + Math.max(s.shL, s.shR), drop });
      // banked roads: the edges sit above / below the centreline, so the terrain also tracks the real edge heights.
      // Following the centreline alone left the terrain up to 1.5 m above the low (inside) edge of banked corners,
      // where it covered the shoulder and half-buried karts and roadside props
      if (Math.abs(s.ry) > 0.02) for (const side of [-1, 1]) {
        const u = side * (s.w / 2 + (side < 0 ? s.shL : s.shR));
        pts.push({ x: s.x + s.rx * u, z: s.z + s.rz * u, y: s.y + s.ry * u, half: 0.5, drop });
      }
    }
  };
  for (const p of m.paths) addPath(p);
  const GC = 24;
  const grid = new Map<number, number[]>();
  const key = (ix: number, iz: number): number => (ix + 5000) * 10000 + (iz + 5000);
  pts.forEach((q, i) => { const k = key(Math.floor(q.x / GC), Math.floor(q.z / GC)); let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(i); });
  let baseY = Infinity;
  for (const q of pts) baseY = Math.min(baseY, q.y);
  for (const kp of c.killPlanes) baseY = Math.min(baseY, kp.y + 0.5);
  const x0 = bounds[0]! - margin, z0 = bounds[2]! - margin, x1 = bounds[3]! + margin, z1 = bounds[5]! + margin;
  const nx = Math.ceil((x1 - x0) / cell), nz = Math.ceil((z1 - z0) / cell);
  const H = new Float64Array((nx + 1) * (nz + 1));
  for (let iz = 0; iz <= nz; iz++) for (let ix = 0; ix <= nx; ix++) {
    const x = x0 + ix * cell, z = z0 + iz * cell;
    let best = Infinity, bestHalf = 8;
    const gx = Math.floor(x / GC), gz = Math.floor(z / GC);
    const near: number[] = [];
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const l = grid.get(key(gx + dx, gz + dz));
      if (!l) continue;
      for (const i of l) {
        const q = pts[i]!;
        const d = Math.hypot(q.x - x, q.z - z);
        if (d < best) { best = d; bestHalf = q.half; }
        if (d < 60) near.push(i, d);
      }
    }
    const natural = baseY - 1.5 + noise(x, z) * amp * Math.min(1, Math.max(0, (best - bestHalf - 10) / 60));
    let y = natural;
    // only near-track points blend towards the decks: beyond 60 m `near` is empty, yRef would stay Infinity and
    // Infinity·0 made the vertex NaN
    if (Number.isFinite(best) && best < 60) {
      // reference height: the lowest deck about as near as the nearest one (stacked decks → the lower one)
      let yRef = Infinity, drop = false;
      for (let k = 0; k < near.length; k += 2) {
        const q = pts[near[k]!]!, d = near[k + 1]!;
        if (d < best + 6) { if (q.y < yRef) yRef = q.y; if (q.drop && d < q.half + 6) drop = true; }
      }
      const target = drop ? Math.min(yRef - 7, natural) : yRef - 0.35;
      const edge = bestHalf + 3;
      // follow the local (lowest nearby) deck; fall away only where the road is meant to drop (jump gaps, open ledges
      // over kill planes, rails, warps). `natural` is relative to the track's lowest point, so min(target, natural)
      // dug a trench as deep as the road's height above it (L5: 12–14 m on a canyon rim, 115 support pillars)
      if (best < edge) y = drop ? Math.min(target, natural) : target;
      else { const tt = Math.min(1, (best - edge) / 30), sm = tt * tt * (3 - 2 * tt); y = target * (1 - sm) + natural * sm; if (best < edge + 6) y = Math.min(y, target + 0.05); }
    }
    H[iz * (nx + 1) + ix] = y;
  }
  const height = (x: number, z: number): number => {
    const fx = (x - x0) / cell, fz = (z - z0) / cell;
    const ix = Math.max(0, Math.min(nx - 1, Math.floor(fx))), iz = Math.max(0, Math.min(nz - 1, Math.floor(fz)));
    const tx = Math.max(0, Math.min(1, fx - ix)), tz = Math.max(0, Math.min(1, fz - iz));
    const h00 = H[iz * (nx + 1) + ix]!, h10 = H[iz * (nx + 1) + ix + 1]!, h01 = H[(iz + 1) * (nx + 1) + ix]!, h11 = H[(iz + 1) * (nx + 1) + ix + 1]!;
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  };
  return { height, cell, x0, z0, nx, nz, H };
}

/** Emits terrain triangles into 24×24-cell tiles (≈ 190 m, one chunk and one draw each; smaller tiles blew the Low
 *  tier draw budget on open vistas, V20). */
export function terrainToRender(rb: RenderBuilder, tf: TerrainField, noise: (x: number, z: number) => number, ao: (x: number, y: number, z: number) => number): void {
  const { nx, nz, cell, x0, z0, H } = tf;
  const sl = rb.slot('terrain', 'terrain');
  const h = (ix: number, iz: number): number => H[Math.min(nz, Math.max(0, iz)) * (nx + 1) + Math.min(nx, Math.max(0, ix))]!;
  const V = (ix: number, iz: number): number[] => {
    const x = x0 + ix * cell, z = z0 + iz * cell, y = h(ix, iz);
    const dx = h(ix + 1, iz) - h(ix - 1, iz), dz = h(ix, iz + 1) - h(ix, iz - 1);
    const n = [-dx, 2 * cell, -dz], l = Math.hypot(n[0]!, n[1]!, n[2]!);
    const shade = (0.85 + 0.15 * noise(x * 3.1, z * 3.1)) * ao(x, y, z);
    return [x, y, z, n[0]! / l, n[1]! / l, n[2]! / l, x / 16, z / 16, shade, shade, shade];
  };
  const T = 24;
  for (let cz = 0; cz < nz; cz += T) for (let cx = 0; cx < nx; cx += T) {
    const chunk = rb.tileChunk(cx / T, cz / T);
    for (let iz = cz; iz < Math.min(nz, cz + T); iz++) for (let ix = cx; ix < Math.min(nx, cx + T); ix++) {
      const a = V(ix, iz), b = V(ix + 1, iz), c = V(ix, iz + 1), d = V(ix + 1, iz + 1);
      rb.tri(sl, chunk, a, c, b); rb.tri(sl, chunk, b, c, d);
    }
  }
}
