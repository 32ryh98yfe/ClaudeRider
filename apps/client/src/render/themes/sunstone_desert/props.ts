// Sunstone Desert props: a caravan-town bazaar and a sandstone canyon. Chunky vinyl-toy shapes, warm sand and
// sandstone with teal/terracotta accents. Local frame: +X faces the road, +Y up, +Z along the track.
import * as THREE from 'three/webgpu';
import { MaterialLibrary } from '../../materials/library.ts';
import type { PropFactory } from '../../props/defaults.ts';
import { merge, paint, place, rbox, box, cyl, cone, ico, sph, sparkleGeometry } from '../../util/geo.ts';
import { arcTube, buntingLine, dome, lathe, part, prism, seeded, tubeThrough } from '../clayhill_village/toyshapes.ts';

const SAND = '#e8c27a', SANDSTONE = '#c98b4e', SANDSTONE_DK = '#a86f3c', OASIS = '#3fb8af', TERRA = '#c96442', CREAM = '#f4e3c3';
const GOLD = '#e0b04b', PALM = '#4e9f3d', PALM_DK = '#3c7f2f', TRUNK = '#8a6340', INK = '#2a2622';
const RUGS = ['#b53333', '#3fb8af', '#e0b04b', '#6a4c93', '#c96442'];

const lit = (): THREE.Material => MaterialLibrary.vertexLit(0.85, 0);
const toy = (): THREE.Material => MaterialLibrary.vinyl({ rim: '#ffe2b8', clearcoat: 0.6, roughness: 0.42 });
const glow = (): THREE.Material => MaterialLibrary.emissiveVertex(3);

/** Layered sandstone strata: stacked slightly offset slabs. */
function strata(w: number, h: number, d: number, layers: number, seed: number): THREE.BufferGeometry[] {
  const r = seeded(seed), out: THREE.BufferGeometry[] = [];
  const cols = [SANDSTONE, '#d49a5c', SANDSTONE_DK, '#dba76a', '#b97a45'];
  for (let i = 0; i < layers; i++) {
    const lh = h / layers, sx = 1 - r() * 0.12, sz = 1 - r() * 0.12;
    out.push(part(rbox(w * sx, lh * 1.02, d * sz, Math.min(0.6, lh * 0.3), 2), cols[i % cols.length]!, (r() - 0.5) * 0.8, lh * (i + 0.5), (r() - 0.5) * 0.8));
  }
  return out;
}

export const SUNSTONE_PROPS: Record<string, PropFactory> = {
  palm: {
    maxInstances: 300,
    build: () => {
      const p: THREE.BufferGeometry[] = [part(tubeThrough([[0, -1.5, 0], [0.3, 2, 0], [0.9, 4.5, 0], [1.6, 6.6, 0]], 0.26, 10, 6), TRUNK)];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        p.push(part(cone(0.55, 3.6, 4), i % 2 ? PALM : PALM_DK, 1.6 + Math.cos(a) * 1.6, 6.3, Math.sin(a) * 1.6, 0, -a, Math.PI / 2 + 0.35, 1, 1, 0.25));
      }
      for (let i = 0; i < 3; i++) p.push(part(sph(0.22, 6, 5), '#7a5a2e', 1.6 + Math.cos(i * 2.1) * 0.35, 6.2, Math.sin(i * 2.1) * 0.35));
      return { geometry: merge(p), material: MaterialLibrary.foliageLit(), castShadow: true };
    },
  },
  awning_stall: {
    maxInstances: 60,
    build: () => {
      const p: THREE.BufferGeometry[] = [part(box(2.4, 1.0, 4), '#9c6b40', 0, 0.5, 0), part(box(2.5, 0.1, 4.1), '#7a522e', 0, 1.02, 0)];
      for (const [x, z] of [[-1.15, -1.95], [-1.15, 1.95], [1.2, -1.95], [1.2, 1.95]] as const) p.push(part(cyl(0.07, 0.07, 3, 6), '#6b4a33', x, 1.5, z));
      for (let i = 0; i < 7; i++) p.push(part(box(3.0, 0.08, 0.62), i % 2 ? CREAM : (i % 4 === 0 ? OASIS : TERRA), 0.45, 2.95, -1.86 + i * 0.62, 0, 0, -0.28));
      const r = seeded(13);
      for (let i = 0; i < 10; i++) p.push(part(sph(0.2, 6, 4), ['#e0b04b', '#c96442', '#8fb573', '#f28b3c'][i % 4]!, -0.6 + r() * 1.3, 1.25, -1.6 + r() * 3.2));
      p.push(part(lathe([[0, 0], [0.35, 0.1], [0.42, 0.5], [0.2, 0.9], [0.22, 1.0]], 8), TERRA, 1.7, 0, -1.2), part(lathe([[0, 0], [0.3, 0.1], [0.36, 0.4], [0.18, 0.75]], 8), SANDSTONE, 1.8, 0, 0.9));
      return { geometry: merge(p), material: lit(), castShadow: true };
    },
  },
  rug_rack: {
    maxInstances: 60,
    build: () => {
      const p: THREE.BufferGeometry[] = [part(cyl(0.08, 0.08, 3, 6), '#6b4a33', 0, 1.5, -2.2), part(cyl(0.08, 0.08, 3, 6), '#6b4a33', 0, 1.5, 2.2), part(cyl(0.06, 0.06, 4.6, 6), '#6b4a33', 0, 2.9, 0, Math.PI / 2, 0, 0)];
      for (let i = 0; i < 3; i++) {
        const z = -1.45 + i * 1.45;
        p.push(part(box(0.06, 2.4, 1.3), RUGS[i]!, 0, 1.65, z), part(box(0.07, 1.4, 0.9), RUGS[(i + 2) % 5]!, 0.01, 1.7, z), part(box(0.08, 0.5, 0.4), GOLD, 0.02, 1.7, z));
      }
      return { geometry: merge(p), material: lit() };
    },
  },
  lantern_string: {
    // glowing brass lanterns strung between two posts across the road (landmark, local X crosses the road)
    maxInstances: 20,
    build: () => {
      const p: THREE.BufferGeometry[] = [part(cyl(0.12, 0.15, 7.5, 6), '#7a522e', -13, 3.5, 0), part(cyl(0.12, 0.15, 7.5, 6), '#7a522e', 13, 3.5, 0)];
      const pts: [number, number, number][] = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([-13 + 26 * t, 7 - 1.4 * 4 * t * (1 - t), 0]); }
      p.push(paint(tubeThrough(pts, 0.035, 24, 4), '#4a3a2a'));
      for (let i = 0; i < 9; i++) {
        const t = (i + 0.5) / 9, x = -13 + 26 * t, y = 7 - 1.4 * 4 * t * (1 - t) - 0.55;
        p.push(part(lathe([[0, -0.3], [0.26, -0.15], [0.3, 0.1], [0.16, 0.3], [0, 0.34]], 8), i % 3 === 1 ? '#ff9a52' : '#ffc46b', x, y, 0));
      }
      return { geometry: merge(p), material: glow() };
    },
  },
  camel_statue: {
    maxInstances: 12,
    build: () => {
      const p: THREE.BufferGeometry[] = [
        part(rbox(3, 1.2, 1.8, 0.2, 2), SANDSTONE_DK, 0, 0.6, 0),                              // plinth
        part(rbox(1.0, 1.0, 2.2, 0.35, 3), SAND, 0, 2.6, 0), part(ico(0.55, 1), SAND, 0, 3.25, 0.1),   // body + hump
        part(rbox(0.4, 1.3, 0.45, 0.15, 2), SAND, 0, 3.1, 1.25, -0.45, 0, 0), part(rbox(0.45, 0.4, 0.8, 0.15, 2), SAND, 0, 3.75, 1.75),
        part(box(0.06, 0.12, 0.03), INK, -0.14, 3.85, 2.16), part(box(0.06, 0.12, 0.03), INK, 0.14, 3.85, 2.16),
        part(box(0.9, 0.12, 1.2), TERRA, 0, 3.13, -0.1), part(box(0.95, 0.06, 1.25), GOLD, 0, 3.2, -0.1),
      ];
      for (const [x, z] of [[-0.3, -0.75], [0.3, -0.75], [-0.3, 0.75], [0.3, 0.75]] as const) p.push(part(rbox(0.22, 1.1, 0.22, 0.06, 1), SAND, x, 1.7, z));
      return { geometry: merge(p), material: toy(), castShadow: true };
    },
  },
  token_monolith: {
    // glyph-carved "token" slab with an original sparkle inset (never the Claude logo)
    maxInstances: 30,
    build: () => {
      const p: THREE.BufferGeometry[] = [part(rbox(1.2, 7, 3, 0.2, 2), SANDSTONE, 0, 3.5, 0), part(box(1.6, 0.6, 3.4), SANDSTONE_DK, 0, 0.3, 0)];
      for (let i = 0; i < 4; i++) p.push(part(box(0.1, 0.35, 1.8 - (i % 2) * 0.6), SANDSTONE_DK, 0.62, 1.5 + i * 0.8, 0));
      p.push(paint(place(sparkleGeometry(0.9, 0.12, 31), 0.64, 5.6, 0, 0, Math.PI / 2, 0), GOLD));
      return { geometry: merge(p), material: lit(), castShadow: true };
    },
  },
  sandstone_arch: {
    // landmark gate over the road; local X crosses the road
    maxInstances: 6,
    build: () => {
      const p: THREE.BufferGeometry[] = [];
      for (const x of [-14, 14]) p.push(...strata(3.2, 10, 3.2, 4, x > 0 ? 3 : 4).map((g) => place(g, x, 0, 0)));
      p.push(part(arcTube(14, 1.6, Math.PI, 6, 24), SANDSTONE, 0, 9.5, 0, 0, 0, 0, 1, 0.42, 1));
      p.push(part(box(30, 1.6, 3.4), SANDSTONE_DK, 0, 16.1, 0), part(box(2.4, 2.2, 3.6), GOLD, 0, 14.6, 0));
      p.push(...buntingLine(-12.5, 12.5, 10.8, 1.4, 0, RUGS, 14));
      return { geometry: merge(p), material: lit(), castShadow: true };
    },
  },
  obelisk: {
    maxInstances: 20,
    build: () => ({
      geometry: merge([
        part(box(4, 1.2, 4), SANDSTONE_DK, 0, 0.1, 0), part(box(3, 0.6, 3), SANDSTONE, 0, 1.0, 0),
        part(cyl(0.9, 1.4, 14, 4), SANDSTONE, 0, 8.3, 0, 0, Math.PI / 4, 0),
        part(cone(1.0, 1.8, 4), GOLD, 0, 16.2, 0, 0, Math.PI / 4, 0),
        part(box(0.1, 0.5, 0.9), SANDSTONE_DK, 1.05, 5, 0), part(box(0.1, 0.5, 0.7), SANDSTONE_DK, 1.0, 7, 0), part(box(0.1, 0.5, 0.5), SANDSTONE_DK, 0.95, 9, 0),
      ]), material: lit(), castShadow: true,
    }),
  },
  pyramid: {
    // far-distance landmark
    maxInstances: 4,
    build: () => ({ geometry: merge([part(cone(46, 44, 4), '#d9ae6a', 0, 20, 0, 0, Math.PI / 4, 0, 1, 1, 1, 0.05, 7), part(cone(4.5, 4.4, 4), GOLD, 0, 41.8, 0, 0, Math.PI / 4, 0)]), material: lit() }),
  },
  dune: {
    maxInstances: 200,
    build: () => ({ geometry: merge([part(sph(9, 12, 6), SAND, 0, -3.2, 0, 0, 0, 0, 1.5, 0.55, 1, 0.06, 5), part(sph(5, 10, 5), '#f0d08e', 5, -1.4, 3, 0, 0, 0, 1.2, 0.5, 1)]), material: lit() }),
  },
  cactus: {
    maxInstances: 300,
    build: () => ({
      geometry: merge([
        part(cyl(0.42, 0.5, 4.2, 8), '#5e9a4a', 0, 1.6, 0), part(sph(0.42, 8, 5), '#5e9a4a', 0, 3.7, 0),
        part(cyl(0.28, 0.28, 1.2, 7), '#5e9a4a', 0.75, 1.8, 0, 0, 0, Math.PI / 2), part(cyl(0.26, 0.28, 1.4, 7), '#5e9a4a', 1.3, 2.5, 0),
        part(sph(0.27, 7, 4), '#5e9a4a', 1.3, 3.2, 0), part(cyl(0.24, 0.24, 1.0, 7), '#5e9a4a', -0.65, 2.3, 0, 0, 0, Math.PI / 2),
        part(cyl(0.22, 0.24, 1.0, 7), '#5e9a4a', -1.1, 2.8, 0), part(sph(0.18, 6, 4), '#f25f7a', 0, 4.1, 0),
      ]), material: MaterialLibrary.foliageLit(), castShadow: true,
    }),
  },
  clay_pots: {
    maxInstances: 200,
    build: () => ({
      geometry: merge([
        part(lathe([[0, 0], [0.45, 0.1], [0.55, 0.6], [0.3, 1.1], [0.32, 1.25]], 10), TERRA),
        part(lathe([[0, 0], [0.35, 0.08], [0.42, 0.45], [0.22, 0.85], [0.25, 0.95]], 10), SANDSTONE, 0.9, 0, 0.4),
        part(lathe([[0, 0], [0.3, 0.05], [0.36, 0.35], [0.2, 0.62]], 10), OASIS, -0.6, 0, 0.6),
      ]), material: toy(), castShadow: true,
    }),
  },
  mesa: {
    // flat-topped layered rock pillar (canyon rims, distant buttes)
    maxInstances: 60,
    build: () => ({ geometry: merge(strata(14, 22, 12, 6, 21).map((g) => place(g, 0, -4, 0))), material: lit(), castShadow: true }),
  },
  canyon_wall: {
    // tall strata slab lining the slot canyon; its face (+X) faces the road, it runs 24 m along the track
    maxInstances: 200,
    build: () => ({ geometry: merge(strata(7, 26, 24, 7, 17).map((g) => place(g, -3.5, -6, 0))), material: lit(), castShadow: true }),
  },
  scaffold: {
    maxInstances: 20,
    build: () => {
      const p: THREE.BufferGeometry[] = [];
      for (const x of [-1.5, 1.5]) for (const z of [-1.5, 1.5]) p.push(part(box(0.18, 9, 0.18), '#8a6340', x, 4.5, z));
      for (let k = 1; k <= 3; k++) { p.push(part(box(3.4, 0.14, 3.4), '#a57a4c', 0, k * 3, 0)); p.push(part(box(0.1, 3.2, 0.1), '#6b4a33', 0, k * 3 - 1.5, 1.5, 0, 0, 0.8)); }
      p.push(part(box(0.1, 0.1, 3), '#d9c7a0', 1.6, 7.8, 0));
      return { geometry: merge(p), material: lit() };
    },
  },
  rope_post: {
    // rope-bridge post with a rope handrail running along the track (spaced every 6 m)
    maxInstances: 200,
    build: () => ({ geometry: merge([part(cyl(0.12, 0.15, 1.6, 6), '#7a522e', 0, 0.8, 0), part(cyl(0.035, 0.035, 6.2, 4), '#d9c7a0', 0, 1.35, 0, Math.PI / 2, 0, 0), part(sph(0.16, 6, 4), '#6b4a33', 0, 1.62, 0)]), material: lit() }),
  },
  sandfall: {
    // a pale luminous sheet of falling sand pouring off the canyon rim (faces the road)
    maxInstances: 20,
    build: () => ({ geometry: merge([part(box(0.4, 22, 5), '#f6d7a7', 0, 11, 0), part(sph(3, 10, 6), '#f0cf96', 1.5, 0, 0, 0, 0, 0, 1, 0.35, 1)]), material: MaterialLibrary.emissiveVertex(0.9) }),
  },
  oasis_pond: {
    maxInstances: 4,
    build: () => ({ geometry: merge([part(cyl(9, 9, 0.2, 24), '#ffffff', 0, -0.25, 0, 0, 0, 0, 1.4, 1, 1)]), material: MaterialLibrary.water({ shallow: '#7fe3d6', deep: '#1fb5c9', foam: '#f6e7c1' }) }),
  },
  reeds: {
    maxInstances: 200,
    build: () => {
      const r = seeded(29), p: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 9; i++) p.push(part(cone(0.12, 1.6 + r() * 0.8, 4), i % 3 ? '#6f9a4a' : '#8fb573', (r() - 0.5) * 1.6, 0.8, (r() - 0.5) * 1.6));
      return { geometry: merge(p), material: MaterialLibrary.foliageLit() };
    },
  },
  dome_house: {
    // adobe house with a small dome, for the bazaar skyline
    maxInstances: 80,
    build: () => {
      const p: THREE.BufferGeometry[] = [part(box(6.4, 2, 6.4), SANDSTONE_DK, 0, -0.6, 0), part(rbox(6, 5, 6, 0.25, 2), '#ecd3a6', 0, 2.5, 0), part(dome(2.3, 12, 6), CREAM, 0, 5, 0), part(cyl(0.2, 0.2, 0.8, 6), GOLD, 0, 7.5, 0)];
      p.push(part(box(0.14, 2.1, 1.2), '#6b4a33', 3.02, 1.05, 0), part(rbox(1.6, 0.14, 3.2, 0.06, 1), OASIS, 3.5, 2.4, 0, 0, 0, -0.2));
      for (const z of [-1.8, 1.8]) p.push(part(box(0.12, 0.9, 0.7), '#3a2f28', 3.02, 3.4, z));
      p.push(part(prism(1.4, 0.8, 1.2), TERRA, 2.6, 5.0, 2.2));
      return { geometry: merge(p), material: lit(), castShadow: true };
    },
  },
};

export const SUNSTONE_PALETTE = { SAND, SANDSTONE, OASIS, TERRA, CREAM } as const;
