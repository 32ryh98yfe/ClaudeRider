// Spark Circuit bespoke props — a pro racing league built like a vinyl toy set: chunky rounded shapes, glossy paint,
// original sponsor-free graphics (chevrons, dots, stripes, the parametric sparkle). Every prop faces local +X (the road side)
// and extends toward −X, so PROPS rows never intrude on the track; local +Z runs along the track.
import type * as THREE from 'three/webgpu';
import { MaterialLibrary } from '../../materials/library.ts';
import type { PropFactory } from '../../props/defaults.ts';
import { merge, paint, place, rbox, box, cyl, cone, sph, ico, sparkleGeometry } from '../../util/geo.ts';

// Three shared materials for the whole kit (vertex colour carries the variation): glossy toy paint, matte, metal.
// The parameter sets match ones the scene already uses (chevrons, default props, kart parts), so the kit adds no materials.
const gloss = (): THREE.Material => MaterialLibrary.vertexLit(0.4, 0);
const matte = (): THREE.Material => MaterialLibrary.vertexLit(0.8, 0);
const metal = (): THREE.Material => MaterialLibrary.vertexLit(0.5, 0.2);

const C = {
  tarmac: '#3a3d42', graphite: '#2b2d33', kerbRed: '#e63946', white: '#fafafa', ivory: '#f5f4ed', concrete: '#c9c6bf',
  concreteDark: '#a9a59d', grass: '#5baa4a', sunset: '#ff8c42', purple: '#6a4c93', coral: '#d97757', sky: '#6a9bcc',
  sage: '#788c5d', mustard: '#e0b04b', glass: '#2a3d52', lamp: '#fff4cf', straw: '#dcae52', strawDark: '#c4923c',
  pine: '#2f6b3f', pineLight: '#3f8a4c', bark: '#6b4a33',
} as const;
const CROWD = [C.coral, C.ivory, C.sky, C.sage, C.mustard, C.purple, C.sunset, '#e8e2d6', '#b85c7a', '#4f8fa8'] as const;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Tiered seating with crowd cards, facing +X. `len` along Z; returns parts (not merged) so bigger stands can reuse it. */
function stand(len: number, tiers: number, seed: number, roofColor: string): THREE.BufferGeometry[] {
  const R = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const depth = tiers * 1.8 + 1;
  parts.push(paint(place(box(depth, 1.0, len), -depth / 2 + 0.5, 0.5, 0), C.concreteDark));
  for (let i = 0; i < tiers; i++) {
    const h = 1.3 + i * 1.05;
    parts.push(paint(place(box(1.8, h, len), -0.4 - i * 1.8, h / 2, 0), i % 2 ? C.concrete : '#d8d5ce'));
    // crowd cards: a body block and a head block, seeded colours, a few empty seats
    for (let z = -len / 2 + 0.6; z < len / 2 - 0.4; z += 0.95) {
      if (R() < 0.12) continue;
      const cc = CROWD[Math.floor(R() * CROWD.length)]!;
      const x = -0.2 - i * 1.8, y = h + 0.35;
      parts.push(paint(place(box(0.45, 0.62, 0.62), x, y, z), cc));
      parts.push(paint(place(box(0.36, 0.34, 0.36), x, y + 0.5, z), R() < 0.5 ? '#e9c9a8' : '#c49374'));
    }
  }
  const top = 1.3 + tiers * 1.05;
  parts.push(paint(place(box(0.5, top + 3.2, len), -depth + 0.4, (top + 3.2) / 2, 0), C.concrete));
  // cantilever roof with a painted fascia
  parts.push(paint(place(box(depth + 1.6, 0.35, len + 1), -depth / 2 + 0.2, top + 3.4, 0, 0, 0, -0.08), C.white));
  parts.push(paint(place(box(0.5, 0.9, len + 1), 1.0, top + 3.3, 0), roofColor));
  for (let z = -len / 2 + 1; z <= len / 2 - 1; z += (len - 2) / 3) parts.push(paint(place(cyl(0.18, 0.22, top + 3.2, 6), -depth + 1.0, (top + 3.2) / 2, z), C.graphite));
  return parts;
}

export const SPARK_PROPS: Record<string, PropFactory> = {
  /** Start/finish gantry spanning the road (placed on the centreline, scaled by w/16): start lights and a checkered band. */
  gantry: {
    build: () => {
      const parts: THREE.BufferGeometry[] = [];
      for (const x of [-11.2, 11.2]) {
        parts.push(paint(place(rbox(1.3, 8.4, 1.6, 0.35, 2), x, 4.2, 0), C.graphite));
        parts.push(paint(place(rbox(1.8, 0.6, 2.2, 0.2, 2), x, 0.3, 0), C.kerbRed));
      }
      parts.push(paint(place(rbox(24, 1.8, 1.4, 0.45, 2), 0, 8.2, 0), C.white));
      parts.push(paint(place(box(24.2, 0.35, 1.45), 0, 9.0, 0), C.kerbRed));
      for (let k = 0; k < 24; k++) parts.push(paint(place(box(0.98, 0.45, 1.46), -11.5 + k, 7.45, 0), k % 2 ? '#141413' : C.white));
      // five start-light pods on a black panel, both faces
      parts.push(paint(place(rbox(7.4, 1.5, 1.8, 0.3, 2), 0, 10.0, 0), '#141413'));
      for (let k = 0; k < 5; k++) for (const z of [-0.92, 0.92]) parts.push(paint(place(sph(0.36, 8, 6), -2.8 + k * 1.4, 10.0, z), '#ff3b30'));
      const sp = sparkleGeometry(2.2, 0.35, 11);
      parts.push(paint(place(sp, 0, 12.2, 0), C.coral));
      return { geometry: merge(parts), material: gloss(), castShadow: true };
    },
    maxInstances: 2,
  },
  /** Grandstand with crowd cards and a cantilever roof (24 m). */
  grandstand: { build: () => ({ geometry: merge(stand(24, 5, 17, C.kerbRed)), material: gloss(), castShadow: true }), maxInstances: 40 },
  /** Stadium stand for the sunset arena bowl: taller, longer, with two floodlight masts. */
  stadium: {
    build: () => {
      const parts = stand(30, 8, 29, C.purple);
      for (const z of [-14, 14]) {
        parts.push(paint(place(cyl(0.35, 0.5, 26, 8), -15, 13, z), C.graphite));
        parts.push(paint(place(rbox(0.8, 2.4, 5, 0.2, 2), -14.4, 26.4, z, 0, 0, -0.35), C.graphite));
        for (let k = 0; k < 4; k++) parts.push(paint(place(box(0.2, 0.8, 1.0), -13.9, 26.0 + (k % 2) * 1.0, z - 1.4 + Math.floor(k / 2) * 2.8, 0, 0, -0.35), C.lamp));
      }
      return { geometry: merge(parts), material: gloss(), castShadow: true };
    },
    maxInstances: 24,
  },
  /** Pit garage block (20 m): three bays with coloured door headers, front canopy over the pit apron. */
  pit_garage: {
    build: () => {
      const parts: THREE.BufferGeometry[] = [paint(place(rbox(10, 6, 20, 0.4, 2), -5, 3, 0), C.ivory)];
      const hdr = [C.coral, C.sky, C.sage];
      for (let k = 0; k < 3; k++) {
        const z = -6.5 + k * 6.5;
        parts.push(paint(place(box(0.2, 3.9, 5.2), 0.02, 1.95, z), '#3b3f47'));
        for (let s = 0; s < 6; s++) parts.push(paint(place(box(0.24, 0.08, 5.2), 0.03, 0.5 + s * 0.6, z), '#555a63'));
        parts.push(paint(place(box(0.3, 0.7, 5.6), 0.05, 4.35, z), hdr[k]!));
      }
      parts.push(paint(place(box(3.4, 0.3, 20.4), 1.5, 5.3, 0), C.white));
      parts.push(paint(place(box(0.35, 0.6, 20.4), 3.2, 5.25, 0), C.kerbRed));
      parts.push(paint(place(box(10.4, 0.6, 20.4), -5, 6.3, 0), C.graphite));
      parts.push(paint(place(cyl(0.06, 0.06, 2.4, 5), -7, 7.8, 7), C.graphite), paint(place(sph(0.25, 6, 4), -7, 9.1, 7), C.kerbRed));
      return { geometry: merge(parts), material: gloss(), castShadow: true };
    },
    maxInstances: 24,
  },
  /** Pit wall with the crew canopy and timing screens (20 m), between the pit apron and the track. */
  pit_wall: {
    build: () => {
      const parts: THREE.BufferGeometry[] = [paint(place(box(0.8, 1.1, 20), 0, 0.55, 0), C.concrete)];
      for (let k = 0; k < 10; k++) parts.push(paint(place(box(0.82, 0.25, 1.0), 0, 1.0, -9 + k * 2), k % 2 ? C.kerbRed : C.white));
      for (const z of [-8, 0, 8]) parts.push(paint(place(cyl(0.08, 0.08, 2.6, 5), -1.4, 1.3, z), C.graphite));
      parts.push(paint(place(box(2.6, 0.18, 20), -1.1, 2.7, 0), C.white), paint(place(box(2.6, 0.2, 20), -1.1, 2.86, 0), C.sunset));
      for (let z = -8; z <= 8; z += 4) parts.push(paint(place(box(0.12, 0.6, 1.0), -0.6, 2.1, z), '#101216'));
      return { geometry: merge(parts), material: gloss() };
    },
    maxInstances: 20,
  },
  /** Race-control tower (landmark): glass cab, red band, the parametric sparkle on a mast. */
  control_tower: {
    build: () => {
      const parts: THREE.BufferGeometry[] = [
        paint(place(rbox(8, 4, 8, 0.4, 2), -4, 2, 0), C.ivory),
        paint(place(cyl(1.6, 2.0, 16, 10), -4, 10, 0), C.white),
        paint(place(cyl(1.7, 1.7, 0.8, 10), -4, 8, 0), C.kerbRed),
        paint(place(rbox(10, 4.2, 10, 0.5, 2), -4, 19.5, 0), C.glass),
        paint(place(box(10.4, 0.7, 10.4), -4, 17.3, 0), C.kerbRed),
        paint(place(rbox(10.8, 0.7, 10.8, 0.3, 2), -4, 21.9, 0), C.white),
        paint(place(cyl(0.12, 0.12, 5, 5), -4, 24.7, 0), C.graphite),
      ];
      for (let k = 0; k < 4; k++) parts.push(paint(place(box(0.2, 3.2, 1.4), -4 + Math.cos((k * Math.PI) / 2) * 5.05, 19.6, Math.sin((k * Math.PI) / 2) * 5.05, 0, (k * Math.PI) / 2, 0), C.white));
      const sp = place(sparkleGeometry(3.4, 0.5, 23), -4, 28.6, 0, 0, Math.PI / 2, 0);
      parts.push(paint(sp, C.coral));
      return { geometry: merge(parts), material: gloss(), castShadow: true };
    },
    maxInstances: 2,
  },
  /** Stack of tyres with a painted top ring (3 along × 2 deep × 3 high). */
  tyre_wall: {
    build: () => {
      const parts: THREE.BufferGeometry[] = [];
      for (let a = 0; a < 3; a++) for (let d = 0; d < 2; d++) for (let h = 0; h < 3; h++) {
        const z = -1.0 + a * 1.0 + (d ? 0.5 : 0), x = -d * 0.9;
        parts.push(paint(place(cyl(0.48, 0.48, 0.34, 9), x, 0.18 + h * 0.36, z), '#1d1e22', 0.12, 3 + a + h));
      }
      for (let a = 0; a < 3; a++) parts.push(paint(place(cyl(0.5, 0.5, 0.1, 9), 0, 1.1, -1.0 + a * 1.0), a % 2 ? C.white : C.kerbRed));
      return { geometry: merge(parts), material: matte() };
    },
    maxInstances: 160,
  },
  /** Original sponsor-free advertising board: three panels (chevrons, a dot, stripes) on legs, 9 m. */
  banner: {
    build: () => {
      const parts: THREE.BufferGeometry[] = [];
      for (const z of [-4.2, 0, 4.2]) parts.push(paint(place(box(0.14, 0.5, 0.14), -0.1, 0.25, z), C.graphite));
      parts.push(paint(place(rbox(0.25, 1.5, 9.2, 0.08, 2), 0, 1.25, 0), C.white));
      // panel 1: coral with white chevrons
      parts.push(paint(place(box(0.08, 1.3, 2.9), 0.14, 1.25, -3.05), C.coral));
      for (let k = 0; k < 3; k++) {
        const z = -4.0 + k * 0.8;
        parts.push(paint(place(box(0.06, 0.62, 0.16), 0.2, 1.47, z, -0.8, 0, 0), C.white), paint(place(box(0.06, 0.62, 0.16), 0.2, 1.03, z, 0.8, 0, 0), C.white));
      }
      // panel 2: deep purple with a sunset disc and a horizon line
      parts.push(paint(place(box(0.08, 1.3, 2.9), 0.14, 1.25, 0), C.purple));
      parts.push(paint(place(cyl(0.45, 0.45, 0.06, 14), 0.2, 1.35, 0, 0, 0, Math.PI / 2), C.sunset), paint(place(box(0.07, 0.08, 2.5), 0.21, 1.0, 0), C.mustard));
      // panel 3: sky blue with diagonal white stripes
      parts.push(paint(place(box(0.08, 1.3, 2.9), 0.14, 1.25, 3.05), C.sky));
      for (let k = 0; k < 4; k++) parts.push(paint(place(box(0.06, 1.25, 0.22), 0.2, 1.25, 2.0 + k * 0.7, 0.5, 0, 0), C.white));
      return { geometry: merge(parts), material: gloss() };
    },
    maxInstances: 120,
  },
  /** Overhead bridge banner spanning the track (placed on the centreline): truss beam, chevron banner, stair towers. */
  footbridge: {
    build: () => {
      const parts: THREE.BufferGeometry[] = [];
      for (const x of [-16.5, 16.5]) {
        parts.push(paint(place(rbox(2.2, 10.4, 2.6, 0.4, 2), x, 5.2, 0), C.ivory));
        parts.push(paint(place(box(2.3, 0.6, 2.7), x, 3.0, 0), C.kerbRed));
      }
      parts.push(paint(place(rbox(35, 2.4, 2.8, 0.4, 2), 0, 9.2, 0), C.white));
      for (const z of [-1.46, 1.46]) {
        parts.push(paint(place(box(30, 1.6, 0.1), 0, 9.2, z), C.coral));
        for (let k = 0; k < 9; k++) {
          const x = -12 + k * 3;
          parts.push(paint(place(box(0.28, 1.0, 0.06), x - 0.2, 9.45, z * 1.02, 0, 0, -0.75), C.white), paint(place(box(0.28, 1.0, 0.06), x - 0.2, 8.95, z * 1.02, 0, 0, 0.75), C.white));
        }
      }
      parts.push(paint(place(box(35.2, 0.4, 2.9), 0, 10.6, 0), C.kerbRed));
      return { geometry: merge(parts), material: gloss(), castShadow: true };
    },
    maxInstances: 4,
  },
  /** Stadium floodlight mast. */
  floodlight: {
    build: () => {
      const parts: THREE.BufferGeometry[] = [
        paint(place(cyl(0.22, 0.4, 20, 8), 0, 10, 0), '#8c9098'),
        paint(place(rbox(1.2, 1.2, 1.2, 0.2, 2), 0, 0.6, 0), C.concreteDark),
        paint(place(rbox(0.6, 2.6, 4.2, 0.15, 2), 0.3, 20.6, 0, 0, 0, -0.3), C.graphite),
      ];
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) parts.push(paint(place(box(0.12, 0.9, 0.85), 0.62 + r * 0.3, 20.0 + r * 1.1, -1.5 + c * 1.0, 0, 0, -0.3), C.lamp));
      return { geometry: merge(parts), material: metal(), castShadow: true };
    },
    maxInstances: 60,
  },
  /** Marshal post: a little hut with a sunset roof and a flag. */
  marshal_post: {
    build: () => ({
      geometry: merge([
        paint(place(rbox(2.2, 2.4, 2.2, 0.3, 2), -1.2, 1.2, 0), C.white),
        paint(place(rbox(2.6, 0.4, 2.6, 0.15, 2), -1.2, 2.55, 0), C.sunset),
        paint(place(box(0.1, 1.0, 1.6), -0.08, 1.5, 0), C.glass),
        paint(place(cyl(0.05, 0.05, 3.6, 5), 0.2, 1.8, 1.0), C.graphite),
        paint(place(box(0.05, 0.7, 1.1), 0.2, 3.2, 1.6), '#f2c14e'),
      ]), material: gloss(),
    }),
    maxInstances: 40,
  },
  /** TV camera scaffold with an umbrella. */
  camera_tower: {
    build: () => {
      const parts: THREE.BufferGeometry[] = [];
      for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]] as const) parts.push(paint(place(box(0.16, 9, 0.16), x - 1.2, 4.5, z), '#9aa0a8'));
      for (let y = 1.5; y < 9; y += 2.5) { parts.push(paint(place(box(1.9, 0.1, 0.1), -1.2, y, -0.9), '#9aa0a8'), paint(place(box(1.9, 0.1, 0.1), -1.2, y, 0.9), '#9aa0a8')); }
      parts.push(paint(place(box(2.6, 0.25, 2.6), -1.2, 9.1, 0), C.graphite));
      parts.push(paint(place(rbox(0.9, 0.6, 0.5, 0.1, 2), -0.9, 9.7, 0), '#1c1d21'), paint(place(cyl(0.16, 0.2, 0.6, 8), -0.25, 9.7, 0, 0, 0, Math.PI / 2), '#3a3d42'));
      parts.push(paint(place(cyl(0.04, 0.04, 2, 4), -1.6, 10.2, 0), C.graphite), paint(place(cone(1.4, 0.6, 8), -1.6, 11.3, 0), C.kerbRed));
      return { geometry: merge(parts), material: metal() };
    },
    maxInstances: 12,
  },
  /** Stadium tunnel spanning the road (placed on the centreline): portal lintels, ceiling light strips, a stand on the roof. */
  tunnel: {
    build: () => {
      const parts: THREE.BufferGeometry[] = [];
      for (const x of [-12.8, 12.8]) {
        parts.push(paint(place(box(1.6, 8.4, 30), x, 4.2, 0), C.concrete));
        parts.push(paint(place(box(1.7, 0.7, 30.2), x, 1.2, 0), C.kerbRed));
      }
      parts.push(paint(place(box(27.2, 1.4, 30), 0, 9.1, 0), C.concreteDark));
      for (const z of [-15.2, 15.2]) {
        parts.push(paint(place(box(28.4, 1.2, 0.8), 0, 8.0, z), C.white));
        for (let k = 0; k < 14; k++) parts.push(paint(place(box(1.0, 0.5, 0.85), -13 + k * 2, 8.8, z), k % 2 ? C.kerbRed : C.white));
      }
      for (const x of [-10, 10]) parts.push(paint(place(box(0.5, 0.18, 28), x, 8.3, 0), C.lamp));
      // the stand on the roof looks into the bowl (+Z); built facing +X, turned a quarter
      for (const g of stand(26, 4, 41, C.sunset)) parts.push(place(g, 0, 9.8, -2, 0, -Math.PI / 2, 0));
      return { geometry: merge(parts), material: gloss(), castShadow: true };
    },
    maxInstances: 4,
  },
  /** Bridge girder under an elevated deck (placed on the centreline, top just under the road). */
  bridge_span: {
    build: () => ({
      geometry: merge([
        paint(place(box(13, 1.6, 20.4), 0, -1.15, 0), C.concrete),
        paint(place(box(13.4, 0.45, 20.4), 0, -0.55, 0), C.kerbRed),
        paint(place(box(11, 0.5, 20.4), 0, -2.1, 0), C.concreteDark),
      ]), material: gloss(), castShadow: true,
    }),
    maxInstances: 24,
  },
  /** Bridge pier: a twin column dropping from under the girder to the ground (buried at the foot). */
  bridge_pier: {
    build: () => ({
      geometry: merge([
        paint(place(rbox(1.8, 13, 2.4, 0.3, 2), -3.2, -8.4, 0), C.concrete),
        paint(place(rbox(1.8, 13, 2.4, 0.3, 2), 3.2, -8.4, 0), C.concrete),
        paint(place(box(9.6, 1.4, 2.8), 0, -2.9, 0), C.concreteDark),
      ]), material: gloss(), castShadow: true,
    }),
    maxInstances: 16,
  },
  /** Round hay bales (rally barriers), two down one up. */
  hay_bale: {
    build: () => ({
      geometry: merge([
        paint(place(cyl(0.8, 0.8, 1.3, 12), 0, 0.8, -0.75, Math.PI / 2, 0, 0), C.straw, 0.1, 5),
        paint(place(cyl(0.8, 0.8, 1.3, 12), 0, 0.8, 0.75, Math.PI / 2, 0, 0), C.straw, 0.1, 9),
        paint(place(cyl(0.8, 0.8, 1.3, 12), -0.2, 2.2, 0, Math.PI / 2, 0, 0), C.strawDark, 0.1, 13),
      ]), material: matte(),
    }),
    maxInstances: 200,
  },
  /** Infield broadleaf tree (overrides the default, whose foliage colour comes from palette[2], white in this theme). */
  tree_round: {
    build: () => ({
      geometry: merge([
        paint(place(cyl(0.25, 0.35, 2.4, 7), 0, 1.2, 0), C.bark),
        paint(place(ico(1.9, 1), 0, 3.6, 0, 0, 0, 0, 1, 0.9, 1), '#5f9e45', 0.12, 3),
        paint(place(ico(1.3, 1), 0.9, 4.4, 0.4), '#72b352', 0.12, 5),
      ]), material: matte(), castShadow: true,
    }),
    maxInstances: 400,
  },
  bush: { build: () => ({ geometry: merge([paint(place(ico(0.9, 1), 0, 0.5, 0, 0, 0, 0, 1.3, 0.8, 1.1), '#5a9a44', 0.15, 13)]), material: matte() }), maxInstances: 400 },
  /** Tall rally pine (slimmer and darker than the default pine). */
  pine: {
    build: () => ({
      geometry: merge([
        paint(place(cyl(0.2, 0.32, 2.2, 6), 0, 1.1, 0), C.bark),
        paint(place(cone(2.2, 3.2, 8), 0, 3.0, 0), C.pine, 0.1, 3),
        paint(place(cone(1.8, 2.9, 8), 0, 4.6, 0), C.pineLight, 0.1, 5),
        paint(place(cone(1.35, 2.6, 8), 0, 6.1, 0), C.pine, 0.1, 7),
        paint(place(cone(0.85, 2.0, 8), 0, 7.5, 0), C.pineLight, 0.1, 9),
      ]), material: matte(), castShadow: true,
    }),
    maxInstances: 400,
  },
};
