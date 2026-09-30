// Lantern Hollow props — a cosy (never scary) autumn-night festival: smiling jack-o'-lanterns, paper-lantern posts
// and parade arches, tombstones with sleepy Clawd eyes, friendly ghosts, scarecrows, crooked lantern trees, candle
// clusters, bats, the mill, the chapel and the hill-top manor, plus the manor's garden and interior set pieces.
// Conventions (trackc props.ts): local +X faces the road, +Z runs along the track, y = 0 is road level − 0.2 m.
// Glowing parts use HDR vertex colours (see canopy_forest/shapes.ts `hdr`).
import * as THREE from 'three/webgpu';
import { MaterialLibrary } from '../../materials/library.ts';
import { merge, box, cyl, cone, ico, rbox, torus } from '../../util/geo.ts';
import type { PropFactory } from '../../props/defaults.ts';
import { CANOPY_PROPS } from '../canopy_forest/props.ts';
import { around, blob, facet, hdr, inward, lathe, part, prng, tube } from '../canopy_forest/shapes.ts';

const C = {
  indigo: '#1e1b3a', purple: '#6b4fa0', plum: '#4a3570', violet: '#8a6cc8', pumpkin: '#ff9f1c', pumpkinDeep: '#e07b12',
  stem: '#5b6b2e', leaf: '#6f8f3a', wisp: '#5ffbf1', moon: '#fff3c4', straw: '#e8c46a', strawDeep: '#c9a24a',
  wood: '#7a5234', woodDark: '#4e3322', woodPale: '#a8784e', stone: '#8f8aa3', stoneDark: '#6a6582', moss: '#6f8f5a',
  iron: '#2a2638', ivory: '#f4efe6', eye: '#141413', blush: '#ff9ec7', red: '#c9463d', cloth: '#5d7fb8', roof: '#3b2f5c',
  roofDeep: '#2b2248', hedge: '#2f5a3a', hedgeLight: '#3f7048', rose: '#e0476b', gold: '#e0b04b', white: '#f7f5ee',
} as const;
const GLOW = (k = 2.2): THREE.Color => hdr('#ffc46b', k);       // warm lantern light
const FLAME = (k = 2.6): THREE.Color => hdr('#ffd98a', k);      // candle flame
const WINDOW = (k = 1.9): THREE.Color => hdr('#ffcf7a', k);     // lit windows

const matte = (): THREE.Material => MaterialLibrary.vertexLit(0.8, 0);
const toy = (): THREE.Material => MaterialLibrary.vinyl({ rim: '#ffd9c7' });

// ------------------------------------------------------------------------------------------------ pumpkins
/** Low-poly pumpkin: 8 squashed lobes around a core, a curly stem and a leaf. */
function pumpkin(parts: THREE.BufferGeometry[], x: number, y: number, z: number, r: number, seed: number, col: string = C.pumpkin): void {
  const rnd = prng(seed);
  parts.push(...around(8, (i, a) => part(new THREE.SphereGeometry(r * 0.55, 8, 6), i % 2 ? col : C.pumpkinDeep, x + Math.cos(a) * r * 0.45, y + r * 0.62, z + Math.sin(a) * r * 0.45, 0, -a, 0, 0.75, 1.05, 1)));
  parts.push(part(new THREE.SphereGeometry(r * 0.7, 8, 6), col, x, y + r * 0.62, z, 0, 0, 0, 1, 0.9, 1));
  parts.push(part(tube([[x, y + r * 1.1, z], [x + r * 0.08, y + r * 1.35, z + r * 0.05], [x + r * 0.22, y + r * 1.45, z + r * 0.12]], r * 0.07, 4, 4), C.stem));
  parts.push(part(new THREE.CircleGeometry(r * 0.28, 5), C.leaf, x - r * 0.2, y + r * 1.13, z + r * 0.15, -Math.PI / 2 + 0.3, 0, rnd() * 6));
}
/** Carved pumpkin facing +X: glowing slot eyes and a small smile (friendly, Clawd-style). */
function jackFace(parts: THREE.BufferGeometry[], x: number, y: number, z: number, r: number): void {
  const fx = x + r * 0.95, cy = y + r * 0.72;
  parts.push(part(box(0.06, r * 0.34, r * 0.14), GLOW(2.6), fx, cy, z - r * 0.24), part(box(0.06, r * 0.34, r * 0.14), GLOW(2.6), fx, cy, z + r * 0.24));
  for (let i = 0; i < 5; i++) {
    const t = (i - 2) / 2, zz = z + t * r * 0.32, yy = y + r * 0.38 - (1 - t * t) * r * 0.08;
    parts.push(part(box(0.06, r * 0.09, r * 0.13), GLOW(2.4), fx - Math.abs(t) * r * 0.06, yy, zz));
  }
}
function jackOLantern(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  pumpkin(parts, 0, 0, 0, 0.95, 3); jackFace(parts, 0, 0, 0, 0.95);
  pumpkin(parts, -0.6, 0, 1.4, 0.6, 5); jackFace(parts, -0.6, 0, 1.4, 0.6);
  pumpkin(parts, 0.3, 0, -1.3, 0.45, 7, '#ffb347');
  parts.push(part(blob(1.8, 1, 0.2, 9, 1.4, 0.2, 1.6), C.strawDeep, -0.2, -0.05, 0));
  return merge(parts);
}
function pumpkinPatch(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rnd = prng(11);
  parts.push(part(blob(4.2, 1, 0.15, 13, 1.4, 0.12, 1.2), '#3c4a2c', 0, -0.1, 0));
  for (let i = 0; i < 7; i++) {
    const a = rnd() * 6.28, d = rnd() * 3.8;
    pumpkin(parts, Math.cos(a) * d, 0, Math.sin(a) * d, 0.45 + rnd() * 0.55, 17 + i, i % 3 ? C.pumpkin : '#ffb347');
  }
  for (let i = 0; i < 5; i++) parts.push(part(tube([[0, 0.1, 0], [(rnd() - 0.5) * 5, 0.25, (rnd() - 0.5) * 5], [(rnd() - 0.5) * 8, 0.1, (rnd() - 0.5) * 8]], 0.06, 6, 3), C.stem));
  return merge(parts);
}

// ------------------------------------------------------------------------------------------------ lanterns
/** Paper lantern (glowing body, dark caps) hanging from point (x, y, z). */
function paperLantern(parts: THREE.BufferGeometry[], x: number, y: number, z: number, r: number, k = 2.2): void {
  parts.push(part(cyl(0.015, 0.015, 0.5, 3), C.iron, x, y - 0.25, z));
  parts.push(part(new THREE.SphereGeometry(r, 8, 6), GLOW(k), x, y - 0.5 - r * 0.9, z, 0, 0, 0, 1, 1.25, 1));
  parts.push(part(cyl(r * 0.5, r * 0.55, r * 0.25, 8), C.red, x, y - 0.5 - r * 0.02, z), part(cyl(r * 0.55, r * 0.5, r * 0.25, 8), C.red, x, y - 0.5 - r * 1.8, z));
  parts.push(part(cyl(0.02, 0.02, r * 0.6, 3), C.gold, x, y - 0.5 - r * 2.2, z));
}
function lanternPost(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(part(facet(cyl(0.16, 0.22, 7, 6)), C.woodDark, 0, 1.5, 0));
  parts.push(part(box(1.8, 0.16, 0.16), C.woodDark, 0.8, 4.6, 0));
  parts.push(part(box(0.1, 0.9, 0.1), C.woodDark, 0.3, 4.2, 0, 0, 0, -0.7));
  paperLantern(parts, 1.5, 4.55, 0, 0.42, 2.4);
  pumpkin(parts, -0.4, 0, 0.3, 0.45, 23); jackFace(parts, -0.4, 0, 0.3, 0.45);
  return merge(parts);
}
/**
 * Parade arch over the road (the swinging-gate fallback: gates fixed open). Placed centred on the road with a
 * negative PROPS offset; posts stand ≥ 13 m out so even a 0.85-scaled arch clears a 17 m road plus shoulders.
 */
function lanternArch(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const X = 14.5, H = 9;
  for (const x of [-X, X]) {
    parts.push(part(facet(rbox(1.1, H + 2, 1.1, 0.2, 2)), C.woodDark, x, H / 2 - 1, 0));
    parts.push(part(cone(1.0, 1.6, 4), C.roof, x, H + 1.6, 0, 0, Math.PI / 4, 0));
    paperLantern(parts, x * 0.93, H - 1.2, 0.9, 0.35, 2.2);
    pumpkin(parts, x * 1.06, 0, 0.9, 0.7, 29 + x); jackFace(parts, x * 1.06, 0, 0.9, 0.7);
  }
  // arched beam
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12, xx = -X + t * 2 * X; pts.push([xx, H + Math.sin(t * Math.PI) * 2.2, 0]); }
  parts.push(part(tube(pts, 0.35, 16, 5), C.wood));
  parts.push(part(tube(pts.map(([x, y]) => [x, y + 0.9, 0] as [number, number, number]), 0.15, 16, 4), C.pumpkinDeep));
  // hanging lanterns + bunting flags
  for (let i = 1; i < 8; i++) {
    const t = i / 8, xx = -X + t * 2 * X, yy = H + Math.sin(t * Math.PI) * 2.2;
    paperLantern(parts, xx, yy - 0.3, 0, 0.42 + (i % 2) * 0.1, 2.3);
  }
  for (let i = 0; i < 14; i++) {
    const t = (i + 0.5) / 14, xx = -X + t * 2 * X, yy = H + Math.sin(t * Math.PI) * 2.2 - 0.45;
    parts.push(part(cone(0.35, 0.8, 3), [C.pumpkin, C.purple, C.wisp][i % 3]!, xx, yy - 0.3, 0.25, Math.PI, 0, 0, 1, 1, 0.2));
  }
  return merge(parts);
}
/** String of small lanterns between two tall poles, strung along the roadside (lantern lane). */
function lanternString(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const z of [-5, 5]) parts.push(part(facet(cyl(0.12, 0.16, 8, 5)), C.woodDark, 0, 2.5, z));
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([0, 6.4 - Math.sin(t * Math.PI) * 1.0, -5 + t * 10]); }
  parts.push(part(tube(pts, 0.03, 10, 3), C.iron));
  for (let i = 1; i < 10; i += 2) { const t = i / 10; paperLantern(parts, 0, 6.4 - Math.sin(t * Math.PI) * 1.0, -5 + t * 10, 0.28, 2.1); }
  return merge(parts);
}

/** Creek-bridge railing: timber rail with a lantern on every other post (9.8 m so every-8 m rows overlap). */
function bridgeRail(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const z of [-4.6, 0, 4.6]) parts.push(part(facet(cyl(0.2, 0.24, 3.4, 6)), C.woodDark, 0.1, 0.0, z));
  parts.push(part(box(0.3, 0.28, 9.8), C.wood, 0.1, 1.25, 0), part(box(0.2, 0.18, 9.6), C.woodPale, 0.1, 0.6, 0));
  parts.push(part(box(0.1, 0.9, 0.1), C.woodDark, 0.1, 2.1, 0));
  paperLantern(parts, 0.35, 2.5, 0, 0.3, 2.3);
  return merge(parts);
}

/** Creek under the bridge hop: a glossy water ribbon across the gap (local X runs across the road), stones, reeds. */
function creek(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rnd = prng(221);
  parts.push(part(new THREE.PlaneGeometry(80, 9), '#27406e', 0, 0, 0, -Math.PI / 2, 0, 0));
  parts.push(part(new THREE.PlaneGeometry(80, 1.2), '#5d7fb8', 0, 0.02, 4.2, -Math.PI / 2, 0, 0), part(new THREE.PlaneGeometry(80, 1.2), '#5d7fb8', 0, 0.02, -4.2, -Math.PI / 2, 0, 0));
  for (let i = 0; i < 14; i++) parts.push(part(blob(0.6 + rnd() * 0.7, 0, 0.3, 223 + i, 1.2, 0.5, 1), i % 2 ? C.stone : C.stoneDark, (rnd() - 0.5) * 70, 0.1, (rnd() > 0.5 ? 1 : -1) * (4.5 + rnd())));
  for (let i = 0; i < 16; i++) { const x = (rnd() - 0.5) * 70, z = (rnd() > 0.5 ? 1 : -1) * (5 + rnd() * 1.5); parts.push(part(cyl(0.04, 0.05, 1.8, 4), C.leaf, x, 0.8, z), part(cyl(0.1, 0.1, 0.4, 5), C.woodDark, x, 1.7, z)); }
  return merge(parts);
}

// ------------------------------------------------------------------------------------------------ graveyard
/** Three smiling tombstones (rounded, cross, square) with sleepy slot eyes, blush and grass tufts. */
function gravestones(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const face = (x: number, y: number, z: number, s: number): void => {
    parts.push(part(box(0.05, 0.2 * s, 0.09 * s), C.eye, x, y, z - 0.14 * s), part(box(0.05, 0.2 * s, 0.09 * s), C.eye, x, y, z + 0.14 * s));
    parts.push(part(box(0.04, 0.06 * s, 0.12 * s), C.blush, x, y - 0.18 * s, z - 0.3 * s), part(box(0.04, 0.06 * s, 0.12 * s), C.blush, x, y - 0.18 * s, z + 0.3 * s));
  };
  // rounded
  parts.push(part(rbox(0.35, 1.3, 1.0, 0.12, 2), C.stone, 0, 0.4, 0), part(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 10, 1, false, 0, Math.PI), C.stone, 0, 1.05, 0, 0, 0, Math.PI / 2));
  face(0.19, 0.85, 0, 1);
  // cross
  parts.push(part(rbox(0.3, 1.6, 0.35, 0.08, 2), C.stoneDark, 0.3, 0.55, 1.6), part(rbox(0.3, 0.3, 1.1, 0.08, 2), C.stoneDark, 0.3, 1.0, 1.6));
  face(0.46, 0.98, 1.6, 0.7);
  // square, leaning
  parts.push(part(rbox(0.32, 1.1, 0.9, 0.1, 2), C.stone, -0.2, 0.3, -1.5, 0, 0, 0.12));
  face(-0.02, 0.55, -1.5, 0.9);
  for (let i = 0; i < 4; i++) parts.push(part(cone(0.18, 0.45, 4), C.moss, 0.4, 0.05, -2 + i * 1.2));
  parts.push(part(blob(1.8, 1, 0.1, 31, 1.2, 0.12, 2.2), '#3c4a2c', 0, -0.1, 0));
  return merge(parts);
}
/** Wrought-iron fence section (9.6 m so sections placed every 8 m overlap at any PROPS scale ≥ 0.85). */
function ironFence(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 17; i++) {
    const z = -4.8 + i * 0.6;
    parts.push(part(box(0.06, 1.7, 0.06), C.iron, 0, 0.35, z));
    parts.push(part(cone(0.07, 0.22, 4), C.iron, 0, 1.3, z));
  }
  parts.push(part(box(0.08, 0.08, 9.6), C.iron, 0, 1.0, 0), part(box(0.08, 0.08, 9.6), C.iron, 0, 0.2, 0));
  for (const z of [-4.8, 0, 4.8]) {
    parts.push(part(box(0.3, 2.2, 0.3), C.stoneDark, 0, 0.3, z));
    parts.push(part(new THREE.SphereGeometry(0.2, 6, 4), C.pumpkin, 0, 1.55, z));
  }
  return merge(parts);
}
/** Friendly floating ghost with Clawd slot eyes and stubby arms (drifts over the graveyard; no collision). */
function ghost(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const body = hdr('#f4fbff', 1.35);
  parts.push(part(lathe([[0.0, 2.9], [0.55, 2.75], [0.72, 2.3], [0.7, 1.6], [0.78, 1.2], [0.6, 1.05], [0.4, 1.2], [0.2, 1.0], [0.0, 1.1]], 12), body, 0, 0, 0));
  parts.push(part(sphere(0.2), body, 0.25, 1.9, -0.72, 0, 0, 0, 1, 0.8, 1.2), part(sphere(0.2), body, 0.25, 1.9, 0.72, 0, 0, 0, 1, 0.8, 1.2));
  parts.push(part(box(0.06, 0.28, 0.12), C.eye, 0.69, 2.25, -0.18), part(box(0.06, 0.28, 0.12), C.eye, 0.69, 2.25, 0.18));
  parts.push(part(box(0.04, 0.07, 0.14), C.blush, 0.68, 2.02, -0.38), part(box(0.04, 0.07, 0.14), C.blush, 0.68, 2.02, 0.38));
  return merge(parts);
}
function sphere(r: number): THREE.BufferGeometry { return new THREE.SphereGeometry(r, 8, 6); }

// ------------------------------------------------------------------------------------------------ countryside
/** Crooked lantern tree: twisted dark trunk, bare curling branches, a few plum leaf tufts and hanging lanterns. */
function crookedTree(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(part(tube([[0, -2, 0], [0.4, 2, 0.2], [-0.5, 5, -0.3], [0.3, 8, 0.4], [1.2, 10, 0.2]], 0.55, 12, 6), C.woodDark));
  const br: [number, number, number][][] = [
    [[0.3, 6, 0.2], [2.5, 7.5, 1], [3.8, 7.2, 2.4], [4.4, 7.9, 2.8]], [[-0.3, 7, -0.2], [-2.8, 8.2, -1.2], [-4.2, 7.6, -1.0], [-4.8, 8.2, -0.4]],
    [[0.8, 9, 0.3], [2.0, 11, -1.5], [1.4, 12.2, -2.6]], [[0, 8, 0], [-1.2, 10.4, 2.2], [-0.4, 11.4, 3.2]],
  ];
  for (const b of br) parts.push(part(tube(b, 0.22, 8, 5), C.woodDark));
  for (const [x, y, z] of [[4.4, 8.2, 2.8], [-4.8, 8.5, -0.4], [1.4, 12.5, -2.6], [-0.4, 11.8, 3.2], [1.3, 10.4, 0.2]] as const) parts.push(part(blob(1.2, 0, 0.3, 37 + x, 1.2, 0.8, 1.2), x > 0 ? C.plum : '#7a4a8c', x, y + 0.4, z));
  paperLantern(parts, 3.8, 7.2, 2.4, 0.3, 2.3);
  paperLantern(parts, -4.2, 7.6, -1.0, 0.3, 2.3);
  paperLantern(parts, 2.0, 10.9, -1.5, 0.26, 2.3);
  return merge(parts);
}
/** Scarecrow with a smiling pumpkin head, straw hat and patched shirt (scarecrow row). */
function scarecrow(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(part(box(0.18, 5, 0.18), C.woodDark, 0, 0.9, 0), part(box(0.16, 0.16, 3.0), C.woodDark, 0, 2.6, 0));
  parts.push(part(rbox(0.6, 1.2, 1.1, 0.2, 2), C.cloth, 0, 2.3, 0));
  parts.push(part(box(0.05, 0.3, 0.3), C.red, 0.31, 2.1, 0.2), part(box(0.05, 0.25, 0.25), C.straw, 0.31, 2.55, -0.25));
  for (const z of [-1.5, 1.5]) parts.push(part(cone(0.18, 0.5, 5), C.straw, 0, 2.6, z, Math.PI / 2 * Math.sign(z), 0, 0));
  pumpkin(parts, 0, 2.9, 0, 0.55, 41); jackFace(parts, 0, 2.9, 0, 0.55);
  parts.push(part(cyl(0.95, 0.95, 0.08, 10), C.straw, 0, 3.95, 0), part(cone(0.45, 0.7, 10), C.strawDeep, 0, 4.3, 0));
  parts.push(part(cone(0.25, 0.6, 5), C.straw, 0, 1.45, 0, Math.PI, 0, 0));
  return merge(parts);
}
function hayBales(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const bale = (x: number, y: number, z: number, ry: number): void => {
    parts.push(part(rbox(1.3, 1.0, 2.0, 0.12, 2), C.straw, x, y + 0.5, z, 0, ry, 0, 1, 1, 1, 0.08, 43));
    parts.push(part(box(1.34, 0.08, 0.1), C.strawDeep, x, y + 0.5, z - 0.5, 0, ry, 0), part(box(1.34, 0.08, 0.1), C.strawDeep, x, y + 0.5, z + 0.5, 0, ry, 0));
  };
  bale(0, -0.1, -1.1, 0); bale(0, -0.1, 1.1, 0); bale(0, 0.9, 0, 0.1); bale(1.6, -0.1, 0.2, 1.4);
  pumpkin(parts, 0.3, 1.9, 0, 0.4, 47); jackFace(parts, 0.3, 1.9, 0, 0.4);
  return merge(parts);
}
/** Candle cluster on a mossy stone (candle alley): five candles with glowing flames and drips. */
function candles(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rnd = prng(53);
  parts.push(part(blob(1.1, 1, 0.2, 57, 1.3, 0.45, 1.1), C.stoneDark, 0, 0.1, 0));
  for (let i = 0; i < 5; i++) {
    const a = rnd() * 6.28, d = rnd() * 0.7, h = 0.6 + rnd() * 1.4, x = Math.cos(a) * d, z = Math.sin(a) * d;
    parts.push(part(cyl(0.13, 0.15, h, 8), C.ivory, x, 0.45 + h / 2, z));
    parts.push(part(cone(0.07, 0.24, 5), FLAME(2.8), x, 0.6 + h + 0.12, z));
    parts.push(part(sphere(0.05), C.ivory, x + 0.12, 0.45 + h * 0.7, z));
  }
  return merge(parts);
}
/** Three little bats hanging in the air with round eyes (bat-tree corner, bat cave). */
function bats(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rnd = prng(59);
  for (let i = 0; i < 3; i++) {
    const x = (rnd() - 0.5) * 3, y = 5 + rnd() * 3, z = (rnd() - 0.5) * 5, flap = (rnd() - 0.5) * 0.6;
    parts.push(part(rbox(0.4, 0.38, 0.36, 0.14, 2), C.indigo, x, y, z));
    parts.push(part(cone(0.07, 0.2, 3), C.indigo, x, y + 0.25, z - 0.1), part(cone(0.07, 0.2, 3), C.indigo, x, y + 0.25, z + 0.1));
    for (const s of [-1, 1]) parts.push(part(new THREE.CircleGeometry(0.5, 3), C.plum, x, y, z + s * 0.5, Math.PI / 2 + flap * s, 0, s > 0 ? 0.5 : -0.5 - Math.PI, 1, 1, 1));
    parts.push(part(sphere(0.06), hdr('#fff3c4', 1.6), x + 0.19, y + 0.05, z - 0.08), part(sphere(0.06), hdr('#fff3c4', 1.6), x + 0.19, y + 0.05, z + 0.08));
  }
  return merge(parts);
}
/** Will-o'-wisps: soft cyan orbs drifting above the fields (pure emissive kind). */
function wisps(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rnd = prng(61);
  for (let i = 0; i < 6; i++) parts.push(part(new THREE.IcosahedronGeometry(0.18 + rnd() * 0.12, 1), '#ffffff', (rnd() - 0.5) * 8, 1.2 + rnd() * 3, (rnd() - 0.5) * 8));
  return merge(parts);
}

// ------------------------------------------------------------------------------------------------ landmarks
/** Gabled cottage block helper (walls, roof, windows) facing +X. */
function cottage(parts: THREE.BufferGeometry[], x: number, z: number, w: number, d: number, h: number, wall: string, lit: number): void {
  parts.push(part(box(d, h, w), wall, x, h / 2 - 1, z, 0, 0, 0, 1, 1, 1, 0.06, 67));
  parts.push(part(cone(Math.hypot(w, d) * 0.56, h * 0.7, 4), C.roof, x, h - 1 + h * 0.35, z, 0, Math.PI / 4, 0, d / Math.hypot(w, d) * 1.41, 1, w / Math.hypot(w, d) * 1.41));
  for (let i = 0; i < lit; i++) {
    const zz = z - w / 2 + (i + 0.5) * (w / lit);
    parts.push(part(box(0.1, 1.2, 0.9), WINDOW(), x + d / 2 + 0.05, h * 0.55, zz));
    parts.push(part(box(0.12, 0.12, 1.1), C.woodDark, x + d / 2 + 0.07, h * 0.55 - 0.66, zz));
  }
}
/** Hill-top manor (landmark): central hall, two towers with witch-hat roofs, glowing windows, a pumpkin-orange door. */
function manor(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(part(box(22, 16, 40), C.stoneDark, -2, 7, 0, 0, 0, 0, 1, 1, 1, 0.06, 71));
  parts.push(part(cone(24, 12, 4), C.roof, -2, 21, 0, 0, Math.PI / 4, 0, 0.65, 1, 1.18));
  for (let r = 0; r < 3; r++) for (let i = 0; i < 7; i++) {
    const z = -16 + i * 5.3, y = 2.5 + r * 4.4;
    if (r === 0 && i === 3) continue;
    parts.push(part(box(0.2, 2.4, 1.6), (i + r) % 3 === 0 ? C.roofDeep : WINDOW(), 9.05, y, z));
    parts.push(part(cone(1.0, 0.8, 3), C.stone, 9.1, y + 1.55, z, 0, 0, 0, 0.2, 1, 1.4));
  }
  parts.push(part(box(0.3, 4.5, 3.2), C.pumpkinDeep, 9.1, 1.8, 0));
  parts.push(part(new THREE.CylinderGeometry(1.6, 1.6, 0.3, 10, 1, false, 0, Math.PI), C.pumpkinDeep, 9.1, 4.05, 0, 0, 0, Math.PI / 2));
  for (const z of [-24, 24]) {
    parts.push(part(facet(cyl(5.5, 6, 26, 8)), C.stone, 0, 12, z));
    parts.push(part(cone(7, 12, 8), C.roofDeep, 0, 31, z));
    parts.push(part(tube([[0, 36.5, z], [0.6, 38, z + 0.3], [1.8, 38.6, z + 0.8]], 0.25, 6, 4), C.roofDeep));
    for (let k = 0; k < 4; k++) parts.push(part(box(0.2, 2, 1.2), WINDOW(), 5.6, 6 + k * 5, z));
  }
  parts.push(part(box(2.2, 7, 2.2), C.stoneDark, -8, 24, 10), part(box(2.2, 7, 2.2), C.stoneDark, -5, 24, -12));
  // porch pumpkins
  for (const z of [-3.2, 3.2]) { pumpkin(parts, 11, -0.2, z, 0.9, 73 + z); jackFace(parts, 11, -0.2, z, 0.9); }
  parts.push(part(box(8, 30, 60), C.stoneDark, -14, -12, 0));
  return merge(parts);
}
function chapel(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(part(box(14, 8, 9), C.stone, 0, 3, 0, 0, 0, 0, 1, 1, 1, 0.06, 79));
  parts.push(part(cone(9.5, 6, 4), C.roof, 0, 10, 0, 0, Math.PI / 4, 0, 1.08, 1, 0.7));
  parts.push(part(box(4.2, 14, 4.2), C.stoneDark, 5.2, 6, 0));
  parts.push(part(cone(3.4, 7, 4), C.roofDeep, 5.2, 16.5, 0, 0, Math.PI / 4, 0));
  parts.push(part(new THREE.CircleGeometry(1.1, 10), WINDOW(2.1), 7.35, 9.5, 0, 0, Math.PI / 2, 0));
  parts.push(part(torus(1.1, 0.15, 4, 12), C.ivory, 7.35, 9.5, 0, 0, Math.PI / 2, 0));
  parts.push(part(box(0.2, 3.2, 1.8), C.pumpkinDeep, 7.35, 1.2, 0));
  for (const z of [-3, 3]) parts.push(part(box(3, 2.4, 0.2), WINDOW(1.7), -2, 4, z * 1.52));
  return merge(parts);
}
function mill(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  cottage(parts, 0, 0, 10, 8, 7, C.woodPale, 3);
  parts.push(part(box(3, 12, 3), C.stoneDark, -2, 5, 5));
  const wheel: THREE.BufferGeometry[] = [];
  wheel.push(part(torus(4.2, 0.3, 4, 16), C.wood, 0, 0, 0), part(torus(2.0, 0.2, 4, 12), C.wood, 0, 0, 0));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; wheel.push(part(box(0.3, 4.2, 0.3), C.woodDark, Math.cos(a) * 2.1, Math.sin(a) * 2.1, 0, 0, 0, a + Math.PI / 2)); wheel.push(part(box(1.4, 0.2, 1.0), C.woodDark, Math.cos(a) * 4.3, Math.sin(a) * 4.3, 0, 0, 0, a)); }
  for (const g of wheel) parts.push(g.translate(4.8, 3.2, -7.5));
  parts.push(part(new THREE.PlaneGeometry(10, 2.5), '#2f4f7a', 5, -0.4, -7.5, -Math.PI / 2, 0, 0));
  return merge(parts);
}

// ------------------------------------------------------------------------------------------------ manor grounds + interior
/** Clipped hedge wall with a stone plinth (garden terraces; 9.6 m so rows every 8 m overlap). */
function hedge(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(part(rbox(1.8, 2.4, 9.6, 0.4, 2), C.hedge, 0.2, 1.2, 0, 0, 0, 0, 1, 1, 1, 0.08, 83));
  parts.push(part(box(2.2, 12, 9.8), C.stoneDark, 0.2, -6, 0));
  for (const z of [-3, 3]) parts.push(part(sphere(0.35), C.rose, 1.1, 1.6 + (z > 0 ? 0.3 : 0), z));
  return merge(parts);
}
function roseBush(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [part(blob(1.2, 1, 0.2, 89, 1.2, 0.9, 1.2), C.hedgeLight, 0, 0.8, 0)];
  const rnd = prng(97);
  for (let i = 0; i < 9; i++) { const a = rnd() * 6.28, e = rnd() * 1.1; parts.push(part(ico(0.18, 0), i % 3 ? C.rose : C.white, Math.cos(a) * 1.3 * Math.cos(e), 0.8 + Math.sin(e) * 1.05, Math.sin(a) * 1.3 * Math.cos(e))); }
  return merge(parts);
}
function fountain(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(part(cyl(6, 6.4, 1.1, 16), C.stone, 0, 0.3, 0), part(new THREE.CircleGeometry(5.5, 16), '#3a5d9a', 0, 0.87, 0, -Math.PI / 2, 0, 0));
  parts.push(part(cyl(0.8, 1.2, 3.5, 8), C.stone, 0, 2, 0), part(cyl(2.4, 1.8, 0.5, 12), C.stone, 0, 3.8, 0));
  parts.push(part(blob(0.9, 1, 0.1, 101, 1, 1.2, 1), hdr('#bfefff', 1.4), 0, 4.8, 0));
  for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28; parts.push(part(sphere(0.25), hdr('#d8f7ff', 1.3), Math.cos(a) * 2.6, 3.2, Math.sin(a) * 2.6)); }
  return merge(parts);
}
function gazebo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(part(cyl(5.2, 5.4, 0.6, 8), C.stone, 0, 0.1, 0));
  parts.push(...around(8, (_, a) => part(cyl(0.2, 0.2, 4.2, 6), C.white, Math.cos(a) * 4.6, 2.4, Math.sin(a) * 4.6)));
  parts.push(part(cone(6.2, 3.6, 8), C.roof, 0, 6.3, 0), part(sphere(0.4), C.gold, 0, 8.3, 0));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.28 + 0.39; paperLantern(parts, Math.cos(a) * 4.5, 4.4, Math.sin(a) * 4.5, 0.25, 2.2); }
  return merge(parts);
}
/** Candelabra: tall iron stand with five glowing candles (ballroom, corridor). */
function candelabra(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(part(cyl(0.6, 0.9, 0.3, 8), C.iron, 0, 0.1, 0), part(cyl(0.1, 0.14, 4.5, 6), C.gold, 0, 2.4, 0));
  parts.push(part(new THREE.TorusGeometry(1.1, 0.07, 4, 12, Math.PI), C.gold, 0, 4.5, 0, 0, Math.PI / 2, Math.PI));
  for (const z of [-1.1, -0.55, 0, 0.55, 1.1]) {
    const y = 4.6 + (z === 0 ? 0.6 : Math.abs(z) < 1 ? 0.25 : 0);
    parts.push(part(cyl(0.1, 0.1, 0.7, 6), C.ivory, 0, y + 0.35, z), part(cone(0.07, 0.25, 5), FLAME(3), 0, y + 0.82, z));
  }
  return merge(parts);
}
/** Portrait frame on a stand: a Clawd portrait (parametric blocky figure, no real artwork) facing +X. */
function portrait(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(part(box(0.3, 4.2, 3.4), C.gold, 0, 3.6, 0), part(box(0.34, 3.6, 2.8), C.plum, 0.02, 3.6, 0));
  parts.push(part(box(0.1, 1.2, 1.7), '#d87656', 0.2, 3.5, 0));
  parts.push(part(box(0.1, 0.34, 0.14), C.eye, 0.26, 3.65, -0.4), part(box(0.1, 0.34, 0.14), C.eye, 0.26, 3.65, 0.4));
  parts.push(part(cone(0.5, 0.6, 5), C.gold, 0.25, 4.4, 0, 0, 0, -Math.PI / 2 + Math.PI / 2));
  parts.push(part(box(0.2, 1.5, 0.2), C.woodDark, -0.3, 0.75, -1.0), part(box(0.2, 1.5, 0.2), C.woodDark, -0.3, 0.75, 1.0));
  return merge(parts);
}
/** Giant cutlery laid beside the giant table: fork, knife and spoon (the ballroom is toy-scale). */
function giantCutlery(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const silver = '#c9c6d6';
  parts.push(part(rbox(1.0, 0.3, 9, 0.12, 2), silver, 0, 0.15, -3, 0, 0, 0));
  for (let i = 0; i < 4; i++) parts.push(part(box(0.18, 0.28, 3), silver, -0.45 + i * 0.3, 0.15, 2.8));
  parts.push(part(box(1.2, 0.3, 1.0), silver, 0, 0.15, 1.2));
  parts.push(part(rbox(1.1, 0.3, 7, 0.12, 2), silver, 2.6, 0.15, -3.5), part(rbox(1.5, 0.22, 6, 0.3, 2), '#dcdae6', 2.6, 0.12, 3.2));
  parts.push(part(rbox(0.9, 0.3, 8, 0.12, 2), silver, -2.8, 0.15, -3), part(new THREE.SphereGeometry(1.4, 10, 6), '#dcdae6', -2.8, 0.2, 2.6, 0, 0, 0, 1, 0.25, 1.4));
  return merge(parts);
}
/** Chandelier (static: the swinging-chandelier fallback) hanging from a chain 12 m up. */
function chandelier(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(part(cyl(0.06, 0.06, 6, 4), C.iron, 0, 15, 0));
  parts.push(part(torus(2.4, 0.15, 5, 16), C.gold, 0, 12, 0, Math.PI / 2, 0, 0), part(torus(1.4, 0.12, 5, 12), C.gold, 0, 12.8, 0, Math.PI / 2, 0, 0));
  parts.push(part(cone(0.7, 1.4, 8), C.gold, 0, 11.2, 0, Math.PI, 0, 0));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * 6.28, r = i % 2 ? 2.4 : 1.4, y = i % 2 ? 12 : 12.8;
    parts.push(part(cyl(0.08, 0.08, 0.4, 5), C.ivory, Math.cos(a) * r, y + 0.25, Math.sin(a) * r), part(cone(0.07, 0.22, 5), FLAME(3), Math.cos(a) * r, y + 0.55, Math.sin(a) * r));
  }
  for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28; parts.push(part(ico(0.16, 0), hdr('#e6e0ff', 1.5), Math.cos(a) * 2.0, 11.3, Math.sin(a) * 2.0)); }
  return merge(parts);
}
function coffin(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const shape = new THREE.Shape([new THREE.Vector2(-0.5, -1.2), new THREE.Vector2(0.5, -1.2), new THREE.Vector2(0.75, 0.6), new THREE.Vector2(0.4, 1.2), new THREE.Vector2(-0.4, 1.2), new THREE.Vector2(-0.75, 0.6)]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.7, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1 });
  parts.push(part(g, C.woodDark, 0, 0.8, 0, -Math.PI / 2, 0, 0));
  parts.push(part(box(0.72, 0.06, 0.12), C.gold, 0.1, 1.62, 0.3), part(box(0.12, 0.06, 0.8), C.gold, 0.1, 1.62, 0.3));
  parts.push(part(box(0.05, 0.2, 0.09), C.eye, 0.25, 1.62, -0.55, 0, 0, 0), part(box(0.05, 0.2, 0.09), C.eye, 0.45, 1.62, -0.55));
  return merge(parts);
}
function bookcase(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rnd = prng(107);
  parts.push(part(box(1.4, 9, 7), C.woodDark, -0.5, 3.5, 0));
  for (let r = 0; r < 5; r++) {
    parts.push(part(box(1.3, 0.15, 6.6), C.wood, 0.3, 0.2 + r * 1.7, 0));
    let z = -3.2;
    while (z < 3.1) { const w = 0.2 + rnd() * 0.25, h = 0.9 + rnd() * 0.6; parts.push(part(box(1.0, h, w), [C.red, C.cloth, C.leaf, C.plum, C.gold][Math.floor(rnd() * 5)]!, 0.35, 0.28 + r * 1.7 + h / 2, z + w / 2)); z += w + 0.03; }
  }
  return merge(parts);
}
/**
 * Crypt vault ring for the catacomb and corridor sections: a stone barrel vault over the road (centred with a
 * negative PROPS offset), rib arches, and a candle niche on each wall. 10 m long so every-8 m rows overlap.
 */
function cryptVault(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const R = 9.2, Lg = 10.4, cy = 1.5;
  const arc = (r: number): THREE.BufferGeometry => new THREE.CylinderGeometry(r, r, Lg, 14, 1, true, Math.PI * 0.4, Math.PI * 1.2);
  parts.push(part(inward(arc(R)), C.stoneDark, 0, cy, 0, Math.PI / 2, 0, 0, 1, 1, 1, 0.1, 109));
  parts.push(part(facet(arc(R + 0.8)), C.stone, 0, cy, 0, Math.PI / 2, 0, 0));
  parts.push(inward(part(new THREE.TorusGeometry(R - 0.1, 0.35, 4, 16, Math.PI * 1.2), C.stone, 0, cy, 2.6, 0, 0, -Math.PI * 0.1)));
  for (const x of [-7.6, 7.6]) {
    parts.push(part(cyl(0.12, 0.12, 0.6, 6), C.ivory, x * 0.98, 3.2, -2.4), part(cone(0.08, 0.24, 5), FLAME(3), x * 0.98, 3.65, -2.4));
    parts.push(part(box(0.5, 0.2, 0.8), C.stone, x, 2.85, -2.4));
  }
  return merge(parts);
}
/** Bat-cave chamber stalactites hanging from a rocky dome ring (centred over the road). */
function batCave(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rnd = prng(113);
  parts.push(part(inward(new THREE.SphereGeometry(22, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.42)), C.plum, 0, -2, 0, 0, 0, 0, 1, 0.55, 1, 0.12, 117));
  for (let i = 0; i < 26; i++) {
    const a = rnd() * 6.28, d = 4 + rnd() * 14, h = 1.5 + rnd() * 3;
    const y = -2 + 22 * 0.55 * Math.sqrt(Math.max(0, 1 - (d / 22) ** 2)) - 0.2;
    parts.push(part(cone(0.5 + rnd() * 0.6, h, 5), i % 3 ? C.stoneDark : C.plum, Math.cos(a) * d, y - h / 2, Math.sin(a) * d, Math.PI, 0, 0));
  }
  for (let i = 0; i < 8; i++) { const a = rnd() * 6.28, d = 6 + rnd() * 10; parts.push(part(ico(0.3, 0), hdr('#5ffbf1', 1.8), Math.cos(a) * d, 8 + rnd() * 2, Math.sin(a) * d)); }
  return merge(parts);
}
/** The ballroom: a giant-scale hall (inward walls, pillars, arched windows) around the table section. */
function ballroom(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const W = 110, D = 110, H = 34;
  parts.push(part(inward(new THREE.BoxGeometry(W, H, D)), C.plum, 0, H / 2 - 2, 0, 0, 0, 0, 1, 1, 1, 0.05, 119));
  // floor tiles (checker) a little under road level so the road reads as the table runner
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) parts.push(part(box(11, 0.2, 11), (i + j) % 2 ? '#3b2f5c' : '#5a4a82', -W / 2 + 5.5 + i * 11, -1.6, -D / 2 + 5.5 + j * 11));
  for (let k = 0; k < 8; k++) {
    const z = -D / 2 + 7 + k * 13.5;
    for (const x of [-W / 2 + 1.5, W / 2 - 1.5]) {
      parts.push(part(cyl(1.3, 1.5, H, 8), C.stone, x, H / 2 - 2, z));
      parts.push(part(box(0.3, 12, 5), WINDOW(1.5), x - Math.sign(x) * 0.9, 16, z + 6.7));
      parts.push(part(new THREE.CylinderGeometry(2.5, 2.5, 0.3, 10, 1, false, 0, Math.PI), WINDOW(1.5), x - Math.sign(x) * 0.9, 22, z + 6.7, 0, 0, Math.PI / 2));
    }
  }
  return merge(parts);
}
/** The giant dining table the road crosses (legs and cloth edge beside the road; the road is the runner). */
function giantTable(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(part(box(24, 1.2, 60), C.woodPale, 0, -0.95, 0));
  parts.push(part(box(24.4, 3.0, 0.3), C.red, 0, -1.9, 30.1), part(box(24.4, 3.0, 0.3), C.red, 0, -1.9, -30.1));
  parts.push(part(box(0.3, 3.0, 60), C.red, 12.1, -1.9, 0), part(box(0.3, 3.0, 60), C.red, -12.1, -1.9, 0));
  for (const x of [-10.5, 10.5]) for (const z of [-27, 27]) parts.push(part(cyl(1.0, 0.8, 14, 8), C.woodDark, x, -8.5, z));
  // table setting: plates and goblets along the edges
  for (let k = 0; k < 6; k++) for (const x of [-10.8, 10.8]) {
    const z = -25 + k * 10;
    parts.push(part(cyl(1.6, 1.4, 0.12, 14), C.white, x, -0.3, z));
    parts.push(part(lathe([[0.5, 0], [0.12, 0.2], [0.1, 1.4], [0.7, 2.1], [0.75, 3.0]], 8), C.gold, x * 0.93, -0.35, z + 4));
  }
  return merge(parts);
}

/** Gore cushion at a branch split: hay bales, a smiling pumpkin and a chevron board facing traffic (−Z). */
function goreCushion(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const [x, y, z] of [[-0.8, 0.4, 0], [0.8, 0.4, 0], [0, 1.4, 0.1]] as const) parts.push(part(rbox(1.5, 1.0, 1.9, 0.12, 2), C.straw, x, y, z, 0, 0, 0, 1, 1, 1, 0.08, 211));
  pumpkin(parts, 0, 1.9, 0.2, 0.5, 213); jackFace(parts, 0, 1.9, 0.2, 0.5);
  parts.push(part(box(2.4, 1.0, 0.12), '#1c1f26', 0, 3.4, -1.1), part(box(0.12, 1.6, 0.12), C.woodDark, 0, 2.4, -1.0));
  for (const sx of [-1, 1]) for (const dy of [-0.16, 0.16]) parts.push(part(box(0.5, 0.14, 0.05), '#ffd23f', sx * 0.55, 3.4 + dy, -1.18, 0, 0, sx * (dy > 0 ? -0.7 : 0.7)));
  return merge(parts);
}
/** Support under elevated decks: a short stone column with a lantern niche (kept under the 4 m minimum clearance). */
function stonePillar(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [part(facet(cyl(1.2, 1.5, 6, 8)), C.stoneDark, 0, 1, 0, 0, 0, 0, 1, 1, 1, 0.06, 217), part(cyl(1.6, 1.6, 0.4, 8), C.stone, 0, 3.8, 0)];
  paperLantern(parts, 1.35, 3.4, 0, 0.22, 2.2);
  return merge(parts);
}

// ------------------------------------------------------------------------------------------------ factory table
const kind = (build: () => THREE.BufferGeometry, material: () => THREE.Material, castShadow = true): PropFactory => {
  let cache: THREE.BufferGeometry | null = null;
  return { build: () => ({ geometry: (cache ??= build()), material: material(), castShadow }) };
};

export const LANTERN_PROPS: Record<string, PropFactory> = {
  jack_o_lantern: kind(jackOLantern, toy, false),
  pumpkin_patch: kind(pumpkinPatch, toy, false),
  lantern_post: kind(lanternPost, matte),
  lantern_arch: kind(lanternArch, matte),
  lantern_string: kind(lanternString, matte, false),
  bridge_rail: kind(bridgeRail, matte, false),
  creek: kind(creek, () => MaterialLibrary.vertexLit(0.12, 0), false),
  gore_cushion: kind(goreCushion, matte),
  pillar: kind(stonePillar, matte, false),
  bridge_deck: CANOPY_PROPS.bridge_deck!,
  gravestone: kind(gravestones, matte, false),
  iron_fence: kind(ironFence, matte, false),
  ghost: kind(ghost, toy, false),
  crooked_tree: kind(crookedTree, matte),
  scarecrow: kind(scarecrow, matte),
  hay_bale: kind(hayBales, matte),
  candles: kind(candles, matte, false),
  bat: kind(bats, toy, false),
  wisp: kind(wisps, () => MaterialLibrary.emissive('#8ffff6', 2.2), false),
  manor: kind(manor, matte),
  chapel: kind(chapel, matte),
  mill: kind(mill, matte),
  hedge: kind(hedge, matte),
  rose_bush: kind(roseBush, matte, false),
  fountain: kind(fountain, matte),
  gazebo: kind(gazebo, matte),
  candelabra: kind(candelabra, matte, false),
  portrait: kind(portrait, matte, false),
  giant_cutlery: kind(giantCutlery, toy, false),
  chandelier: kind(chandelier, matte, false),
  coffin: kind(coffin, matte, false),
  bookcase: kind(bookcase, matte),
  crypt_vault: kind(cryptVault, matte, false),
  bat_cave: kind(batCave, matte, false),
  ballroom: kind(ballroom, matte, false),
  giant_table: kind(giantTable, matte, false),
  // scatter aliases so shared THEME scatter lists (tree/bush/rock) resolve to the festival look
  tree: kind(crookedTree, matte),
  bush: kind(roseBush, matte, false),
  rock: kind(gravestones, matte, false),
};
