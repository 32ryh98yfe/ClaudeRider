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
        p.push(part(box(0.1, 0.9, 0.22), TERRACOTTA, 0.2, 3.2, z, 0.7, 0, 0), part(box(0.1, 0.9, 0.22), TERRACOTTA, 0.2, 2.75, z, -0.7, 0, 0));
      }
      return { geometry: merge(p), material: lit() };
    },
  },
  // ---- nature ---------------------------------------------------------------------------------------------------
  cypress: {
    maxInstances: 300,
    build: () => ({
      geometry: merge([
        part(cyl(0.2, 0.28, 3, 6), WOOD_DK, 0, -0.5, 0),
        part(lathe([[0, 0], [1.1, 0.8], [1.3, 3], [1.0, 6], [0.5, 8], [0, 9.2]], 8), '#4f7a3a', 0, 0.6, 0, 0, 0, 0, 1, 1, 1, 0.1, 7),
      ]), material: lit(), castShadow: true,
    }),
  },
  orchard_tree: {
    maxInstances: 300,
    build: () => ({
      geometry: merge([
        part(cyl(0.22, 0.32, 3.6, 7), WOOD_DK, 0, 0.6, 0),
        part(ico(1.9, 1), '#79ad4f', 0, 3.8, 0, 0, 0, 0, 1.1, 0.85, 1.1, 0.1, 3),
        part(ico(1.2, 1), '#98c463', 0.9, 4.5, 0.5, 0, 0, 0, 1, 1, 1, 0.1, 5),
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
