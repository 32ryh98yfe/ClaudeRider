// Baked per-vertex ambient occlusion for the .vis (multiplied into the vertex colour, so the renderer needs nothing
// new). Every static triangle of the render slots goes into one BVH (three-mesh-bvh); each lit vertex casts a fixed
// cosine-weighted hemisphere of short rays around its normal. What it buys: dark wall bases and kerb joints, shade
// under stacked decks and bridges, tunnel mouths and gully floors, with no runtime SSAO cost.
// Deterministic: fixed ray set, a per-vertex rotation from its index, no randomness; the BVH build is deterministic.
import { BufferAttribute, BufferGeometry, DoubleSide, Ray, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import type { RenderSlot } from './render.ts';

export interface AoOptions {
  rays: number;        // rays per vertex
  far: number;         // occlusion radius, m (long enough to see a stacked deck ≥ 8 m overhead)
  strength: number;    // darkening at full occlusion (0..1)
  /** slots whose vertices receive AO (all slots occlude) */
  receive: (slot: RenderSlot) => boolean;
}

export const DEFAULT_AO: AoOptions = {
  rays: 12, far: 16, strength: 0.55,
  receive: (s) => !['underside', 'startline', 'boostpad', 'portal'].includes(s.material),
};

/** Golden-spiral cosine-weighted hemisphere around +Z: [x, y, z] per ray. */
function hemisphere(n: number): Float64Array {
  const out = new Float64Array(n * 3), ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt((i + 0.5) / n), th = i * ga;
    out[i * 3] = r * Math.cos(th); out[i * 3 + 1] = r * Math.sin(th); out[i * 3 + 2] = Math.sqrt(Math.max(0, 1 - r * r));
  }
  return out;
}

export interface AoReport { vertices: number; triangles: number; rays: number; ms: number; buildMs: number; mean: number }

/** Darkens each receiving slot's vertex colours in place by its occlusion. */
export function bakeAo(slots: RenderSlot[], o: AoOptions = DEFAULT_AO): AoReport {
  const t0 = Date.now();
  let nv = 0, nt = 0;
  for (const s of slots) { nv += s.pos.length / 3; nt += s.idx.length / 3; }
  const pos = new Float32Array(nv * 3), idx = new Uint32Array(nt * 3);
  let vo = 0, io = 0;
  for (const s of slots) {
    const base = vo / 3;
    for (let i = 0; i < s.pos.length; i++) pos[vo++] = s.pos[i]!;
    for (let i = 0; i < s.idx.length; i++) idx[io++] = s.idx[i]! + base;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setIndex(new BufferAttribute(idx, 1));
  const bvh = new MeshBVH(geo);
  const buildMs = Date.now() - t0;

  const H = hemisphere(o.rays);
  // evaluation order: stride through the spiral so any prefix covers the whole hemisphere
  const probe = Math.max(1, Math.round(o.rays / 3)), stride = Math.max(1, Math.floor(o.rays / probe));
  const order: number[] = [];
  for (let r0 = 0; r0 < stride; r0++) for (let k = r0; k < o.rays; k += stride) order.push(k);
  for (let k = 0; k < o.rays; k++) if (!order.includes(k)) order.push(k);
  const ray = new Ray(new Vector3(), new Vector3());
  let cast = 0, sum = 0, lit = 0;
  for (const s of slots) {
    if (!o.receive(s)) continue;
    const n = s.pos.length / 3;
    for (let v = 0; v < n; v++) {
      const nx = s.nrm[v * 3]!, ny = s.nrm[v * 3 + 1]!, nz = s.nrm[v * 3 + 2]!;
      // tangent frame around the normal, spun per vertex (golden angle × index) to break up banding
      const ax = Math.abs(nx) < 0.9 ? 1 : 0, ay = ax ? 0 : 1;
      let tx = ay * nz - 0 * ny, ty = 0 * nx - ax * nz, tz = ax * ny - ay * nx;
      const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
      const spin = v * 2.399963229728653, cs = Math.cos(spin), sn = Math.sin(spin);
      const ox = s.pos[v * 3]! + nx * 0.05, oy = s.pos[v * 3 + 1]! + ny * 0.05, oz = s.pos[v * 3 + 2]! + nz * 0.05;
      let occ = 0;
      let hits = 0;
      for (let kk = 0; kk < o.rays; kk++) {
        // a spread-out first quarter of the set; a vertex none of them can see occluded is open sky (most of the
        // terrain and open road), so the rest are skipped
        if (kk === probe && hits === 0) break;
        const k = order[kk]!;
        const hx = H[k * 3]! * cs - H[k * 3 + 1]! * sn, hy = H[k * 3]! * sn + H[k * 3 + 1]! * cs, hz = H[k * 3 + 2]!;
        ray.origin.set(ox, oy, oz);
        ray.direction.set(tx * hx + bx * hy + nx * hz, ty * hx + by * hy + ny * hz, tz * hx + bz * hy + nz * hz);
        const hit = bvh.raycastFirst(ray, DoubleSide, 0, o.far);
        cast++;
        // near hits (wall bases, kerbs) count fully; a deck 10 m overhead still counts ~60%
        if (hit) { occ += 1 - 0.6 * (hit.distance / o.far); hits++; }
      }
      const a = 1 - o.strength * (occ / o.rays);
      // quantise so the f32 colours (and the bake hash) do not depend on the last ulp of a ray distance
      const aq = Math.round(a * 1024) / 1024;
      s.col[v * 3] = s.col[v * 3]! * aq; s.col[v * 3 + 1] = s.col[v * 3 + 1]! * aq; s.col[v * 3 + 2] = s.col[v * 3 + 2]! * aq;
      sum += aq; lit++;
    }
  }
  return { vertices: lit, triangles: nt, rays: cast, ms: Date.now() - t0, buildMs, mean: lit ? sum / lit : 1 };
}
