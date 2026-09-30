// Canopy Forest props: giant trunks, ferns, glossy toy mushrooms, mossy logs, the hollow-log tunnel, the pond,
// fireflies, karst pillars, waterfalls, treehouses, rope boardwalks and a sleepy panda.
// Conventions (trackc props.ts): local +X faces the road, +Z runs along the track, y = 0 is road level − 0.2 m.
// Terrain can sit up to ~1.5 m below that near the road, so every grounded prop extends a skirt down to y ≈ −2.
import * as THREE from 'three/webgpu';
import { MaterialLibrary } from '../../materials/library.ts';
import { merge, box, cyl, cone, ico, rbox, torus } from '../../util/geo.ts';
import type { PropFactory } from '../../props/defaults.ts';
import { around, blob, dome, facet, hdr, inward, lathe, part, prng, tube } from './shapes.ts';

const C = {
  bark: '#6b4226', barkDark: '#4f3019', barkLight: '#8a5a36', wood: '#b98a57', woodPale: '#d9b27c', rings: '#e2c08a',
  leaf: '#4e9f3d', leafDeep: '#3b7f31', leafLight: '#6fbf4a', moss: '#9bc53d', mossDeep: '#6f9a2e',
  cap: '#e4572e', capDeep: '#c2401f', ivory: '#f9f8f4', cream: '#f4ead2', stone: '#8d8c7c', stoneDark: '#6e6d60',
  water: '#3f9a92', waterDeep: '#2d7a78', foam: '#e8f7f2', lily: '#5aa845', pink: '#ff9ec7', gold: '#ffd23f',
  eye: '#141413', panda: '#f7f5ee', rope: '#c9a46a', coral: '#d97757',
} as const;

/** Matte low-poly world props share the default prop material (no new material slots). */
const matte = (): THREE.Material => MaterialLibrary.vertexLit(0.8, 0);
/** Glossy "vinyl toy" props share the mascot vinyl material (same params → same cached material). */
const toy = (): THREE.Material => MaterialLibrary.vinyl({ rim: '#ffd9c7' });
/** Water surfaces: one shared glossy vertex-lit slot. */
const glossy = (): THREE.Material => MaterialLibrary.vertexLit(0.12, 0);

// ------------------------------------------------------------------------------------------------ trees
function canopy(parts: THREE.BufferGeometry[], cx: number, cy: number, cz: number, r: number, n: number, seed: number): void {
  const rnd = prng(seed);
  const greens = [C.leaf, C.leafDeep, C.leafLight];
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = i === 0 ? 0 : r * (0.45 + rnd() * 0.35);
    const rr = r * (i === 0 ? 0.75 : 0.45 + rnd() * 0.2);
    parts.push(part(blob(rr, 1, 0.18, seed + i * 7, 1, 0.62, 1), greens[i % 3]!, cx + Math.cos(a) * d, cy + (rnd() - 0.3) * r * 0.35, cz + Math.sin(a) * d, 0, 0, 0, 1, 1, 1, 0.08, seed + i));
  }
}

/** Giant forest trunk (≈ 34 m): root flares, moss collars, shelf fungus, a broad canopy that shades the trail. */
function giantTrunk(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(part(facet(lathe([[3.9, -24], [3.6, -3], [3.8, 0], [3.0, 2.5], [2.5, 7], [2.3, 14], [2.1, 22], [1.7, 29], [1.2, 33]], 9)), C.bark, 0, 0, 0, 0, 0.2, 0, 1, 1, 1, 0.1, 3));
  parts.push(...around(6, (i, a) => part(facet(new THREE.BoxGeometry(3.6, 3.2, 1.3)), i % 2 ? C.barkDark : C.bark, Math.cos(a) * 3.6, -0.3, Math.sin(a) * 3.6, 0, -a, -0.35)));
  parts.push(part(blob(3.15, 1, 0.12, 11, 1, 0.35, 1), C.moss, 0, 1.4, 0, 0, 0, 0, 1, 1, 1, 0.12, 5));
  parts.push(part(blob(2.45, 1, 0.1, 12, 1, 0.3, 1), C.mossDeep, 0, 12, 0));
  // shelf fungus facing the road
  parts.push(part(dome(1.1, 8, 3, Math.PI / 2), C.cap, 2.2, 8.5, 0.6, 0, 0, -Math.PI / 2, 1, 0.35, 1));
  parts.push(part(dome(0.8, 8, 3, Math.PI / 2), C.woodPale, 2.25, 9.6, -0.4, 0, 0, -Math.PI / 2, 1, 0.3, 1));
  // branches + canopy
  parts.push(part(tube([[0, 24, 0], [4, 27, 1], [8, 29, 2]], 0.7, 6, 5), C.bark));
  parts.push(part(tube([[0, 26, 0], [-4, 29, -2], [-7, 31, -4]], 0.6, 6, 5), C.bark));
  canopy(parts, 1, 32, 0, 11, 4, 21);
  return merge(parts);
}

/** Background forest wall: three trunks under one broad canopy (cheap, for the second and third rows). */
function forestWall(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rnd = prng(177);
  for (let i = 0; i < 3; i++) {
    const x = (rnd() - 0.5) * 6, z = -7 + i * 7 + (rnd() - 0.5) * 2, h = 24 + rnd() * 8, r = 1.6 + rnd() * 0.8;
    parts.push(part(facet(lathe([[r * 1.3, -22], [r * 1.25, -3], [r * 1.3, 0], [r, 3], [r * 0.8, h * 0.6], [r * 0.55, h]], 7)), i === 1 ? C.barkDark : C.bark, x, 0, z, 0, rnd() * 3, 0));
    parts.push(part(blob(6 + rnd() * 2, 0, 0.2, 181 + i, 1.2, 0.6, 1.2), [C.leaf, C.leafDeep, C.leafLight][i]!, x + (rnd() - 0.5) * 3, h + 1, z));
  }
  parts.push(part(blob(3.5, 0, 0.3, 191, 1.8, 0.6, 3), C.leafDeep, 0, 0.8, 0));
  return merge(parts);
}

/** Old oak landmark: a massive gnarled trunk with a round door and window, a rope swing and a wide canopy. */
function oldOak(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(part(facet(lathe([[7.5, -3], [7.8, 0], [6.2, 3], [5.2, 8], [5.4, 13], [4.2, 18]], 10)), C.barkDark, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0.12, 9));
  parts.push(...around(7, (i, a) => part(tube([[Math.cos(a) * 5, 1.5, Math.sin(a) * 5], [Math.cos(a) * 8.5, 0.2, Math.sin(a) * 8.5], [Math.cos(a + 0.2) * 11, -1.2, Math.sin(a + 0.2) * 11]], 1.1, 6, 5), C.bark)));
  // door + window facing the road (+X)
  parts.push(part(new THREE.CylinderGeometry(1.4, 1.4, 0.5, 12, 1, false, 0, Math.PI), C.coral, 6.4, 2.2, 0, 0, 0, Math.PI / 2));
  parts.push(part(box(0.5, 2.2, 2.8), C.coral, 6.4, 1.1, 0));
  parts.push(part(sphere(0.18), C.gold, 6.75, 1.6, 0.8));
  parts.push(part(torus(0.85, 0.16, 6, 14), C.woodPale, 5.6, 7.4, -1.5, 0, Math.PI / 2, 0));
  parts.push(part(new THREE.CircleGeometry(0.8, 12), hdr('#ffd98a', 1.6), 5.75, 7.4, -1.5, 0, Math.PI / 2, 0));
  // limbs
  const limbs: [number, number, number][][] = [
    [[0, 15, 0], [8, 18, 3], [15, 19, 6]], [[0, 16, 0], [-7, 19, -4], [-13, 22, -8]], [[0, 17, 0], [2, 21, -8], [4, 24, -14]], [[0, 16, 0], [-2, 20, 8], [-5, 23, 13]],
  ];
  for (const l of limbs) parts.push(part(tube(l, 1.2, 8, 6), C.bark));
  // rope swing on the road-side limb
  parts.push(part(cyl(0.05, 0.05, 11, 4), C.rope, 11, 12.8, 3.4));
  parts.push(part(cyl(0.05, 0.05, 11, 4), C.rope, 11, 12.8, 5.0));
  parts.push(part(rbox(0.6, 0.15, 2.0, 0.05, 1), C.wood, 11, 7.3, 4.2));
  canopy(parts, 0, 23, 0, 17, 8, 33);
  return merge(parts);
}

function sphere(r: number): THREE.BufferGeometry { return new THREE.SphereGeometry(r, 8, 6); }

/** Fern clump: arched, tapering fronds in two greens. */
function fern(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rnd = prng(41);
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.4;
    const len = 1.5 + rnd() * 0.6;
    const col = i % 2 ? C.leaf : C.leafLight;
    // two segments: rising, then drooping — each a flattened tapered box rotated about its own pitch
    let x = 0, y = 0.1, pitch = 0.8;
    for (let k = 0; k < 2; k++) {
      const seg = len / 2, w = 0.6 - k * 0.22;
      const dx = Math.cos(pitch) * seg, dy = Math.sin(pitch) * seg;
      parts.push(part(new THREE.BoxGeometry(seg * 1.08, 0.05, w), col, Math.cos(a) * (x + dx / 2), y + dy / 2, Math.sin(a) * (x + dx / 2), 0, -a, pitch));
      x += dx; y += dy; pitch -= 1.0;
    }
  }
  parts.push(part(cone(0.25, 0.5, 5), C.mossDeep, 0, 0.1, 0));
  return merge(parts);
}

// ------------------------------------------------------------------------------------------------ mushrooms
function toadstool(parts: THREE.BufferGeometry[], x: number, z: number, h: number, r: number, seed: number, cap: string = C.cap, y0 = 0): void {
  const rnd = prng(seed);
  parts.push(part(lathe([[r * 0.28, -0.6], [r * 0.3, 0], [r * 0.22, h * 0.55], [r * 0.26, h]], 8), C.ivory, x, y0, z));
  parts.push(part(new THREE.CylinderGeometry(r * 0.9, r * 0.3, r * 0.12, 12), C.cream, x, y0 + h + 0.02, z));
  parts.push(part(dome(r, 12, 4, Math.PI * 0.46), cap, x, y0 + h, z, 0, 0, 0, 1, 0.62, 1));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rnd(), el = 0.35 + rnd() * 0.5;
    const px = Math.cos(a) * Math.sin(el) * r, py = Math.cos(el) * r * 0.62, pz = Math.sin(a) * Math.sin(el) * r;
    parts.push(part(ico(r * (0.1 + rnd() * 0.05), 0), C.ivory, x + px, y0 + h + py, z + pz, 0, 0, 0, 1, 0.45, 1));
  }
}
function mushroomCluster(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  toadstool(parts, 0, 0, 1.3, 0.85, 3);
  toadstool(parts, 0.9, 0.6, 0.8, 0.5, 5);
  toadstool(parts, -0.5, 0.9, 0.55, 0.35, 7, C.gold);
  return merge(parts);
}
/** The bounce mushrooms of the meadow: 8 m toy toadstools with a friendly face. */
function mushroomGiant(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  toadstool(parts, 0, 0, 7.5, 5.2, 13);
  // Clawd-style eye slots on the stem, facing the road
  parts.push(part(box(0.2, 1.0, 0.42), C.eye, 1.52, 3.4, -0.55), part(box(0.2, 1.0, 0.42), C.eye, 1.52, 3.4, 0.55));
  toadstool(parts, 3.2, 2.4, 2.2, 1.4, 17, C.gold);
  toadstool(parts, -2.6, -2.8, 1.5, 1.0, 19);
  return merge(parts);
}

// ------------------------------------------------------------------------------------------------ ground clutter
function mossyLog(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(part(facet(new THREE.CylinderGeometry(1.0, 1.1, 9, 9, 1, true)), C.bark, 0, 0.6, 0, Math.PI / 2, 0, 0, 1, 1, 1, 0.1, 2));
  parts.push(part(new THREE.CircleGeometry(1.0, 9), C.rings, 0, 0.6, 4.5, 0, 0, 0));
  parts.push(part(new THREE.CircleGeometry(1.1, 9), C.rings, 0, 0.6, -4.5, 0, Math.PI, 0));
  parts.push(part(torus(0.55, 0.06, 4, 12), C.barkLight, 0, 0.6, 4.52, 0, 0, 0));
  parts.push(part(blob(1.0, 1, 0.15, 23, 1.05, 0.4, 4.2), C.moss, 0, 1.45, 0));
  toadstool(parts, 0.9, 2.2, 0.5, 0.3, 29);
  toadstool(parts, 0.95, 1.4, 0.35, 0.22, 31, C.gold);
  return merge(parts);
}
function stump(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(part(facet(lathe([[1.5, -1.5], [1.6, 0], [1.2, 0.5], [1.1, 1.6], [0.0, 1.6]], 9)), C.bark, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0.1, 4));
  parts.push(part(new THREE.CylinderGeometry(1.05, 1.05, 0.05, 12), C.rings, 0, 1.62, 0));
  parts.push(part(torus(0.6, 0.05, 4, 14), C.barkLight, 0, 1.66, 0, Math.PI / 2, 0, 0));
  parts.push(part(torus(0.3, 0.04, 4, 10), C.barkLight, 0, 1.66, 0, Math.PI / 2, 0, 0));
  parts.push(part(blob(0.9, 1, 0.2, 37, 1, 0.4, 1), C.moss, -0.7, 0.3, 0.5));
  toadstool(parts, 1.2, 0.4, 0.45, 0.28, 39);
  return merge(parts);
}
function rockMoss(): THREE.BufferGeometry {
  return merge([
    part(blob(2.2, 1, 0.25, 43, 1.2, 0.8, 1), C.stone, 0, 0.6, 0, 0, 0, 0, 1, 1, 1, 0.08, 7),
    part(blob(1.9, 1, 0.2, 47, 1.25, 0.35, 1.05), C.moss, 0, 1.9, 0),
    part(blob(1.1, 1, 0.25, 49, 1, 0.8, 1), C.stoneDark, 2.2, 0.1, 1.2),
  ]);
}
function shrub(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [part(blob(1.3, 1, 0.2, 53, 1.3, 0.85, 1.1), C.leafDeep, 0, 0.7, 0, 0, 0, 0, 1, 1, 1, 0.1, 9)];
  const rnd = prng(57);
  for (let i = 0; i < 7; i++) { const a = rnd() * 6.28, e = rnd() * 0.9; parts.push(part(ico(0.13, 0), C.cap, Math.cos(a) * 1.55 * Math.cos(e), 0.7 + Math.sin(e) * 1.0, Math.sin(a) * 1.3 * Math.cos(e))); }
  return merge(parts);
}

// ------------------------------------------------------------------------------------------------ set pieces
/**
 * The hollow-log tunnel: one 70 m fallen giant laid over the tunnel straight (a single landmark instance centred on
 * the road, so the random PROPS scale only stretches it as a whole). Bark outside, pale heartwood inside with
 * growth-ring bands, thick annulus ends, moss and toadstools along the top.
 */
function hollowLog(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const R = 12.5, T = 1.3, Lg = 70, cy = 1.0;
  const rnd = prng(59);
  // CylinderGeometry puts theta = π on top once its axis is turned along Z, so the 223° arc is centred there
  const arc = (r: number, len: number): THREE.BufferGeometry => new THREE.CylinderGeometry(r, r, len, 18, 7, true, Math.PI * 0.38, Math.PI * 1.24);
  parts.push(part(facet(arc(R + T, Lg)), C.bark, 0, cy, 0, Math.PI / 2, 0, 0, 1, 1, 1, 0.12, 5));
  parts.push(part(inward(arc(R, Lg)), C.woodPale, 0, cy, 0, Math.PI / 2, 0, 0, 1, 1, 1, 0.1, 6));
  const band = (r: number, t: number, z: number, c: string): THREE.BufferGeometry =>
    part(new THREE.TorusGeometry(r, t, 4, 22, Math.PI * 1.24), c, 0, cy, z, 0, 0, -Math.PI * 0.12);
  for (let k = -3; k <= 3; k++) parts.push(band(R + T + 0.05, 0.35, k * 10 + (rnd() - 0.5) * 3, C.barkDark));
  for (let k = -3; k <= 3; k++) parts.push(inward(band(R - 0.02, 0.22, k * 10 + 5, C.wood)));
  // thick ends: annulus with growth rings
  for (const z of [-Lg / 2, Lg / 2]) {
    const face = z > 0 ? 0 : Math.PI;
    parts.push(part(new THREE.RingGeometry(R, R + T, 22, 1, Math.PI * 0.88, Math.PI * 1.24), C.rings, 0, cy, z, 0, face, 0));
    parts.push(part(new THREE.RingGeometry(R + T * 0.45, R + T * 0.55, 22, 1, Math.PI * 0.88, Math.PI * 1.24), C.barkLight, 0, cy, z + (z > 0 ? 0.02 : -0.02), 0, face, 0));
  }
  for (let k = 0; k < 6; k++) parts.push(part(blob(3.2 + rnd() * 1.5, 1, 0.2, 61 + k, 1.3, 0.35, 2.2), k % 2 ? C.moss : C.mossDeep, (rnd() - 0.5) * 4, cy + R + T - 0.1, -30 + k * 12));
  toadstool(parts, -2.2, 12, 1.4, 1.0, 67, C.cap, cy + R + T - 0.3);
  toadstool(parts, -3.2, 9.5, 0.8, 0.6, 69, C.gold, cy + R + T - 0.6);
  toadstool(parts, 2.6, -18, 1.1, 0.8, 71, C.cap, cy + R + T - 0.4);
  // a fern tuft sprouting from a knot on each flank
  parts.push(part(blob(1.4, 1, 0.25, 73, 1, 0.8, 1), C.leafLight, R + T - 0.2, cy + 5, -8), part(blob(1.4, 1, 0.25, 75, 1, 0.8, 1), C.leaf, -(R + T - 0.2), cy + 6, 14));
  return merge(parts);
}

/** Forest start gate: two log posts, a plank banner and leaf garlands (replaces the default gantry). */
function forestGantry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-10.5, 10.5]) {
    parts.push(part(facet(lathe([[1.0, -2], [1.05, 0], [0.85, 4], [0.8, 8.4]], 8)), C.bark, x, 0, 0, 0, 0, 0, 1, 1, 1, 0.1, 8));
    parts.push(part(blob(1.4, 1, 0.2, 167 + x, 1, 0.8, 1), C.leaf, x, 8.8, 0), part(blob(1.0, 1, 0.2, 171 + x, 1, 0.8, 1), C.leafLight, x * 0.93, 9.6, 0.4));
    toadstool(parts, x * 1.06, 0.8, 0.9, 0.55, 173, C.cap, 0);
  }
  parts.push(part(rbox(22, 1.9, 0.6, 0.25, 2), C.woodPale, 0, 7.2, 0));
  parts.push(part(rbox(22.6, 0.35, 0.8, 0.12, 1), C.barkLight, 0, 8.25, 0), part(rbox(22.6, 0.35, 0.8, 0.12, 1), C.barkLight, 0, 6.15, 0));
  // checkered strip on the banner (start/finish language without any text)
  for (let i = 0; i < 16; i++) parts.push(part(box(1.1, 0.5, 0.64), i % 2 ? C.ivory : '#2b2a26', -8.25 + i * 1.1, 7.2, 0));
  for (let i = 0; i < 9; i++) parts.push(part(ico(0.45, 0), i % 2 ? C.leaf : C.moss, -9 + i * 2.25, 5.75 - Math.sin((i / 8) * Math.PI) * 0.6, 0.45, 0, 0, 0, 1.3, 0.7, 0.6));
  return merge(parts);
}

/** Log-bridge railing section (the bridge wall is invisible; this is what you see). */
function logRail(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // 9.8 m long so neighbouring sections (every 8 m, random scale ≥ 0.85) always overlap
  for (const z of [-4.6, 0, 4.6]) parts.push(part(facet(new THREE.CylinderGeometry(0.28, 0.32, 3.6, 6)), C.bark, 0.1, 0.0, z));
  parts.push(part(facet(new THREE.CylinderGeometry(0.22, 0.22, 9.8, 6)), C.barkLight, 0.1, 1.2, 0, Math.PI / 2, 0, 0));
  parts.push(part(cyl(0.05, 0.05, 9.6, 4), C.rope, 0.1, 0.55, 0, Math.PI / 2, 0, 0));
  return merge(parts);
}

/**
 * Log-bridge deck: 100 m of cross planks laid over the road surface, placed once at mid-bridge. The planks sit
 * 6–12 cm above the physics road, so the bridge reads as timber without touching collision; 20 m wide so the random
 * 0.85–1.15 PROPS scale still covers a 17 m deck.
 */
function bridgeDeck(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rnd = prng(163);
  const N = 100;
  for (let k = 0; k < N; k++) {
    const z = -N / 2 + 0.5 + k, tone = rnd();
    parts.push(part(box(20 + (rnd() - 0.5) * 0.6, 0.06, 0.9), tone < 0.33 ? C.wood : tone < 0.66 ? '#a57a4b' : '#c29462', (rnd() - 0.5) * 0.3, 0.29, z));
  }
  for (let k = 0; k < 6; k++) parts.push(part(facet(new THREE.CylinderGeometry(0.55, 0.55, 22, 6)), C.bark, 0, -0.55, -45 + k * 18, 0, 0, Math.PI / 2));
  return merge(parts);
}

/** The pond by the sweeper: glossy water disc, shallows ring, lily pads with pink flowers, cattails, a stepping stone. */
function pond(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rnd = prng(71);
  parts.push(part(new THREE.CircleGeometry(11, 24), C.waterDeep, 0, -0.25, 0, -Math.PI / 2, 0, 0));
  parts.push(part(new THREE.RingGeometry(11, 13, 24, 1), C.water, 0, -0.22, 0, -Math.PI / 2, 0, 0));
  parts.push(part(new THREE.RingGeometry(13, 14, 24, 1), C.foam, 0, -0.2, 0, -Math.PI / 2, 0, 0));
  for (let i = 0; i < 12; i++) {
    const a = rnd() * 6.28, d = 3 + rnd() * 8, r = 0.8 + rnd() * 0.7;
    parts.push(part(new THREE.CircleGeometry(r, 8, 0.4, Math.PI * 1.8), C.lily, Math.cos(a) * d, -0.15, Math.sin(a) * d, -Math.PI / 2, 0, rnd() * 6));
    if (i % 3 === 0) parts.push(part(ico(0.3, 0), C.pink, Math.cos(a) * d, 0.05, Math.sin(a) * d, 0, 0, 0, 1, 0.6, 1));
  }
  for (let i = 0; i < 18; i++) {
    const a = rnd() * 6.28, d = 13.5 + rnd() * 1.5;
    const x = Math.cos(a) * d, z = Math.sin(a) * d, h = 1.6 + rnd() * 1.2;
    parts.push(part(cyl(0.04, 0.05, h, 4), C.leafDeep, x, h / 2 - 0.3, z));
    parts.push(part(cyl(0.12, 0.12, 0.5, 5), C.barkDark, x, h - 0.1, z));
  }
  parts.push(part(blob(1.6, 1, 0.2, 73, 1.2, 0.5, 1), C.stone, 5, 0, -3));
  parts.push(part(blob(1.2, 1, 0.2, 79, 1.1, 0.5, 1), C.stoneDark, 6.5, 0, -1));
  return merge(parts);
}

/** Firefly swarm: tiny glowing motes hanging in a 6 m cloud (pure emissive kind). */
function fireflies(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rnd = prng(83);
  for (let i = 0; i < 14; i++) parts.push(part(new THREE.OctahedronGeometry(0.07 + rnd() * 0.05, 0), '#ffffff', (rnd() - 0.5) * 7, 0.8 + rnd() * 3.5, (rnd() - 0.5) * 7));
  return merge(parts);
}

/** Karst pillar: a tall limestone column with ledges and a tuft of trees on top (Cascade Slalom slalom posts). */
function karstPillar(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(part(facet(lathe([[5.2, -3], [5.5, 0], [4.4, 6], [4.8, 12], [3.8, 20], [4.2, 26], [3.0, 32], [2.2, 34]], 7)), C.stone, 0, 0, 0, 0, 0.3, 0, 1, 1, 1, 0.12, 13));
  parts.push(part(blob(3.4, 1, 0.2, 89, 1.2, 0.35, 1.1), C.moss, 0, 34, 0));
  parts.push(part(blob(2.0, 1, 0.2, 97, 1, 0.3, 1), C.mossDeep, 2.8, 20.5, 1));
  parts.push(part(blob(1.6, 1, 0.2, 101, 1, 0.3, 1), C.moss, -3.2, 12.2, -1));
  canopy(parts, 0, 38, 0, 5, 4, 103);
  parts.push(part(cone(1.2, 4, 6), C.leafDeep, 1.5, 36, 1.5), part(cone(1.0, 3.4, 6), C.leaf, -1.2, 36, -1.0));
  return merge(parts);
}

/** Waterfall sheet (static stripes of white water) with a foam pool; faces the road (+X). */
function waterfall(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rnd = prng(107);
  const H = 28, Wd = 16;
  parts.push(part(facet(new THREE.BoxGeometry(6, H + 6, Wd + 10)), C.stoneDark, -3.4, H / 2 - 3, 0, 0, 0, 0, 1, 1, 1, 0.08, 17));
  for (let i = 0; i < 9; i++) {
    const z = -Wd / 2 + (i + 0.5) * (Wd / 9);
    parts.push(part(new THREE.PlaneGeometry(Wd / 9 + 0.1, H), i % 2 ? hdr('#e6fbff', 1.25) : hdr('#bfeaf2', 1.15), -0.3 + rnd() * 0.3, H / 2, z, 0, Math.PI / 2, 0));
  }
  for (let i = 0; i < 10; i++) parts.push(part(blob(1.4 + rnd(), 1, 0.3, 109 + i, 1, 0.55, 1), hdr('#f4ffff', 1.2), 0.8 + rnd() * 2, 0.2, -Wd / 2 + rnd() * Wd));
  parts.push(part(blob(2.5, 1, 0.2, 131, 1, 0.4, 3.6), C.moss, -1.8, H + 0.4, 0));
  return merge(parts);
}

/** Treehouse on stilts with a coral roof and a rope ladder, tucked beside the treehouse bend. */
function treehouse(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const [x, z] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]] as const) parts.push(part(facet(cyl(0.35, 0.45, 12, 6)), C.bark, x, 4, z));
  parts.push(part(rbox(6.4, 0.5, 6.4, 0.12, 2), C.wood, 0, 9.5, 0));
  parts.push(part(rbox(4.6, 3.2, 4.2, 0.25, 2), C.woodPale, 0, 11.4, 0));
  parts.push(part(cone(4.4, 2.6, 4), C.coral, 0, 14.3, 0, 0, Math.PI / 4, 0, 1, 1, 0.9));
  parts.push(part(box(0.2, 1.4, 1.0), C.barkDark, 2.32, 11.0, 0));
  parts.push(part(box(0.2, 0.9, 0.9), hdr('#ffe6a8', 1.3), 2.32, 11.8, 1.4));
  for (let k = 0; k < 7; k++) parts.push(part(box(0.1, 0.08, 1.0), C.rope, 3.3, 2.5 + k * 1.0, -1.5));
  parts.push(part(cyl(0.04, 0.04, 7.5, 4), C.rope, 3.3, 5.6, -2.0), part(cyl(0.04, 0.04, 7.5, 4), C.rope, 3.3, 5.6, -1.0));
  canopy(parts, 0, 17, 0, 6, 4, 137);
  return merge(parts);
}

/** Boardwalk rope rail for the canopy boardwalk: posts, a rope and a hanging leaf garland. */
function ropeRail(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const z of [-3, 3]) parts.push(part(facet(cyl(0.18, 0.2, 2.2, 6)), C.bark, 0, 0.5, z));
  parts.push(part(tube([[0, 1.3, -3], [0, 0.95, 0], [0, 1.3, 3]], 0.06, 8, 4), C.rope));
  parts.push(part(tube([[0, 0.7, -3], [0, 0.45, 0], [0, 0.7, 3]], 0.05, 8, 4), C.rope));
  for (const z of [-1.5, 0, 1.5]) parts.push(part(ico(0.22, 0), C.leafLight, 0, 0.9, z, 0, 0, 0, 1, 0.5, 1.3));
  // trestle legs down to the forest floor
  parts.push(part(cyl(0.22, 0.26, 24, 5), C.barkDark, 0.4, -11.5, 0));
  return merge(parts);
}

/** A sleepy panda on a mossy rock munching bamboo (cosmetic spectator). */
function panda(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(part(blob(1.6, 1, 0.15, 139, 1.3, 0.6, 1.1), C.stone, 0, 0, 0), part(blob(1.2, 1, 0.15, 149, 1.25, 0.35, 1.05), C.moss, 0, 0.9, 0));
  parts.push(part(rbox(1.1, 1.0, 1.0, 0.35, 3), C.panda, 0, 1.9, 0));
  parts.push(part(rbox(0.9, 0.8, 0.85, 0.32, 3), C.panda, 0.15, 2.75, 0));
  for (const z of [-0.36, 0.36]) {
    parts.push(part(sphere(0.18), C.eye, 0.1, 3.2, z));
    parts.push(part(rbox(0.1, 0.24, 0.16, 0.04, 1), C.eye, 0.58, 2.8, z * 0.55));
    parts.push(part(rbox(0.35, 0.45, 0.35, 0.15, 2), C.eye, 0.3, 1.5, z * 1.35));
  }
  parts.push(part(cyl(0.06, 0.06, 1.8, 5), '#8fc25a', 0.55, 2.2, 0.4, 0.3, 0, 0.5));
  for (let k = 0; k < 3; k++) parts.push(part(ico(0.14, 0), C.leafLight, 0.9 + k * 0.15, 2.9 + k * 0.2, 0.6));
  return merge(parts);
}

/** Bamboo stand: a few segmented canes with leaf sprays. */
function bamboo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rnd = prng(151);
  for (let i = 0; i < 6; i++) {
    const x = (rnd() - 0.5) * 3, z = (rnd() - 0.5) * 3, h = 8 + rnd() * 5, tilt = (rnd() - 0.5) * 0.15;
    parts.push(part(cyl(0.14, 0.17, h, 6), i % 2 ? '#8fc25a' : '#79ad49', x, h / 2 - 1, z, tilt, 0, tilt));
    for (let k = 1; k < 5; k++) parts.push(part(cyl(0.18, 0.18, 0.12, 6), '#5f8f36', x, (k * h) / 5 - 1, z, tilt, 0, tilt));
    parts.push(part(blob(1.0, 0, 0.3, 157 + i, 1.4, 0.35, 0.8), C.leafLight, x, h - 1.4, z));
  }
  return merge(parts);
}

/** Gore cushion at a branch split (yaw = branch direction): stacked mossy logs with a chevron board facing traffic. */
function goreCushion(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const [y, z, r] of [[0.5, -0.9, 0.55], [0.5, 0.2, 0.55], [1.4, -0.35, 0.5]] as const) {
    parts.push(part(facet(new THREE.CylinderGeometry(r, r, 3.2, 8)), C.bark, 0, y, z, 0, 0, Math.PI / 2));
    parts.push(part(new THREE.CircleGeometry(r * 0.9, 8), C.rings, 1.61, y, z, 0, Math.PI / 2, 0), part(new THREE.CircleGeometry(r * 0.9, 8), C.rings, -1.61, y, z, 0, -Math.PI / 2, 0));
  }
  parts.push(part(blob(1.0, 1, 0.2, 193, 1.6, 0.35, 1), C.moss, 0, 1.95, -0.3));
  // chevron board facing −Z (oncoming karts), arrows pointing both ways
  parts.push(part(box(2.4, 1.0, 0.12), '#1c1f26', 0, 2.9, -1.2), part(box(0.12, 1.4, 0.12), C.barkDark, 0, 2.0, -1.1));
  for (const sx of [-1, 1]) for (const dy of [-0.16, 0.16]) parts.push(part(box(0.5, 0.14, 0.05), '#ffd23f', sx * 0.55, 2.9 + dy, -1.28, 0, 0, sx * (dy > 0 ? -0.7 : 0.7)));
  return merge(parts);
}
/** Support under elevated decks: a short mossy trunk column (the compiler's variant height class is not rendered yet,
 * so it stays under 4 m — the minimum clearance where pillars are placed — and never pokes through a deck). */
function trunkPillar(): THREE.BufferGeometry {
  return merge([
    part(facet(lathe([[1.6, -2], [1.7, 0], [1.2, 1.2], [1.0, 3.8], [1.4, 4.0]], 8)), C.bark, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0.1, 3),
    part(blob(1.3, 1, 0.2, 197, 1, 0.35, 1), C.moss, 0, 0.4, 0),
  ]);
}

/**
 * Forest floor for `THEME … terrain=none` tracks (Cascade Slalom): one 900 m disc of mossy ground with painted clearings,
 * placed once as a landmark at the lowest road level, so elevated boardwalks stand on trestles instead of embankments.
 */
function forestFloor(): THREE.BufferGeometry {
  const g = new THREE.RingGeometry(0.5, 900, 72, 30);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  const a = new THREE.Color(C.leafDeep), b = new THREE.Color(C.mossDeep), c = new THREE.Color('#5b4a2f'), t = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const n = 0.5 + 0.25 * Math.sin(x * 0.013 + Math.cos(z * 0.011) * 2) + 0.25 * Math.sin(z * 0.017 - x * 0.007);
    t.copy(a).lerp(b, n); if (n > 0.8) t.lerp(c, (n - 0.8) * 2.5);
    col[i * 3] = t.r; col[i * 3 + 1] = t.g; col[i * 3 + 2] = t.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g.toNonIndexed();
}
/** Boardwalk trestle: two log legs from the forest floor (−24 m) up to the deck edges, with cross braces. */
function trestle(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const z of [-1.2, 1.2]) parts.push(part(facet(cyl(0.35, 0.45, 25, 6)), C.barkDark, 0, -12.2, z));
  for (let k = 0; k < 4; k++) parts.push(part(box(0.2, 0.25, 3.4), C.bark, 0, -2 - k * 5.5, 0, (k % 2 ? 1 : -1) * 0.6, 0, 0));
  parts.push(part(box(1.2, 0.5, 3.2), C.wood, 0, -0.35, 0));
  return merge(parts);
}
/**
 * Behind-the-waterfall section (centred on the tunnel straight): a rock overhang over the road, the cliff on the
 * inside, and a curtain of falling water on the outside edge (+X side of the prop is the road's left).
 */
function fallsCurtain(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rnd = prng(229);
  const L = 52, H = 16, half = 8.5;
  parts.push(part(facet(new THREE.BoxGeometry(8, H + 20, L + 8)), C.stoneDark, -(half + 4), H / 2 - 10, 0, 0, 0, 0, 1, 1, 1, 0.08, 19));
  parts.push(part(facet(new THREE.BoxGeometry(2 * half + 12, 3, L + 4)), C.stone, -3, H - 1.5, 0, 0, 0, 0.04, 1, 1, 1, 0.08, 23));
  parts.push(part(blob(6, 1, 0.2, 231, 2.2, 0.4, 5), C.moss, -4, H + 0.2, 0));
  for (let i = 0; i < 14; i++) {
    const z = -L / 2 + (i + 0.5) * (L / 14);
    parts.push(part(new THREE.PlaneGeometry(L / 14 + 0.1, H + 12), i % 2 ? hdr('#e6fbff', 1.25) : hdr('#bfeaf2', 1.15), half + 1.2 + rnd() * 0.3, (H - 12) / 2 - 0.5, z, 0, -Math.PI / 2, 0));
    parts.push(part(new THREE.PlaneGeometry(L / 14 + 0.1, H + 12), i % 2 ? hdr('#e6fbff', 1.2) : hdr('#bfeaf2', 1.1), half + 1.3 + rnd() * 0.3, (H - 12) / 2 - 0.5, z, 0, Math.PI / 2, 0));
  }
  for (let i = 0; i < 10; i++) parts.push(part(blob(1.2 + rnd(), 1, 0.3, 233 + i, 1, 0.5, 1), hdr('#f4ffff', 1.2), half + 2 + rnd() * 2, -0.2, -L / 2 + rnd() * L));
  return merge(parts);
}

/**
 * Pendulum-run gate (the swinger fallback: logs hang still): two trunk posts, a crossbeam 9 m up and a log slung on
 * ropes 3.2 m above the road. Placed centred on the road as a landmark (posts at ±10 m clear a 13 m road).
 */
function logArch(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-10, 10]) {
    parts.push(part(facet(lathe([[1.0, -2], [1.05, 0], [0.8, 5], [0.75, 9.6]], 8)), C.bark, x, 0, 0, 0, 0, 0, 1, 1, 1, 0.1, 4));
    parts.push(part(blob(1.6, 1, 0.2, 239 + x, 1, 0.7, 1), C.leaf, x, 10, 0));
  }
  parts.push(part(facet(new THREE.CylinderGeometry(0.55, 0.55, 22, 7)), C.barkDark, 0, 9, 0, 0, 0, Math.PI / 2));
  for (const x of [-3, 3]) parts.push(part(cyl(0.05, 0.05, 5.2, 4), C.rope, x, 6.4, 0));
  parts.push(part(facet(new THREE.CylinderGeometry(0.7, 0.75, 8, 8)), C.bark, 0, 3.8, 0, 0, 0, Math.PI / 2));
  parts.push(part(new THREE.CircleGeometry(0.68, 8), C.rings, 4.01, 3.8, 0, 0, Math.PI / 2, 0), part(new THREE.CircleGeometry(0.68, 8), C.rings, -4.01, 3.8, 0, 0, -Math.PI / 2, 0));
  parts.push(part(blob(0.9, 1, 0.2, 243, 3.4, 0.35, 0.9), C.moss, 0, 4.45, 0));
  return merge(parts);
}

// ------------------------------------------------------------------------------------------------ factory table
const kind = (build: () => THREE.BufferGeometry, material: () => THREE.Material, castShadow = true): PropFactory => {
  let cache: THREE.BufferGeometry | null = null;
  return { build: () => ({ geometry: (cache ??= build()), material: material(), castShadow }) };
};

export const CANOPY_PROPS: Record<string, PropFactory> = {
  giant_trunk: kind(giantTrunk, matte),
  old_oak: kind(oldOak, matte),
  forest_wall: kind(forestWall, matte),
  fern: kind(fern, matte, false),
  mushroom_red: kind(mushroomCluster, toy, false),
  mushroom_giant: kind(mushroomGiant, toy),
  mossy_log: kind(mossyLog, matte),
  stump: kind(stump, matte),
  rock_moss: kind(rockMoss, matte),
  shrub: kind(shrub, matte, false),
  hollow_log: kind(hollowLog, matte),
  gantry: kind(forestGantry, matte),
  gore_cushion: kind(goreCushion, matte),
  forest_floor: kind(forestFloor, matte, false),
  trestle: kind(trestle, matte, false),
  falls_curtain: kind(fallsCurtain, matte),
  log_arch: kind(logArch, matte),
  pillar: kind(trunkPillar, matte, false),
  log_rail: kind(logRail, matte),
  bridge_deck: kind(bridgeDeck, matte, false),
  pond: kind(pond, glossy, false),
  firefly: kind(fireflies, () => MaterialLibrary.emissive('#e4ff8a', 2.6), false),
  karst_pillar: kind(karstPillar, matte),
  waterfall: kind(waterfall, matte),
  treehouse: kind(treehouse, matte),
  rope_rail: kind(ropeRail, matte),
  panda: kind(panda, toy, false),
  bamboo: kind(bamboo, matte),
  // scatter aliases so shared THEME scatter lists (tree/bush/rock) resolve to the forest look
  tree: kind(giantTrunk, matte),
  bush: kind(shrub, matte, false),
  rock: kind(rockMoss, matte),
};
