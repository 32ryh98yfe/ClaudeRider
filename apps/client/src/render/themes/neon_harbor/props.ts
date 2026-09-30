// Neon Harbor prop kit: a rain-wet harbour city at dusk. Local frame for PROPS rows: +Z along the track, +X toward
// the road, y = 0 on the terrain. Self-lit parts (windows, signs, lamp heads) use the vertex-coloured emissive
// material, so one library material serves every glowing colour and the tower bodies read as dark silhouettes.
// Every sign is original abstract art (bars, rings and the parametric sparkle); no real brands or lettering.
import * as THREE from 'three/webgpu';
import { MaterialLibrary } from '../../materials/library.ts';
import type { PropFactory } from '../../props/defaults.ts';
import { box, cyl, merge, paint, place, rbox, sparkleGeometry, torus } from '../../util/geo.ts';
import { beam, glow, rng } from '../ember_mine/shapes.ts';

const lit = (): THREE.Material => MaterialLibrary.vertexLit(0.7, 0);
const metal = (): THREE.Material => MaterialLibrary.vertexLit(0.45, 0.5);
const selfLit = (): THREE.Material => MaterialLibrary.emissiveVertex(1.15);

const NIGHT = '#141824', NIGHT_2 = '#1b2030', STEEL = '#3a3f4c', CONCRETE = '#6f7380';
const MAGENTA = '#ff3ea5', CYAN = '#3ee6ff', AMBER = '#ffb347', VIOLET = '#9b6bff', WARM = '#ffd98a';

/** A flat pane facing +normal (x/z axis), used for windows and sign faces (2 triangles each). */
function pane(w: number, h: number, x: number, y: number, z: number, ry: number, c: string): THREE.BufferGeometry {
  return paint(place(new THREE.PlaneGeometry(w, h), x, y, z, 0, ry, 0), c);
}

/** Window bands on the four faces of a w × d block from y0 to y1 (lit panes at random, seeded per kind). */
function windows(w: number, d: number, y0: number, y1: number, seed: number, cols: string[]): THREE.BufferGeometry[] {
  const R = rng(seed), out: THREE.BufferGeometry[] = [];
  for (let y = y0 + 1.6; y < y1 - 1; y += 3.4) {
    for (const [fw, fx, fz, ry] of [[w, 0, d / 2 + 0.03, 0], [w, 0, -d / 2 - 0.03, Math.PI], [d, w / 2 + 0.03, 0, Math.PI / 2], [d, -w / 2 - 0.03, 0, -Math.PI / 2]] as const) {
      const n = Math.max(2, Math.round(fw / 4.5));
      for (let i = 0; i < n; i++) {
        if (R() < 0.35) continue;
        const off = -fw / 2 + (i + 0.5) * (fw / n);
        const c = cols[Math.floor(R() * cols.length)]!;
        const px = ry === 0 || ry === Math.PI ? off : fx, pz = ry === 0 || ry === Math.PI ? fz : off;
        out.push(pane(fw / n - 1.1, 1.5, px, y, pz, ry, c));
      }
    }
  }
  return out;
}

/** Slab tower (scatter): dark body, warm/cyan window bands, a red aviation beacon. */
function towerA(): THREE.BufferGeometry {
  const h = 46;
  return merge([
    paint(place(box(16, h, 13), 0, h / 2 - 1, 0), NIGHT, 0.05, 3),
    paint(place(box(17, 1.2, 14), 0, h - 0.4, 0), NIGHT_2),
    paint(place(box(5, 4, 5), 3, h + 1.8, -2), NIGHT_2),
    paint(place(box(0.8, 0.8, 0.8), 3, h + 4.2, -2), '#ff2a3a'),
    ...windows(16, 13, 0, h - 1, 11, [WARM, WARM, CYAN, '#e8f3ff']),
  ]);
}

/** Stepped tower (scatter): three setbacks and a magenta neon crown ring. */
function towerB(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const tiers: [number, number, number][] = [[14, 0, 26], [10.5, 26, 44], [7, 44, 58]];
  for (const [s, y0, y1] of tiers) {
    parts.push(paint(place(box(s, y1 - y0, s), 0, (y0 + y1) / 2 - 1, 0), NIGHT_2, 0.05, 5));
    parts.push(...windows(s, s, y0, y1 - 1, 17 + y0, [CYAN, VIOLET, WARM]));
    parts.push(paint(place(box(s + 0.6, 0.35, s + 0.6), 0, y1 - 1, 0), MAGENTA));
  }
  parts.push(paint(place(torus(4.2, 0.28, 6, 24), 0, 60, 0, Math.PI / 2), MAGENTA));
  parts.push(paint(place(cyl(0.25, 0.4, 8, 6), 0, 61, 0), STEEL));
  return merge(parts);
}

/** Vertical blade sign on a pole: stacked abstract glyph bars and a ring, magenta/cyan. */
function neonSign(): THREE.BufferGeometry {
  const parts = [paint(place(cyl(0.22, 0.28, 9, 6), 0, 4.5, 0), STEEL), paint(place(rbox(0.5, 7.2, 2.6, 0.12, 2), 0, 9.6, 0), NIGHT)];
  const R = rng(29);
  for (let i = 0; i < 6; i++) {
    const c = i % 2 ? CYAN : MAGENTA, w = 0.8 + R() * 1.2;
    for (const sx of [1, -1]) parts.push(paint(place(box(0.08, 0.5, w), sx * 0.29, 6.8 + i * 1.05, (R() - 0.5) * 0.6), c));
  }
  for (const sx of [1, -1]) parts.push(paint(place(torus(0.8, 0.12, 5, 16), sx * 0.3, 13.6, 0, 0, Math.PI / 2), AMBER));
  return merge(parts);
}

/** Roadside billboard: two legs, a lit frame and a sparkle-and-stripes panel (original art). */
function billboard(): THREE.BufferGeometry {
  const parts = [
    paint(place(box(0.6, 7, 0.6), 0, 3.5, -5), STEEL), paint(place(box(0.6, 7, 0.6), 0, 3.5, 5), STEEL),
    paint(place(box(0.5, 5.4, 13.4), 0, 9.3, 0), NIGHT),
    paint(place(box(0.55, 0.25, 13.6), 0, 12.05, 0), CYAN), paint(place(box(0.55, 0.25, 13.6), 0, 6.55, 0), CYAN),
  ];
  // the panel faces the road (+X): a violet field, three magenta stripes and a warm sparkle
  parts.push(pane(12.6, 4.8, 0.28, 9.3, 0, Math.PI / 2, '#3b2a6b'));
  for (let i = 0; i < 3; i++) parts.push(pane(6.2 - i * 1.4, 0.45, 0.3, 8.0 + i * 0.9, 2.6, Math.PI / 2, MAGENTA));
  parts.push(paint(place(sparkleGeometry(2.1, 0.1, 5), 0.35, 9.4, -3.4, 0, Math.PI / 2, 0), WARM));
  return merge(parts);
}

/** Container gantry crane: four legs, a portal beam and an outreach boom over the water side (−X). */
function harborCrane(): THREE.BufferGeometry {
  const O = '#e8622a', parts: THREE.BufferGeometry[] = [];
  for (const x of [-7, 7]) for (const z of [-5, 5]) parts.push(paint(place(box(1, 22, 1), x, 11, z), O, 0.04, 9));
  for (const z of [-5, 5]) parts.push(paint(place(box(15, 1.4, 1.2), 0, 22, z), O));
  parts.push(paint(place(box(1.2, 1.4, 11), -7, 22, 0), O), paint(place(box(1.2, 1.4, 11), 7, 22, 0), O));
  parts.push(paint(place(box(40, 1.6, 2.6), -8, 24, 0), '#d45a24'));
  parts.push(paint(beam(0, 32, 0, -26, 24.8, 0, 0.5), O), paint(beam(0, 32, 0, 12, 24.8, 0, 0.5), O));
  parts.push(paint(place(box(1.2, 8, 1.2), 0, 28, 0), O));
  parts.push(paint(place(box(3.4, 2.4, 3.4), -4, 22.2, 0), '#f1f1ea'));
  parts.push(glow(paint(place(box(0.6, 0.6, 0.6), -27, 25.3, 0), '#ff2a3a'), 2.2));
  return merge(parts);
}

/** Stacked shipping containers (2 × 3), ribbed doors, harbour colours. */
function containerStack(): THREE.BufferGeometry {
  const cols = ['#c0392b', '#2e86ab', '#e1a52b', '#2f9e62', '#7d4fa0', '#d9dde2'];
  const R = rng(41), parts: THREE.BufferGeometry[] = [];
  for (let lv = 0; lv < 3; lv++) {
    for (let j = 0; j < 2; j++) {
      if (lv === 2 && j === 1) continue;
      const c = cols[Math.floor(R() * cols.length)]!, x = j * 2.7, y = lv * 2.75 + 1.35;
      parts.push(paint(place(box(2.45, 2.6, 12), x, y, (R() - 0.5) * 1.2), c, 0.04, lv * 7 + j));
      for (let r = -5; r <= 5; r += 1.25) parts.push(paint(place(box(2.55, 2.2, 0.12), x, y, r), c, 0.1, 3));
    }
  }
  return merge(parts);
}

/** Sodium street lamp leaning over the road (+X). */
function streetLamp(): THREE.BufferGeometry {
  return merge([
    paint(place(cyl(0.14, 0.2, 8, 6), 0, 4, 0), '#2a2d36'),
    paint(beam(0, 7.9, 0, 2.6, 8.5, 0, 0.18), '#2a2d36'),
    paint(place(rbox(1.3, 0.3, 0.6, 0.08, 2), 2.8, 8.4, 0), '#2a2d36'),
    paint(place(box(1.1, 0.12, 0.45), 2.8, 8.22, 0), '#ffc87a'),
  ]);
}

/** Toll booth with a canopy and a light strip (the toll plaza on Skyway Interchange). */
function tollBooth(): THREE.BufferGeometry {
  return merge([
    paint(place(rbox(2.2, 2.8, 3.2, 0.2, 2), 0, 1.4, 0), '#d9dde2', 0.04, 3),
    paint(place(box(2.3, 0.9, 3.3), 0, 2.2, 0), '#3b4a66'),
    paint(place(box(2.8, 0.2, 3.6), 0, 2.95, 0), '#2a2d36'),
    paint(place(box(1.2, 5.8, 1.2), 0, 2.9, -8), CONCRETE), paint(place(box(1.2, 5.8, 1.2), 0, 2.9, 8), CONCRETE),
    paint(place(box(3.5, 0.9, 18), 0, 6.2, 0), '#e8ebf0'),
    glow(paint(place(box(3.6, 0.2, 18.2), 0, 5.7, 0), CYAN), 1.8),
    paint(place(box(0.3, 1.2, 0.3), 1.4, 0.6, 1.6), '#ff4fa3'),
  ]);
}

/** Strobing tunnel light bar (flickering neon). */
function strobeBar(): THREE.BufferGeometry {
  return merge([paint(place(box(0.35, 0.35, 5.5), 0, 5.2, 0), '#dff9ff'), paint(place(box(0.2, 5.2, 0.2), 0, 2.6, -2.6), '#dff9ff'), paint(place(box(0.2, 5.2, 0.2), 0, 2.6, 2.6), '#dff9ff')]);
}

/** Traffic car (F5 traffic hazard): rounded hatch, glowing tail and head lights; long axis along +Z. */
function car(): THREE.BufferGeometry {
  return merge([
    paint(place(rbox(1.9, 0.8, 4.2, 0.3, 2), 0, 0.65, 0), '#d8dce4', 0.03, 5),
    paint(place(rbox(1.7, 0.7, 2.3, 0.3, 2), 0, 1.35, -0.2), '#2a3346'),
    glow(paint(place(box(1.6, 0.18, 0.08), 0, 0.85, -2.12), '#ff2a3a'), 2),
    glow(paint(place(box(1.6, 0.16, 0.08), 0, 0.8, 2.12), '#fff3c4'), 2),
    ...[-1.4, 1.4].flatMap((z) => [-0.95, 0.95].map((x) => paint(place(cyl(0.34, 0.34, 0.25, 8), x, 0.34, z, 0, 0, Math.PI / 2), '#16181f'))),
  ]);
}

/** Metro car (F5 train hazard): 24 m, long axis along +Z, lit window band and magenta livery stripe. */
function metro(): THREE.BufferGeometry {
  const parts = [paint(place(rbox(3.2, 3.4, 24, 0.5, 2), 0, 2.0, 0), '#cfd4dc', 0.03, 8), paint(place(box(3.26, 0.35, 24.05), 0, 1.2, 0), MAGENTA)];
  for (let z = -10; z <= 10; z += 2.5) for (const sx of [1, -1]) parts.push(glow(paint(place(box(0.05, 0.9, 1.9), sx * 1.62, 2.6, z), WARM), 1.6));
  parts.push(glow(paint(place(box(2.4, 0.4, 0.05), 0, 1.6, 12.02), '#fff3c4'), 2.2));
  return merge(parts);
}

/** Deck support under elevated roads (compiler-placed): concrete column with a cyan neon collar. */
function pier(): THREE.BufferGeometry {
  return merge([
    paint(place(rbox(1.6, 6, 1.6, 0.2, 2), 0, 3, 0), CONCRETE, 0.05, 23),
    paint(place(box(3.6, 0.6, 2.2), 0, 5.8, 0), '#5d616d'),
    glow(paint(place(box(1.7, 0.18, 1.7), 0, 1.2, 0), CYAN), 1.8),
  ]);
}

/** Overhead sign gantry (compiler-placed at branch splits; spans ±9 m like the default). */
function signGantry(): THREE.BufferGeometry {
  return merge([
    paint(place(box(0.7, 7, 0.7), -9, 3.5, 0), STEEL), paint(place(box(0.7, 7, 0.7), 9, 3.5, 0), STEEL),
    paint(place(box(19, 0.9, 0.9), 0, 6.8, 0), STEEL),
    paint(place(box(8, 1.8, 0.3), -3.5, 5.8, 0.2), '#1f5a3a'),
    glow(paint(place(box(7.4, 0.2, 0.32), -3.5, 5.4, 0.2), '#e8f3ff'), 1.6),
    glow(paint(place(box(3, 1.2, 0.32), 4.5, 5.9, 0.2), AMBER), 1.6),
  ]);
}

/** Crash cushion at a split gore: water-filled barrels in harbour yellow with a reflective chevron board. */
function goreCushion(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j <= i; j++) parts.push(paint(place(cyl(0.42, 0.45, 1.0, 8), (j - i / 2) * 0.9, 0.5, -i * 0.85), i % 2 ? '#1c1f26' : '#ffd23f'));
  parts.push(glow(paint(place(box(1.6, 0.7, 0.1), 0, 1.4, 0.45), MAGENTA), 1.5));
  return merge(parts);
}

/** Subway station canopy with platform lights (subway platform on Skyway Interchange). */
function stationCanopy(): THREE.BufferGeometry {
  const parts = [paint(place(box(4, 0.5, 30), 0, 5.2, 0), '#d9dde2'), paint(place(box(4, 0.8, 30), 0, 0.4, 0), CONCRETE)];
  for (let z = -12; z <= 12; z += 8) parts.push(paint(place(cyl(0.2, 0.2, 4.8, 6), 1.4, 2.8, z), STEEL));
  parts.push(glow(paint(place(box(0.4, 0.12, 28), 1.2, 4.9, 0), '#e8f3ff'), 1.8));
  parts.push(paint(place(box(0.2, 1.2, 3), 1.9, 4.2, 0), '#2e86ab'));
  return merge(parts);
}

export const NEON_PROPS: Record<string, PropFactory> = {
  tower_a: { build: () => ({ geometry: towerA(), material: selfLit(), castShadow: false }), maxInstances: 256 },
  tower_b: { build: () => ({ geometry: towerB(), material: selfLit(), castShadow: false }), maxInstances: 256 },
  neon_sign: { build: () => ({ geometry: neonSign(), material: selfLit() }) },
  billboard: { build: () => ({ geometry: billboard(), material: selfLit() }) },
  harbor_crane: { build: () => ({ geometry: harborCrane(), material: metal(), castShadow: true }) },
  container_stack: { build: () => ({ geometry: containerStack(), material: metal(), castShadow: true }) },
  street_lamp: { build: () => ({ geometry: streetLamp(), material: selfLit() }) },
  toll_booth: { build: () => ({ geometry: tollBooth(), material: lit(), castShadow: true }) },
  strobe_bar: { build: () => ({ geometry: strobeBar(), material: MaterialLibrary.neon('#dff9ff', 4, 0.8) }) },
  station_canopy: { build: () => ({ geometry: stationCanopy(), material: lit(), castShadow: true }) },
  hazard_car: { build: () => ({ geometry: car(), material: metal(), castShadow: true }) },
  hazard_train: { build: () => ({ geometry: metro(), material: metal(), castShadow: true }) },
  pillar: { build: () => ({ geometry: pier(), material: lit(), castShadow: true }) },
  gantry: { build: () => ({ geometry: signGantry(), material: lit(), castShadow: true }) },
  gore_cushion: { build: () => ({ geometry: goreCushion(), material: lit() }) },
};
