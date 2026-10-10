// Sunstone Desert props: a caravan-town bazaar and a sandstone canyon. Chunky vinyl-toy shapes, warm sand and
// sandstone with teal/terracotta accents. Local frame: +X faces the road, +Y up, +Z along the track.
import * as THREE from 'three/webgpu';
import { MaterialLibrary } from '../../materials/library.ts';
import type { PropFactory } from '../../props/defaults.ts';
import { TRACKSIDE_PROPS } from '../../props/trackside.ts';
import { BACKED_BOARDS } from './mirror.ts';
import { GlowParts, glowLit } from '../neon_harbor/glowlit.ts';
import { cosmetic, merge, paint, place, rbox, box, cyl, cone, ico, sph, sparkleGeometry } from '../../util/geo.ts';
import { arcTube, buntingLine, dome, lathe, part, prism, seeded, tubeThrough } from '../clayhill_village/toyshapes.ts';

const SAND = '#e8c27a', SANDSTONE = '#c98b4e', SANDSTONE_DK = '#a86f3c', OASIS = '#3fb8af', TERRA = '#c96442', CREAM = '#f4e3c3';
const GOLD = '#e0b04b', PALM = '#4e9f3d', PALM_DK = '#3c7f2f', TRUNK = '#8a6340', INK = '#2a2622', WOOD_DK = '#6b4a33';
const RUGS = ['#b53333', '#3fb8af', '#e0b04b', '#6a4c93', '#c96442'];
/** Dry ground cover (straw, khaki, olive) and desert scrub greens: mid-value, never lime. */
const DRY = ['#c8b06a', '#a99f5a', '#8f9a4e', '#b9a25e'] as const;
const SCRUB = ['#7d9150', '#8fa05c', '#6a8045'] as const;
const STRATA = ['#c27c52', '#e2bf93', '#b06a45', '#d8a06e', '#9e5d3c'] as const;

const lit = (): THREE.Material => MaterialLibrary.vertexLit(0.85, 0);
// statues, pots and carts are fired clay, stone and painted wood: satin-matte (gloss stays on kart paint, 34 §1.3)
const toy = (): THREE.Material => MaterialLibrary.vertexLit(0.62, 0);
// lit brass frames with self-lit glass in one draw (the shared lit-plus-glow material, see neon_harbor/glowlit.ts)
const lanternLit = (): THREE.Material => glowLit(0.6, 0);

/**
 * Layered sandstone strata: stacked, slightly offset slabs with crisp (small-radius) edges in an ordered band palette
 * (deep red-rock, pale cream, terracotta, ochre). `lean` steps each layer back along −X, so a canyon face opens upward.
 */
function strata(w: number, h: number, d: number, layers: number, seed: number, lean = 0): THREE.BufferGeometry[] {
  const r = seeded(seed), out: THREE.BufferGeometry[] = [];
  const cols = STRATA;
  for (let i = 0; i < layers; i++) {
    const lh = h / layers, sx = 1 - r() * 0.1, sz = 1 - r() * 0.1;
    out.push(part(rbox(w * sx, lh * 1.02, d * sz, Math.min(0.22, lh * 0.1), 2), cols[i % cols.length]!, (r() - 0.5) * 0.6 - i * lean, lh * (i + 0.5), (r() - 0.5) * 0.6, 0, 0, 0, 1, 1, 1, 0.03, seed + i));
  }
  return out;
}

/** Vertex colours from `c0` at height y0 to `c1` at y1 (sandfall strands). */
function gradient(g: THREE.BufferGeometry, y0: number, y1: number, c0: THREE.Color, c1: THREE.Color): THREE.BufferGeometry {
  const out = paint(g, c0), pos = out.attributes.position!, col = out.attributes.color!, c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.copy(c0).lerp(c1, Math.min(1, Math.max(0, (pos.getY(i) - y0) / (y1 - y0))));
    col.setXYZ(i, c.r, c.g, c.b);
  }
  return out;
}

/** Low-detail palm (far groves): a leaning tube trunk and five drooping fronds. */
function palmLite(x: number, z: number, k: number, yaw: number, seed: number): THREE.BufferGeometry[] {
  const lean = 0.6 + (seed % 3) * 0.3, c = Math.cos(yaw), s = Math.sin(yaw);
  const top: [number, number, number] = [x + c * lean * k, 6.2 * k, z + s * lean * k];
  const out = [part(tubeThrough([[x, -0.5, z], [x + c * lean * 0.3 * k, 3 * k, z + s * lean * 0.3 * k], top], 0.22 * k, 6, 5), TRUNK)];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + seed;
    out.push(cosmetic(part(cone(0.5 * k, 3.2 * k, 4), i % 2 ? PALM : PALM_DK, top[0] + Math.cos(a) * 1.4 * k, top[1] - 0.25 * k, top[2] + Math.sin(a) * 1.4 * k, 0, -a, Math.PI / 2 + 0.4, 1, 1, 0.25)));
  }
  return out;
}

/**
 * Bazaar street frontage (local +X faces the road): a two-storey adobe house 6.2 m wide standing just behind the
 * 2.5 m building wall, with shuttered windows, a crenellated roofline and a striped cloth awning that leans out over
 * the wall top (never down into the road). Three looks so a row of a/b/c reads as a varied but ordered street.
 */
function bazaarHouse(v: 'a' | 'b' | 'c'): THREE.BufferGeometry {
  const W = 6.2, D = 5, H = 6.4;
  const body = v === 'a' ? '#ecd3a6' : v === 'b' ? '#e6b98c' : '#f1e6d2';
  const trim = v === 'a' ? OASIS : v === 'b' ? TERRA : '#2f6f9a';
  const cloth = v === 'a' ? [CREAM, OASIS] : v === 'b' ? [CREAM, TERRA] : ['#f5c230', '#c8402e'];
  const p: THREE.BufferGeometry[] = [
    part(box(D + 0.3, 0.9, W + 0.2), SANDSTONE_DK, -D / 2, -0.15, 0),                        // plinth into the sand
    part(rbox(D, H, W, 0.12, 2), body, -D / 2, H / 2, 0),
    part(box(D + 0.2, 0.35, W + 0.2), '#d9bf94', -D / 2, H + 0.12, 0),                       // roof slab
  ];
  // crenellated parapet along the street face
  for (let k = 0; k < 6; k++) p.push(part(box(0.35, 0.45, 0.6), '#d9bf94', -0.17, H + 0.5, -W / 2 + 0.5 + k * 1.04));
  // upper-storey windows: dark recess, rounded head, shutters in the trim colour
  for (const z of [-1.6, 1.6]) {
    p.push(part(box(0.08, 1.1, 0.8), '#3a2f28', 0.02, 4.4, z), part(cyl(0.4, 0.4, 0.08, 10), '#3a2f28', 0.02, 4.95, z, 0, 0, Math.PI / 2));
    p.push(part(box(0.06, 1.15, 0.26), trim, 0.06, 4.4, z - 0.56), part(box(0.06, 1.15, 0.26), trim, 0.06, 4.4, z + 0.56));
    p.push(part(box(0.3, 0.1, 1.0), '#d9bf94', 0.12, 3.8, z));                                // sill
  }
  // trim band under the roof
  p.push(part(box(0.06, 0.22, W), trim, 0.03, H - 0.45, 0));
  // striped awning over the wall: 3.0 m at its lip, 3.7 m at the house, 1.15 m deep
  for (let i = 0; i < 8; i++) p.push(cosmetic(part(box(1.25, 0.07, W / 8 - 0.02), cloth[i % 2]!, 0.5, 3.35, -W / 2 + W / 16 + (i * W) / 8, 0, 0, -0.55)));
  p.push(cosmetic(part(box(0.06, 0.18, W), cloth[1]!, 1.06, 2.98, 0)));                                  // valance
  for (const z of [-W / 2 + 0.2, W / 2 - 0.2]) p.push(part(box(0.06, 0.06, 0.06), WOOD_DK, 1.0, 3.0, z));
  if (v === 'b') {
    // rug hung over a small balcony rail
    p.push(part(box(0.9, 0.12, 2.4), WOOD_DK, 0.35, 5.25, 0), part(box(0.06, 0.5, 2.4), WOOD_DK, 0.78, 5.55, 0));
    p.push(part(box(0.05, 1.3, 1.5), RUGS[0]!, 0.82, 5.05, 0), part(box(0.06, 0.8, 1.0), RUGS[2]!, 0.84, 5.05, 0), part(box(0.07, 0.3, 0.4), RUGS[1]!, 0.86, 5.05, 0));
  } else if (v === 'c') {
    // small dome and gold finial on the back of the roof
    p.push(part(cyl(1.3, 1.3, 0.6, 14), '#d9bf94', -3.2, H + 0.6, -1.2), part(dome(1.25, 14, 6), CREAM, -3.2, H + 0.9, -1.2), part(cyl(0.08, 0.08, 0.7, 6), GOLD, -3.2, H + 2.4, -1.2));
  } else {
    // potted palm on the roof terrace
    p.push(part(lathe([[0, 0], [0.4, 0.05], [0.45, 0.5], [0.35, 0.6]], 8), TERRA, -1.6, H + 0.3, 1.8));
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; p.push(cosmetic(part(cone(0.22, 1.3, 4), i % 2 ? PALM : PALM_DK, -1.6 + Math.cos(a) * 0.55, H + 1.25, 1.8 + Math.sin(a) * 0.55, 0, -a, Math.PI / 2 - 0.5, 1, 1, 0.3))); }
  }
  return merge(p);
}

/** Bronze lantern post with a pierced brass lantern (unlit by day; the street lights are the lantern strings). */
function lanternPost(): THREE.BufferGeometry {
  const BR = '#5a4632';
  return merge([
    part(cyl(0.2, 0.26, 0.4, 8), SANDSTONE_DK, 0, 0.18, 0), part(cyl(0.07, 0.09, 3.6, 8), BR, 0, 2.1, 0),
    part(tubeThrough([[0, 3.7, 0], [0.35, 4.05, 0], [0.75, 3.95, 0]], 0.04, 8, 4), BR),
    part(lathe([[0, -0.32], [0.2, -0.2], [0.24, 0.1], [0.12, 0.28], [0.03, 0.42]], 8), GOLD, 0.75, 3.5, 0),
    part(cyl(0.15, 0.15, 0.3, 8), '#ffe2a8', 0.75, 3.48, 0),
  ]);
}

export const SUNSTONE_PROPS: Record<string, PropFactory> = {
  lamp_post: { maxInstances: 200, build: () => ({ geometry: lanternPost(), material: lit(), castShadow: true }) },
  palm: {
    maxInstances: 300,
    build: () => {
      const p: THREE.BufferGeometry[] = [part(tubeThrough([[0, -1.5, 0], [0.3, 2, 0], [0.9, 4.5, 0], [1.6, 6.6, 0]], 0.26, 10, 6), TRUNK)];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        p.push(cosmetic(part(cone(0.55, 3.6, 4), i % 2 ? PALM : PALM_DK, 1.6 + Math.cos(a) * 1.6, 6.3, Math.sin(a) * 1.6, 0, -a, Math.PI / 2 + 0.35, 1, 1, 0.25)));
      }
      for (let i = 0; i < 3; i++) p.push(cosmetic(part(sph(0.22, 6, 5), '#7a5a2e', 1.6 + Math.cos(i * 2.1) * 0.35, 6.2, Math.sin(i * 2.1) * 0.35)));
      return { geometry: merge(p), material: MaterialLibrary.foliageLit(), castShadow: true };
    },
  },
  awning_stall: {
    maxInstances: 60,
    build: () => {
      const p: THREE.BufferGeometry[] = [part(box(2.4, 1.0, 4), '#9c6b40', 0, 0.5, 0), part(box(2.5, 0.1, 4.1), '#7a522e', 0, 1.02, 0)];
      for (const [x, z] of [[-1.15, -1.95], [-1.15, 1.95], [1.2, -1.95], [1.2, 1.95]] as const) p.push(part(cyl(0.07, 0.07, 3, 6), '#6b4a33', x, 1.5, z));
      for (let i = 0; i < 7; i++) p.push(cosmetic(part(box(3.0, 0.08, 0.62), i % 2 ? CREAM : (i % 4 === 0 ? OASIS : TERRA), 0.45, 2.95, -1.86 + i * 0.62, 0, 0, -0.28)));
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
        p.push(cosmetic(part(box(0.06, 2.4, 1.3), RUGS[i]!, 0, 1.65, z)), cosmetic(part(box(0.07, 1.4, 0.9), RUGS[(i + 2) % 5]!, 0.01, 1.7, z)), cosmetic(part(box(0.08, 0.5, 0.4), GOLD, 0.02, 1.7, z)));
      }
      return { geometry: merge(p), material: lit() };
    },
  },
  lantern_string: {
    // brass lanterns strung between two posts across the road (landmark, local X crosses the road). By day the old
    // all-emissive mesh read as flat pale stickers, so the posts, wire, caps and frames are now lit brass and bronze
    // (they keep their form in the sun) and only the glass glows, at gain 0.65 (under the 0.8 day bloom threshold)
    maxInstances: 20,
    build: () => {
      const BRASS = '#7a5a2a', BRONZE = '#4a3a28';
      const g = new GlowParts();
      g.add(part(cyl(0.12, 0.15, 7.5, 6), BRONZE, -13, 3.5, 0), part(cyl(0.12, 0.15, 7.5, 6), BRONZE, 13, 3.5, 0));
      g.add(part(sph(0.2, 8, 6), BRASS, -13, 7.3, 0), part(sph(0.2, 8, 6), BRASS, 13, 7.3, 0));
      const pts: [number, number, number][] = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([-13 + 26 * t, 7 - 1.4 * 4 * t * (1 - t), 0]); }
      g.add(paint(tubeThrough(pts, 0.035, 24, 4), BRONZE));
      for (let i = 0; i < 9; i++) {
        const t = (i + 0.5) / 9, x = -13 + 26 * t, wire = 7 - 1.4 * 4 * t * (1 - t), y = wire - 0.62;
        // glass: a warm lantern body (alternate amber and orange), self-lit
        g.light(0.65, part(lathe([[0, -0.24], [0.21, -0.14], [0.24, 0.06], [0.14, 0.22], [0, 0.26]], 8), i % 3 === 1 ? '#ff9a52' : '#ffc46b', x, y, 0));
        // brass cap with a ring hook up to the wire, a base plate with a drop finial, and four frame ribs
        g.add(
          part(cone(0.22, 0.2, 8), BRASS, x, y + 0.34, 0), part(cyl(0.025, 0.025, wire - y - 0.42, 4), BRASS, x, (wire + y + 0.42) / 2, 0),
          part(cyl(0.18, 0.12, 0.08, 8), BRASS, x, y - 0.27, 0), part(cone(0.06, 0.14, 6), BRASS, x, y - 0.37, 0, Math.PI, 0, 0),
        );
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
          g.add(part(box(0.04, 0.44, 0.04), BRASS, x + Math.cos(a) * 0.235, y + 0.02, Math.sin(a) * 0.235));
        }
      }
      return { geometry: g.build(), material: lanternLit(), castShadow: true };
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
      p.push(...buntingLine(-12.5, 12.5, 10.8, 1.4, 0, RUGS, 14).map(cosmetic));
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
    // tall strata slab lining the slot canyon: its face (+X) faces the road, it runs 16 m along the track (short enough
    // to follow the S-chains) and its layers step back as they rise so the corridor opens to the sky
    maxInstances: 300,
    build: () => ({ geometry: merge(strata(7, 24, 16, 7, 17, 0.3).map((g) => place(g, -3.5, -5, 0))), material: lit(), castShadow: true }),
  },
  canyon_pillar: {
    // narrow strata column for the insides of tight canyon bends, where a long slab would cut across the road
    maxInstances: 300,
    build: () => ({ geometry: merge(strata(5, 20, 6, 6, 23, 0.2).map((g) => place(g, -2.5, -4, 0))), material: lit(), castShadow: true }),
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
    build: () => ({ geometry: merge([part(cyl(0.12, 0.15, 1.6, 6), '#7a522e', 0, 0.8, 0), cosmetic(part(cyl(0.035, 0.035, 6.2, 4), '#d9c7a0', 0, 1.35, 0, Math.PI / 2, 0, 0)), part(sph(0.16, 6, 4), '#6b4a33', 0, 1.62, 0)]), material: lit() }),
  },
  sandfall: {
    // sand pouring off the canyon rim (faces the road): light strands (#f6e6c4 at the rim → #e3c48f at the foot) with
    // gaps between them, each breaking into clumps near the bottom, a rock lip at the top, a flat splash mound and a few
    // small puffs behind the wall line (x ≤ 0) so nothing solid stands on the racing line. Lit, not emissive
    maxInstances: 20,
    build: () => {
      const r = seeded(157), p: THREE.BufferGeometry[] = [];
      const TOP = new THREE.Color('#f6e6c4'), FOOT = new THREE.Color('#e3c48f');
      const strand = (x: number, y0: number, y1: number, z: number, w: number, t: number): void => {
        p.push(cosmetic(gradient(place(box(t, y1 - y0, w), x, (y0 + y1) / 2, z), 0, 22.2, FOOT, TOP)));
      };
      for (let i = 0; i < 7; i++) {
        const z = -2.4 + i * 0.8 + (r() - 0.5) * 0.15, w = 0.32 + r() * 0.22, t = 0.2 + r() * 0.15, x = -0.6 + (r() - 0.5) * 0.3;
        const brk = 3 + r() * 4;                                     // the strand breaks into clumps below this height
        strand(x, brk, 22.2, z, w, t);
        strand(x, brk * 0.45, brk - 0.5, z, w * 0.8, t);
        strand(x, 0, brk * 0.45 - 0.4, z, w * 0.6, t);
      }
      p.push(part(rbox(2.2, 1.2, 6.4, 0.2, 2), STRATA[2], -1.4, 22.6, 0));
      p.push(part(sph(3, 12, 6), '#e6c995', -0.6, 0, 0, 0, 0, 0, 1.1, 0.15, 1.2), part(sph(1.8, 10, 5), '#f0d8a8', 0.6, 0, 0.8, 0, 0, 0, 1, 0.15, 1));
      for (let i = 0; i < 3; i++) p.push(cosmetic(part(ico(0.4 + r() * 0.3, 1), '#f2e2c0', -0.8 - r() * 1.6, 0.4 + r() * 0.6, (r() - 0.5) * 4)));
      return { geometry: merge(p), material: lit() };
    },
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
  // ---- dressing pass (2026-10, docs/design/34-stylized-pass.md) --------------------------------------------------
  // Desert versions of the shared ground-cover / shrub / tree kinds (same names, so they win over trackside.ts), plus
  // pebbles, small cacti, palms, a bazaar street frontage and market clutter. Everything here is matte (vertexLit /
  // foliageLit); plant kinds are named so TrackView's SCATTER / tree|bush patterns thin them on Low and Medium.
  grass_tuft: {
    // dry desert tuft: straw, khaki and olive blades fanning out of the sand
    maxInstances: 6000,
    build: () => {
      const p: THREE.BufferGeometry[] = [], r = seeded(141);
      for (let i = 0; i < 8; i++) {
        const a = r() * Math.PI * 2, d = r() * 0.22, h = 0.26 + r() * 0.38, t = 0.35 + r() * 0.5;
        p.push(part(cone(0.045, h, 3), DRY[i % DRY.length]!, Math.cos(a) * d, h / 2, Math.sin(a) * d, Math.sin(a) * t, a, -Math.cos(a) * t));
      }
      return { geometry: merge(p), material: MaterialLibrary.foliageLit() };
    },
  },
  flower_patch: {
    // desert bloom: a grey-green succulent rosette with two flower stalks (coral and yellow)
    maxInstances: 3000,
    build: () => {
      const p: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2, t = i % 2 ? 0.95 : 0.6;
        p.push(part(cone(0.075, 0.48, 4), i % 2 ? '#7f9a6c' : '#6c8a5e', Math.cos(a) * 0.14, 0.18, Math.sin(a) * 0.14, Math.sin(a) * t, 0, -Math.cos(a) * t));
      }
      p.push(part(cone(0.09, 0.4, 4), '#86a374', 0, 0.2, 0));
      p.push(part(cyl(0.014, 0.02, 0.62, 4), '#6c8a5e', 0.12, 0.31, 0.05), part(ico(0.075, 0), '#f0705a', 0.12, 0.64, 0.05));
      p.push(part(cyl(0.014, 0.02, 0.48, 4), '#6c8a5e', -0.1, 0.24, -0.08), part(ico(0.065, 0), '#f2c14e', -0.1, 0.5, -0.08));
      return { geometry: merge(p), material: MaterialLibrary.foliageLit() };
    },
  },
  bush_round: {
    // low desert scrub: flattened sage and olive mounds (no lime)
    maxInstances: 1500,
    build: () => ({
      geometry: merge([
        part(ico(0.8, 1), SCRUB[0], 0, 0.42, 0, 0, 0, 0, 1.2, 0.68, 1.1, 0.08, 3),
        part(ico(0.58, 1), SCRUB[1], 0.6, 0.5, 0.3, 0, 0, 0, 1, 0.75, 1, 0.08, 5),
        part(ico(0.5, 1), SCRUB[2], -0.55, 0.34, -0.25, 0, 0, 0, 1, 0.72, 1, 0.08, 7),
        part(ico(0.18, 0), '#e7c65a', 0.2, 0.92, -0.2), part(ico(0.15, 0), '#e7c65a', -0.4, 0.66, 0.3),
      ]), material: MaterialLibrary.foliageLit(), castShadow: true,
    }),
  },
  rock_cluster: {
    // sandstone boulders: faceted, warm, one flat-topped slab
    maxInstances: 800,
    build: () => ({
      geometry: merge([
        part(ico(0.75, 0), '#c2916a', 0, 0.3, 0, 0.3, 0.5, 0.2, 1.3, 0.7, 1.0, 0.1, 11),
        part(ico(0.48, 0), '#ad7d58', 0.85, 0.18, 0.3, 0.2, 1.2, 0.1, 1.1, 0.65, 1, 0.1, 13),
        part(ico(0.32, 0), '#d4a67c', -0.65, 0.12, 0.5, 0, 0.4, 0.3, 1, 0.8, 1.2, 0.1, 17),
        part(rbox(0.9, 0.3, 0.7, 0.08, 1), '#b98a62', -0.3, 0.12, -0.7, 0, 0.6, 0),
      ]), material: lit(), castShadow: true,
    }),
  },
  rock_pebbles: {
    // a handful of flat pebbles on the sand (fine ground cover near the walls)
    maxInstances: 3000,
    build: () => {
      const p: THREE.BufferGeometry[] = [], r = seeded(147);
      const cols = ['#c8a07a', '#b48a64', '#d9b994', '#9c7a5c'];
      for (let i = 0; i < 7; i++) {
        const s = 0.08 + r() * 0.16;
        p.push(part(ico(s, 0), cols[i % cols.length]!, (r() - 0.5) * 1.6, s * 0.3, (r() - 0.5) * 1.6, r(), r() * 3, r(), 1.3, 0.55, 1.1));
      }
      return { geometry: merge(p), material: lit() };
    },
  },
  bush_cactus: {
    // small cactus garden: a barrel cactus, prickly-pear pads and a flower (knee to waist high)
    maxInstances: 1500,
    build: () => {
      const C1 = '#5f9a4c', C2 = '#4f8a42';
      const p: THREE.BufferGeometry[] = [
        part(sph(0.34, 10, 7), C1, 0, 0.3, 0, 0, 0, 0, 1, 1.2, 1), cosmetic(part(ico(0.09, 0), '#f25f7a', 0, 0.72, 0)),
        part(sph(0.22, 8, 6), C2, 0.45, 0.2, 0.3, 0, 0, 0, 1, 1.15, 1),
        part(cyl(0.3, 0.3, 0.08, 10), C1, -0.45, 0.32, -0.15, Math.PI / 2, 0.4, 0, 1, 1, 1.4),
        part(cyl(0.24, 0.24, 0.07, 10), C2, -0.62, 0.68, -0.05, Math.PI / 2, 0.9, 0.3, 1, 1, 1.4),
        part(cyl(0.2, 0.2, 0.07, 10), C1, -0.3, 0.7, -0.35, Math.PI / 2, -0.3, -0.3, 1, 1, 1.4),
        cosmetic(part(ico(0.07, 0), '#f2c14e', -0.66, 0.98, -0.05)),
        part(ico(0.28, 0), '#c8a07a', 0.2, 0.06, -0.45, 0, 0, 0, 1.3, 0.5, 1),
      ];
      return { geometry: merge(p), material: MaterialLibrary.foliageLit(), castShadow: true };
    },
  },
  tree_round_big: {
    // flat-topped acacia: forked trunk under three wide, thin canopy layers (the mid-distance layer)
    maxInstances: 800,
    build: () => ({
      geometry: merge([
        part(cyl(0.2, 0.32, 3.4, 7), TRUNK, 0, 1.6, 0),
        part(cyl(0.11, 0.17, 2.4, 6), TRUNK, 0.75, 3.9, 0.1, 0, 0, -0.65), part(cyl(0.11, 0.17, 2.3, 6), TRUNK, -0.7, 3.9, -0.2, 0.15, 0, 0.6),
        cosmetic(part(ico(2.6, 1), '#6f8f3e', 0, 4.95, 0, 0, 0, 0, 1.25, 0.32, 1.1, 0.08, 3)),
        cosmetic(part(ico(1.9, 1), '#7f9d48', 1.4, 5.35, 0.5, 0, 0, 0, 1.1, 0.34, 1, 0.08, 5)),
        cosmetic(part(ico(1.7, 1), '#5f7f36', -1.35, 5.2, -0.6, 0, 0, 0, 1.1, 0.34, 1, 0.08, 7)),
      ]), material: MaterialLibrary.foliageLit(), castShadow: true,
    }),
  },
  tree_clump: {
    // far line: a palm grove (five palms of mixed height over scrub mounds) in a 16 m patch
    maxInstances: 400,
    build: () => {
      const p: THREE.BufferGeometry[] = [], r = seeded(149);
      for (let i = 0; i < 5; i++) p.push(...palmLite((r() - 0.5) * 13, (r() - 0.5) * 13, 0.8 + r() * 0.5, r() * 6.28, i));
      for (let i = 0; i < 3; i++) p.push(cosmetic(part(ico(1.3, 0), SCRUB[i % 3]!, (r() - 0.5) * 12, 0.4, (r() - 0.5) * 12, 0, r() * 3, 0, 1.4, 0.6, 1.2, 0.08, 31 + i)));
      return { geometry: merge(p), material: MaterialLibrary.foliageLit(), castShadow: true };
    },
  },
  butte: {
    // distant sandstone butte (far horizon layer on the canyon rim): a stepped strata tower
    maxInstances: 120,
    build: () => ({
      geometry: merge([...strata(16, 14, 14, 4, 37).map((g) => place(g, 0, -3, 0)), ...strata(9, 12, 8, 3, 39).map((g) => place(g, 1, 10.5, -1))]),
      material: lit(), castShadow: true,
    }),
  },
  // ---- bazaar street frontage and market clutter (sits behind the 2.5 m building wall; awnings overhang its top)
  bazaar_house_a: { maxInstances: 120, build: () => ({ geometry: bazaarHouse('a'), material: lit(), castShadow: true }) },
  bazaar_house_b: { maxInstances: 120, build: () => ({ geometry: bazaarHouse('b'), material: lit(), castShadow: true }) },
  bazaar_house_c: { maxInstances: 120, build: () => ({ geometry: bazaarHouse('c'), material: lit(), castShadow: true }) },
  spectators_roof: {
    // the bazaar's grandstand: the shared cheering crowd standing on a house's roof terrace (place it on the same row
    // grid as `bazaar_house_b`, 1 m further out, so it stands behind the street-side parapet)
    maxInstances: 120,
    build: () => {
      const g = TRACKSIDE_PROPS['spectators']!.build([]).geometry.clone();
      g.translate(0, 6.42, 0);
      return { geometry: g, material: lit(), castShadow: true };
    },
  },
  street_bunting: {
    // a sagging line of cloth pennants across the market street on two tall posts that stand in the building walls'
    // thickness (local X crosses the road, ±10.25 m; lowest point ≈ 5 m above the road), so neither end floats where
    // the frontage opens into a plaza
    maxInstances: 40,
    build: () => {
      const p = buntingLine(-10.25, 10.25, 6.3, 1.3, 0, [TERRA, CREAM, OASIS, GOLD, '#c8402e'], 18).map(cosmetic);
      for (const x of [-10.25, 10.25]) p.push(part(cyl(0.09, 0.12, 7.0, 6), WOOD_DK, x, 2.9, 0), part(sph(0.16, 6, 4), GOLD, x, 6.5, 0));
      return { geometry: merge(p), material: lit(), castShadow: true };
    },
  },
  crate_stack: {
    // wooden crates, a fruit crate and a grain sack
    maxInstances: 600,
    build: () => ({
      geometry: merge([
        part(rbox(0.9, 0.8, 0.9, 0.05, 1), '#a57a4c', 0, 0.4, 0), part(rbox(0.92, 0.1, 0.92, 0.03, 1), '#7a522e', 0, 0.62, 0),
        part(rbox(0.8, 0.7, 0.8, 0.05, 1), '#b88a58', 0.05, 1.15, 0.05, 0, 0.3, 0),
        part(rbox(0.9, 0.5, 0.9, 0.05, 1), '#a57a4c', 0, 0.25, 1.0, 0, -0.2, 0),
        ...[0, 1, 2, 3].map((k) => part(sph(0.15, 7, 5), k % 2 ? '#f28b3c' : '#e8c14a', -0.2 + (k % 2) * 0.4, 0.58, 0.8 + (k > 1 ? 0.35 : 0))),
        part(rbox(0.6, 0.75, 0.5, 0.2, 2), '#e3d2ae', 0.1, 0.37, -0.95, 0, 0.4, 0.08), part(cyl(0.12, 0.2, 0.18, 8), '#d4c09a', 0.1, 0.8, -0.95),
      ]), material: lit(), castShadow: true,
    }),
  },
  barrel_spice: {
    // spice market display: open sacks heaped with red, saffron and green spice, a basket and a clay jar
    maxInstances: 600,
    build: () => {
      const p: THREE.BufferGeometry[] = [part(box(1.8, 0.3, 1.4), '#7a522e', 0, 0.15, 0)];
      const SP = ['#c8402e', '#e8a92a', '#7d9150', '#b8623a'];
      for (let i = 0; i < 4; i++) {
        const x = i % 2 ? 0.42 : -0.42, z = i < 2 ? -0.32 : 0.32;
        p.push(part(lathe([[0, 0], [0.34, 0.02], [0.36, 0.45], [0.3, 0.5]], 9), '#e3d2ae', x, 0.3, z));
        p.push(part(cone(0.3, 0.26, 9), SP[i]!, x, 0.88, z));
      }
      p.push(part(lathe([[0, 0], [0.3, 0.05], [0.4, 0.4], [0.42, 0.45]], 10), '#b98a55', 1.3, 0, 0.2));
      p.push(part(lathe([[0, 0], [0.28, 0.08], [0.34, 0.5], [0.16, 0.85], [0.18, 0.95]], 10), TERRA, 1.25, 0, -0.55));
      return { geometry: merge(p), material: lit(), castShadow: true };
    },
  },
  // ---- hazards (drawn by render/track/hazards.ts at real size: x across, y up, z along travel) ------------------
  hazard_pot_cart: {
    // bazaar traffic: a toy donkey-less pot cart matching the 4.4 × 2 × 1.8 m traffic contact box
    build: () => {
      const p: THREE.BufferGeometry[] = [
        part(rbox(1.9, 0.5, 3.2, 0.12, 2), '#8a6340', 0, 0.75, -0.3),                   // bed
        part(rbox(1.95, 0.6, 0.2, 0.06, 1), '#a57a4c', 0, 1.2, -1.85), part(rbox(1.95, 0.6, 0.2, 0.06, 1), '#a57a4c', 0, 1.2, 1.25),
        part(cyl(0.55, 0.55, 0.16, 14), INK, 1.05, 0.55, -0.6, 0, 0, Math.PI / 2), part(cyl(0.55, 0.55, 0.16, 14), INK, -1.05, 0.55, -0.6, 0, 0, Math.PI / 2),
        part(cyl(0.2, 0.2, 0.2, 10), GOLD, 1.12, 0.55, -0.6, 0, 0, Math.PI / 2), part(cyl(0.2, 0.2, 0.2, 10), GOLD, -1.12, 0.55, -0.6, 0, 0, Math.PI / 2),
        part(box(0.1, 0.1, 1.6), '#6b4a33', 0.5, 0.7, 1.9, -0.25, 0, 0), part(box(0.1, 0.1, 1.6), '#6b4a33', -0.5, 0.7, 1.9, -0.25, 0, 0), // shafts
        part(box(1.9, 0.12, 0.12), TERRA, 0, 0.55, 2.2),
      ];
      // a load of glazed pots and a striped canopy
      const pots = [[-0.5, -1.2], [0.45, -1.1], [0, -0.3], [-0.5, 0.5], [0.5, 0.55]] as const;
      pots.forEach(([x, z], i) => p.push(part(lathe([[0, 0], [0.3, 0.05], [0.38, 0.35], [0.22, 0.62], [0.16, 0.75]], 10), i % 2 ? TERRA : OASIS, x, 1.0, z)));
      p.push(part(box(0.08, 1.2, 0.08), '#6b4a33', 0.9, 1.6, -1.7), part(box(0.08, 1.2, 0.08), '#6b4a33', -0.9, 1.6, -1.7));
      p.push(part(box(2.1, 0.08, 1.4), CREAM, 0, 2.2, -1.2), part(box(2.1, 0.1, 0.3), RUGS[0]!, 0, 2.22, -1.2));
      return { geometry: merge(p), material: toy(), castShadow: true };
    },
  },
};
// the traffic default key (`hazard_car`) resolves to the pot cart too, so a HAZ without `prop=` still fits the theme
SUNSTONE_PROPS['hazard_car'] = SUNSTONE_PROPS['hazard_pot_cart']!;
// dressing rows use `tree_palm` / `tree_saguaro` (same models) so Low / Medium thin them like every other tree kind
SUNSTONE_PROPS['tree_palm'] = SUNSTONE_PROPS['palm']!;
SUNSTONE_PROPS['tree_saguaro'] = SUNSTONE_PROPS['cactus']!;
// navy-backed sponsor boards and the left-side chevron board (arrows point forward on side=L rows)
Object.assign(SUNSTONE_PROPS, BACKED_BOARDS);

export const SUNSTONE_PALETTE = { SAND, SANDSTONE, OASIS, TERRA, CREAM } as const;
