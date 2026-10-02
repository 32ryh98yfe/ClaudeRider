// Canopy Forest dressing kit (2026-10 stylized pass, docs/design/34-stylized-pass.md §6): forest versions of the shared
// ground-cover / shrub / tree-line kinds and of the racing furniture, so the same PROPS layers that dress Meadow Loop
// read as a morning forest here. Names match the shared kinds on purpose: the kit's entries win on a clash, and the
// plant names (grass/flower/bush/rock/mushroom/tree) are the ones TrackView thins and culls early on Low and Medium.
// Local frame: +X faces the road, +Y up, +Z along the track. Instanced: one draw per kind (+1 for shadows).
import type * as THREE from 'three/webgpu';
import { MaterialLibrary } from '../../materials/library.ts';
import type { PropFactory } from '../../props/defaults.ts';
import { merge, paint, place, rbox, box, cyl, cone, ico, sph, sparkleGeometry } from '../../util/geo.ts';
import { blob, lathe, part, prng } from './shapes.ts';

// one organised forest palette: mid-value leaf greens (no lime, no near-black: shaded crowns stay ≥ 60 % of lit, like
// Meadow's #3c8133), bark browns, mushroom red, cream
const G = { deep: '#4f7a42', mid: '#5a8e48', leaf: '#5f9c43', light: '#76b04f', teal: '#356f4a', tealLight: '#468458' } as const;
const BARK = '#6b4a33', BARK_DK = '#4f3624', WOOD = '#b98a57', WOOD_PALE = '#dcb985', MOSS = '#7ca04c';
const CAP = '#e0533a', CREAM = '#f6efdc', GOLD = '#f2c14e', STONE = '#9a978c', STONE_DK = '#827f75', INK = '#2a2826';
const FLOOR = [G.deep, G.mid, G.leaf, G.light] as const;

/** Plants: vertex colour, a little tonal noise, wind sway above 1.4 m (shared foliage slot). */
const leafy = (): THREE.Material => MaterialLibrary.foliageLit();
/** Matte world props (rock, wood, cloth): the shared default prop slot. */
const matte = (): THREE.Material => MaterialLibrary.vertexLit(0.8, 0);

/** Arched, tapering frond (two flattened boxes) fanned at angle `a` around the origin. */
function frond(p: THREE.BufferGeometry[], a: number, len: number, w: number, col: string, y0 = 0.05): void {
  let x = 0, y = y0, pitch = 0.85;
  for (let k = 0; k < 2; k++) {
    const seg = len / 2, ww = w * (1 - k * 0.4);
    const dx = Math.cos(pitch) * seg, dy = Math.sin(pitch) * seg;
    p.push(part(box(seg * 1.08, 0.04, ww), col, Math.cos(a) * (x + dx / 2), y + dy / 2, Math.sin(a) * (x + dx / 2), 0, -a, pitch));
    x += dx; y += dy; pitch -= 1.05;
  }
}

/** Small toadstool: ivory stem, domed cap, a few cream dots. */
function toad(p: THREE.BufferGeometry[], x: number, z: number, h: number, r: number, cap: string, seed: number): void {
  const rnd = prng(seed);
  p.push(part(cyl(r * 0.24, r * 0.32, h, 6), CREAM, x, h / 2, z));
  p.push(part(sph(r, 10, 5), cap, x, h, z, 0, 0, 0, 1, 0.55, 1));
  for (let i = 0; i < 4; i++) {
    const a = rnd() * Math.PI * 2;
    p.push(part(ico(r * 0.16, 0), CREAM, x + Math.cos(a) * r * 0.62, h + r * 0.3, z + Math.sin(a) * r * 0.62, 0, 0, 0, 1, 0.5, 1));
  }
}

/** Round broadleaf tree (forest shade layer): straight trunk, moss collar, five-blob canopy. */
function forestTree(seed: number): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [], r = prng(seed);
  p.push(part(lathe([[0.78, -1.5], [0.75, 0], [0.54, 1.2], [0.45, 4.5], [0.36, 6.6]], 8), BARK, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0.08, seed));
  p.push(part(blob(0.62, 1, 0.12, seed + 1, 1, 0.45, 1), MOSS, 0, 0.35, 0));
  p.push(part(cyl(0.12, 0.18, 2.2, 6), BARK, 0.7, 5.2, 0.2, 0, 0, -0.6), part(cyl(0.11, 0.16, 2.0, 6), BARK, -0.6, 5.4, -0.3, 0.3, 0, 0.6));
  const blobs: [number, number, number, number, string][] = [
    [0, 7.4, 0, 2.6, G.mid], [1.7, 7.0, 0.8, 1.9, G.leaf], [-1.6, 7.1, -0.6, 1.9, G.deep], [0.3, 8.7, -0.7, 1.7, G.light], [-0.5, 6.6, 1.5, 1.6, G.mid],
  ];
  for (const [x, y, z, s, c] of blobs) p.push(part(blob(s, 1, 0.14, seed + 7 + Math.floor(r() * 50), 1.05, 0.88, 1.05), c, x, y, z, 0, 0, 0, 1, 1, 1, 0.07, seed + 3));
  return merge(p);
}

/** Forest conifer for the far tree lines: stacked cones in teal greens on a short trunk. */
function conifer(p: THREE.BufferGeometry[], x: number, z: number, k: number, seed: number): void {
  p.push(part(cyl(0.22, 0.32, 2.2, 5), BARK_DK, x, 0.6 * k, z, 0, 0, 0, k, k, k));
  const tiers: [number, number, number][] = [[2.6, 3.6, 2.4], [2.1, 3.2, 4.4], [1.5, 2.8, 6.2], [0.9, 2.2, 7.8]];
  tiers.forEach(([rr, h, y], i) => p.push(part(cone(rr, h, 7), i % 2 ? G.tealLight : G.teal, x, y * k, z, 0, seed + i, 0, k, k, k, 0.06, seed + i)));
}

export const CANOPY_DRESSING: Record<string, PropFactory> = {
  // ---- ground cover at the wall foot ------------------------------------------------------------------------------
  grass_tuft: {
    // undergrowth tuft: grass blades plus two little fern fronds (the forest read of the meadow tuft)
    build: () => {
      const p: THREE.BufferGeometry[] = [], r = prng(301);
      for (let i = 0; i < 7; i++) {
        const a = r() * Math.PI * 2, d = r() * 0.22, h = 0.3 + r() * 0.36;
        p.push(part(cone(0.05, h, 3), FLOOR[i % 4]!, Math.cos(a) * d, h / 2, Math.sin(a) * d, (r() - 0.5) * 0.6, a, (r() - 0.5) * 0.6));
      }
      frond(p, r() * 6.28, 0.7, 0.2, G.leaf);
      frond(p, r() * 6.28, 0.6, 0.18, G.mid);
      return { geometry: merge(p), material: leafy() };
    },
  },
  flower_patch: {
    // forest floor: white star flowers, yellow buttercups, one red toadstool, on a clover pad
    build: () => {
      const p: THREE.BufferGeometry[] = [], r = prng(307);
      const petals = [CREAM, GOLD, CREAM, '#b9a2e6'];
      for (let i = 0; i < 5; i++) {
        const a = r() * Math.PI * 2, d = 0.12 + r() * 0.34, h = 0.22 + r() * 0.2;
        p.push(part(cone(0.035, h, 3), G.mid, Math.cos(a) * d, h / 2, Math.sin(a) * d, (r() - 0.5) * 0.4, a, 0));
        p.push(part(ico(0.07, 0), petals[i % petals.length]!, Math.cos(a) * d, h + 0.02, Math.sin(a) * d, 0, 0, 0, 1, 0.6, 1));
      }
      toad(p, 0.18, -0.2, 0.16, 0.11, CAP, 311);
      p.push(part(ico(0.3, 0), G.deep, 0, 0.06, 0, 0, 0, 0, 1.4, 0.35, 1.4));
      return { geometry: merge(p), material: leafy() };
    },
  },
  mushroom_patch: {
    // a ring of small toy toadstools at the wall foot (matte: gloss stays on the karts)
    build: () => {
      const p: THREE.BufferGeometry[] = [];
      toad(p, 0, 0, 0.42, 0.26, CAP, 313);
      toad(p, 0.34, 0.22, 0.26, 0.17, GOLD, 317);
      toad(p, -0.22, 0.32, 0.2, 0.13, CAP, 319);
      toad(p, 0.1, -0.36, 0.18, 0.12, CAP, 323);
      p.push(part(ico(0.34, 0), G.mid, 0, 0.04, 0, 0, 0, 0, 1.5, 0.3, 1.4));
      return { geometry: merge(p), material: matte() };
    },
  },
  // ---- shrubs and rocks --------------------------------------------------------------------------------------------
  bush_round: {
    // fern bush: a leafy mound with eight arching fronds
    build: () => {
      const p: THREE.BufferGeometry[] = [], r = prng(331);
      p.push(part(blob(0.62, 1, 0.14, 333, 1.2, 0.75, 1.1), G.deep, 0, 0.42, 0));
      for (let i = 0; i < 8; i++) frond(p, (i / 8) * Math.PI * 2 + r() * 0.4, 1.6 + r() * 0.6, 0.42, i % 2 ? G.leaf : G.light, 0.25);
      return { geometry: merge(p), material: leafy(), castShadow: true };
    },
  },
  rock_cluster: {
    // mossy grey boulders: two stones with moss caps and a pebble
    build: () => ({
      geometry: merge([
        part(blob(0.85, 1, 0.16, 341, 1.25, 0.75, 1.0), STONE, 0, 0.32, 0, 0, 0, 0, 1, 1, 1, 0.06, 5),
        part(blob(0.72, 1, 0.12, 343, 1.2, 0.32, 0.95), MOSS, 0, 0.78, 0),
        part(blob(0.5, 1, 0.16, 347, 1.1, 0.8, 1.0), STONE_DK, 0.95, 0.18, 0.55),
        part(blob(0.26, 0, 0.12, 349, 1, 0.7, 1), STONE, -0.8, 0.08, 0.7),
      ]),
      material: matte(), castShadow: true,
    }),
  },
  // ---- shade trees and far tree lines ------------------------------------------------------------------------------
  tree_round_big: { build: () => ({ geometry: forestTree(351), material: leafy(), castShadow: true }) },
  tree_clump: {
    // far forest line: seven trees (teal conifers + round broadleafs) in a 16 m patch
    build: () => {
      const p: THREE.BufferGeometry[] = [], r = prng(361);
      for (let i = 0; i < 7; i++) {
        const x = (r() - 0.5) * 14, z = (r() - 0.5) * 14, k = 0.85 + r() * 0.6;
        if (i % 2 === 0) conifer(p, x, z, k, 363 + i);
        else {
          p.push(part(cyl(0.25, 0.35, 3.4, 5), BARK, x, 1.2 * k, z, 0, 0, 0, k, k, k));
          p.push(part(ico(2.3, 0), FLOOR[i % 4]!, x, 4.3 * k, z, 0, r() * 3, 0, k * 1.1, k * 0.9, k * 1.1, 0.08, 367 + i));
          p.push(part(ico(1.5, 0), FLOOR[(i + 1) % 4]!, x + 1.1 * k, 5.1 * k, z + 0.5 * k, 0, r() * 3, 0, k, k, k, 0.08, 371 + i));
        }
      }
      return { geometry: merge(p), material: leafy(), castShadow: true };
    },
  },
  // ---- racing furniture, forest built ------------------------------------------------------------------------------
  grandstand: {
    // timber stand facing the road: four log tiers with moss / coral / cream cushions, a crowd, a leaf-roof canopy
    build: () => {
      const p: THREE.BufferGeometry[] = [];
      const L = 24, r = prng(381);
      const SEATS = [MOSS, CAP, CREAM, GOLD];
      for (let i = 0; i < 4; i++) {
        const x = -1.7 - i * 1.4, top = 0.6 + i * 0.6;
        p.push(part(box(1.4, top + 0.6, L), i % 2 ? WOOD : WOOD_PALE, x, (top - 0.6) / 2, 0));
        p.push(part(cyl(0.22, 0.22, L, 7), BARK, x + 0.55, top, 0, Math.PI / 2, 0, 0));
        for (let k = 0; k < 10; k++) p.push(part(rbox(0.6, 0.16, 2.0, 0.06, 1), SEATS[(i + k) % SEATS.length]!, x + 0.1, top + 0.08, -L / 2 + 1.3 + k * 2.4));
        for (let k = 0; k < 7; k++) {
          if (r() < 0.2) continue;
          const z = -L / 2 + 1.4 + k * 3.3 + r() * 1.2, col = ['#e84a3c', '#3d7bd9', '#f2c14e', '#ffffff', '#8fb573', '#b57cff'][Math.floor(r() * 6)]!;
          p.push(part(rbox(0.42, 0.55, 0.42, 0.12, 1), col, x + 0.15, top + 0.45, z), part(sph(0.2, 8, 6), '#f0c9a0', x + 0.15, top + 0.9, z));
        }
      }
      const back = -1.7 - 4 * 1.4;
      for (let k = 0; k < 13; k++) p.push(part(cyl(0.3, 0.32, 5.6, 7), k % 2 ? BARK : BARK_DK, back - 0.2, 1.9, -L / 2 + k * 2));
      p.push(part(box(0.25, 0.9, L), WOOD_PALE, -0.9, 0.45, 0), part(box(0.06, 0.3, L - 0.2), CAP, -0.76, 0.7, 0));
      for (const z of [-L / 2 + 0.4, -L / 6, L / 6, L / 2 - 0.4]) p.push(part(cyl(0.2, 0.24, 5.3, 7), BARK, -0.95, 2.65, z));
      // leaf roof: a green canopy slab with a mushroom-red fascia, plus leafy lumps along its ridge
      p.push(part(box(8.2, 0.35, L + 1.2), G.mid, back / 2 - 0.3, 5.75, 0, 0, 0, -0.12));
      p.push(part(box(0.3, 0.55, L + 1.2), CAP, 0.12, 5.27, 0, 0, 0, -0.12));
      for (let k = 0; k < 6; k++) p.push(part(blob(1.5, 0, 0.2, 391 + k, 1.4, 0.5, 1.6), k % 2 ? G.leaf : G.deep, back / 2 - 1.2, 6.4, -L / 2 + 2 + k * 4));
      return { geometry: merge(p), material: matte(), castShadow: true };
    },
  },
  lamp_post: {
    // crooked timber post with a hanging lantern and a leaf tuft on top
    build: () => ({
      geometry: merge([
        part(cyl(0.12, 0.16, 4.0, 7), BARK, 0, 2.0, 0, 0, 0, 0.04),
        part(cyl(0.06, 0.07, 1.0, 5), BARK, 0.42, 3.85, 0, 0, 0, Math.PI / 2 - 0.2),
        part(cyl(0.015, 0.015, 0.35, 4), INK, 0.82, 3.65, 0),
        part(rbox(0.34, 0.46, 0.34, 0.06, 1), BARK_DK, 0.82, 3.3, 0), part(box(0.26, 0.32, 0.26), '#ffe7a8', 0.82, 3.3, 0),
        part(cone(0.28, 0.2, 6), BARK_DK, 0.82, 3.62, 0),
        part(blob(0.4, 0, 0.2, 397, 1.1, 0.7, 1.1), G.leaf, 0, 4.1, 0),
      ]),
      material: matte(), castShadow: true,
    }),
  },
  flag_pole: {
    // timber pole with a mushroom-red pennant and a cream band
    build: () => ({
      geometry: merge([
        part(cyl(0.06, 0.08, 6.0, 6), BARK, 0, 3.0, 0), part(sph(0.1, 6, 4), GOLD, 0, 6.05, 0),
        part(box(0.03, 0.9, 1.4), CAP, 0, 5.45, 0.72), part(box(0.035, 0.22, 1.4), CREAM, 0, 5.45, 0.72),
      ]),
      material: matte(), castShadow: true,
    }),
  },
  ad_board_a: { build: () => ({ geometry: signBoard('a'), material: matte(), castShadow: true }) },
  ad_board_b: { build: () => ({ geometry: signBoard('b'), material: matte(), castShadow: true }) },
  ad_board_c: { build: () => ({ geometry: signBoard('c'), material: matte(), castShadow: true }) },
  tyre_wall: {
    // 1.3 m log barrier on the outside of a corner: five logs with cream end rings, banded mushroom red / cream; the
    // front column stands 1.8 m tall so its bands read above the 1.2 m stone wall from the road
    build: () => {
      const p: THREE.BufferGeometry[] = [];
      for (const [x, y] of [[0, 0.3], [0, 0.9], [0, 1.5], [-0.6, 0.3], [-0.6, 0.9]] as const) {
        p.push(part(cyl(0.3, 0.3, 1.3, 9), BARK, x, y, 0, Math.PI / 2, 0, 0, 1, 1, 1, 0.06, 7));
        for (const z of [-0.66, 0.66]) p.push(part(cyl(0.26, 0.26, 0.03, 9), WOOD_PALE, x, y, z, Math.PI / 2, 0, 0));
        p.push(part(cyl(0.31, 0.31, 0.32, 9), CAP, x, y, -0.3, Math.PI / 2, 0, 0), part(cyl(0.31, 0.31, 0.32, 9), CREAM, x, y, 0.3, Math.PI / 2, 0, 0));
      }
      return { geometry: merge(p), material: matte(), castShadow: true };
    },
  },
};

/** Forest signboard (local +X faces the road): a plank board on two log posts, high enough to read over the 1.2 m
 *  stone wall and over the 1.8 m log barrier in front of the corner boards. */
function signBoard(v: 'a' | 'b' | 'c'): THREE.BufferGeometry {
  const W = 3.0, H = 0.95, y = 1.85 + H / 2;
  const p: THREE.BufferGeometry[] = [
    part(cyl(0.08, 0.1, y + 0.4, 6), BARK, -0.06, (y + 0.4) / 2 - 0.2, -W / 2 + 0.25), part(cyl(0.08, 0.1, y + 0.4, 6), BARK, -0.06, (y + 0.4) / 2 - 0.2, W / 2 - 0.25),
    part(rbox(0.12, H + 0.16, W + 0.16, 0.05, 1), BARK_DK, -0.07, y, 0),
  ];
  const face = v === 'a' ? CAP : v === 'b' ? G.teal : CREAM;
  p.push(part(box(0.04, H, W), face, 0.02, y, 0));
  if (v === 'a') {
    p.push(paint(place(sparkleGeometry(0.34, 0.03, 11), 0.05, y, -0.85, 0, Math.PI / 2, 0), CREAM));
    p.push(part(box(0.03, 0.16, 1.6), CREAM, 0.05, y + 0.12, 0.45), part(box(0.03, 0.1, 1.2), CREAM, 0.05, y - 0.16, 0.25));
  } else if (v === 'b') {
    // chevrons tip toward +Z (the travel direction once placed on the right): only for the outside of left-handers
    for (let k = 0; k < 4; k++) {
      const z = -0.9 + k * 0.6;
      p.push(part(box(0.03, 0.5, 0.14), GOLD, 0.05, y + 0.14, z, -0.8, 0, 0), part(box(0.03, 0.5, 0.14), GOLD, 0.05, y - 0.14, z, 0.8, 0, 0));
    }
  } else {
    for (let k = 0; k < 15; k++) p.push(part(box(0.03, 0.2, 0.2), k % 2 ? CAP : G.deep, 0.05, y - H / 2 + 0.1, -W / 2 + 0.1 + k * 0.2));
    p.push(paint(place(sparkleGeometry(0.28, 0.03, 5), 0.05, y + 0.12, 0, 0, Math.PI / 2, 0), CAP));
  }
  return merge(p);
}
