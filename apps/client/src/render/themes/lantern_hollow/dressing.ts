// Lantern Hollow dressing (2026-10 stylized pass, docs/design/34-stylized-pass.md §6): night-festival versions of the
// shared dressing kinds — autumn grass, fallen leaves with toadstools and mini pumpkins, autumn shrubs, mossy stones,
// big autumn trees with a hanging lantern, dark far woods — plus festival furniture (a lantern-lit grandstand, a
// costumed crowd, festival boards, straw-bale corner walls, pennant poles, floating sky lanterns). Spooky-cute, never
// scary. Same frame as props.ts: +X faces the road, +Z along the track, y = 0 is road height − 0.2 m.
import * as THREE from 'three/webgpu';
import { MaterialLibrary } from '../../materials/library.ts';
import type { PropFactory } from '../../props/defaults.ts';
import { merge, paint, place, box, cyl, cone, ico, rbox, sph, sparkleGeometry } from '../../util/geo.ts';
import { blob, hdr, lathe, part, prng, tube } from '../canopy_forest/shapes.ts';
import { glowLit } from './glow.ts';
import { C, GLOW, jackFace, paperLantern, pumpkin } from './props.ts';

const lit = (): THREE.Material => glowLit(0.8, 1.2);
const leafy = (): THREE.Material => MaterialLibrary.foliageLit();

// night palette: mid values (the moon key is weak), so the autumn colours still read under the lilac fill
const N = {
  grass: '#58804f', grassLight: '#6f9454', grassTip: '#b0954c', leafOrange: '#e0782c', leafRed: '#c2452f', leafGold: '#e8b03a',
  leafPlum: '#8a4f96', bark: '#4e3322', barkLight: '#6a4630', moss: '#6f9a5a', stone: '#9690ad', stoneDark: '#736d8c', cap: '#d9483b',
  pine: '#2f5a48', pineLight: '#3d6b52', violet: '#6b4fa0', indigo: '#2a2552', cream: '#f4efe6', straw: '#e8c46a', strawDeep: '#c9a24a',
  ribbon: '#8a6cc8', pumpkin: '#ff9f1c', ink: '#1e1b3a',
} as const;

/** Big autumn canopy tree: forked dark trunk and five leaf blobs in orange / gold / red. */
function autumnTree(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  p.push(part(tube([[0, -0.5, 0], [0.2, 2, 0.1], [-0.2, 3.6, 0], [0.1, 4.6, 0.1]], 0.42, 8, 6), N.bark));
  p.push(part(tube([[0, 3.4, 0], [1.2, 4.6, 0.4], [1.8, 5.6, 0.6]], 0.18, 6, 5), N.bark), part(tube([[0, 3.7, 0], [-1.3, 4.9, -0.5], [-1.9, 5.8, -0.7]], 0.17, 6, 5), N.bark));
  const blobs: [number, number, number, number, string][] = [[0, 6.0, 0, 2.3, N.leafOrange], [1.6, 6.4, 0.7, 1.7, N.leafGold], [-1.5, 6.2, -0.7, 1.7, N.leafRed], [0.3, 7.4, -0.6, 1.4, N.leafGold], [-0.4, 5.3, 1.3, 1.3, N.leafRed]];
  blobs.forEach(([x, y, z, r, c], i) => p.push(part(blob(r, 1, 0.12, 301 + i, 1.1, 0.9, 1.1), c, x, y, z)));
  paperLantern(p, 1.7, 5.0, 0.55, 0.28, 2.2);
  // a few leaves already on the ground round the trunk
  p.push(part(blob(1.6, 1, 0.1, 309, 1.3, 0.1, 1.2), '#a65a2a', 0, 0.02, 0));
  return merge(p);
}

/** Far woods: seven low-detail trees in a 16 m patch (dark pines and muted autumn rounds) read as a night tree line. */
function farWoods(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [], r = prng(313);
  for (let i = 0; i < 7; i++) {
    const x = (r() - 0.5) * 14, z = (r() - 0.5) * 14, k = 0.8 + r() * 0.6;
    if (i % 2 === 0) {
      p.push(part(lathe([[0, 0], [1.2, 1], [1.4, 3], [1.0, 6], [0.5, 8.5], [0, 10]], 6), i % 4 ? N.pine : N.pineLight, x, 0, z, 0, r() * 3, 0, k, k, k));
    } else {
      p.push(part(cyl(0.25, 0.35, 3, 5), N.bark, x, 1.2 * k, z, 0, 0, 0, k, k, k));
      p.push(part(ico(2.2, 0), [N.leafOrange, '#9a5a3a', N.leafPlum][i % 3]!, x, 4.0 * k, z, 0, r() * 3, 0, k * 1.1, k * 0.9, k * 1.1));
    }
  }
  return merge(p);
}

/** Autumn shrub: three round leaf blobs (orange, red, plum) with two little pumpkins at its foot. */
function autumnShrub(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [
    part(blob(0.85, 1, 0.1, 321, 1.15, 0.85, 1.1), N.leafOrange, 0, 0.6, 0),
    part(blob(0.62, 1, 0.1, 323), N.leafRed, 0.55, 0.78, 0.3),
    part(blob(0.55, 1, 0.1, 325, 1, 0.85, 1), N.leafPlum, -0.5, 0.52, -0.25),
  ];
  pumpkin(p, 0.75, -0.05, -0.6, 0.3, 327);
  return merge(p);
}

/** Toy festival grandstand: five timber tiers with violet / pumpkin seats, a costumed crowd and a lantern-lit canopy. */
function festivalStand(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  const L = 24, r = prng(331);
  const SEATS = [N.pumpkin, N.violet, N.cream, '#5d7fb8', N.leafGold];
  for (let i = 0; i < 5; i++) {
    const x = -1.6 - i * 1.25, top = 0.55 + i * 0.5;
    p.push(part(box(1.25, top + 0.6, L), '#6a5a7e', x, (top - 0.6) / 2, 0));
    for (let k = 0; k < 12; k++) p.push(part(box(0.5, 0.18, 1.8), SEATS[(i + k) % SEATS.length]!, x + 0.2, top + 0.09, -L / 2 + 1 + k * 2));
    for (let k = 0; k < 7; k++) {
      if (r() < 0.25) continue;
      const z = -L / 2 + 1.2 + k * 3.4 + r() * 1.2, col = ['#e0476b', '#5d7fb8', N.leafGold, N.cream, N.moss, '#b57cff'][Math.floor(r() * 6)]!;
      const hx = x + 0.15, hy = top + 0.9;
      p.push(part(rbox(0.42, 0.55, 0.42, 0.12, 1), col, hx, top + 0.46, z), part(sph(0.2, 8, 6), ['#f0c9a0', '#c98e62', '#8a5a3c'][k % 3]!, hx, hy, z));
      if (k % 3 === 0) p.push(part(cyl(0.34, 0.34, 0.04, 10), N.ink, hx, hy + 0.14, z), part(cone(0.17, 0.5, 8), N.ink, hx, hy + 0.4, z, 0, 0, 0.25)); // witch hats
      else if (k % 3 === 1) pumpkin(p, hx - 0.05, hy - 0.2, z, 0.24, 333 + k); // pumpkin masks
    }
  }
  const back = -1.6 - 5 * 1.25;
  p.push(part(box(0.3, 5.4, L + 0.6), N.indigo, back - 0.15, 2.1, 0));
  p.push(part(box(0.25, 1.0, L), N.cream, -0.85, 0.5, 0), part(box(0.06, 0.4, L - 0.2), N.pumpkin, -0.7, 0.75, 0));
  for (const z of [-L / 2 + 0.4, -L / 6, L / 6, L / 2 - 0.4]) p.push(part(cyl(0.12, 0.12, 5.6, 8), C.woodDark, -0.9, 2.8, z));
  for (let k = 0; k < 12; k++) p.push(part(box(8.6, 0.22, L / 12 + 0.02), k % 2 ? N.violet : N.pumpkin, back / 2 - 0.4, 5.85, -L / 2 + (k + 0.5) * (L / 12), 0, 0, -0.12));
  for (let k = 0; k < 9; k++) paperLantern(p, -0.7, 5.35, -L / 2 + 1.5 + k * 2.6, 0.26, 2.2);
  p.push(paint(place(sparkleGeometry(0.9, 0.08, 9), -0.6, 4.3, 0, 0, Math.PI / 2, 0), N.pumpkin));
  return merge(p);
}

/** Costumed crowd behind the barrier: witch hats, a sheet ghost, pumpkin heads, lanterns on sticks and a banner. */
function costumeCrowd(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [], r = prng(341);
  const shirts = ['#e0476b', '#5d7fb8', N.leafGold, N.cream, N.moss, '#b57cff', N.pumpkin];
  for (let i = 0; i < 9; i++) {
    const z = -2.4 + i * 0.6 + (r() - 0.5) * 0.2, x = -0.2 - r() * 0.9, hgt = 0.85 + r() * 0.3;
    if (i === 4) { // a friendly sheet ghost
      p.push(part(lathe([[0, 1.9], [0.35, 1.8], [0.45, 1.4], [0.48, 0.5], [0.55, 0.35], [0, 0.35]], 10), hdr('#f4fbff', 1.15), x, 0, z));
      p.push(part(box(0.04, 0.16, 0.07), N.ink, x + 0.44, 1.5, z - 0.11), part(box(0.04, 0.16, 0.07), N.ink, x + 0.44, 1.5, z + 0.11));
      continue;
    }
    p.push(part(rbox(0.42, hgt, 0.36, 0.12, 1), shirts[i % shirts.length]!, x, 0.35 + hgt / 2, z));
    const hy = 0.55 + hgt;
    if (i % 3 === 0) { pumpkin(p, x - 0.05, hy - 0.22, z, 0.24, 343 + i); jackFace(p, x - 0.05, hy - 0.22, z, 0.24); }
    else {
      p.push(part(sph(0.21, 8, 6), ['#f0c9a0', '#c98e62', '#8a5a3c'][i % 3]!, x, hy, z));
      if (i % 3 === 1) p.push(part(cyl(0.34, 0.34, 0.04, 10), N.ink, x, hy + 0.15, z), part(cone(0.17, 0.5, 8), N.ink, x, hy + 0.42, z, 0, 0, 0.3));
    }
    if (i % 4 === 2) { p.push(part(cyl(0.02, 0.02, 1.0, 4), C.woodDark, x + 0.2, 1.4 + hgt * 0.5, z + 0.2)); paperLantern(p, x + 0.2, 1.95 + hgt * 0.5, z + 0.2, 0.16, 2.2); }
  }
  p.push(part(box(0.06, 0.6, 2.6), N.violet, -0.05, 1.45, 0), part(box(0.07, 0.12, 2.6), N.pumpkin, -0.04, 1.2, 0));
  p.push(paint(place(sparkleGeometry(0.22, 0.03, 9), -0.01, 1.5, 0, 0, Math.PI / 2, 0), N.cream));
  for (const z of [-1.35, 1.35]) p.push(part(cyl(0.03, 0.03, 1.8, 5), C.woodDark, -0.08, 0.9, z));
  return merge(p);
}

/** Festival boards (local +X faces the road) on posts above the 1.1 m barrier: pumpkin, indigo chevron, cream checker. */
function festivalBoard(v: 'a' | 'b' | 'c'): THREE.BufferGeometry {
  const W = 3.0, H = 0.95, y = 1.22 + H / 2;
  const p: THREE.BufferGeometry[] = [
    part(box(0.09, y, 0.09), C.woodDark, -0.05, y / 2, -W / 2 + 0.25), part(box(0.09, y, 0.09), C.woodDark, -0.05, y / 2, W / 2 - 0.25),
    part(box(0.1, H + 0.1, W + 0.1), C.woodDark, -0.06, y, 0),
  ];
  const face = v === 'a' ? N.pumpkin : v === 'b' ? N.indigo : N.cream;
  p.push(part(box(0.04, H, W), face, 0.02, y, 0));
  if (v === 'a') {
    p.push(paint(place(sparkleGeometry(0.34, 0.03, 11), 0.05, y, -0.85, 0, Math.PI / 2, 0), N.cream));
    p.push(part(box(0.03, 0.16, 1.6), N.indigo, 0.05, y + 0.12, 0.45), part(box(0.03, 0.1, 1.2), N.indigo, 0.05, y - 0.16, 0.25));
  } else if (v === 'b') {
    // chevrons point along +Z (the travel direction once placed): on a bend's outside they point into the turn
    for (let k = 0; k < 4; k++) {
      const z = -0.9 + k * 0.6;
      p.push(part(box(0.03, 0.5, 0.14), N.pumpkin, 0.05, y + 0.14, z, -0.8, 0, 0), part(box(0.03, 0.5, 0.14), N.pumpkin, 0.05, y - 0.14, z, 0.8, 0, 0));
    }
  } else {
    for (let k = 0; k < 15; k++) p.push(part(box(0.03, 0.2, 0.2), k % 2 ? N.violet : N.pumpkin, 0.05, y - H / 2 + 0.1, -W / 2 + 0.1 + k * 0.2));
    pumpkin(p, 0.0, y - 0.15, 0, 0.22, 351);
  }
  // a little lantern on the left post so the board reads at night
  paperLantern(p, 0.15, y + H / 2 + 0.45, -W / 2 + 0.25, 0.14, 2.2);
  return merge(p);
}

export const LANTERN_DRESSING: Record<string, PropFactory> = {
  // ---- ground cover, shrubs, trees ------------------------------------------------------------------------------
  grass_tuft: {
    // autumn grass with ochre tips
    maxInstances: 6000,
    build: () => {
      const p: THREE.BufferGeometry[] = [], r = prng(361);
      for (let i = 0; i < 7; i++) {
        const a = r() * Math.PI * 2, d = r() * 0.2, h = 0.32 + r() * 0.36;
        p.push(part(cone(0.05, h, 3), [N.grass, N.grassLight, N.grassTip][i % 3]!, Math.cos(a) * d, h / 2, Math.sin(a) * d, (r() - 0.5) * 0.6, a, (r() - 0.5) * 0.6));
      }
      return { geometry: merge(p), material: leafy() };
    },
  },
  flower_patch: {
    // fallen leaves, a red toadstool and a mini pumpkin
    maxInstances: 3000,
    build: () => {
      const p: THREE.BufferGeometry[] = [], r = prng(363);
      for (let i = 0; i < 9; i++) {
        const a = r() * Math.PI * 2, d = r() * 0.6;
        p.push(part(box(0.2, 0.025, 0.13), [N.leafOrange, N.leafRed, N.leafGold][i % 3]!, Math.cos(a) * d, 0.03, Math.sin(a) * d, (r() - 0.5) * 0.4, r() * 3, (r() - 0.5) * 0.4));
      }
      p.push(part(cyl(0.05, 0.07, 0.26, 6), N.cream, 0.3, 0.13, -0.2), part(sph(0.17, 8, 4), N.cap, 0.3, 0.28, -0.2, 0, 0, 0, 1, 0.6, 1));
      for (let k = 0; k < 3; k++) p.push(part(sph(0.03, 4, 3), N.cream, 0.3 + Math.cos(k * 2.1) * 0.1, 0.37, -0.2 + Math.sin(k * 2.1) * 0.1));
      pumpkin(p, -0.35, -0.02, 0.25, 0.22, 365);
      return { geometry: merge(p), material: lit() };
    },
  },
  grass_patch: {
    // 12 × 6 m clump of the ground-cover layer for hand-placed PROP lines where PROPS rows are excluded (start line,
    // pads, item rows): autumn grass, fallen leaves, a toadstool ring, mini pumpkins, a mossy stone
    maxInstances: 80,
    build: () => {
      const p: THREE.BufferGeometry[] = [], r = prng(367);
      for (let t = 0; t < 26; t++) {
        const cx = -r() * 6, cz = (r() - 0.5) * 12, k = 1 + r() * 0.8;
        for (let i = 0; i < 7; i++) { const a = r() * Math.PI * 2, d = r() * 0.2 * k, h = (0.32 + r() * 0.36) * k; p.push(part(cone(0.05 * k, h, 3), [N.grass, N.grassLight, N.grassTip][i % 3]!, cx + Math.cos(a) * d, h / 2, cz + Math.sin(a) * d, (r() - 0.5) * 0.6, a, (r() - 0.5) * 0.6)); }
      }
      for (let i = 0; i < 30; i++) p.push(part(box(0.2, 0.025, 0.13), [N.leafOrange, N.leafRed, N.leafGold][i % 3]!, -r() * 6, 0.03, (r() - 0.5) * 12, 0, r() * 3, 0));
      for (let i = 0; i < 4; i++) { const x = -3.8 + Math.cos(i * 1.57) * 0.5, z = 2.4 + Math.sin(i * 1.57) * 0.5; p.push(part(cyl(0.05, 0.07, 0.26, 6), N.cream, x, 0.13, z), part(sph(0.16, 8, 4), N.cap, x, 0.28, z, 0, 0, 0, 1, 0.6, 1)); }
      pumpkin(p, -1.6, -0.02, -3.2, 0.32, 369); pumpkin(p, -2.2, -0.02, -2.6, 0.22, 370); pumpkin(p, -4.6, -0.02, 4.4, 0.28, 371);
      p.push(part(blob(0.6, 0, 0.15, 372, 1.3, 0.75, 1.0), N.stone, -2.9, 0.25, 4.6), part(blob(0.45, 0, 0.1, 373, 1.2, 0.25, 1.0), N.moss, -2.9, 0.55, 4.6));
      return { geometry: merge(p), material: lit() };
    },
  },
  bush_round: { maxInstances: 1500, build: () => ({ geometry: autumnShrub(), material: lit(), castShadow: true }) },
  rock_cluster: {
    // mossy lilac-grey stones
    maxInstances: 800,
    build: () => ({
      geometry: merge([
        part(blob(0.7, 0, 0.15, 371, 1.3, 0.75, 1.0), N.stone, 0, 0.3, 0),
        part(blob(0.45, 0, 0.15, 373, 1.1, 0.7, 1), N.stoneDark, 0.8, 0.18, 0.3),
        part(blob(0.3, 0, 0.15, 375, 1, 0.8, 1.2), N.stone, -0.6, 0.12, 0.5),
        part(blob(0.55, 0, 0.1, 377, 1.2, 0.25, 1.0), N.moss, 0.05, 0.62, 0),
      ]), material: lit(), castShadow: true,
    }),
  },
  tree_round_big: { maxInstances: 800, build: () => ({ geometry: autumnTree(), material: lit(), castShadow: true }) },
  tree_clump: { maxInstances: 400, build: () => ({ geometry: farWoods(), material: leafy(), castShadow: true }) },
  // ---- festival furniture -----------------------------------------------------------------------------------------
  grandstand: { maxInstances: 4, build: () => ({ geometry: festivalStand(), material: lit(), castShadow: true }) },
  spectators: { maxInstances: 120, build: () => ({ geometry: costumeCrowd(), material: lit(), castShadow: true }) },
  ad_board_a: { maxInstances: 60, build: () => ({ geometry: festivalBoard('a'), material: lit(), castShadow: true }) },
  ad_board_b: { maxInstances: 60, build: () => ({ geometry: festivalBoard('b'), material: lit(), castShadow: true }) },
  ad_board_c: { maxInstances: 60, build: () => ({ geometry: festivalBoard('c'), material: lit(), castShadow: true }) },
  tyre_wall: {
    // corner wall of straw bales (two high) tied with violet ribbon, a small pumpkin on every other run
    maxInstances: 200,
    build: () => {
      const p: THREE.BufferGeometry[] = [];
      for (let h = 0; h < 2; h++) {
        p.push(part(rbox(0.9, 0.55, 1.28, 0.08, 1), h ? N.straw : N.strawDeep, 0, 0.27 + h * 0.55, 0));
        p.push(part(box(0.92, 0.57, 0.08), N.ribbon, 0, 0.27 + h * 0.55, 0.3), part(box(0.92, 0.57, 0.08), N.ribbon, 0, 0.27 + h * 0.55, -0.3));
      }
      return { geometry: merge(p), material: lit(), castShadow: true };
    },
  },
  flag_pole: {
    maxInstances: 200,
    build: () => ({
      geometry: merge([
        part(cyl(0.05, 0.06, 6.2, 6), C.woodDark, 0, 3.1, 0), part(sph(0.12, 6, 4), GLOW(2.0), 0, 6.3, 0),
        part(box(0.03, 0.95, 1.5), N.violet, 0, 5.6, 0.78), part(box(0.035, 0.24, 1.5), N.pumpkin, 0, 5.6, 0.78),
      ]), material: lit(), castShadow: true,
    }),
  },
  topiary: {
    // manor garden topiary behind the hedges: a clipped cone and a ball tree in stone planters, a lantern between
    maxInstances: 300,
    build: () => {
      const p: THREE.BufferGeometry[] = [];
      for (const [z, ball] of [[-2.2, false], [2.2, true]] as const) {
        p.push(part(cyl(0.7, 0.55, 0.8, 8), N.stoneDark, -1.2, 0.4, z), part(cyl(0.75, 0.75, 0.12, 8), N.stone, -1.2, 0.82, z));
        if (ball) p.push(part(cyl(0.1, 0.12, 1.6, 5), N.bark, -1.2, 1.6, z), part(blob(1.0, 1, 0.05, 391), '#3f7048', -1.2, 2.9, z));
        else p.push(part(cone(1.0, 3.2, 10), '#2f5a3a', -1.2, 2.4, z), part(cone(0.55, 1.2, 10), '#3f7048', -1.2, 4.2, z));
      }
      p.push(part(cyl(0.06, 0.08, 2.4, 6), C.iron, -1.2, 1.2, 0));
      paperLantern(p, -1.2, 2.9, 0, 0.24, 2.2);
      return { geometry: merge(p), material: lit(), castShadow: true };
    },
  },
  sky_lantern: {
    // five floating paper sky lanterns drifting 14–26 m up (pure decoration over the fields)
    maxInstances: 60,
    build: () => {
      const p: THREE.BufferGeometry[] = [], r = prng(381);
      for (let i = 0; i < 5; i++) {
        const x = (r() - 0.5) * 12, y = 14 + r() * 12, z = (r() - 0.5) * 12, s = 0.7 + r() * 0.5;
        p.push(part(cyl(0.45 * s, 0.32 * s, 0.9 * s, 8), GLOW(2.4), x, y, z), part(cyl(0.47 * s, 0.47 * s, 0.06, 8), C.red, x, y + 0.45 * s, z));
      }
      return { geometry: merge(p), material: lit() };
    },
  },
};
