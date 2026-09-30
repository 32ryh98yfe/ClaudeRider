// Frostbyte Glacier props: a penguin village under a snow-globe dome, crystal caves, pine slopes and a night ski resort
// under the aurora. Glossy vinyl for toys and crystals, emissive vertex colour for lights and aurora ribbons.
// Local frame: +X faces the road, +Y up, +Z along the track.
import * as THREE from 'three/webgpu';
import { MaterialLibrary } from '../../materials/library.ts';
import type { PropFactory } from '../../props/defaults.ts';
import { merge, paint, place, rbox, box, cyl, cone, ico, sph, sparkleGeometry } from '../../util/geo.ts';
import { arcTube, dome, part, prism, seeded, tubeThrough } from '../clayhill_village/toyshapes.ts';

const SNOW = '#f7fbff', SNOW_SH = '#dfeaf3', ICE = '#bee9f7', DEEP = '#2f6fa6', AURORA_G = '#6cf2c2', AURORA_V = '#b57cff';
const PINE = '#2f5f45', PINE_LT = '#3f7a55', WOOD = '#7a5236', WOOD_DK = '#5a3a26', INK = '#1c2230', CARROT = '#f28b3c', RED = '#d94f4f';
const BULBS = ['#fff2c4', '#ffb4c6', '#9fe8ff', '#c9ffb0', '#ffd27a'];

const lit = (): THREE.Material => MaterialLibrary.vertexLit(0.8, 0);
const toy = (): THREE.Material => MaterialLibrary.vinyl({ rim: '#dff6ff', clearcoat: 0.7, roughness: 0.38 });
const crystal = (): THREE.Material => MaterialLibrary.vinyl({ rim: '#9fe8ff', clearcoat: 1, roughness: 0.15 });
const glow = (k = 3): THREE.Material => MaterialLibrary.emissiveVertex(k);
// open-ended cylinder band (igloo courses, snow-globe plinth)
const ring = (r: number, h: number, seg: number): THREE.BufferGeometry => new THREE.CylinderGeometry(r, r, h, seg, 1, true);

function crystalCluster(seed: number, n: number, h: number, spread: number): THREE.BufferGeometry[] {
  const r = seeded(seed), out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const hh = h * (0.45 + r() * 0.55), x = (r() - 0.5) * spread, z = (r() - 0.5) * spread;
    const c = i % 3 === 0 ? '#9fe8ff' : i % 3 === 1 ? ICE : '#d6c8ff';
    out.push(part(cyl(0.08, 0.55 * (hh / h) + 0.25, hh, 6), c, x, hh / 2 - 0.3, z, (r() - 0.5) * 0.5, r() * 3, (r() - 0.5) * 0.5));
  }
  return out;
}

export const FROSTBYTE_PROPS: Record<string, PropFactory> = {
  pine_snow: {
    maxInstances: 400,
    build: () => ({
      geometry: merge([
        part(cyl(0.22, 0.32, 3, 6), WOOD_DK, 0, -0.2, 0),
        part(cone(2.2, 3, 8), PINE, 0, 2.2, 0), part(cone(2.25, 0.7, 8), SNOW, 0, 1.2, 0),
        part(cone(1.7, 2.6, 8), PINE_LT, 0, 3.8, 0), part(cone(1.72, 0.6, 8), SNOW, 0, 2.95, 0),
        part(cone(1.1, 2.2, 8), PINE, 0, 5.2, 0), part(cone(0.6, 1.2, 8), SNOW, 0, 6.1, 0),
      ]), material: MaterialLibrary.foliageLit(), castShadow: true,
    }),
  },
  birch: {
    maxInstances: 300,
    build: () => {
      const p: THREE.BufferGeometry[] = [part(cyl(0.16, 0.22, 7, 7), '#f1efe8', 0, 2.5, 0)];
      for (let i = 0; i < 5; i++) p.push(part(box(0.35, 0.08, 0.35), INK, 0, 0.8 + i * 1.2, 0, 0, i, 0));
      p.push(part(ico(1.4, 1), '#d9b44a', 0, 6.2, 0, 0, 0, 0, 1, 1.3, 1, 0.12, 3), part(ico(0.9, 1), '#e8c95a', 0.6, 5.2, 0.4, 0, 0, 0, 1, 1, 1, 0.12, 5));
      return { geometry: merge(p), material: MaterialLibrary.foliageLit(), castShadow: true };
    },
  },
  ice_spire: {
    maxInstances: 120,
    build: () => ({ geometry: merge(crystalCluster(7, 7, 7, 2.6)), material: crystal(), castShadow: true }),
  },
  serac: {
    maxInstances: 120,
    build: () => {
      const r = seeded(11), p: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 5; i++) p.push(part(ico(1.6 + r() * 1.4, 0), i % 2 ? ICE : '#d8f1fb', (r() - 0.5) * 4, 0.6 + r() * 1.8, (r() - 0.5) * 4, r(), r() * 3, r(), 1, 1.4 + r() * 0.8, 1));
      return { geometry: merge(p), material: crystal(), castShadow: true };
    },
  },
  snowbank: {
    maxInstances: 300,
    build: () => ({ geometry: merge([part(sph(3.2, 10, 6), SNOW, 0, -0.6, 0, 0, 0, 0, 1.6, 0.45, 1.1, 0.03, 3), part(sph(2, 10, 5), SNOW_SH, 2.4, -0.4, 1.2, 0, 0, 0, 1, 0.5, 1)]), material: lit() }),
  },
  igloo: {
    maxInstances: 40,
    build: () => {
      const p: THREE.BufferGeometry[] = [part(dome(2.6, 14, 7), SNOW), part(cyl(0.9, 1.0, 1.8, 10), SNOW_SH, 2.5, 0.6, 0, 0, 0, Math.PI / 2), part(cyl(0.62, 0.62, 0.1, 10), '#3a4a60', 3.42, 0.62, 0, 0, 0, Math.PI / 2)];
      for (let k = 1; k <= 3; k++) p.push(part(arcTube(2.62, 0.04, Math.PI, 3, 16), SNOW_SH, 0, 0, 0, 0, (k * Math.PI) / 4, 0));
      for (const y of [0.7, 1.4, 2.0]) p.push(part(ring(Math.sqrt(2.62 * 2.62 - y * y), 0.05, 16), SNOW_SH, 0, y, 0));
      return { geometry: merge(p), material: lit(), castShadow: true };
    },
  },
  snowman: {
    maxInstances: 60,
    build: () => ({
      geometry: merge([
        part(sph(1.0, 12, 8), SNOW, 0, 0.9, 0), part(sph(0.72, 12, 8), SNOW, 0, 2.3, 0), part(sph(0.5, 12, 8), SNOW, 0, 3.3, 0),
        part(cone(0.1, 0.55, 6), CARROT, 0.72, 3.28, 0, 0, 0, -Math.PI / 2),
        part(box(0.06, 0.16, 0.06), INK, 0.44, 3.42, -0.16), part(box(0.06, 0.16, 0.06), INK, 0.44, 3.42, 0.16),
        part(cyl(0.42, 0.42, 0.08, 12), INK, 0, 3.72, 0), part(cyl(0.28, 0.3, 0.5, 12), INK, 0, 3.98, 0),
        part(cyl(0.56, 0.56, 0.2, 12), RED, 0, 2.85, 0), part(box(0.2, 0.7, 0.14), RED, 0.35, 2.55, 0.35, 0, 0, 0.2),
        part(cyl(0.04, 0.05, 1.4, 5), WOOD_DK, 0, 2.5, 1.1, 0.9, 0, 0), part(cyl(0.04, 0.05, 1.4, 5), WOOD_DK, 0, 2.5, -1.1, -0.9, 0, 0),
      ]), material: toy(), castShadow: true,
    }),
  },
  penguin: {
    maxInstances: 80,
    build: () => ({
      geometry: merge([
        part(rbox(0.8, 1.2, 0.7, 0.3, 3), INK, 0, 0.7, 0), part(rbox(0.12, 0.9, 0.55, 0.05, 2), SNOW, 0.35, 0.65, 0),
        part(sph(0.34, 10, 8), INK, 0, 1.45, 0), part(cone(0.1, 0.28, 5), CARROT, 0.4, 1.42, 0, 0, 0, -Math.PI / 2),
        part(box(0.05, 0.1, 0.05), SNOW, 0.3, 1.55, -0.12), part(box(0.05, 0.1, 0.05), SNOW, 0.3, 1.55, 0.12),
        part(rbox(0.3, 0.08, 0.2, 0.03, 1), CARROT, 0.12, 0.05, -0.16), part(rbox(0.3, 0.08, 0.2, 0.03, 1), CARROT, 0.12, 0.05, 0.16),
        part(rbox(0.1, 0.6, 0.18, 0.04, 1), INK, 0, 0.75, -0.42, 0.25, 0, 0), part(rbox(0.1, 0.6, 0.18, 0.04, 1), INK, 0, 0.75, 0.42, -0.25, 0, 0),
        part(cyl(0.2, 0.2, 0.1, 10), '#6cf2c2', 0, 1.8, 0),
      ]), material: toy(), castShadow: true,
    }),
  },
  sled: {
    // cosmetic penguin sled (the F5 traffic hazard stands in as props until then)
    maxInstances: 20,
    build: () => ({ geometry: merge([part(rbox(1.2, 0.3, 2.2, 0.1, 2), RED, 0, 0.35, 0), part(box(0.08, 0.08, 2.6), INK, 0.5, 0.1, 0.1), part(box(0.08, 0.08, 2.6), INK, -0.5, 0.1, 0.1), part(tubeThrough([[0.5, 0.1, 1.4], [0.5, 0.5, 1.6], [0.5, 0.8, 1.4]], 0.04, 6, 4), INK), part(tubeThrough([[-0.5, 0.1, 1.4], [-0.5, 0.5, 1.6], [-0.5, 0.8, 1.4]], 0.04, 6, 4), INK)]), material: toy() }),
  },
  snow_cabin: {
    maxInstances: 60,
    build: () => {
      const p: THREE.BufferGeometry[] = [part(box(5.6, 2, 6.6), '#8a6a52', 0, -0.6, 0), part(rbox(5, 3.4, 6, 0.12, 2), '#9a6a45', 0, 1.7, 0)];
      for (let i = 0; i < 6; i++) p.push(part(box(5.05, 0.1, 6.05), WOOD_DK, 0, 0.3 + i * 0.55, 0));
      p.push(part(prism(6.6, 2.4, 6.6), '#6a3f2c', 0, 3.4, 0, 0, Math.PI / 2, 0), part(prism(6.8, 0.7, 6.9), SNOW, 0, 5.2, 0, 0, Math.PI / 2, 0, 0.72, 0.9, 1));
      p.push(part(box(0.14, 1.1, 1.2), '#ffd27a', 2.52, 1.9, -1.4), part(box(0.14, 1.1, 1.2), '#ffd27a', 2.52, 1.9, 1.4), part(box(0.14, 2, 1.1), WOOD_DK, 2.52, 1.0, 0));
      p.push(part(rbox(0.8, 1.8, 0.8, 0.1, 2), '#8a8f99', -1.2, 5.4, 1.8), part(sph(0.5, 8, 5), SNOW, -1.2, 6.4, 1.8, 0, 0, 0, 1, 0.5, 1));
      return { geometry: merge(p), material: lit(), castShadow: true };
    },
  },
  ski_lodge: {
    maxInstances: 2,
    build: () => {
      const p: THREE.BufferGeometry[] = [part(box(22, 3, 14), '#8a6a52', 0, -0.5, 0), part(rbox(20, 7, 12, 0.2, 2), '#a8734a', 0, 3.5, 0), part(prism(14, 7, 22), '#6a3f2c', 0, 7, 0), part(prism(14.4, 1, 22.4), SNOW, 0, 12.4, 0, 0, 0, 0, 0.6, 1.2, 1)];
      for (let i = 0; i < 5; i++) p.push(part(box(0.2, 2.4, 2.4), '#ffd27a', 10.05, 3.2, -7.5 + i * 3.75));
      p.push(part(box(3, 0.4, 20), WOOD, 11, 1.2, 0), part(box(0.3, 1, 20), WOOD_DK, 12.4, 1.8, 0));
      p.push(paint(place(sparkleGeometry(1.6, 0.25, 41), 10.1, 9.2, 0, 0, Math.PI / 2, 0), '#ffd27a'));
      return { geometry: merge(p), material: lit(), castShadow: true };
    },
  },
  chapel: {
    maxInstances: 2,
    build: () => ({
      geometry: merge([
        part(box(9, 2, 13), '#9aa3ad', 0, -0.4, 0), part(rbox(8, 6, 12, 0.15, 2), '#f1efe8', 0, 3, 0), part(prism(9, 4, 13), '#5a6b7b', 0, 6, 0, 0, 0, 0),
        part(box(4, 8, 4), '#f1efe8', 0, 8, -4), part(cone(3, 6, 4), '#5a6b7b', 0, 15, -4, 0, Math.PI / 4, 0), part(cyl(0.1, 0.1, 1.6, 5), '#e0b04b', 0, 18.8, -4),
        part(box(0.14, 2.6, 1.6), '#6b4a33', 4.05, 1.3, 2), part(cyl(1.1, 1.1, 0.12, 16), '#ffd27a', 4.05, 5.2, 0, 0, 0, Math.PI / 2),
        part(prism(9.2, 0.8, 13.2), SNOW, 0, 9.4, 0, 0, 0, 0, 0.5, 1, 1),
      ]), material: lit(), castShadow: true,
    }),
  },
  gondola_pylon: {
    maxInstances: 20,
    build: () => {
      const p: THREE.BufferGeometry[] = [];
      for (const x of [-1.2, 1.2]) for (const z of [-1.2, 1.2]) p.push(part(box(0.25, 22, 0.25), '#8a8f99', x * 0.6, 11, z * 0.6, x * 0.02, 0, z * 0.02));
      for (let k = 0; k < 6; k++) p.push(part(box(1.8, 0.14, 0.14), '#8a8f99', 0, 3 + k * 3.2, 0, 0, 0, 0.6), part(box(0.14, 0.14, 1.8), '#8a8f99', 0, 4.5 + k * 3.2, 0, 0.6, 0, 0));
      p.push(part(box(0.5, 0.5, 9), DEEP, 0, 22.2, 0), part(cyl(0.6, 0.6, 0.3, 12), INK, 0.4, 22.2, -4, 0, 0, Math.PI / 2), part(cyl(0.6, 0.6, 0.3, 12), INK, 0.4, 22.2, 4, 0, 0, Math.PI / 2));
      return { geometry: merge(p), material: MaterialLibrary.vertexLit(0.5, 0.4), castShadow: true };
    },
  },
  avalanche_net: {
    maxInstances: 200,
    build: () => {
      const p: THREE.BufferGeometry[] = [part(cyl(0.1, 0.12, 3.4, 6), '#6f757d', 0, 1.6, -3, 0, 0, -0.2), part(cyl(0.1, 0.12, 3.4, 6), '#6f757d', 0, 1.6, 3, 0, 0, -0.2)];
      for (let i = 0; i < 5; i++) p.push(part(box(0.04, 0.04, 6), '#c9a13c', -0.3 + i * 0.12, 0.6 + i * 0.6, 0));
      for (let i = 0; i < 7; i++) p.push(part(box(0.04, 3, 0.04), '#c9a13c', 0, 1.5, -2.7 + i * 0.9, 0, 0, -0.2));
      return { geometry: merge(p), material: lit() };
    },
  },
  fairy_lights: {
    // a string of glowing bulbs across the road between two ice posts (landmark, local X crosses the road)
    maxInstances: 20,
    build: () => {
      const p: THREE.BufferGeometry[] = [part(cyl(0.14, 0.18, 7.5, 6), '#9fe8ff', -13, 3.5, 0), part(cyl(0.14, 0.18, 7.5, 6), '#9fe8ff', 13, 3.5, 0)];
      const pts: [number, number, number][] = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([-13 + 26 * t, 7 - 1.6 * 4 * t * (1 - t), 0]); }
      p.push(paint(tubeThrough(pts, 0.03, 24, 4), '#3a4a60'));
      for (let i = 0; i < 20; i++) { const t = (i + 0.5) / 20; p.push(part(sph(0.16, 6, 4), BULBS[i % BULBS.length]!, -13 + 26 * t, 7 - 1.6 * 4 * t * (1 - t) - 0.22, 0)); }
      return { geometry: merge(p), material: glow(3.5) };
    },
  },
  aurora_ribbon: {
    // huge far-field curtain of light (placed well away from the road)
    maxInstances: 12,
    build: () => {
      const p: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 18; i++) {
        const x = -90 + i * 10, y = 70 + Math.sin(i * 0.7) * 8, z = Math.sin(i * 0.45) * 18;
        p.push(part(box(10.5, 34, 0.6), i % 5 === 3 ? AURORA_V : AURORA_G, x, y, z, 0, Math.sin(i * 0.45) * 0.4, 0, 1, 1, 1, 0.25, i + 1));
      }
      return { geometry: merge(p), material: glow(1.6) };
    },
  },
  crystal_arch: {
    // crystal-cave tunnel ring over the road (landmark, local X crosses the road); rows of these make the cave
    maxInstances: 40,
    build: () => {
      const p: THREE.BufferGeometry[] = [part(arcTube(12.5, 1.1, Math.PI, 6, 20), '#9fd8f0', 0, 0, 0, 0, 0, 0, 1, 0.75, 1)];
      const r = seeded(19);
      for (let i = 0; i < 16; i++) {
        const a = (i / 15) * Math.PI, rad = 12.5 + r() * 0.8, h = 1.4 + r() * 2.2;
        p.push(part(cyl(0.06, 0.5, h, 6), i % 3 ? '#bfefff' : '#d6c8ff', Math.cos(a) * rad, Math.sin(a) * rad * 0.75, (r() - 0.5) * 2, 0, 0, a - Math.PI / 2 + (r() - 0.5) * 0.4));
      }
      return { geometry: merge(p), material: crystal(), castShadow: true };
    },
  },
  snowglobe_frame: {
    // the snow-globe dome over the start: a ring of glassy meridians on a ruby plinth (landmark, X across the road)
    maxInstances: 2,
    build: () => {
      const p: THREE.BufferGeometry[] = [part(ring(24, 1.2, 40), '#b53333', 0, 0.2, 0), part(ring(24.6, 0.4, 40), '#e0b04b', 0, 0.9, 0)];
      for (let k = 0; k < 6; k++) p.push(part(arcTube(24, 0.35, Math.PI, 4, 32), '#dff6ff', 0, 0.8, 0, 0, (k * Math.PI) / 6, 0));
      p.push(part(arcTube(20.8, 0.3, Math.PI * 2, 4, 40), '#dff6ff', 0, 12.8, 0, Math.PI / 2, 0, 0));
      p.push(paint(place(sparkleGeometry(2.4, 0.4, 53), 0, 26.4, 0), '#ffe2a0'));
      return { geometry: merge(p), material: crystal() };
    },
  },
  rink_boards: {
    maxInstances: 200,
    build: () => ({ geometry: merge([part(rbox(0.3, 1.1, 5.6, 0.08, 2), SNOW, 0, 0.55, 0), part(box(0.34, 0.2, 5.62), DEEP, 0, 1.0, 0), part(box(0.34, 0.12, 5.62), RED, 0, 0.15, 0)]), material: lit() }),
  },
};

export const FROSTBYTE_PALETTE = { SNOW, ICE, DEEP, AURORA_G, AURORA_V } as const;
