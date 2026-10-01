// Clayhill Village props: terracotta hill town, sage meadows, market day. Vinyl-toy proportions (chunky, rounded).
// Local frame: +X faces the road, +Y up, +Z along the track. Buildings carry a foundation below y = 0 so they
// never float where the terrain dips away from the road.
import * as THREE from 'three/webgpu';
import { MaterialLibrary } from '../../materials/library.ts';
import type { PropFactory } from '../../props/defaults.ts';
import { merge, paint, place, rbox, box, cyl, cone, ico, sph, sparkleGeometry } from '../../util/geo.ts';
import { arcTube, buntingLine, dome, lathe, part, pennant, prism, seeded } from './toyshapes.ts';

const TERRACOTTA = '#d97757', CREAM = '#f4efe6', SAGE = '#8fb573', SKY = '#9fd3f5', SLATE = '#5a6b7b';
const STONE = '#e3d3b6', STONE_DK = '#c9b08c', WOOD = '#8a5a3c', WOOD_DK = '#6b4a33', GOLD = '#e0b04b', IVORY = '#faf9f5', INK = '#2a2826';
const FLAGS = [TERRACOTTA, CREAM, SKY, '#f2c14e', SAGE];

const lit = (): THREE.Material => MaterialLibrary.vertexLit(0.8, 0);
/** Plants: vertex colour with a little tonal noise and wind sway above 1.4 m (MaterialLibrary.foliageLit). */
const leafy = (): THREE.Material => MaterialLibrary.foliageLit();
const LEAF = ['#4b8636', '#5d9a42', '#6aa84a', '#3f7a33'] as const;
const toy = (): THREE.Material => MaterialLibrary.vinyl({ rim: '#ffd9c7', clearcoat: 0.6, roughness: 0.42 });
const metal = (): THREE.Material => MaterialLibrary.vertexLit(0.35, 0.55);

function windowRow(parts: THREE.BufferGeometry[], x: number, y: number, zs: readonly number[], w = 0.9, h = 1.1): void {
  for (const z of zs) {
    parts.push(part(box(0.12, h + 0.2, w + 0.2), CREAM, x + 0.02, y, z));
    parts.push(part(box(0.12, h, w), '#7cb8d8', x + 0.06, y, z));
    parts.push(part(box(0.1, 0.25, w + 0.3), TERRACOTTA, x + 0.1, y - h / 2 - 0.12, z)); // flower box
    parts.push(part(ico(0.16, 0), '#f25f7a', x + 0.18, y - h / 2 + 0.02, z - 0.25));
    parts.push(part(ico(0.16, 0), '#f2c14e', x + 0.18, y - h / 2 + 0.02, z + 0.2));
  }
}

export const CLAYHILL_PROPS: Record<string, PropFactory> = {
  // ---- landmarks ------------------------------------------------------------------------------------------------
  windmill: {
    maxInstances: 4,
    build: () => {
      const p: THREE.BufferGeometry[] = [
        part(lathe([[3.4, -2], [3.4, 0], [3.1, 4], [2.6, 9], [2.3, 11.5], [0, 11.5]], 12), CREAM),
        part(cyl(3.5, 3.6, 0.5, 12), STONE_DK, 0, 0.1, 0),
        part(cone(2.9, 3.6, 12), TERRACOTTA, 0, 13.3, 0),
        part(box(0.2, 2.2, 1.3), WOOD_DK, 3.0, 1.1, 0), // door, facing the road
        part(box(0.2, 1.0, 0.8), '#7cb8d8', 2.75, 6.5, 0),
        part(cyl(0.35, 0.35, 1.6, 8), WOOD_DK, 3.0, 11.2, 0, 0, 0, Math.PI / 2),
      ];
      // four lattice sails in the YZ plane on the road side
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + 0.35;
        const cy = 11.2, len = 7.2;
        p.push(part(box(0.18, len, 0.22), WOOD, 3.7, cy + Math.cos(a) * len / 2, Math.sin(a) * len / 2, a, 0, 0));
        p.push(part(box(0.08, len * 0.82, 1.5), IVORY, 3.8, cy + Math.cos(a) * len * 0.55, Math.sin(a) * len * 0.55, a, 0, 0));
      }
      return { geometry: merge(p), material: lit(), castShadow: true };
    },
  },
  bell_tower: {
    maxInstances: 2,
    build: () => {
      // a round campanile: the drum (r 10.4) encloses the plaza's `tower=cyl(r=10,h=38)` collider walls, so the
      // collider never shows; arcade tiers, a clock, an open belfry and a terracotta cone roof above it (≈ 54 m).
      const R0 = 10.4;
      const p: THREE.BufferGeometry[] = [
        part(cyl(R0 + 0.8, R0 + 1.0, 4, 32), STONE_DK, 0, 0.4, 0),               // plinth (+ foundation)
        part(cyl(R0, R0, 36, 32), STONE, 0, 20, 0),                               // drum → 38 m
        part(cyl(8.4, 8.4, 7, 24), CREAM, 0, 41.5, 0),                            // belfry
        part(cyl(9.2, 9.2, 0.8, 24), STONE_DK, 0, 45.3, 0),
        part(cone(9, 8.5, 24), TERRACOTTA, 0, 49.9, 0),                           // roof → 54 m
        part(sph(1.6, 10, 8), GOLD, 0, 41.2, 0),                                  // the bell
      ];
      // cornices between the arcade tiers, dark arch insets round every tier and the open belfry
      for (const y of [8, 14, 20, 26, 32, 38]) p.push(part(cyl(R0 + 0.35, R0 + 0.35, 0.6, 32), STONE_DK, 0, y, 0));
      for (let tier = 0; tier < 5; tier++) {
        const y = 11 + tier * 6;
        for (let k = 0; k < 14; k++) {
          const a = ((k + (tier % 2) * 0.5) / 14) * Math.PI * 2;
          p.push(part(rbox(0.3, 3.6, 2.2, 0.12, 1), tier === 2 ? '#7cb8d8' : INK, Math.cos(a) * (R0 + 0.05), y, -Math.sin(a) * (R0 + 0.05), 0, a, 0));
        }
      }
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        p.push(part(rbox(0.3, 4.4, 2.6, 0.15, 1), INK, Math.cos(a) * 8.35, 41.4, -Math.sin(a) * 8.35, 0, a, 0));
      }
      // four clock faces on the drum just under the belfry
      for (let k = 0; k < 4; k++) {
        const ry = (k * Math.PI) / 2 + Math.PI / 4;
        const dx = Math.cos(ry), dz = -Math.sin(ry);
        p.push(part(cyl(2.3, 2.3, 0.3, 20), IVORY, dx * (R0 + 0.2), 35, dz * (R0 + 0.2), 0, ry, Math.PI / 2));
        p.push(part(cyl(2.55, 2.55, 0.2, 20), GOLD, dx * (R0 + 0.1), 35, dz * (R0 + 0.1), 0, ry, Math.PI / 2));
        p.push(part(box(0.12, 1.7, 0.2), INK, dx * (R0 + 0.4), 35.7, dz * (R0 + 0.4), 0, ry, 0));
      }
      p.push(paint(place(sparkleGeometry(1.8, 0.25, 11), 0, 56.4, 0, 0, Math.PI / 2, 0), GOLD));
      p.push(part(cyl(0.1, 0.1, 2.2, 6), GOLD, 0, 55, 0));
      return { geometry: merge(p), material: lit(), castShadow: true };
    },
  },
  basilica: {
    maxInstances: 2,
    build: () => {
      const p: THREE.BufferGeometry[] = [
        part(box(18, 3, 18), STONE_DK, 0, -0.5, 0),
        part(rbox(16, 10, 16, 0.3, 2), CREAM, 0, 6, 0),
        part(cyl(6.5, 6.8, 5, 16), STONE, 0, 13.5, 0),
        part(dome(6.6, 16, 8), '#6f9f8a', 0, 16, 0),                               // weathered copper dome
        part(cyl(0.9, 1.2, 2.4, 10), CREAM, 0, 23.4, 0),
        part(cone(1.1, 1.8, 10), '#6f9f8a', 0, 25.5, 0),
        part(prism(9, 3, 4), TERRACOTTA, 9, 11, 0, 0, Math.PI / 2, 0),              // portico pediment facing the road
        part(box(3.5, 0.6, 9.4), STONE_DK, 9.4, 10.8, 0),
      ];
      for (const z of [-3.6, -1.2, 1.2, 3.6]) p.push(part(cyl(0.45, 0.5, 9.5, 10), IVORY, 10.3, 5.8, z));
      p.push(part(box(0.2, 5, 2.6), WOOD_DK, 8.05, 2.5, 0));
      return { geometry: merge(p), material: lit(), castShadow: true };
    },
  },
  bandstand: {
    maxInstances: 2,
    build: () => {
      const p: THREE.BufferGeometry[] = [
        part(cyl(5, 5.2, 1.4, 8), STONE, 0, 0.2, 0),
        part(cone(6, 2.6, 8), TERRACOTTA, 0, 6.2, 0),
        part(cyl(0.3, 0.3, 1.2, 8), GOLD, 0, 8, 0),
      ];
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.push(part(cyl(0.18, 0.18, 4, 6), IVORY, Math.cos(a) * 4.4, 3, Math.sin(a) * 4.4)); }
      p.push(...buntingLine(-4.4, 4.4, 4.7, 0.6, 0, FLAGS, 8));
      return { geometry: merge(p), material: lit(), castShadow: true };
    },
  },
  fountain: {
    maxInstances: 4,
    build: () => ({
      geometry: merge([
        part(lathe([[0, 0], [4.2, 0], [4.4, 0.9], [4.0, 0.95], [3.9, 0.5], [0, 0.5]], 20), STONE),
        part(cyl(3.9, 3.9, 0.1, 20), '#7fc6df', 0, 0.75, 0),
        part(cyl(0.6, 0.8, 2.8, 10), STONE_DK, 0, 1.8, 0),
        part(lathe([[0, 0], [1.8, 0], [1.9, 0.4], [0, 0.3]], 16), STONE, 0, 3.1, 0),
        part(cyl(1.7, 1.7, 0.08, 16), '#9fd3f5', 0, 3.42, 0),
        part(ico(0.55, 1), '#bfe6f5', 0, 3.9, 0),
      ]), material: lit(), castShadow: true,
    }),
  },
  stone_arch: {
    // spans the road: place centred (PROPS side=L offset=-(w/2+shoulder)); local X crosses the road
    maxInstances: 6,
    build: () => {
      const p: THREE.BufferGeometry[] = [
        part(rbox(2.4, 9, 2.4, 0.2, 2), STONE, -14, 3.5, 0), part(rbox(2.4, 9, 2.4, 0.2, 2), STONE, 14, 3.5, 0),
        part(arcTube(14, 1.3, Math.PI, 6, 24), STONE, 0, 8, 0, 0, 0, 0, 1, 0.45, 1),
        part(box(1.4, 1.8, 2.6), STONE_DK, 0, 14.4, 0),                              // keystone
      ];
      for (const x of [-14, 14]) p.push(part(box(3, 0.6, 3), STONE_DK, x, 8.2, 0), part(cone(0.9, 1.6, 4), TERRACOTTA, x, 9.3, 0, 0, Math.PI / 4, 0));
      p.push(...buntingLine(-12.5, 12.5, 9.6, 1.6, 0, FLAGS, 16));
      return { geometry: merge(p), material: lit(), castShadow: true };
    },
  },
  // ---- town -----------------------------------------------------------------------------------------------------
  cottage: {
    maxInstances: 80,
    build: () => {
      const p: THREE.BufferGeometry[] = [
        part(box(5.6, 1.6, 6.6), STONE_DK, 0, -0.5, 0),
        part(rbox(5, 3.6, 6, 0.18, 2), CREAM, 0, 1.8, 0),
        part(prism(6.8, 2.6, 6), TERRACOTTA, 0, 3.55, 0, 0, Math.PI / 2, 0),
        part(rbox(0.9, 2.2, 0.9, 0.1, 2), '#a8663f', -1.2, 5.4, 1.8),                 // chimney
        part(box(0.14, 2, 1.1), WOOD_DK, 2.52, 1, 0),                                 // door on the road side
      ];
      windowRow(p, 2.5, 2.2, [-1.9, 1.9], 0.9, 0.9);
      return { geometry: merge(p), material: lit(), castShadow: true };
    },
  },
  townhouse: {
    maxInstances: 80,
    build: () => {
      const p: THREE.BufferGeometry[] = [
        part(box(6.4, 2, 7.2), STONE_DK, 0, -0.6, 0),
        part(rbox(6, 7.6, 7, 0.18, 2), '#f0c9a0', 0, 3.8, 0),
        part(box(6.3, 0.35, 7.3), CREAM, 0, 3.6, 0),                                  // string course
        part(prism(7.6, 2.4, 6.8), TERRACOTTA, 0, 7.6, 0, 0, Math.PI / 2, 0),
        part(box(1.2, 0.2, 3.2), WOOD, 3.55, 3.9, 0),                                 // balcony
        part(box(0.1, 0.9, 3.2), '#3d3a36', 4.1, 4.4, 0),
        part(rbox(1.3, 0.2, 7.4, 0.08, 2), SAGE, 3.3, 2.6, 0),                        // shop awning
        part(box(0.14, 2.2, 1.3), WOOD_DK, 3.02, 1.1, -2),
      ];
      windowRow(p, 3.0, 5.2, [-2.2, 2.2], 0.9, 1.3);
      windowRow(p, 3.0, 1.4, [0.4, 2.3], 1.1, 1.1);
      return { geometry: merge(p), material: lit(), castShadow: true };
    },
  },
  market_stall: {
    maxInstances: 60,
    build: () => {
      const p: THREE.BufferGeometry[] = [
        part(box(2.2, 1.0, 3.6), WOOD, 0, 0.5, 0),
        part(box(2.3, 0.1, 3.7), WOOD_DK, 0, 1.02, 0),
      ];
      for (const [x, z] of [[-1.05, -1.75], [-1.05, 1.75], [1.05, -1.75], [1.05, 1.75]] as const) p.push(part(cyl(0.07, 0.07, 2.8, 6), WOOD_DK, x, 1.4, z));
      // striped awning sloping toward the road
      for (let i = 0; i < 6; i++) p.push(part(box(2.8, 0.08, 0.64), i % 2 ? CREAM : TERRACOTTA, 0.3, 2.85, -1.6 + i * 0.64, 0, 0, -0.22));
      const r = seeded(17);
      const fruit = ['#e84a3c', '#f2c14e', '#8fb573', '#f28b3c', '#b04a7a'];
      for (let i = 0; i < 12; i++) p.push(part(sph(0.17, 6, 4), fruit[i % 5]!, -0.6 + r() * 1.3, 1.2, -1.5 + r() * 3));
      p.push(part(box(0.9, 0.5, 0.9), '#c9a06a', 1.6, 0.25, -0.8), part(box(0.9, 0.5, 0.9), '#b88d58', 1.6, 0.25, 0.4));
      return { geometry: merge(p), material: lit(), castShadow: true };
    },
  },
  cafe_table: {
    maxInstances: 60,
    build: () => ({
      geometry: merge([
        part(cyl(0.6, 0.6, 0.06, 12), IVORY, 0, 0.78, 0), part(cyl(0.05, 0.05, 0.78, 6), INK, 0, 0.39, 0),
        part(cyl(0.05, 0.05, 2.5, 6), INK, 0, 1.25, 0), part(cone(1.6, 0.7, 10), TERRACOTTA, 0, 2.55, 0),
        part(rbox(0.5, 0.08, 0.5, 0.03, 1), SAGE, 0.9, 0.46, 0), part(rbox(0.5, 0.6, 0.08, 0.03, 1), SAGE, 1.12, 0.75, 0, 0, Math.PI / 2, 0),
        part(rbox(0.5, 0.08, 0.5, 0.03, 1), SAGE, -0.9, 0.46, 0), part(rbox(0.5, 0.6, 0.08, 0.03, 1), SAGE, -1.12, 0.75, 0, 0, Math.PI / 2, 0),
      ]), material: lit(),
    }),
  },
  bunting: {
    // spans the road (centred) between two poles at ±13 m
    maxInstances: 30,
    build: () => {
      const p: THREE.BufferGeometry[] = [part(cyl(0.12, 0.15, 7.5, 6), WOOD_DK, -13, 3.5, 0), part(cyl(0.12, 0.15, 7.5, 6), WOOD_DK, 13, 3.5, 0)];
      p.push(...buntingLine(-13, 13, 7, 1.4, 0, FLAGS, 18));
      return { geometry: merge(p), material: lit() };
    },
  },
  flower_box: {
    maxInstances: 200,
    build: () => {
      const p: THREE.BufferGeometry[] = [part(rbox(2.2, 0.6, 0.8, 0.08, 1), WOOD, 0, 0.3, 0)];
      const r = seeded(5), cols = ['#f25f7a', '#f2c14e', '#ffffff', '#b57cff', '#f28b3c'];
      for (let i = 0; i < 9; i++) p.push(part(ico(0.2, 0), cols[i % 5]!, -0.9 + i * 0.22, 0.75 + r() * 0.1, (r() - 0.5) * 0.4));
      p.push(part(box(2.0, 0.2, 0.6), SAGE, 0, 0.6, 0));
      return { geometry: merge(p), material: lit() };
    },
  },
  hay_bale: {
    maxInstances: 200,
    build: () => ({
      geometry: merge([
        part(cyl(0.85, 0.85, 1.4, 14), '#e6c15a', 0, 0.85, 0, Math.PI / 2, 0, 0, 1, 1, 1, 0.06, 3),
        part(cyl(0.86, 0.86, 0.12, 14), '#c9a13c', 0, 0.85, 0.3, Math.PI / 2, 0, 0),
        part(cyl(0.86, 0.86, 0.12, 14), '#c9a13c', 0, 0.85, -0.3, Math.PI / 2, 0, 0),
        part(cyl(0.7, 0.7, 1.2, 12), '#efcf6e', 0.2, 2.2, 0.1, Math.PI / 2, 0.3, 0),
      ]), material: lit(), castShadow: true,
    }),
  },
  sheep: {
    // vinyl-toy sheep: cloud body, dark face, facing along the track
    maxInstances: 60,
    build: () => {
      const p: THREE.BufferGeometry[] = [];
      const r = seeded(9);
      for (let i = 0; i < 7; i++) p.push(part(ico(0.42, 1), IVORY, (r() - 0.5) * 0.5, 0.95 + (r() - 0.5) * 0.25, -0.45 + i * 0.15));
      p.push(part(rbox(0.42, 0.45, 0.5, 0.14, 2), INK, 0, 1.05, 0.72));
      p.push(part(box(0.3, 0.08, 0.12), INK, 0, 1.22, 0.62, 0, 0, 0.2));
      for (const [x, z] of [[-0.22, -0.35], [0.22, -0.35], [-0.22, 0.35], [0.22, 0.35]] as const) p.push(part(rbox(0.13, 0.55, 0.13, 0.04, 1), INK, x, 0.3, z));
      p.push(part(box(0.06, 0.12, 0.03), IVORY, -0.1, 1.12, 0.975), part(box(0.06, 0.12, 0.03), IVORY, 0.1, 1.12, 0.975));
      return { geometry: merge(p), material: toy(), castShadow: true };
    },
  },
  weathervane: {
    // the "Spark" weathervane: a parametric sparkle (never the Claude logo) on a copper arrow
    maxInstances: 20,
    build: () => {
      const sp = sparkleGeometry(1.1, 0.16, 23);
      return {
        geometry: merge([
          part(cyl(0.1, 0.16, 7, 6), SLATE, 0, 3.5, 0),
          part(box(2.2, 0.1, 0.1), GOLD, 0, 7.1, 0), part(cone(0.22, 0.5, 4), GOLD, 1.25, 7.1, 0, 0, 0, -Math.PI / 2),
          part(box(0.1, 0.1, 1.6), SLATE, 0, 6.6, 0), part(box(1.6, 0.1, 0.1), SLATE, 0, 6.6, 0),
          paint(place(sp, 0, 8.2, 0, 0, Math.PI / 2, 0), GOLD),
        ]), material: metal(), castShadow: true,
      };
    },
  },
  signboard: {
    // tutorial board: coral chevrons (drift → boost) on an ivory panel, facing the road
    maxInstances: 12,
    build: () => {
      const p: THREE.BufferGeometry[] = [
        part(box(0.2, 2.6, 0.2), WOOD_DK, 0, 1.3, -1.4), part(box(0.2, 2.6, 0.2), WOOD_DK, 0, 1.3, 1.4),
        part(rbox(0.2, 1.8, 3.6, 0.08, 2), IVORY, 0.05, 3.0, 0), part(rbox(0.16, 2.0, 3.8, 0.08, 2), TERRACOTTA, -0.02, 3.0, 0),
      ];
      for (let i = 0; i < 3; i++) {
        const z = -1 + i * 0.95;
        // the tips point along +Z (the travel direction once placed), so the board never reads as a wrong-way arrow
        p.push(part(box(0.1, 0.9, 0.22), TERRACOTTA, 0.2, 3.2, z, -0.7, 0, 0), part(box(0.1, 0.9, 0.22), TERRACOTTA, 0.2, 2.75, z, 0.7, 0, 0));
      }
      return { geometry: merge(p), material: lit() };
    },
  },
  // ---- start straight dressing (Meadow Loop start → T1) -----------------------------------------------------------
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
  // ---- nature ---------------------------------------------------------------------------------------------------
  cypress: {
    maxInstances: 300,
    build: () => ({
      geometry: merge([
        part(cyl(0.2, 0.28, 3, 6), WOOD_DK, 0, -0.5, 0),
        part(lathe([[0, 0], [1.1, 0.8], [1.3, 3], [1.0, 6], [0.5, 8], [0, 9.2]], 8), '#4a7f42', 0, 0.6, 0, 0, 0, 0, 1, 1, 1, 0.1, 7),
      ]), material: lit(), castShadow: true,
    }),
  },
  orchard_tree: {
    maxInstances: 300,
    build: () => ({
      geometry: merge([
        part(cyl(0.22, 0.32, 3.6, 7), WOOD_DK, 0, 0.6, 0),
        part(ico(1.9, 1), '#5e9a45', 0, 3.8, 0, 0, 0, 0, 1.1, 0.85, 1.1, 0.1, 3),
        part(ico(1.2, 1), '#74ad52', 0.9, 4.5, 0.5, 0, 0, 0, 1, 1, 1, 0.1, 5),
        part(sph(0.18, 6, 4), '#e84a3c', 1.6, 3.6, 0.6), part(sph(0.18, 6, 4), '#e84a3c', -1.2, 3.3, 1.1), part(sph(0.18, 6, 4), '#f2c14e', 0.3, 3.1, -1.6),
      ]), material: lit(), castShadow: true,
    }),
  },
  creek: {
    // a water strip crossing under the hump bridge (centred prop; local X crosses the road)
    maxInstances: 2,
    build: () => ({
      geometry: merge([
        part(box(90, 0.1, 9), '#5fb3d9', 0, -3.2, 0), part(box(90, 0.3, 1.2), '#c9b08c', 0, -3.1, 5), part(box(90, 0.3, 1.2), '#c9b08c', 0, -3.1, -5),
      ]), material: MaterialLibrary.vertexLit(0.15, 0.1),
    }),
  },
  canal_boat: {
    maxInstances: 12,
    build: () => ({
      geometry: merge([
        part(rbox(1.6, 0.7, 5.5, 0.3, 2), '#2f6fa6', 0, -0.4, 0), part(rbox(1.3, 0.2, 5.0, 0.1, 1), WOOD, 0, 0, 0),
        part(prism(1.4, 0.8, 1.2), TERRACOTTA, 0, 0.1, 1.9), part(cyl(0.06, 0.06, 2.4, 6), WOOD_DK, 0, 1.2, -1.2),
        part(pennant(0.8, 0.6), TERRACOTTA, 0.02, 2.3, -1.2, 0, Math.PI / 2, 0),
      ]), material: lit(),
    }),
  },
};

export const CLAYHILL_PALETTE = { TERRACOTTA, CREAM, SAGE, SKY, SLATE } as const;

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
