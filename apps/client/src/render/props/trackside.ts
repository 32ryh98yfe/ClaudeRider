// Trackside and dressing props shared by every theme kit (merged into DEFAULT_PROPS; a kit may override any kind
// with a themed version). Built for the 2026-10 stylized pass (docs/design/34-stylized-pass.md): racing furniture
// (sponsor boards, tyre walls, grandstand, spectators, flags, lamps) and the dressing layers (ground cover, shrubs,
// shade trees, far tree lines, balloons). Local frame: +X faces the road, +Y up, +Z along the track.
// Budget note: these are instanced (one draw per kind, one more for shadows); the Meadow Loop dressing is ≈ 1.2 M
// triangles, a fraction of what a desktop RTX 30-class GPU draws at 60 fps. Low/Medium thin the plant kinds by
// `foliage` and cull them early (TrackView SCATTER / tree|bush patterns), so software GL in CI stays light.
import * as THREE from 'three/webgpu';
import { MaterialLibrary } from '../materials/library.ts';
import type { PropFactory } from './defaults.ts';
import { merge, paint, place, rbox, box, cyl, cone, ico, sph, sparkleGeometry } from '../util/geo.ts';
import { lathe, part, seeded } from '../themes/clayhill_village/toyshapes.ts';

const TERRACOTTA = '#d97757', CREAM = '#f4efe6', SAGE = '#8fb573', SKY = '#9fd3f5';
const WOOD_DK = '#6b4a33', GOLD = '#e0b04b', IVORY = '#faf9f5', INK = '#2a2826';

const lit = (): THREE.Material => MaterialLibrary.vertexLit(0.8, 0);
/** Plants: vertex colour with a little tonal noise and wind sway above 1.4 m (MaterialLibrary.foliageLit). */
const leafy = (): THREE.Material => MaterialLibrary.foliageLit();
const LEAF = ['#4b8636', '#5d9a42', '#6aa84a', '#3f7a33'] as const;

export const TRACKSIDE_PROPS: Record<string, PropFactory> = {
  // ---- racing furniture -------------------------------------------------------------------------------------------
  grandstand: {
    // five-tier stand facing the road (+X) with coloured seat rows, a terracotta canopy and a small crowd
    maxInstances: 4,
    build: () => {
      const p: THREE.BufferGeometry[] = [];
      const L = 24, r = seeded(31);
      const SEATS = [TERRACOTTA, SKY, '#f2c14e', CREAM, SAGE];
      for (let i = 0; i < 5; i++) {
        const x = -1.6 - i * 1.25, top = 0.55 + i * 0.5;
        p.push(part(box(1.25, top + 0.6, L), '#d9d4ca', x, (top - 0.6) / 2, 0));
        for (let k = 0; k < 12; k++) p.push(part(box(0.5, 0.18, 1.8), SEATS[(i + k) % SEATS.length]!, x + 0.2, top + 0.09, -L / 2 + 1 + k * 2));
        // spectators: chunky toy figures, a few per row
        for (let k = 0; k < 7; k++) {
          if (r() < 0.25) continue;
          const z = -L / 2 + 1.2 + k * 3.4 + r() * 1.2, col = ['#e84a3c', '#3d7bd9', '#f2c14e', '#ffffff', '#8fb573', '#b57cff'][Math.floor(r() * 6)]!;
          p.push(part(rbox(0.42, 0.55, 0.42, 0.12, 1), col, x + 0.15, top + 0.46, z), part(sph(0.2, 8, 6), '#f0c9a0', x + 0.15, top + 0.9, z));
        }
      }
      const back = -1.6 - 5 * 1.25;
      p.push(part(box(0.3, 5.4, L + 0.6), CREAM, back - 0.15, 2.1, 0));
      p.push(part(box(0.25, 1.0, L), IVORY, -0.85, 0.5, 0));                                  // front parapet
      p.push(part(box(0.06, 0.4, L - 0.2), TERRACOTTA, -0.7, 0.75, 0));
      for (const z of [-L / 2 + 0.4, -L / 6, L / 6, L / 2 - 0.4]) p.push(part(cyl(0.12, 0.12, 5.6, 8), INK, -0.9, 2.8, z));
      p.push(part(box(8.6, 0.25, L + 1.2), TERRACOTTA, back / 2 - 0.4, 5.85, 0, 0, 0, -0.12));  // canopy
      p.push(part(box(8.7, 0.1, L + 1.3), '#a8553c', back / 2 - 0.4, 5.7, 0, 0, 0, -0.12));
      return { geometry: merge(p), material: lit(), castShadow: true };
    },
  },
  ad_board_a: { maxInstances: 60, build: () => ({ geometry: adBoard('a'), material: lit(), castShadow: true }) },
  ad_board_b: { maxInstances: 60, build: () => ({ geometry: adBoard('b'), material: lit(), castShadow: true }) },
  ad_board_c: { maxInstances: 60, build: () => ({ geometry: adBoard('c'), material: lit(), castShadow: true }) },
  tyre_wall: {
    // 1.3 m run of stacked tyres (2 columns × 3 high) on the outside of a corner, banded red / white per column
    maxInstances: 200,
    build: () => {
      const p: THREE.BufferGeometry[] = [];
      for (let c = 0; c < 2; c++) for (let h = 0; h < 3; h++) {
        const z = -0.32 + c * 0.64, y = 0.15 + h * 0.3;
        p.push(part(cyl(0.32, 0.32, 0.28, 14), '#23242a', 0, y, z));
        p.push(part(cyl(0.325, 0.325, 0.1, 14), c ? '#f6f4ef' : '#d9453c', 0, y, z));
        p.push(part(cyl(0.16, 0.16, 0.3, 10), '#0f1013', 0, y, z));
      }
      return { geometry: merge(p), material: MaterialLibrary.vertexLit(0.9, 0), castShadow: true };
    },
  },
  // ---- dressing pass (2026-10): ground cover, shrubs, layered tree lines and village life -------------------------
  // Budget note: these are instanced (one draw per kind, one more for shadows); the whole Meadow Loop dressing is
  // ≈ 1.2 M triangles, a fraction of what a desktop RTX 30-class GPU draws at 60 fps. Low/Medium thin the plant
  // kinds by `foliage` and cull them early (TrackView SCATTER), so software GL in CI stays light.
  grass_tuft: {
    maxInstances: 6000,
    build: () => {
      const p: THREE.BufferGeometry[] = [], r = seeded(41);
      for (let i = 0; i < 7; i++) {
        const a = r() * Math.PI * 2, d = r() * 0.2, h = 0.32 + r() * 0.34;
        p.push(part(cone(0.05, h, 3), LEAF[i % 3]!, Math.cos(a) * d, h / 2, Math.sin(a) * d, (r() - 0.5) * 0.6, a, (r() - 0.5) * 0.6));
      }
      return { geometry: merge(p), material: leafy() };
    },
  },
  flower_patch: {
    maxInstances: 3000,
    build: () => {
      const p: THREE.BufferGeometry[] = [], r = seeded(43);
      const petals = ['#f25f7a', '#f2c14e', '#ffffff', '#b57cff', '#f28b3c'];
      for (let i = 0; i < 6; i++) {
        const a = r() * Math.PI * 2, d = 0.1 + r() * 0.35, h = 0.28 + r() * 0.25;
        p.push(part(cone(0.04, h, 3), LEAF[i % 3]!, Math.cos(a) * d, h / 2, Math.sin(a) * d, (r() - 0.5) * 0.4, a, (r() - 0.5) * 0.4));
        p.push(part(ico(0.075, 0), petals[i % petals.length]!, Math.cos(a) * d, h + 0.03, Math.sin(a) * d));
      }
      p.push(part(ico(0.28, 0), LEAF[3], 0, 0.08, 0, 0, 0, 0, 1.4, 0.4, 1.4));
      return { geometry: merge(p), material: leafy() };
    },
  },
  bush_round: {
    maxInstances: 1500,
    build: () => ({
      geometry: merge([
        part(ico(0.85, 1), '#4f8a3c', 0, 0.62, 0, 0, 0, 0, 1.15, 0.85, 1.1, 0.08, 3),
        part(ico(0.62, 1), '#5f9a45', 0.55, 0.78, 0.25, 0, 0, 0, 1, 0.9, 1, 0.08, 5),
        part(ico(0.55, 1), '#3f7a36', -0.5, 0.5, -0.2, 0, 0, 0, 1, 0.85, 1, 0.08, 7),
      ]), material: leafy(), castShadow: true,
    }),
  },
  rock_cluster: {
    maxInstances: 800,
    build: () => ({
      geometry: merge([
        part(ico(0.7, 0), '#9a958c', 0, 0.3, 0, 0.3, 0.5, 0.2, 1.3, 0.75, 1.0, 0.12, 11),
        part(ico(0.45, 0), '#86827a', 0.8, 0.18, 0.3, 0.2, 1.2, 0.1, 1.1, 0.7, 1, 0.12, 13),
        part(ico(0.3, 0), '#a9a49a', -0.6, 0.12, 0.5, 0, 0.4, 0.3, 1, 0.8, 1.2, 0.1, 17),
      ]), material: lit(), castShadow: true,
    }),
  },
  tree_round_big: {
    // big shade tree: thick trunk, a fork, four canopy blobs (the mid-distance layer behind the fences)
    maxInstances: 800,
    build: () => ({
      geometry: merge([
        part(cyl(0.3, 0.45, 3.6, 7), WOOD_DK, 0, 1.5, 0),
        part(cyl(0.14, 0.2, 2.0, 6), WOOD_DK, 0.55, 3.6, 0, 0, 0, -0.5), part(cyl(0.14, 0.2, 2.0, 6), WOOD_DK, -0.5, 3.7, 0.2, 0.2, 0, 0.5),
        part(ico(2.3, 1), '#4f8a3c', 0, 5.2, 0, 0, 0, 0, 1.15, 0.9, 1.1, 0.08, 3),
        part(ico(1.7, 1), '#62a046', 1.4, 5.9, 0.6, 0, 0, 0, 1, 0.9, 1, 0.08, 5),
        part(ico(1.6, 1), '#447f37', -1.3, 5.6, -0.7, 0, 0, 0, 1, 0.9, 1, 0.08, 7),
        part(ico(1.4, 1), '#6aa84a', 0.2, 6.6, -0.9, 0, 0, 0, 1, 0.9, 1, 0.08, 9),
      ]), material: leafy(), castShadow: true,
    }),
  },
  tree_clump: {
    // far tree line: seven low-detail trees (round + cypress) in a 16 m patch, so the horizon reads as woodland
    maxInstances: 400,
    build: () => {
      const p: THREE.BufferGeometry[] = [], r = seeded(53);
      for (let i = 0; i < 7; i++) {
        const x = (r() - 0.5) * 14, z = (r() - 0.5) * 14, k = 0.8 + r() * 0.6;
        if (i % 3 === 2) {
          p.push(part(lathe([[0, 0], [1.0, 0.8], [1.2, 3], [0.9, 6], [0.4, 8], [0, 9]], 6), '#47803f', x, 0, z, 0, 0, 0, k, k, k, 0.1, 19 + i));
        } else {
          p.push(part(cyl(0.25, 0.35, 3, 5), WOOD_DK, x, 1.2 * k, z, 0, 0, 0, k, k, k));
          p.push(part(ico(2.2, 0), LEAF[i % 4]!, x, 4.0 * k, z, 0, r() * 3, 0, k * 1.1, k * 0.9, k * 1.1, 0.1, 23 + i));
          p.push(part(ico(1.5, 0), LEAF[(i + 1) % 4]!, x + 1.1 * k, 4.8 * k, z + 0.5 * k, 0, r() * 3, 0, k, k, k, 0.1, 29 + i));
        }
      }
      return { geometry: merge(p), material: leafy(), castShadow: true };
    },
  },
  lamp_post: {
    maxInstances: 200,
    build: () => ({
      geometry: merge([
        part(cyl(0.2, 0.24, 0.35, 8), INK, 0, 0.17, 0), part(cyl(0.07, 0.09, 3.8, 8), INK, 0, 2.1, 0),
        part(box(0.06, 0.06, 0.9), INK, 0.35, 3.95, 0, 0, Math.PI / 2, 0),
        part(rbox(0.36, 0.5, 0.36, 0.06, 1), INK, 0.75, 3.75, 0), part(box(0.28, 0.36, 0.28), '#fff1c8', 0.75, 3.75, 0),
        part(cone(0.3, 0.22, 8), INK, 0.75, 4.1, 0),
      ]), material: lit(), castShadow: true,
    }),
  },
  flag_pole: {
    maxInstances: 200,
    build: () => ({
      geometry: merge([
        part(cyl(0.05, 0.06, 6.2, 6), IVORY, 0, 3.1, 0), part(sph(0.09, 6, 4), GOLD, 0, 6.25, 0),
        part(box(0.03, 0.95, 1.5), '#d8423a', 0, 5.6, 0.78), part(box(0.035, 0.24, 1.5), IVORY, 0, 5.6, 0.78),
      ]), material: lit(), castShadow: true,
    }),
  },
  spectators: {
    // a cheering group behind the fence with a coral sparkle banner (toy figures, our own mark only)
    maxInstances: 120,
    build: () => {
      const p: THREE.BufferGeometry[] = [], r = seeded(61);
      const shirts = ['#e84a3c', '#3d7bd9', '#f2c14e', '#ffffff', '#8fb573', '#b57cff', '#f28b3c'];
      for (let i = 0; i < 9; i++) {
        const z = -2.4 + i * 0.6 + (r() - 0.5) * 0.2, x = -0.2 - r() * 0.9, hgt = 0.85 + r() * 0.3;
        p.push(part(rbox(0.42, hgt, 0.36, 0.12, 1), shirts[i % shirts.length]!, x, 0.35 + hgt / 2, z));
        p.push(part(sph(0.21, 8, 6), ['#f0c9a0', '#c98e62', '#8a5a3c'][i % 3]!, x, 0.55 + hgt, z));
        if (i % 3 === 1) p.push(part(box(0.1, 0.5, 0.1), shirts[(i + 2) % shirts.length]!, x + 0.05, 0.8 + hgt, z + 0.2, 0.3, 0, 0)); // waving arm
      }
      p.push(part(box(0.06, 0.6, 2.6), TERRACOTTA, -0.05, 1.45, 0), part(box(0.07, 0.12, 2.6), IVORY, -0.04, 1.2, 0));
      p.push(paint(place(sparkleGeometry(0.22, 0.03, 9), -0.01, 1.5, 0, 0, Math.PI / 2, 0), IVORY));
      for (const z of [-1.35, 1.35]) p.push(part(cyl(0.03, 0.03, 1.8, 5), WOOD_DK, -0.08, 0.9, z));
      return { geometry: merge(p), material: lit(), castShadow: true };
    },
  },
  hot_air_balloon: {
    // floating landmark over the meadow: banded envelope, ropes and a wicker basket
    maxInstances: 8,
    build: () => {
      const env: [number, number][] = [[0.6, 0], [2.2, 1.2], [4.0, 3.2], [4.9, 5.4], [4.7, 7.4], [3.6, 9.0], [1.8, 10.0], [0, 10.3]];
      const bands = [TERRACOTTA, CREAM, SKY, '#f2c14e'];
      const p: THREE.BufferGeometry[] = [];
      for (let i = 0; i < env.length - 1; i++) p.push(part(lathe([env[i]!, env[i + 1]!], 16), bands[i % bands.length]!, 0, 2.2, 0));
      p.push(part(rbox(1.3, 1.0, 1.3, 0.12, 1), '#a8773f', 0, 0, 0));
      for (const [x, z] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]] as const) p.push(part(cyl(0.025, 0.025, 2.0, 4), INK, x * 0.9, 1.4, z * 0.9));
      return { geometry: merge(p), material: lit() };
    },
  },
};

/** Roadside sponsor board (local +X faces the road): three looks in the village palette, our own sparkle mark only. */
function adBoard(v: 'a' | 'b' | 'c'): THREE.BufferGeometry {
  // the panel sits on posts above the 1 m rail fence in front of it, so the rails never cut across its face
  const W = 3.0, H = 0.95, y = 1.12 + H / 2;
  const NAVY = '#2f4a7a', YEL = '#f5c230', RED = '#d8423a';
  const p: THREE.BufferGeometry[] = [
    part(box(0.09, y, 0.09), '#5b4a3a', -0.05, y / 2, -W / 2 + 0.25), part(box(0.09, y, 0.09), '#5b4a3a', -0.05, y / 2, W / 2 - 0.25),
    part(box(0.1, H + 0.1, W + 0.1), '#c9ccd4', -0.06, y, 0),
  ];
  const face = v === 'a' ? TERRACOTTA : v === 'b' ? NAVY : IVORY;
  p.push(part(box(0.04, H, W), face, 0.02, y, 0));
  if (v === 'a') {
    p.push(paint(place(sparkleGeometry(0.34, 0.03, 11), 0.05, y, -0.85, 0, Math.PI / 2, 0), IVORY));
    p.push(part(box(0.03, 0.16, 1.6), IVORY, 0.05, y + 0.12, 0.45), part(box(0.03, 0.1, 1.2), IVORY, 0.05, y - 0.16, 0.25));
  } else if (v === 'b') {
    for (let k = 0; k < 4; k++) {
      const z = -0.9 + k * 0.6;
      // tips toward +Z (the travel direction once placed): on a bend's outside they point into the turn
      p.push(part(box(0.03, 0.5, 0.14), YEL, 0.05, y + 0.14, z, -0.8, 0, 0), part(box(0.03, 0.5, 0.14), YEL, 0.05, y - 0.14, z, 0.8, 0, 0));
    }
  } else {
    for (let k = 0; k < 15; k++) p.push(part(box(0.03, 0.2, 0.2), k % 2 ? RED : INK, 0.05, y - H / 2 + 0.1, -W / 2 + 0.1 + k * 0.2));
    p.push(paint(place(sparkleGeometry(0.28, 0.03, 5), 0.05, y + 0.12, 0, 0, Math.PI / 2, 0), RED));
  }
  return merge(p);
}
