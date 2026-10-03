// Coral Cove bespoke props — a tropical harbour built like a vinyl toy playset: chunky rounded shapes, glossy paint,
// turquoise sea, sun-bleached wood, red-and-white sails and a very friendly kraken. Every prop faces local +X (the road)
// and extends toward −X; local +Z runs along the track. PROPS rows sit at road height − 0.2 m, so anything that floats
// puts its waterline at SEA_Y (the sea plane is placed the same way, so both line up beside a sea-level road).
import * as THREE from 'three/webgpu';
import { MaterialLibrary } from '../../materials/library.ts';
import type { PropFactory } from '../../props/defaults.ts';
import { merge, paint, place, rbox, box, cyl, cone, sph, ico, sparkleGeometry, torus } from '../../util/geo.ts';

/** Sea surface relative to a prop origin (road height − 0.2 m): the water sits 1.3 m below a sea-level road. */
export const SEA_Y = -1.1;

// Materials: parameter sets already used by the scene (chevrons, default props, kart parts, mascots) plus one water material.
const gloss = (): THREE.Material => MaterialLibrary.vertexLit(0.4, 0);
const matte = (): THREE.Material => MaterialLibrary.vertexLit(0.8, 0);
const metal = (): THREE.Material => MaterialLibrary.vertexLit(0.5, 0.2);
const vinyl = (): THREE.Material => MaterialLibrary.vinyl({ rim: '#ffd9c7', roughness: 0.42, clearcoat: 0.6 });

const C = {
  sea: '#1fb5c9', lagoon: '#7fe3d6', sand: '#f6e3b4', wood: '#8b5a2b', woodLight: '#b9854f', woodPale: '#d9b98a',
  sail: '#f2f2f2', red: '#d94f4f', white: '#fafafa', rope: '#e0c79a', rock: '#9c8a74', rockDark: '#7c6c5a', rockLight: '#b8a68c',
  leaf: '#4f8f40', leafLight: '#6ea44c', trunk: '#8a6340', trunkDark: '#6f4c2f', coconut: '#5a3a22', kraken: '#e0607e',
  krakenDark: '#b8456a', sucker: '#ffd1dc', gold: '#e0b04b', iron: '#2f3136', glass: '#fff3c0', navy: '#2d4a6b', net: '#3c6e5a',
} as const;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** One tentacle as a chain of shrinking glossy spheres along a curl in the XY plane, suckers on the inner side. */
function tentacle(height: number, curl: number, r0: number, seed: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const n = 16;
  let x = 0, y = 0, a = Math.PI / 2;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const r = r0 * (1 - 0.78 * t);
    parts.push(paint(place(ico(r, 1), x, y, 0), i % 2 ? C.kraken : '#e86b88', 0.05, seed + i));
    if (i % 2 === 0 && i < n - 2) {
      const sx = x + Math.cos(a + Math.PI / 2) * r * 0.85, sy = y + Math.sin(a + Math.PI / 2) * r * 0.85;
      parts.push(paint(place(cyl(r * 0.32, r * 0.32, r * 0.25, 8), sx, sy, 0, 0, 0, a), C.sucker));
    }
    const step = (height / n) * (1.25 - 0.5 * t);
    a += curl * t * 0.32;
    x += Math.cos(a) * step; y += Math.sin(a) * step;
  }
  return parts;
}

/** Galleon rail stripe, porthole rims and road-opening frame (review round). */
const RAIL = '#e9d6b0';

export const CORAL_PROPS: Record<string, PropFactory> = {
  /** The sea: one big turquoise disc placed once per track (PROPS … every= larger than the range). */
  sea: {
    build: () => {
      const g = new THREE.CircleGeometry(1700, 72);
      g.rotateX(-Math.PI / 2);
      g.translate(0, SEA_Y, 0);
      return { geometry: paint(g, C.white), material: MaterialLibrary.world({ color: '#19a9c2', color2: '#5fd4d2', roughness: 0.14, metalness: 0.05, noiseScale: 0.012, vertexAO: true }) };
    },
    maxInstances: 2,
  },
  /** Start/finish arch: palm-wood posts wrapped in rope, a wave board and bunting (placed on the centreline, scaled w/16). */
  gantry: {
    build: () => {
      const parts: THREE.BufferGeometry[] = [];
      for (const x of [-11.2, 11.2]) {
        parts.push(paint(place(cyl(0.55, 0.7, 8.6, 9), x, 4.3, 0), C.trunk, 0.06, 3));
        for (let k = 0; k < 4; k++) parts.push(paint(place(cyl(0.72, 0.72, 0.25, 9), x, 1.2 + k * 1.9, 0), C.rope));
      }
      parts.push(paint(place(rbox(24, 1.9, 1.0, 0.45, 2), 0, 8.4, 0), C.sea));
      for (let k = 0; k < 7; k++) parts.push(paint(place(cyl(0.9, 0.9, 1.06, 12), -9 + k * 3, 8.4, 0, Math.PI / 2, 0, 0), k % 2 ? C.lagoon : C.white));
      parts.push(paint(place(box(24.2, 0.3, 1.05), 0, 9.45, 0), C.sand));
      // bunting: small flags hanging from a rope under the board
      const flag = [C.red, C.white, C.gold, C.sea];
      for (let k = 0; k < 20; k++) parts.push(paint(place(cone(0.34, 0.7, 3), -10.4 + k * 1.1, 6.9 - Math.sin((k / 19) * Math.PI) * 0.5, 0, Math.PI, 0, 0), flag[k % 4]!));
      parts.push(paint(place(sparkleGeometry(2.0, 0.3, 5), 0, 10.9, 0), '#d97757'));
      return { geometry: merge(parts), material: gloss(), castShadow: true };
    },
    maxInstances: 2,
  },
  /** Curved coconut palm (~8 m) with seven fronds. */
  palm: {
    build: () => {
      const parts: THREE.BufferGeometry[] = [];
      let x = 0, y = -0.35;
      for (let i = 0; i < 8; i++) {
        const r = 0.3 - i * 0.015;
        parts.push(paint(place(cyl(r - 0.02, r, 1.05, 7), x, y + 0.5, 0, 0, 0, -0.05 - i * 0.035), i % 2 ? C.trunk : C.trunkDark));
        x -= 0.06 + i * 0.045; y += 1.0;
      }
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2 + 0.3;
        const cx = Math.cos(a), cz = Math.sin(a);
        parts.push(paint(place(box(2.2, 0.08, 0.75), x + cx * 1.0, y + 0.25, cz * 1.0, 0, -a, 0.25), k % 2 ? C.leaf : C.leafLight, 0.08, k + 1));
        parts.push(paint(place(box(1.9, 0.08, 0.6), x + cx * 2.8, y - 0.35, cz * 2.8, 0, -a, -0.55), k % 2 ? C.leafLight : C.leaf, 0.08, k + 9));
      }
      for (let k = 0; k < 3; k++) parts.push(paint(place(sph(0.22, 6, 4), x + Math.cos(k * 2.1) * 0.35, y - 0.2, Math.sin(k * 2.1) * 0.35), C.coconut));
      return { geometry: merge(parts), material: matte(), castShadow: true };
    },
    maxInstances: 500,
  },
  /** Dock pilings with a rope rail, for pier edges (top just above the deck, feet in the sea for decks up to +4.5 m). */
  pier_post: {
    build: () => ({
      geometry: merge([
        paint(place(cyl(0.22, 0.26, 7.4, 7), 0, -3.2, -1.2), C.woodLight, 0.08, 2),
        paint(place(cyl(0.22, 0.26, 7.4, 7), 0, -3.2, 1.2), C.woodLight, 0.08, 4),
        paint(place(cyl(0.26, 0.26, 0.12, 7), 0, 0.5, -1.2), C.woodPale), paint(place(cyl(0.26, 0.26, 0.12, 7), 0, 0.5, 1.2), C.woodPale),
        paint(place(cyl(0.05, 0.05, 2.4, 4), 0, 0.25, 0, Math.PI / 2, 0, 0), C.rope),
        paint(place(box(0.5, 0.18, 2.9), -0.1, -0.35, 0), C.wood),
      ]), material: matte(),
    }),
    maxInstances: 400,
  },
  /** Little fishing boat floating at the waterline (bow toward +Z). */
  boat: {
    build: () => ({
      geometry: merge([
        paint(place(rbox(2.6, 1.3, 6.2, 0.5, 3), 0, SEA_Y + 0.25, 0), C.red),
        paint(place(cone(1.3, 1.9, 8), 0, SEA_Y + 0.25, 3.8, Math.PI / 2, 0, 0, 1, 1, 0.55), C.red),
        paint(place(box(2.65, 0.25, 6.1), 0, SEA_Y + 0.85, 0), C.white),
        paint(place(rbox(1.7, 1.3, 1.9, 0.25, 2), 0, SEA_Y + 1.55, -0.9), C.white),
        paint(place(box(1.72, 0.35, 1.2), 0, SEA_Y + 1.7, -0.9), C.sea),
        paint(place(cyl(0.07, 0.07, 3.6, 5), 0, SEA_Y + 2.8, 1.2), C.wood),
        paint(place(box(0.05, 0.6, 0.9), 0, SEA_Y + 4.3, 1.65), C.gold),
      ]), material: gloss(), castShadow: true,
    }),
    maxInstances: 60,
  },
  /** The moored galleon (landmark, ~44 m): striped sails, gun ports, stern castle; hull faces the road with its port side. */
  galleon: {
    build: () => {
      const parts: THREE.BufferGeometry[] = [
        paint(place(rbox(11, 6.5, 38, 1.4, 3), -6, SEA_Y + 1.5, 0), C.wood, 0.05, 3),
        paint(place(cone(5.4, 8, 8), -6, SEA_Y + 2.0, 22.5, Math.PI / 2, 0, 0, 1, 1, 0.75), C.wood, 0.05, 5),
        paint(place(box(11.2, 0.6, 38), -6, SEA_Y + 4.1, 0), C.gold),
        paint(place(box(11.1, 0.9, 38.2), -6, SEA_Y + 0.4, 0), '#5c3a1c'),
        paint(place(rbox(11.4, 5, 9, 0.8, 2), -6, SEA_Y + 6.8, -15), C.woodLight, 0.05, 7),
        paint(place(box(11.6, 0.5, 9.2), -6, SEA_Y + 9.4, -15), C.red),
        paint(place(box(10.6, 0.3, 30), -6, SEA_Y + 4.9, 3), C.woodPale),
      ];
      for (let k = 0; k < 8; k++) parts.push(paint(place(box(0.2, 0.9, 1.2), -0.45, SEA_Y + 2.7, -13 + k * 3.6), '#1b1b1f'));
      for (const [z, h] of [[-4, 24], [7, 28], [17, 20]] as const) {
        parts.push(paint(place(cyl(0.45, 0.6, h, 8), -6, SEA_Y + 4.5 + h / 2, z), C.trunkDark));
        for (const [yy, w, hh] of [[h * 0.42, 13, 6.5], [h * 0.78, 10, 5]] as const) {
          for (let s = 0; s < 3; s++) parts.push(paint(place(box(w, hh / 3, 0.35), -6, SEA_Y + 4.5 + yy - hh / 3 + s * (hh / 3), z + 0.6, 0, 0, 0), s % 2 ? C.red : C.sail));
          parts.push(paint(place(cyl(0.15, 0.15, w + 1, 5), -6, SEA_Y + 4.5 + yy + hh / 2, z + 0.3, 0, 0, Math.PI / 2), C.trunkDark));
        }
        parts.push(paint(place(box(0.08, 1.2, 2.2), -6, SEA_Y + 4.5 + h + 0.8, z + 1.1), C.red));
      }
      return { geometry: merge(parts), material: gloss(), castShadow: true };
    },
    maxInstances: 2,
  },
  /** Striped lighthouse on a rock base (landmark, ~30 m); a bright lantern room and a red dome. */
  lighthouse: {
    build: () => {
      const parts: THREE.BufferGeometry[] = [paint(place(ico(7.5, 1), -9, -3.5, 0, 0, 0, 0, 1.3, 0.7, 1.2), C.rock, 0.12, 5)];
      const bands = 6, h = 3.8;
      for (let k = 0; k < bands; k++) {
        const r0 = 3.2 - k * 0.22, r1 = r0 - 0.22;
        parts.push(paint(place(cyl(r1, r0, h, 14), -9, 1.5 + k * h + h / 2, 0), k % 2 ? C.white : C.red));
      }
      const top = 1.5 + bands * h;
      parts.push(paint(place(cyl(2.9, 2.7, 0.5, 14), -9, top + 0.25, 0), C.iron));
      for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; parts.push(paint(place(box(0.1, 1.0, 0.1), -9 + Math.cos(a) * 2.8, top + 1.0, Math.sin(a) * 2.8), C.iron)); }
      parts.push(paint(place(cyl(2.85, 2.85, 0.12, 14), -9, top + 1.5, 0), C.iron));
      parts.push(paint(place(cyl(1.7, 1.7, 2.6, 12), -9, top + 1.8, 0), '#fff8d6'));
      parts.push(paint(place(sph(1.9, 12, 6), -9, top + 3.2, 0, 0, 0, 0, 1, 0.7, 1), C.red));
      parts.push(paint(place(cone(0.35, 1.2, 6), -9, top + 4.8, 0), C.iron));
      parts.push(paint(place(box(0.2, 2.2, 1.3), -5.8, 2.6, 0), C.navy));
      for (let k = 1; k < 5; k++) parts.push(paint(place(box(0.2, 0.9, 0.7), -9 + (3.1 - k * 0.22), 2 + k * h, 0), C.navy));
      return { geometry: merge(parts), material: gloss(), castShadow: true };
    },
    maxInstances: 3,
  },
  /** A single friendly kraken tentacle curling up out of the water (~12 m), glossy vinyl. */
  kraken_tentacle: {
    build: () => ({ geometry: merge(tentacle(12, 1.1, 1.5, 7).map((g) => place(g, -2, SEA_Y - 0.5, 0))), material: vinyl(), castShadow: true }),
    maxInstances: 40,
  },
  /** Two tentacles rising from both sides of the road and curling overhead (placed on the centreline): static arch. */
  tentacle_arch: {
    build: () => {
      const parts: THREE.BufferGeometry[] = [];
      for (const side of [-1, 1]) {
        for (const g of tentacle(13, 0.9, 1.7, side > 0 ? 3 : 11)) {
          // curl toward the centreline: mirror the left tentacle, lean both inward
          place(g, 0, 0, 0, 0, side < 0 ? Math.PI : 0, 0);
          place(g, side * 13, SEA_Y - 0.4, 0, 0, 0, side * 0.28);
          parts.push(g);
        }
      }
      return { geometry: merge(parts), material: vinyl(), castShadow: true };
    },
    maxInstances: 8,
  },
  /** Fish-market stall: counter, striped awning, crates of fish. */
  market_stall: {
    build: () => {
      const parts: THREE.BufferGeometry[] = [
        paint(place(rbox(2.4, 1.1, 5, 0.15, 2), -1.4, 0.55, 0), C.woodLight, 0.06, 3),
        paint(place(box(2.5, 0.12, 5.1), -1.4, 1.14, 0), C.woodPale),
      ];
      for (const [x, z] of [[-0.2, -2.4], [-0.2, 2.4], [-2.6, -2.4], [-2.6, 2.4]] as const) parts.push(paint(place(cyl(0.07, 0.07, 3.1, 5), x, 1.55, z), C.wood));
      for (let k = 0; k < 7; k++) parts.push(paint(place(box(3.4, 0.1, 0.78), -1.2, 3.05, -2.7 + k * 0.78, 0, 0, -0.28), k % 2 ? C.white : C.red));
      for (let k = 0; k < 3; k++) {
        const z = -1.6 + k * 1.6;
        parts.push(paint(place(box(1.0, 0.3, 1.2), -0.9, 1.35, z), C.woodPale));
        for (let f = 0; f < 3; f++) parts.push(paint(place(sph(0.16, 6, 4), -0.9, 1.55, z - 0.35 + f * 0.35, 0, 0, 0, 2.1, 0.8, 0.9), f % 2 ? '#7fa6c9' : '#c9d6e3'));
      }
      parts.push(paint(place(box(0.08, 0.6, 2.2), 0.05, 3.5, 0), C.sea));
      return { geometry: merge(parts), material: gloss() };
    },
    maxInstances: 40,
  },
  /** Lifeguard tower on stilts with a ramp and a flag. */
  lifeguard_tower: {
    build: () => {
      const parts: THREE.BufferGeometry[] = [];
      for (const [x, z] of [[-1, -1], [-1, 1], [-3, -1], [-3, 1]] as const) parts.push(paint(place(box(0.2, 3.4, 0.2), x, 1.7, z), C.white));
      parts.push(paint(place(rbox(2.9, 2.2, 2.9, 0.25, 2), -2, 4.5, 0), C.white));
      parts.push(paint(place(box(2.95, 0.5, 2.95), -2, 4.2, 0), C.red));
      parts.push(paint(place(rbox(3.6, 0.35, 3.6, 0.12, 2), -2, 5.8, 0), C.sea));
      parts.push(paint(place(box(0.1, 0.9, 1.9), -0.5, 4.9, 0), C.navy));
      parts.push(paint(place(box(1.0, 0.12, 4.2), -0.6, 1.7, 2.6, -0.75, 0, 0), C.woodLight));
      parts.push(paint(place(cyl(0.04, 0.04, 2.4, 4), -3.2, 7.0, -1.2), C.iron), paint(place(box(0.05, 0.6, 1.0), -3.2, 7.8, -0.7), C.red));
      return { geometry: merge(parts), material: gloss(), castShadow: true };
    },
    maxInstances: 12,
  },
  /** Dock cargo: barrels and crates. */
  cargo: {
    build: () => {
      const parts: THREE.BufferGeometry[] = [];
      for (const [x, z, y] of [[-0.6, -0.7, 0], [-0.6, 0.5, 0], [-1.7, -0.1, 0], [-1.1, -0.1, 1.2]] as const) {
        parts.push(paint(place(cyl(0.5, 0.45, 1.15, 10), x, y + 0.58, z), C.woodLight, 0.06, 3));
        parts.push(paint(place(cyl(0.52, 0.52, 0.1, 10), x, y + 0.3, z), C.iron), paint(place(cyl(0.52, 0.52, 0.1, 10), x, y + 0.9, z), C.iron));
      }
      parts.push(paint(place(rbox(1.4, 1.2, 1.4, 0.08, 2), -1.2, 0.6, 2.0), C.woodPale, 0.05, 5), paint(place(rbox(1.1, 1.0, 1.1, 0.08, 2), -1.2, 1.7, 2.0), C.wood, 0.05, 7));
      return { geometry: merge(parts), material: matte() };
    },
    maxInstances: 80,
  },
  /** Fort cannon on a wooden carriage, pointing out to sea (−X). */
  cannon: {
    build: () => ({
      geometry: merge([
        paint(place(rbox(1.8, 0.7, 1.3, 0.1, 2), -1, 0.65, 0), C.wood),
        paint(place(cyl(0.45, 0.45, 0.2, 10), -0.4, 0.45, 0.72, Math.PI / 2, 0, 0), C.trunkDark), paint(place(cyl(0.45, 0.45, 0.2, 10), -0.4, 0.45, -0.72, Math.PI / 2, 0, 0), C.trunkDark),
        paint(place(cyl(0.4, 0.3, 2.6, 10), -1.4, 1.35, 0, 0, 0, Math.PI / 2 + 0.18), C.iron),
        paint(place(cyl(0.46, 0.46, 0.3, 10), -2.6, 1.55, 0, 0, 0, Math.PI / 2 + 0.18), C.iron),
        paint(place(sph(0.28, 8, 6), -0.1, 1.1, 0), C.iron),
        paint(place(sph(0.25, 6, 4), 0.2, 0.25, 0.8), C.iron), paint(place(sph(0.25, 6, 4), 0.2, 0.25, 1.35), C.iron), paint(place(sph(0.25, 6, 4), 0.2, 0.62, 1.08), C.iron),
      ]), material: metal(), castShadow: true,
    }),
    maxInstances: 40,
  },
  /** Sea stack: a tall rock pillar with a grassy cap, standing in the water (up to ~16 m). */
  sea_stack: {
    build: () => ({
      geometry: merge([
        paint(place(ico(3.4, 1), 0, SEA_Y + 2, 0, 0.2, 0.4, 0, 1.2, 1.6, 1.1), C.rockDark, 0.12, 3),
        paint(place(ico(2.8, 1), 0.3, SEA_Y + 8, 0.2, 0.5, 0.1, 0.2, 1, 1.5, 0.95), C.rock, 0.12, 5),
        paint(place(ico(2.2, 1), 0, SEA_Y + 13, 0, 0.1, 0.7, 0, 1.05, 0.9, 1), C.rockLight, 0.1, 7),
        paint(place(ico(2.3, 1), 0, SEA_Y + 14.4, 0, 0, 0, 0, 1.1, 0.35, 1.05), C.leafLight, 0.1, 9),
      ]), material: matte(), castShadow: true,
    }),
    maxInstances: 60,
  },
  /** Rocky cliff mass under an elevated road edge (top just below the road, reaching ~20 m down). */
  cliff: {
    build: () => ({
      geometry: merge([
        paint(place(ico(6.5, 1), -5.5, -6.5, 0, 0.3, 0.2, 0.1, 1, 1.25, 1.35), C.rock, 0.12, 11),
        paint(place(ico(5.5, 1), -4.5, -14, 2, 0.1, 0.9, 0.3, 1.3, 1.1, 1.2), C.rockDark, 0.12, 13),
        paint(place(ico(4.2, 1), -2.8, -1.8, -2.5, 0.6, 0.3, 0.2, 1.1, 0.45, 1.3), C.rockLight, 0.1, 17),
        paint(place(ico(2.6, 1), -6.5, -0.9, 3.5, 0, 0.4, 0, 1.2, 0.35, 1.1), C.leafLight, 0.1, 19),
      ]), material: matte(), castShadow: true,
    }),
    maxInstances: 300,
  },
  /** Fishing net shed: plank walls, a sloped roof, nets drying on a frame, floats. */
  net_shed: {
    build: () => {
      const parts: THREE.BufferGeometry[] = [
        paint(place(box(5, 3.2, 6), -3.2, 1.6, 0), C.woodLight, 0.06, 3),
        paint(place(box(5.6, 0.25, 6.8), -3.2, 3.55, 0, 0, 0, 0.18), C.red),
        paint(place(box(0.1, 2, 1.6), -0.68, 1.0, -1), '#4a3320'),
      ];
      for (let k = 0; k < 6; k++) parts.push(paint(place(box(5.05, 0.06, 6.05), -3.2, 0.5 + k * 0.5, 0), C.wood));
      for (const z of [-2.6, 2.6]) parts.push(paint(place(cyl(0.07, 0.07, 2.6, 5), -0.3, 1.3, z + (z > 0 ? 1.8 : -1.8)), C.wood));
      for (let r = 0; r < 5; r++) for (const z of [-4.4, 4.4]) parts.push(paint(place(box(0.04, 0.05, 1.8), -0.3, 0.5 + r * 0.45, z), C.net));
      for (let c = 0; c < 5; c++) for (const z of [-4.4, 4.4]) parts.push(paint(place(box(0.04, 2.0, 0.05), -0.3, 1.4, z - 0.8 + c * 0.4), C.net));
      for (let k = 0; k < 4; k++) parts.push(paint(place(sph(0.18, 6, 4), -0.25, 2.35, -3.6 + k * 2.4), k % 2 ? C.gold : C.red));
      return { geometry: merge(parts), material: gloss() };
    },
    maxInstances: 20,
  },
  /** Sand bank under a sea-level road edge: flat top just under the shoulder, a wet band, sloping into the sea. */
  beach: {
    build: () => ({
      geometry: merge([
        paint(place(cyl(15, 19, 1.4, 20), -13, -0.75, 0, 0, 0, 0, 1, 1, 1.35), C.sand, 0.04, 3),
        paint(place(cyl(19.6, 21, 0.6, 20), -13, SEA_Y - 0.12, 0, 0, 0, 0, 1, 1, 1.35), '#dcc28c', 0.05, 5),
        paint(place(cyl(21.5, 23, 0.3, 20), -13, SEA_Y - 0.3, 0, 0, 0, 0, 1, 1, 1.35), '#8fe0d6', 0.03, 7),
      ]), material: matte(),
    }),
    maxInstances: 300,
  },
  /** Little sandy islet with two palms, for the far water (top ~1.5 m above the sea). */
  islet: {
    build: () => {
      const parts: THREE.BufferGeometry[] = [
        paint(place(sph(9, 16, 6), 0, SEA_Y - 5.6, 0, 0, 0, 0, 1.4, 0.8, 1), C.sand, 0.05, 3),
        paint(place(cyl(13.2, 14, 0.25, 18), 0, SEA_Y - 0.1, 0), '#8fe0d6', 0.03, 5),
      ];
      for (const [x, z, lean] of [[-2, 1, 0.25], [3, -2, -0.3]] as const) {
        let px = x, py = SEA_Y + 1.3;
        for (let i = 0; i < 7; i++) { parts.push(paint(place(cyl(0.26 - i * 0.015, 0.28 - i * 0.015, 1.05, 6), px, py + 0.5, z, 0, 0, lean), i % 2 ? C.trunk : C.trunkDark)); px -= lean * 0.9; py += 1.0; }
        for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; parts.push(paint(place(box(3.4, 0.08, 0.7), px + Math.cos(a) * 1.5, py - 0.1, z + Math.sin(a) * 1.5, 0, -a, -0.3), k % 2 ? C.leaf : C.leafLight)); }
      }
      return { geometry: merge(parts), material: matte(), castShadow: true };
    },
    maxInstances: 40,
  },
  /** Drive-through galleon (placed on the centreline of the flat deck section): hull sides, bow and stern castles,
   *  masts outside the road and striped sails high overhead. The road itself is the main deck. */
  galleon_deck: {
    build: () => {
      const parts: THREE.BufferGeometry[] = [];
      for (const side of [-1, 1]) {
        parts.push(paint(place(rbox(2.2, 8.5, 66, 0.8, 2), side * 11.2, -3.4, 0), C.wood, 0.05, side > 0 ? 3 : 5));
        parts.push(paint(place(box(2.3, 0.5, 66), side * 11.2, 0.6, 0), C.gold));
        parts.push(paint(place(box(2.25, 1.0, 66), side * 11.2, -5.8, 0), '#5c3a1c'));
        for (let k = 0; k < 9; k++) parts.push(paint(place(box(0.15, 0.9, 1.3), side * 12.35, -2.2, -26 + k * 6.5), '#1b1b1f'));
        // review round: a cream rail stripe both faces, round portholes on the lower deck (outside and facing the road),
        // and the hull tapering in towards bow and stern so it reads as a ship, not a 66 m box
        parts.push(paint(place(box(2.34, 0.42, 66.2), side * 11.2, -1.0, 0), RAIL));
        for (let k = 0; k < 10; k++) for (const face of [-1, 1]) {
          const x = side * (11.2 + face * 1.12), z = -27 + k * 6;
          parts.push(paint(place(torus(0.36, 0.08, 5, 12), x, -4.1, z, 0, Math.PI / 2, 0), RAIL), paint(place(cyl(0.3, 0.3, 0.1, 10), x, -4.1, z, 0, 0, Math.PI / 2), '#1b1b1f'));
        }
        for (const end of [-1, 1]) {
          parts.push(paint(place(rbox(2.2, 8.0, 9, 0.8, 2), side * 10.7, -3.6, end * 36.5, 0, -end * side * 0.2, 0), C.wood, 0.05, 7));
          parts.push(paint(place(box(2.3, 0.42, 9.1), side * 10.7, -1.0, end * 36.5, 0, -end * side * 0.2, 0), RAIL));
          // the road opening is framed: cream posts at both ends of the hull
          parts.push(paint(place(box(0.7, 9.4, 0.7), side * 9.75, 4.3, end * 33.2), RAIL));
        }
        for (const z of [-18, 4, 22]) {
          const h = z === 4 ? 26 : 21;
          parts.push(paint(place(cyl(0.45, 0.6, h, 8), side * 11.4, h / 2 - 1, z), C.trunkDark));
          parts.push(paint(place(box(0.08, 1.1, 2.0), side * 11.4, h + 0.2, z + 1), C.red));
        }
      }
      // sails and yards span the road high above the karts (lowest yard 9 m up)
      for (const z of [-18, 4, 22]) {
        const top = z === 4 ? 23 : 18.5;
        for (const [yy, hh] of [[top - 7.5, 6], [top - 1.5, 5]] as const) {
          for (let s = 0; s < 3; s++) parts.push(paint(place(box(20.4, hh / 3, 0.3), 0, yy + s * (hh / 3), z + 0.5), s % 2 ? C.red : C.sail));
          parts.push(paint(place(cyl(0.16, 0.16, 23.5, 5), 0, yy - 0.3, z + 0.3, 0, 0, Math.PI / 2), C.trunkDark));
        }
      }
      // both ends stay open for the road: the stern castle is an arch, the bow carries a bowsprit and figurehead high up
      parts.push(paint(place(box(24.6, 3.5, 8), 0, 7.6, -30), C.woodLight), paint(place(box(24.8, 0.5, 8.2), 0, 9.5, -30), C.red));
      for (const side of [-1, 1]) {
        parts.push(paint(place(box(2.4, 6.2, 8), side * 11.2, 3.0, -30), C.woodLight));
      }
      parts.push(paint(place(box(24.4, 1.4, 1.4), 0, 9.6, 33.5), C.woodLight));
      parts.push(paint(place(box(20.2, 0.5, 1.5), 0, 8.8, 33.2), RAIL), paint(place(box(20.2, 0.5, 1.5), 0, 5.6, -33.2), RAIL));
      parts.push(paint(place(cyl(0.3, 0.45, 16, 6), 0, 12.5, 39, 1.15, 0, 0), C.trunkDark));
      parts.push(paint(place(sparkleGeometry(2.4, 0.4, 13), 0, 10.6, 34.4), C.gold));
      return { geometry: merge(parts), material: gloss(), castShadow: true };
    },
    maxInstances: 2,
  },
  /** Harbour crane holding a cargo net over the water (static stand-in for the F5 swinging crane). */
  dock_crane: {
    build: () => {
      const parts: THREE.BufferGeometry[] = [];
      for (const [x, z] of [[-2, -2], [-2, 2], [-6, -2], [-6, 2]] as const) parts.push(paint(place(box(0.5, 14, 0.5), x, 7, z), C.gold));
      for (let y = 2; y < 14; y += 3) parts.push(paint(place(box(4.5, 0.25, 0.25), -4, y, -2), C.gold), paint(place(box(4.5, 0.25, 0.25), -4, y, 2), C.gold));
      parts.push(paint(place(rbox(5.4, 3, 5.4, 0.4, 2), -4, 15.5, 0), C.red), paint(place(box(1.6, 1.2, 0.1), -1.5, 15.8, 2.72), C.glass));
      parts.push(paint(place(box(22, 1.1, 1.1), -12, 17.5, 0, 0, 0, 0.12), C.gold));
      parts.push(paint(place(cyl(0.04, 0.04, 8, 4), -21, 13.5, 0), C.iron));
      parts.push(paint(place(ico(1.6, 1), -21, 8.8, 0, 0, 0, 0, 1, 1.2, 1), C.net, 0.1, 3), paint(place(box(1.2, 1.2, 1.2), -21, 8.6, 0), C.woodPale));
      return { geometry: merge(parts), material: metal(), castShadow: true };
    },
    maxInstances: 6,
  },
  /** Compiler-placed support under an elevated deck (only on tracks with terrain): a wooden pier trestle. TrackView
   *  stretches it in Y by (1 + height class); a 2.7 m base stays under the lowest deck of every class. */
  pillar: {
    build: () => ({
      geometry: merge([
        paint(place(cyl(0.35, 0.4, 2.6, 8), -1.6, 1.3, 0), C.woodLight), paint(place(cyl(0.35, 0.4, 2.6, 8), 1.6, 1.3, 0), C.woodLight),
        paint(place(box(4.2, 0.35, 0.8), 0, 2.52, 0), C.wood), paint(place(box(3.4, 0.2, 0.2), 0, 1.3, 0, 0, 0, 0.6), C.wood),
      ]), material: matte(), castShadow: true,
    }),
    maxInstances: 120,
  },
  /** Crash cushion at a branch split: a pile of lifebuoys and fenders. */
  gore_cushion: {
    build: () => {
      const parts: THREE.BufferGeometry[] = [];
      for (let k = 0; k < 5; k++) parts.push(paint(place(new THREE.TorusGeometry(0.55, 0.22, 8, 16), (k % 3 - 1) * 0.9, 0.3 + Math.floor(k / 3) * 0.45, -0.3 * Math.floor(k / 3), Math.PI / 2, 0, 0), k % 2 ? C.white : C.red));
      parts.push(paint(place(box(2.4, 0.9, 0.12), 0, 1.45, 0.5), C.sea));
      for (let k = 0; k < 3; k++) parts.push(paint(place(box(0.16, 0.7, 0.05), -0.7 + k * 0.7, 1.45, 0.58, 0, 0, 0.6), C.white));
      return { geometry: merge(parts), material: vinyl() };
    },
    maxInstances: 8,
  },
  // ---- hazard models (HAZ … prop=<key>), posed each frame by the renderer from track.hazardPose (vis v2 §8):
  // cylinders stand on the pose's up axis, capsules lie along it, boxes use (along f, across, up).
  /** Kraken Lighthouse cannonball impact (geyser, r 2.6): the ball, a foam column, a target ring on the road. */
  hazard_cannonball: {
    build: () => ({
      geometry: merge([
        paint(place(new THREE.TorusGeometry(2.4, 0.18, 6, 24), 0, 0.08, 0, Math.PI / 2, 0, 0), '#e5484d'),
        paint(place(cyl(1.1, 2.0, 3.2, 12), 0, 1.6, 0), C.white, 0.08, 3),
        paint(place(sph(1.6, 10, 6), 0, 3.4, 0, 0, 0, 0, 1, 0.6, 1), C.lagoon, 0.08, 5),
        paint(place(sph(0.85, 12, 8), 0, 4.6, 0), C.iron),
      ]), material: gloss(),
    }),
    maxInstances: 8,
  },
  /** Kraken tentacle segment swept across the sea-cave road (swinger capsule r 0.9, len 2.5, along the arm). */
  hazard_tentacle: { build: () => ({ geometry: merge(tentacle(5.5, 0.6, 1.0, 21).map((g) => place(g, 0, -2.2, 0))), material: vinyl(), castShadow: true }), maxInstances: 8 },
  /** Rolling cargo barrel for the pier traffic (axis across the road, rolls along it). */
  hazard_barrel: {
    build: () => ({
      geometry: merge([
        paint(place(cyl(0.75, 0.75, 1.5, 12), 0, 0.75, 0, 0, 0, Math.PI / 2), C.woodLight, 0.06, 3),
        paint(place(cyl(0.78, 0.78, 0.14, 12), -0.45, 0.75, 0, 0, 0, Math.PI / 2), C.iron),
        paint(place(cyl(0.78, 0.78, 0.14, 12), 0.45, 0.75, 0, 0, 0, Math.PI / 2), C.iron),
      ]), material: matte(), castShadow: true,
    }),
    maxInstances: 8,
  },
  /** The dock crane's swinging cargo net (swinger capsule r 1.3, len 1.6). */
  hazard_net: {
    build: () => ({
      geometry: merge([
        paint(place(ico(1.5, 1), 0, 0, 0, 0, 0, 0, 1, 1.15, 1), C.net, 0.1, 3),
        paint(place(box(1.0, 1.0, 1.0), 0.2, -0.3, 0.2), C.woodPale), paint(place(cyl(0.4, 0.4, 0.9, 8), -0.4, -0.2, -0.3), C.red),
      ]), hazardDecoration: paint(place(cyl(0.05, 0.05, 6, 4), 0, 3.6, 0), C.iron), material: gloss(), castShadow: true,
    }),
    maxInstances: 4,
  },
  /** Red-and-white harbour buoy with a lamp. */
  buoy: {
    build: () => ({
      geometry: merge([
        paint(place(sph(0.9, 12, 8), 0, SEA_Y + 0.1, 0, 0, 0, 0, 1, 0.75, 1), C.red),
        paint(place(cyl(0.55, 0.75, 1.0, 10), 0, SEA_Y + 0.9, 0), C.white),
        paint(place(cyl(0.35, 0.55, 0.9, 10), 0, SEA_Y + 1.8, 0), C.red),
        paint(place(sph(0.22, 8, 6), 0, SEA_Y + 2.45, 0), C.glass),
      ]), material: vinyl(),
    }),
    maxInstances: 120,
  },
  /** Coral heads poking out of the shallows: branching coral and a brain coral. */
  coral: {
    build: () => {
      const R = rng(9);
      const cols = ['#ff7aa2', '#ff9f5a', '#a17ae6', '#ffd166'];
      const parts: THREE.BufferGeometry[] = [paint(place(sph(1.4, 10, 6), -1.5, SEA_Y + 0.1, 1.2, 0, 0, 0, 1, 0.6, 1), '#f4a3b5', 0.1, 3)];
      for (let k = 0; k < 9; k++) {
        const a = R() * Math.PI * 2, d = 0.4 + R() * 1.6, h = 1.0 + R() * 1.6, c = cols[k % cols.length]!;
        const x = -2 + Math.cos(a) * d, z = -0.8 + Math.sin(a) * d;
        parts.push(paint(place(cyl(0.12, 0.2, h, 6), x, SEA_Y + h / 2 - 0.2, z, (R() - 0.5) * 0.5, 0, (R() - 0.5) * 0.5), c));
        parts.push(paint(place(sph(0.24, 6, 4), x, SEA_Y + h - 0.15, z), c));
      }
      return { geometry: merge(parts), material: vinyl() };
    },
    maxInstances: 120,
  },
};
