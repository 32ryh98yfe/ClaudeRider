// Ember Mine prop kit (instanced, one geometry + one library material per kind). Local frame for rows placed by
// PROPS: +Z runs along the track, +X points toward the road, y = 0 sits 0.2 m below the road surface.
// Parts that would float above the flattened terrain (elevated trestles, scatter on the spiral) extend well below 0.
import * as THREE from 'three/webgpu';
import { MaterialLibrary } from '../../materials/library.ts';
import type { PropFactory } from '../../props/defaults.ts';
import { box, cone, cyl, merge, paint, place, rbox, torus } from '../../util/geo.ts';
import { beam, blob, blobShape, crystalCluster, glow, rng, rock } from './shapes.ts';
import { glowLit } from '../lantern_hollow/glow.ts';

// glowing parts (windows, ore, lava seams, portal sign) are HDR vertex colours: the glow material lets them emit
const lit = (): THREE.Material => glowLit(0.85, 1.3);
const metal = (): THREE.Material => MaterialLibrary.vertexLit(0.5, 0.35);

const TIMBER = '#8b5a2b', TIMBER_DARK = '#6b4226', IRON = '#4a4d52', RUST = '#8a4b2a', BASALT = '#2b2320';
const CYAN = '#7fdbff', VIOLET = '#c77dff', AMBER = '#ffc857', LAVA = '#ff6a2b';
// deeper glow colours for the emissive crystals: the pastel paint colours tone-mapped to mint / pink once they bloomed
const GEODE_CYAN = '#2fb6ff', GEODE_VIOLET = '#9a4dff';

/**
 * Timber post-and-lintel mine support spanning the road. Rows may not start on the road, so the origin is the right
 * post and the frame spans +X (toward and across the road) by ARCH_SPAN; place it with side=R, scale=1-1 and
 * offset = ARCH_SPAN/2 − w/2 (9.3 − w/2) so both posts stand just outside the walls.
 */
export const ARCH_SPAN = 18.6;
function timberArch(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const c = ARCH_SPAN / 2;
  for (const sx of [-1, 1]) {
    parts.push(paint(place(box(0.7, 10.5, 0.7), c + sx * c, 2.2, 0), TIMBER, 0.08, 3));
    parts.push(paint(beam(c + sx * c, 5.2, 0, c + sx * (c - 2.8), 7.3, 0, 0.45), TIMBER_DARK));
    parts.push(paint(place(box(0.9, 0.5, 0.9), c + sx * c, 7.25, 0), IRON));
  }
  parts.push(paint(place(box(ARCH_SPAN + 1.4, 0.8, 0.8), c, 7.7, 0), TIMBER, 0.06, 5));
  parts.push(paint(place(box(ARCH_SPAN + 1.8, 0.18, 0.95), c, 8.15, 0), TIMBER_DARK));
  for (const x of [-6, -2, 2, 6]) parts.push(paint(place(box(0.25, 0.85, 0.85), c + x, 7.7, 0), IRON));
  return merge(parts);
}

/** Render-only support placed by the compiler under decks > 4 m above the terrain (y = terrain). */
function pier(): THREE.BufferGeometry {
  return merge([
    paint(place(cyl(1.1, 1.35, 4.2, 6), 0, 2.0, 0), BASALT, 0.08, 7),
    paint(place(box(3.4, 0.5, 1.6), 0, 4.1, 0), TIMBER_DARK),
    paint(place(cyl(1.6, 1.9, 0.6, 6), 0, 0.1, 0), '#3b2f29'),
  ]);
}

function goreCushion(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) parts.push(paint(place(cyl(0.45, 0.45, 0.9, 8), (i - 1.5) * 0.4, 0.45, -i * 0.5), i % 2 ? '#ffc857' : '#2b2320'));
  parts.push(paint(place(box(1.6, 0.9, 0.12), 0, 1.35, 0.3), '#ffc857'));
  return merge(parts);
}

function mineCart(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    paint(place(rbox(1.5, 1.0, 2.3, 0.14, 2), 0, 1.05, 0), IRON, 0.05, 11),
    paint(place(box(1.56, 0.16, 2.36), 0, 1.45, 0), RUST),
    paint(place(box(1.56, 0.16, 2.36), 0, 0.75, 0), RUST),
  ];
  for (const x of [-0.62, 0.62]) for (const z of [-0.75, 0.75]) parts.push(paint(place(cyl(0.3, 0.3, 0.16, 10), x, 0.42, z, 0, 0, Math.PI / 2), '#2a2b2e'));
  const R = rng(21);
  for (let i = 0; i < 7; i++) parts.push(paint(place(rock(0.32 + R() * 0.12, i), (R() - 0.5) * 0.9, 1.62 + R() * 0.15, (R() - 0.5) * 1.5), i % 3 === 0 ? '#e8a23a' : '#5a4a42'));
  // a short length of rail under the cart
  for (const x of [-0.62, 0.62]) parts.push(paint(place(box(0.1, 0.12, 3.2), x, 0.08, 0), '#7c7f86'));
  for (const z of [-1.2, -0.4, 0.4, 1.2]) parts.push(paint(place(box(1.8, 0.1, 0.24), 0, 0.0, z), TIMBER_DARK));
  // ballast mound so carts parked beside a ledge road never hover over the pit floor
  parts.push(paint(place(cyl(1.6, 2.6, 2.4, 7), 0, -1.25, 0, 0, 0.3, 0, 1, 1, 1.5), '#4a3b33', 0.1, 5));
  return merge(parts);
}

/** Rock mass under a ledge road's edge (the terrain is flattened to the lowest deck, so upper decks need a bank). */
function rockBank(seed: number): THREE.BufferGeometry {
  // origin = road edge (offset 0); +X is under the road, so everything with x > 0 stays below the road deck
  return merge([
    paint(place(rock(2.6, seed, 1), -3.6, -1.5, 0, 0, 0.7, 0, 1.2, 1.1, 1.6), '#3b2f29', 0.12, seed),
    paint(place(rock(3.5, seed + 1, 1), -1.0, -5.2, 0.8, 0, 1.9, 0, 1.3, 1.2, 1.3), '#33292a', 0.12, seed + 1),
    paint(place(cyl(3.0, 4.2, 14, 7), -1.0, -9.5, 0, 0, 0.2, 0, 1, 1, 1.5), '#2b2320', 0.08, seed + 2),
  ]);
}

function oreRail(): THREE.BufferGeometry {
  // 8 m of track (placed every 8 m along the rail line); rails sit just above the road
  const parts: THREE.BufferGeometry[] = [];
  for (let z = -3.5; z <= 3.6; z += 1) parts.push(paint(place(box(1.9, 0.1, 0.26), 0, 0.23, z), TIMBER_DARK, 0.1, (z + 4) * 7));
  for (const x of [-0.6, 0.6]) parts.push(paint(place(box(0.1, 0.1, 8.02), x, 0.32, 0), '#9a9ea6'));
  return merge(parts);
}

function trestleBent(): THREE.BufferGeometry {
  // timber bent under an elevated deck: legs to −17 m, X bracing, cap beam
  const parts: THREE.BufferGeometry[] = [];
  const top = -0.55, bot = -17;
  for (const x of [-6.2, -2.2, 2.2, 6.2]) parts.push(paint(place(box(0.55, top - bot, 0.55), x, (top + bot) / 2, 0), TIMBER, 0.08, x * 3 + 20));
  parts.push(paint(place(box(14, 0.6, 0.7), 0, top - 0.2, 0), TIMBER_DARK));
  for (let y = top - 1; y > bot + 3; y -= 5) {
    parts.push(paint(beam(-6.2, y, 0, 6.2, y - 4.5, 0, 0.3), TIMBER_DARK));
    parts.push(paint(beam(6.2, y, 0, -6.2, y - 4.5, 0, 0.3), TIMBER_DARK));
    parts.push(paint(place(box(13, 0.3, 0.35), 0, y - 4.6, 0), TIMBER));
  }
  return merge(parts);
}

function headframe(): THREE.BufferGeometry {
  // steel headframe tower (~26 m) with sheave wheels and a winch-house block at its foot
  const parts: THREE.BufferGeometry[] = [];
  const legs: [number, number][] = [[-4, -4], [4, -4], [-4, 4], [4, 4]];
  for (const [x, z] of legs) parts.push(paint(beam(x * 1.25, -14, z * 1.25, x * 0.35, 24, z * 0.35, 0.7), '#8c3f24'));
  parts.push(paint(place(cyl(7.5, 9, 12, 8), 0, -8.4, 0), '#3b2f29', 0.1, 2));
  for (let y = 0; y < 23; y += 6) {
    const k = 1 - (y + 6) / 30 * 0.65;
    parts.push(paint(place(box(8 * k + 0.6, 0.45, 0.45), 0, y, -4 * k), '#6e3220'), paint(place(box(8 * k + 0.6, 0.45, 0.45), 0, y, 4 * k), '#6e3220'));
    parts.push(paint(place(box(0.45, 0.45, 8 * k + 0.6), -4 * k, y, 0), '#6e3220'), paint(place(box(0.45, 0.45, 8 * k + 0.6), 4 * k, y, 0), '#6e3220'));
  }
  parts.push(paint(place(box(4.2, 0.6, 4.2), 0, 24, 0), IRON));
  for (const z of [-0.9, 0.9]) {
    parts.push(paint(place(torus(2.6, 0.22, 6, 20), 0, 26.4, z), '#d9d4cc'));
    parts.push(paint(place(cyl(0.35, 0.35, 0.5, 8), 0, 26.4, z, Math.PI / 2, 0, 0), IRON));
  }
  parts.push(paint(beam(0, 26.4, 0, 14, 0, 0, 0.6), '#8c3f24'));
  parts.push(paint(place(rbox(9, 17, 7, 0.3, 2), 16, -7.5, 0), '#5e463a', 0.05, 4));
  parts.push(paint(place(cone(6.6, 2.4, 4), 16, 2.2, 0, 0, Math.PI / 4, 0), RUST));
  parts.push(glow(paint(place(box(0.1, 1.2, 2.2), 11.45, -1.5, 0), AMBER), 3));
  return merge(parts);
}

function basaltColumns(seed: number): THREE.BufferGeometry {
  const R = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const a = R() * Math.PI * 2, d = i === 0 ? 0 : 1.2 + R() * 1.6;
    const h = 5 + R() * 11;
    const r = 0.7 + R() * 0.4;
    parts.push(paint(place(cyl(r, r, h + 14, 6), Math.cos(a) * d, (h - 14) / 2, Math.sin(a) * d), i % 2 ? BASALT : '#3a2e29', 0.1, i + seed));
    parts.push(paint(place(cyl(r * 0.96, r, 0.25, 6), Math.cos(a) * d, h + 0.1, Math.sin(a) * d), '#4a3a33'));
  }
  return merge(parts);
}

function stalagmites(seed: number): THREE.BufferGeometry {
  const R = rng(seed);
  const parts: THREE.BufferGeometry[] = [paint(place(rock(3.2, seed, 1, 0.9), 0, -1.6, 0), '#3b2f29', 0.12, seed)];
  parts.push(paint(place(cyl(3.2, 4.2, 12, 7), 0, -8, 0), '#2e2522'));
  for (let i = 0; i < 5; i++) {
    const a = R() * Math.PI * 2, d = i === 0 ? 0 : 0.8 + R() * 1.7;
    const h = (i === 0 ? 7 : 2.5 + R() * 4) ;
    parts.push(paint(place(cone(0.5 + h * 0.12, h, 7), Math.cos(a) * d, h / 2 + 0.2, Math.sin(a) * d), i % 2 ? '#5a4638' : '#6b5647', 0.12, i * 5 + seed));
  }
  return merge(parts);
}

function orePile(): THREE.BufferGeometry {
  const R = rng(77);
  const parts: THREE.BufferGeometry[] = [paint(place(cyl(2.4, 3.4, 4, 8), 0, -1.6, 0), '#3a2e29')];
  for (let i = 0; i < 12; i++) {
    const a = R() * Math.PI * 2, d = R() * 2.2;
    const gold = i % 4 === 0;
    const g = paint(place(rock(0.45 + R() * 0.6, i + 3), Math.cos(a) * d, 0.35 + (2.2 - d) * 0.45 + R() * 0.3, Math.sin(a) * d), gold ? '#f0a83c' : i % 2 ? '#4f4038' : '#5f4d43', 0.1, i);
    parts.push(gold ? glow(g, 1.8) : g);
  }
  // a shovel stuck in the pile
  parts.push(paint(beam(1.2, 0.6, 0.3, 2.0, 2.8, 0.6, 0.12), TIMBER), paint(place(box(0.5, 0.6, 0.06), 1.1, 0.35, 0.28, 0.3, 0, 0.35), '#8a8d93'));
  return merge(parts);
}

function lanternOnWall(): THREE.BufferGeometry {
  // wall-top miner's lantern: hexagonal glass body, cap and bail (the base sits inside the 1.4 m rock wall for
  // every row scale 0.85–1.15, so it never floats)
  return merge([
    paint(place(cyl(0.2, 0.22, 0.46, 6), 0, 1.5, 0), AMBER),
    paint(place(cone(0.27, 0.2, 6), 0, 1.83, 0), AMBER),
    paint(place(cyl(0.26, 0.26, 0.08, 6), 0, 1.25, 0), AMBER),
    paint(place(torus(0.12, 0.03, 4, 8), 0, 2.0, 0), AMBER),
  ]);
}

/**
 * Lava pool in a basalt basin, all on the lit glow material (final pass; the old pool was a flat emissive-orange
 * octagon, since the emissive material ignores vertex colours): an HDR-orange molten surface (it emits, and its
 * albedo still takes the cave light), raised crust plates and a few hot spots, and a lip of basalt slabs along the
 * blob's own outline. The basin is that outline extruded 2.6 m down, so on a slope the pool never floats.
 */
function lavaPool(r = 6, seed = 4, seg = 14): THREE.BufferGeometry {
  const R = rng(seed + 101);
  const outline = blobShape(r, seed, seg);
  const parts: THREE.BufferGeometry[] = [glow(paint(place(blob(r, seed, seg), 0, 0.1, 0), '#ff9a3c'), 2.4)];
  const basin = new THREE.ExtrudeGeometry(outline, { depth: 2.6, bevelEnabled: false, curveSegments: 1 });
  basin.rotateX(-Math.PI / 2); // extrude +Z becomes +Y, shape (x, y) lands at (x, ., -y) like blob()
  parts.push(paint(place(basin, 0, -2.65, 0, 0, 0, 0, 1.04, 1, 1.04), '#2b2320', 0.08, seed));
  // crust plates: low lit basalt rafts on the melt
  for (let i = 0; i < 6; i++) {
    const a = R() * Math.PI * 2, d = r * (0.12 + R() * 0.45), sz = 0.55 + R() * 0.55;
    parts.push(paint(place(rock(sz, seed + 40 + i, 1), Math.cos(a) * d, 0.1, Math.sin(a) * d, 0, R() * 3, 0, 1.5, 0.14, 1.1), i % 2 ? '#3b2219' : '#4a2c1e', 0.12, i));
  }
  for (let i = 0; i < 3; i++) {
    const a = R() * Math.PI * 2, d = r * R() * 0.45;
    parts.push(glow(paint(place(blob(0.5 + R() * 0.5, seed + 60 + i, 9), Math.cos(a) * d, 0.13, Math.sin(a) * d), '#ffe08a'), 2.6));
  }
  // the lip: slabs at every outline vertex and edge midpoint (same radii as blobShape: rng(seed), 0.7-1.15 r)
  const Rb = rng(seed);
  const rad: number[] = [];
  for (let i = 0; i < seg; i++) rad.push(r * (0.7 + Rb() * 0.45));
  for (let k = 0; k < seg * 2; k++) {
    const i = k >> 1, a = ((i + (k & 1) * 0.5) / seg) * Math.PI * 2;
    const d = (k & 1 ? (rad[i]! + rad[(i + 1) % seg]!) / 2 : rad[i]!) * (1.0 + R() * 0.06);
    const sz = 0.45 + R() * 0.3;
    const tone = k % 3 === 0 ? '#4a3a33' : k % 3 === 1 ? '#3b2f29' : '#2b2320';
    parts.push(paint(place(rock(sz, seed + k, 1), Math.cos(a) * d, 0.08, -Math.sin(a) * d, 0, a + Math.PI / 2 + (R() - 0.5) * 0.4, 0, 1.8, 0.5, 1.0), tone, 0.1, k));
  }
  return merge(parts);
}

function lavaCracks(seed: number): THREE.BufferGeometry {
  const R = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  let x = 0, z = 0, a = R() * Math.PI * 2;
  for (let i = 0; i < 9; i++) {
    const l = 1.2 + R() * 1.8;
    const nx = x + Math.cos(a) * l, nz = z + Math.sin(a) * l;
    parts.push(paint(place(box(0.28, 0.06, l + 0.2), (x + nx) / 2, 0.03, (z + nz) / 2, 0, -a + Math.PI / 2, 0), i % 3 ? LAVA : '#ffc857'));
    if (i % 3 === 2) { x = 0; z = 0; } else { x = nx; z = nz; }
    a += (R() - 0.5) * 1.6;
  }
  return merge(parts.map((g) => place(g, 0, 0.25, 0)));
}

function minePortal(): THREE.BufferGeometry {
  // start/finish: a heavy timber portal with a lit ember sign board (scaled by road width / 16 at bake)
  const parts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    parts.push(paint(place(box(1.2, 11, 1.2), sx * 9.4, 3.0, 0), TIMBER, 0.06, 9));
    parts.push(paint(place(rock(1.6, sx + 5, 1), sx * 9.4, -0.2, 0), '#4a3a33'));
    parts.push(paint(beam(sx * 9.4, 5.8, 0, sx * 6.2, 8.2, 0, 0.6), TIMBER_DARK));
  }
  parts.push(paint(place(box(20.4, 1.3, 1.3), 0, 8.8, 0), TIMBER, 0.05, 2));
  parts.push(paint(place(rbox(10, 2.4, 0.5, 0.2, 2), 0, 10.6, 0), '#2b2320'));
  // the sign is a marquee, not a lit slab: a fully glowing 9 m panel bloomed into a blank orange bar across the top of
  // the grid camera. Dark face, lava border, amber chevrons pointing in at a cyan geode (the glyphs are symmetric, so
  // the back face reads the same)
  for (const z of [0.3, -0.3]) {
    const zf = z * 1.25, y = 10.6;
    parts.push(paint(place(box(9.2, 1.7, 0.1), 0, y, z), '#3b2219'));
    parts.push(glow(paint(place(box(9.2, 0.16, 0.12), 0, y + 0.77, zf), LAVA), 1.8), glow(paint(place(box(9.2, 0.16, 0.12), 0, y - 0.77, zf), LAVA), 1.8));
    parts.push(glow(paint(place(box(0.16, 1.7, 0.12), -4.52, y, zf), LAVA), 1.8), glow(paint(place(box(0.16, 1.7, 0.12), 4.52, y, zf), LAVA), 1.8));
    parts.push(glow(paint(place(box(0.85, 0.85, 0.12), 0, y, zf, 0, 0, Math.PI / 4), GEODE_CYAN), 2.6));
    for (let k = 0; k < 3; k++) {
      for (const sx of [-1, 1]) {
        // '>' left of the geode and '<' right of it: each chevron is two strokes meeting at the tip nearest the centre
        const x = sx * (1.4 + k * 0.85), tilt = sx * 0.7;
        parts.push(glow(paint(place(box(0.6, 0.15, 0.12), x, y + 0.19, zf, 0, 0, tilt), AMBER), 2.2));
        parts.push(glow(paint(place(box(0.6, 0.15, 0.12), x, y - 0.19, zf, 0, 0, -tilt), AMBER), 2.2));
      }
    }
  }
  for (let i = 0; i < 12; i++) parts.push(paint(place(box(0.8, 1.35, 1.35), -8.8 + i * 1.6, 8.8, 0), i % 2 ? '#ff6a2b' : '#1c1816'));
  return merge(parts);
}

/**
 * Cavern roof slab with stalactites (placed on the centreline); keeps above the intro flyover height (≥ 20 m). The
 * tips hang 23 m × row scale above the row origin, so rows skip stretches with another road less than ~10 m below
 * that (the stacked plateau / under-plateau and switchback stretches).
 */
function caveRoof(seed: number): THREE.BufferGeometry {
  const R = rng(seed);
  // origin sits beside the road (rows cannot start on it); the slab is centred ~10 m toward the road.
  // Final pass: mid basalt (#3e3438) with lighter stalactites: the underside only sees the lava bounce, and the old
  // #2a2429 slab rendered pure black over the top half of the chase view
  const parts: THREE.BufferGeometry[] = [paint(place(rock(30, seed, 1), 10, 38, 0, 0, R() * 3, 0, 1.3, 0.42, 1.1), '#3e3438', 0.14, seed)];
  for (let i = 0; i < 9; i++) {
    const a = R() * Math.PI * 2, d = 6 + R() * 26, h = 4 + R() * 6;
    parts.push(paint(place(cone(1.2 + h * 0.18, h, 6), 10 + Math.cos(a) * d, 33 - h / 2, Math.sin(a) * d, Math.PI, 0, 0), i % 2 ? '#4a4044' : '#564b4f', 0.1, i + seed));
  }
  return merge(parts);
}

function crystalSpire(): THREE.BufferGeometry {
  return geodeCluster(VIOLET, GEODE_VIOLET, 9, 16, 5, -2.2);
}

/**
 * Geode cluster on the lit glow material (review round): the outer facets are matte paint, so they shade like
 * crystal instead of reading as flat pastel emissive cards, and only the central spire is an HDR core (≈ 1.6–2 after
 * the glow gain, above the 0.8 bloom knee) for a small halo.
 */
function geodeCluster(face: string, core: string, count: number, size: number, seed: number, y = 0): THREE.BufferGeometry {
  const parts = crystalCluster(face, count, size, seed);
  const perCrystal = 2; // shapes.ts crystal(): prism + tip
  for (let i = 0; i < perCrystal; i++) parts[i] = glow(paint(parts[i]!, core), 2.6);
  return merge(y ? parts.map((g) => place(g, 0, y, 0)) : parts);
}

/**
 * Lava lake surface (emissive) and its basalt rim (lit) are two kinds placed by identical PROPS rows: positions match
 * exactly, and the rim band (0.62–1.45 R) always contains the surface edge for any pair of row scales (0.85–1.15).
 */
function lavaLake(r: number, seed: number): THREE.BufferGeometry {
  const R = rng(seed);
  const parts = [paint(place(blob(r, seed, 18), 0, 0.12, 0), LAVA)];
  for (let i = 0; i < 6; i++) parts.push(paint(place(blob(r * (0.08 + R() * 0.1), seed + i + 1), (R() - 0.5) * r, 0.16, (R() - 0.5) * r), '#ffc857'));
  return merge(parts);
}
function lavaRim(r: number, seed: number): THREE.BufferGeometry {
  const R = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + R() * 0.2, d = r * (1.02 + R() * 0.12);
    parts.push(paint(place(rock(r * 0.2 + R() * r * 0.06, seed + i, 1), Math.cos(a) * d, -0.3, Math.sin(a) * d, 0, R() * 3, 0, 1.4, 0.55, 1.1), i % 2 ? '#2b2320' : '#3b2f29', 0.1, i));
  }
  // basalt skirt from the rim down to the pit floor (the lake may sit several metres above the flattened terrain)
  parts.push(paint(place(cyl(r * 1.2, r * 1.35, 10, 16), 0, -5.05, 0), '#2b2320', 0.06, seed));
  return merge(parts);
}

/** Basalt column between two helix decks (inner edge of the lowest turn, top meets the deck above at +9.3 m). */
function helixPillar(): THREE.BufferGeometry {
  return merge([
    paint(place(cyl(0.95, 1.1, 18.6, 6), 0, 0, 0), BASALT, 0.08, 3),
    paint(place(cyl(1.25, 1.25, 0.5, 6), 0, 8.9, 0), '#4a3a33'),
    paint(place(cyl(1.35, 1.5, 0.6, 6), 0, -0.2, 0), '#4a3a33'),
    glow(paint(place(box(0.08, 3.2, 0.3), 0.9, 2.2, 0, 0, 0, 0.1), LAVA), 2.2),
  ]);
}

function obsidianShards(seed: number): THREE.BufferGeometry {
  const R = rng(seed);
  const parts: THREE.BufferGeometry[] = [paint(place(rock(1.8, seed, 1, 0.9), 0, -1.0, 0), '#1c1a22')];
  for (let i = 0; i < 6; i++) {
    const a = R() * Math.PI * 2, d = R() * 1.4, h = 1.2 + R() * 2.6;
    parts.push(paint(place(cone(0.35 + R() * 0.25, h, 4), Math.cos(a) * d, h / 2, Math.sin(a) * d, (R() - 0.5) * 0.7, R() * 3, (R() - 0.5) * 0.7), i % 2 ? '#15131a' : '#2a2433'));
  }
  return merge(parts);
}

/** Dormant geyser vent (F5 geysers fall back to static vents): a basalt cone with a glowing mouth. */
function geyserVent(): THREE.BufferGeometry {
  return merge([
    paint(place(cyl(0.9, 2.6, 1.6, 9), 0, 0.3, 0), '#3b2f29', 0.1, 4),
    paint(place(cyl(2.8, 3.2, 1.6, 9), 0, -1.2, 0), '#2b2320'),
    glow(paint(place(cyl(0.72, 0.72, 0.12, 9), 0, 1.12, 0), '#ffb347'), 3),
    glow(paint(place(torus(0.85, 0.12, 4, 12), 0, 1.1, 0, Math.PI / 2, 0, 0), LAVA), 2.4),
  ]);
}

// Stylized pass (2026-10): geode, spire and lava emissives held below a white-out (crystals read cyan / violet, lava
// orange) so the karts and the next corner stay the brightest-read things in the cave.
export const EMBER_PROPS: Record<string, PropFactory> = {
  timber_arch: { build: () => ({ geometry: timberArch(), material: lit(), castShadow: false }) },
  mine_cart: { build: () => ({ geometry: mineCart(), material: metal(), castShadow: true }) },
  ore_rail: { build: () => ({ geometry: oreRail(), material: metal() }) },
  rock_bank: { build: () => ({ geometry: rockBank(6), material: lit() }) },
  trestle_bent: { build: () => ({ geometry: trestleBent(), material: lit() }) },
  headframe: { build: () => ({ geometry: headframe(), material: metal(), castShadow: true }) },
  basalt_column: { build: () => ({ geometry: basaltColumns(3), material: lit() }) },
  stalagmite: { build: () => ({ geometry: stalagmites(8), material: lit() }) },
  ore_pile: { build: () => ({ geometry: orePile(), material: lit() }) },
  lantern: { build: () => ({ geometry: lanternOnWall(), material: MaterialLibrary.emissive(AMBER, 1.15) }) },
  geode_cyan: { build: () => ({ geometry: geodeCluster(CYAN, GEODE_CYAN, 8, 4.4, 11), material: lit() }) },
  geode_violet: { build: () => ({ geometry: geodeCluster(VIOLET, GEODE_VIOLET, 8, 4.8, 17), material: lit() }) },
  cave_roof: { build: () => ({ geometry: caveRoof(12), material: lit(), castShadow: false }) },
  crystal_spire: { build: () => ({ geometry: crystalSpire(), material: lit() }) },
  lava_pool: { build: () => ({ geometry: lavaPool(), material: lit() }) },
  lava_crack: { build: () => ({ geometry: lavaCracks(9), material: MaterialLibrary.emissive(LAVA, 1.4) }) },
  lava_lake: { build: () => ({ geometry: lavaLake(12, 31), material: MaterialLibrary.emissive(LAVA, 1.3) }) },
  lava_rim: { build: () => ({ geometry: lavaRim(12, 31), material: lit() }) },
  // pit-floor lava: surface 4.6 m below the row origin, for rows on decks ~5 m above the flattened terrain
  lava_pit: { build: () => ({ geometry: place(lavaLake(22, 47), 0, -4.6, 0), material: MaterialLibrary.emissive(LAVA, 1.25) }) },
  helix_pillar: { build: () => ({ geometry: helixPillar(), material: lit() }) },
  obsidian: { build: () => ({ geometry: obsidianShards(13), material: MaterialLibrary.vertexLit(0.25, 0.3) }) },
  geyser_vent: { build: () => ({ geometry: geyserVent(), material: lit() }) },
  gantry: { build: () => ({ geometry: minePortal(), material: lit(), castShadow: false }) },
  pillar: { build: () => ({ geometry: pier(), material: lit() }) },
  gore_cushion: { build: () => ({ geometry: goreCushion(), material: lit() }) },
};
