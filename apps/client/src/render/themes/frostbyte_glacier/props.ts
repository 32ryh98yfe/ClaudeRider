// Frostbyte Glacier props: a penguin village under a snow-globe dome, crystal caves, pine slopes and a night ski resort
// under the aurora. Glossy vinyl for toys and crystals, emissive vertex colour for lights and aurora ribbons.
// Local frame: +X faces the road, +Y up, +Z along the track.
import * as THREE from 'three/webgpu';
import { MaterialLibrary } from '../../materials/library.ts';
import type { PropFactory } from '../../props/defaults.ts';
import { merge, paint, place, rbox, box, cyl, cone, ico, sph, sparkleGeometry } from '../../util/geo.ts';
import { arcTube, dome, part, prism, seeded, tubeThrough } from '../clayhill_village/toyshapes.ts';
import { AD_BOARD_B_L } from '../sunstone_desert/mirror.ts';

// snow albedo stays ≈ #e8eef5 so it never clips to pure white under ACES (34-stylized-pass, glacier notes)
const SNOW = '#e8eef5', SNOW_SH = '#d3dfeb', ICE = '#bee9f7', DEEP = '#2f6fa6', AURORA_G = '#6cf2c2', AURORA_V = '#b57cff';
const PINE = '#2f5f45', PINE_LT = '#3f7a55', WOOD = '#7a5236', WOOD_DK = '#5a3a26', INK = '#1c2230', CARROT = '#f28b3c', RED = '#d94f4f';
const BULBS = ['#fff2c4', '#ffb4c6', '#9fe8ff', '#c9ffb0', '#ffd27a'];

const lit = (): THREE.Material => MaterialLibrary.vertexLit(0.8, 0);
// penguins, sleds and snowmen are satin-matte (gloss stays on kart paint and ice, 34 §1.3)
const toy = (): THREE.Material => MaterialLibrary.vertexLit(0.6, 0);
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

/** Vertex colours fading from `c0` at height y0 to `c1` at y1 (aurora curtains: bright hem, dissolving top). */
function fade(g: THREE.BufferGeometry, y0: number, y1: number, c0: THREE.Color, c1: THREE.Color): THREE.BufferGeometry {
  const out = paint(g, c0), pos = out.attributes.position!, col = out.attributes.color!;
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, (pos.getY(i) - y0) / (y1 - y0)));
    c.copy(c0).lerp(c1, Math.sqrt(t));
    col.setXYZ(i, c.r, c.g, c.b);
  }
  return out;
}

/** Resort lamp post (local +X faces the road). `head` = only the lantern box, for the emissive twin kind. */
function lampGeometry(head: boolean): THREE.BufferGeometry {
  if (head) return merge([part(box(0.3, 0.38, 0.3), '#ffe6b0', 0.75, 3.75, 0)]);
  return merge([
    part(cyl(0.2, 0.24, 0.35, 8), DEEP, 0, 0.17, 0), part(cyl(0.07, 0.09, 3.8, 8), '#24507e', 0, 2.1, 0),
    part(box(0.06, 0.06, 0.9), '#24507e', 0.35, 3.95, 0, 0, Math.PI / 2, 0),
    part(rbox(0.38, 0.52, 0.38, 0.06, 1), '#24507e', 0.75, 3.75, 0), part(box(0.29, 0.37, 0.29), '#f4e6c8', 0.75, 3.75, 0),
    part(cone(0.32, 0.24, 8), '#24507e', 0.75, 4.1, 0), part(cone(0.26, 0.12, 8), SNOW, 0.75, 4.24, 0),
  ]);
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
    // a string of glowing bulbs across the road between two ice posts (landmark, local X crosses the road). One
    // emissive mesh: the posts are a dim ice blue and the wire near-black, so only the bulbs glow (and bloom)
    maxInstances: 20,
    build: () => {
      const p: THREE.BufferGeometry[] = [part(cyl(0.14, 0.18, 7.5, 6), '#2b3d52', -13, 3.5, 0), part(cyl(0.14, 0.18, 7.5, 6), '#2b3d52', 13, 3.5, 0)];
      const pts: [number, number, number][] = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([-13 + 26 * t, 7 - 1.6 * 4 * t * (1 - t), 0]); }
      p.push(paint(tubeThrough(pts, 0.03, 24, 4), '#18202c'));
      for (let i = 0; i < 20; i++) { const t = (i + 0.5) / 20; p.push(part(sph(0.16, 6, 4), BULBS[i % BULBS.length]!, -13 + 26 * t, 7 - 1.6 * 4 * t * (1 - t) - 0.22, 0)); }
      return { geometry: merge(p), material: glow(2.2) };
    },
  },
  aurora_ribbon: {
    // huge far-field curtain of light (placed well above the summit): 64 narrow strips along a wavy line, bright at
    // the lower hem and fading upward into the night-sky colour, so it reads as a curtain rather than lit slabs
    maxInstances: 12,
    build: () => {
      const p: THREE.BufferGeometry[] = [];
      const hem = new THREE.Color(AURORA_G), hemV = new THREE.Color(AURORA_V), top = new THREE.Color('#081a33');
      for (let i = 0; i < 64; i++) {
        const x = -96 + i * 3, z = Math.sin(i * 0.16) * 16 + Math.sin(i * 0.05) * 10;
        const y0 = 52 + Math.sin(i * 0.21) * 6, h = 30 + Math.sin(i * 0.37) * 8;
        p.push(fade(place(box(3.1, h, 0.4), x, y0 + h / 2, z, 0, Math.cos(i * 0.16) * 0.5, 0), y0, y0 + h, i % 9 === 4 ? hemV : hem, top));
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
  // ---- dressing pass (2026-10, docs/design/34-stylized-pass.md) --------------------------------------------------
  // Snowy versions of the shared ground-cover / shrub / tree kinds (same names win over trackside.ts), snow pines for
  // the far lines, glowing lamp heads for the night track and a penguin crowd. Snow, bark and needles are matte; only
  // the ice kinds (crystal material) are glossy. Plant kinds match TrackView's SCATTER / tree|bush thinning patterns.
  grass_tuft: {
    // snow tuft: a small drift with dry winter grass poking through
    maxInstances: 6000,
    build: () => {
      const p: THREE.BufferGeometry[] = [part(sph(0.3, 8, 5), SNOW, 0, -0.04, 0, 0, 0, 0, 1.3, 0.42, 1.1)];
      const r = seeded(241), BL = ['#b3ad84', '#98a07e', '#c2b98e'];
      for (let i = 0; i < 6; i++) {
        const a = r() * Math.PI * 2, d = r() * 0.16, h = 0.22 + r() * 0.3, t = 0.25 + r() * 0.4;
        p.push(part(cone(0.035, h, 3), BL[i % 3]!, Math.cos(a) * d, h / 2 + 0.05, Math.sin(a) * d, Math.sin(a) * t, a, -Math.cos(a) * t));
      }
      return { geometry: merge(p), material: MaterialLibrary.foliageLit() };
    },
  },
  flower_patch: {
    // frost sprigs: a few small ice crystals and blue winter blooms in a snow drift (matte; the big ice is glossy)
    maxInstances: 3000,
    build: () => {
      const p: THREE.BufferGeometry[] = [part(sph(0.4, 8, 5), SNOW_SH, 0, -0.06, 0, 0, 0, 0, 1.4, 0.38, 1.2)];
      const r = seeded(243);
      for (let i = 0; i < 4; i++) p.push(part(cyl(0.02, 0.09, 0.3 + r() * 0.25, 5), i % 2 ? '#9fd8f0' : '#c4e6f6', (r() - 0.5) * 0.5, 0.15, (r() - 0.5) * 0.5, (r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6));
      for (let i = 0; i < 3; i++) {
        const x = (r() - 0.5) * 0.5, z = (r() - 0.5) * 0.5;
        p.push(part(cyl(0.012, 0.016, 0.32, 4), '#5f7f6a', x, 0.2, z), part(ico(0.06, 0), i % 2 ? '#7fa8e8' : '#b9a8f0', x, 0.38, z));
      }
      return { geometry: merge(p), material: lit() };
    },
  },
  bush_round: {
    // snowy juniper: dark blue-green mounds under thick snow caps
    maxInstances: 1500,
    build: () => ({
      geometry: merge([
        part(ico(0.82, 1), '#3c6650', 0, 0.55, 0, 0, 0, 0, 1.15, 0.8, 1.1, 0.07, 3),
        part(ico(0.6, 1), '#467459', 0.55, 0.62, 0.28, 0, 0, 0, 1, 0.85, 1, 0.07, 5),
        part(ico(0.52, 1), '#335b47', -0.5, 0.45, -0.2, 0, 0, 0, 1, 0.8, 1, 0.07, 7),
        part(ico(0.7, 1), SNOW, 0.05, 0.95, 0, 0, 0, 0, 1.15, 0.38, 1.05), part(ico(0.48, 1), SNOW, 0.55, 1.02, 0.28, 0, 0, 0, 1, 0.38, 1),
        part(ico(0.4, 1), SNOW, -0.5, 0.78, -0.2, 0, 0, 0, 1, 0.38, 1),
      ]), material: MaterialLibrary.foliageLit(), castShadow: true,
    }),
  },
  rock_cluster: {
    // blue-grey granite boulders with snow caps
    maxInstances: 800,
    build: () => ({
      geometry: merge([
        part(ico(0.72, 0), '#7f8b99', 0, 0.3, 0, 0.3, 0.5, 0.2, 1.3, 0.75, 1.0, 0.1, 11), part(ico(0.62, 0), SNOW, 0, 0.62, 0, 0.3, 0.5, 0.2, 1.15, 0.32, 0.9),
        part(ico(0.46, 0), '#6e7a88', 0.8, 0.18, 0.3, 0.2, 1.2, 0.1, 1.1, 0.7, 1, 0.1, 13), part(ico(0.38, 0), SNOW, 0.8, 0.38, 0.3, 0.2, 1.2, 0.1, 1.0, 0.32, 0.9),
        part(ico(0.3, 0), '#8e9aa8', -0.6, 0.12, 0.5, 0, 0.4, 0.3, 1, 0.8, 1.2, 0.1, 17),
      ]), material: lit(), castShadow: true,
    }),
  },
  tree_round_big: {
    // big snow-laden fir (the mid-distance layer): five tiers with snow on every shelf
    maxInstances: 800,
    build: () => {
      const p: THREE.BufferGeometry[] = [part(cyl(0.3, 0.42, 3, 7), WOOD_DK, 0, 0.9, 0)];
      const tiers = [[3.0, 3.2, 2.6], [2.5, 2.9, 4.4], [2.0, 2.6, 6.0], [1.45, 2.3, 7.5], [0.9, 2.0, 8.9]] as const;
      tiers.forEach(([rad, h, y], i) => {
        p.push(part(cone(rad, h, 9), i % 2 ? PINE_LT : PINE, 0, y, 0, 0, i * 0.4, 0));
        p.push(part(cone(rad * 1.01, h * 0.28, 9), SNOW, 0, y - h * 0.36, 0, 0, i * 0.4, 0));
      });
      p.push(part(cone(0.5, 0.9, 8), SNOW, 0, 10.0, 0));
      return { geometry: merge(p), material: MaterialLibrary.foliageLit(), castShadow: true };
    },
  },
  tree_clump: {
    // far tree line: eight low-detail snow pines of mixed height in a 16 m patch
    maxInstances: 400,
    build: () => {
      const p: THREE.BufferGeometry[] = [], r = seeded(253);
      for (let i = 0; i < 8; i++) {
        const x = (r() - 0.5) * 14, z = (r() - 0.5) * 14, k = 0.75 + r() * 0.7;
        p.push(part(cone(2.1, 4.6, 7), i % 2 ? PINE_LT : PINE, x, 2.6 * k, z, 0, r() * 3, 0, k, k, k));
        p.push(part(cone(2.12, 1.1, 7), SNOW, x, 1.0 * k, z, 0, r() * 3, 0, k, k, k));
        p.push(part(cone(1.4, 3.4, 7), PINE, x, 5.4 * k, z, 0, 0, 0, k, k, k), part(cone(0.7, 1.4, 7), SNOW, x, 6.6 * k, z, 0, 0, 0, k, k, k));
      }
      return { geometry: merge(p), material: MaterialLibrary.foliageLit(), castShadow: true };
    },
  },
  lamp_post: {
    // navy resort lamp: the head is a frosted box; at night `lamp_glow` (same rows) lights it
    maxInstances: 200,
    build: () => ({ geometry: lampGeometry(false), material: lit(), castShadow: true }),
  },
  lamp_glow: {
    // the glowing lantern of `lamp_post` alone, placed by an identical PROPS row (emissive, so it blooms at night)
    maxInstances: 200,
    build: () => ({ geometry: lampGeometry(true), material: glow(2.2) }),
  },
  spectators: {
    // a cheering penguin crowd behind the barrier, with a blue sparkle banner (toy figures, our own mark only)
    maxInstances: 120,
    build: () => {
      const p: THREE.BufferGeometry[] = [], r = seeded(261);
      const hats = [RED, '#3d7bd9', '#f2c14e', AURORA_G, '#b57cff'];
      for (let i = 0; i < 9; i++) {
        const z = -2.4 + i * 0.6 + (r() - 0.5) * 0.2, x = -0.25 - r() * 0.9, s = 0.75 + r() * 0.3;
        p.push(part(rbox(0.5, 0.75, 0.45, 0.2, 2), INK, x, 0.4 + 0.37 * s, z, 0, 0, 0, s, s, s), part(rbox(0.08, 0.55, 0.32, 0.03, 1), SNOW, x + 0.22 * s, 0.4 + 0.35 * s, z, 0, 0, 0, s, s, s));
        p.push(part(sph(0.22, 8, 6), INK, x, 0.4 + 0.9 * s, z, 0, 0, 0, s, s, s), part(cone(0.06, 0.18, 5), CARROT, x + 0.26 * s, 0.4 + 0.88 * s, z, 0, 0, -Math.PI / 2, s, s, s));
        p.push(part(cyl(0.14, 0.2, 0.14, 8), hats[i % hats.length]!, x, 0.4 + 1.1 * s, z, 0, 0, 0, s, s, s));
        if (i % 3 === 1) p.push(part(rbox(0.08, 0.38, 0.14, 0.03, 1), INK, x + 0.05, 0.4 + 0.95 * s, z + 0.24, 0.7, 0, 0)); // waving flipper
      }
      p.push(part(box(0.06, 0.6, 2.6), DEEP, -0.05, 1.45, 0), part(box(0.07, 0.12, 2.6), SNOW, -0.04, 1.2, 0));
      p.push(paint(place(sparkleGeometry(0.22, 0.03, 9), -0.01, 1.5, 0, 0, Math.PI / 2, 0), SNOW));
      for (const z of [-1.35, 1.35]) p.push(part(cyl(0.03, 0.03, 1.8, 5), WOOD_DK, -0.08, 0.9, z));
      return { geometry: merge(p), material: toy(), castShadow: true };
    },
  },
  grandstand: {
    // five-tier resort stand facing the road (+X): ice-blue and white seats, a snow-loaded navy canopy, penguin fans
    maxInstances: 4,
    build: () => {
      const p: THREE.BufferGeometry[] = [];
      const L = 24, r = seeded(271);
      const SEATS = [DEEP, SNOW, '#6fb7e0', RED, '#f2c14e'];
      for (let i = 0; i < 5; i++) {
        const x = -1.6 - i * 1.25, top = 0.55 + i * 0.5;
        p.push(part(box(1.25, top + 0.6, L), '#c9d3de', x, (top - 0.6) / 2, 0));
        for (let k = 0; k < 12; k++) p.push(part(box(0.5, 0.18, 1.8), SEATS[(i + k) % SEATS.length]!, x + 0.2, top + 0.09, -L / 2 + 1 + k * 2));
        for (let k = 0; k < 7; k++) {
          if (r() < 0.25) continue;
          const z = -L / 2 + 1.2 + k * 3.4 + r() * 1.2;
          p.push(part(rbox(0.4, 0.55, 0.38, 0.15, 2), INK, x + 0.15, top + 0.46, z), part(rbox(0.06, 0.4, 0.26, 0.02, 1), SNOW, x + 0.34, top + 0.44, z));
          p.push(part(sph(0.19, 8, 6), INK, x + 0.15, top + 0.86, z), part(cone(0.05, 0.14, 5), CARROT, x + 0.36, top + 0.85, z, 0, 0, -Math.PI / 2));
        }
      }
      const back = -1.6 - 5 * 1.25;
      p.push(part(box(0.3, 5.4, L + 0.6), '#f1efe8', back - 0.15, 2.1, 0));
      p.push(part(box(0.25, 1.0, L), SNOW, -0.85, 0.5, 0), part(box(0.06, 0.4, L - 0.2), DEEP, -0.7, 0.75, 0));
      for (const z of [-L / 2 + 0.4, -L / 6, L / 6, L / 2 - 0.4]) p.push(part(cyl(0.12, 0.12, 5.6, 8), INK, -0.9, 2.8, z));
      p.push(part(box(8.6, 0.25, L + 1.2), DEEP, back / 2 - 0.4, 5.85, 0, 0, 0, -0.12));
      p.push(part(box(8.4, 0.3, L + 1.0), SNOW, back / 2 - 0.4, 6.1, 0, 0, 0, -0.12));             // snow load on the canopy
      p.push(part(box(8.7, 0.1, L + 1.3), '#24507e', back / 2 - 0.4, 5.7, 0, 0, 0, -0.12));
      return { geometry: merge(p), material: lit(), castShadow: true };
    },
  },
  // ---- hazards (drawn by render/track/hazards.ts at real size: x across, y up, z along travel) ------------------
  hazard_sled_train: {
    // penguin sled train: a little snow-plough sled towing a trailer, inside the 4.4 × 2 × 1.8 m traffic contact box
    build: () => {
      const p: THREE.BufferGeometry[] = [];
      for (const [z0, len] of [[0.9, 2.2], [-1.3, 1.6]] as const) {
        p.push(part(rbox(1.8, 0.45, len, 0.12, 2), RED, 0, 0.45, z0));
        for (const x of [-0.75, 0.75]) p.push(part(tubeThrough([[x, 0.1, z0 - len / 2], [x, 0.1, z0 + len / 2 - 0.1], [x, 0.4, z0 + len / 2 + 0.15]], 0.05, 8, 4), INK));
      }
      p.push(part(box(0.1, 0.1, 0.5), INK, 0, 0.35, -0.15));                                         // tow bar
      p.push(part(prism(2, 0.7, 0.35), '#f2c14e', 0, 0.35, 2.15, 0.35, 0, 0));                      // plough blade
      p.push(part(rbox(1.2, 0.8, 0.9, 0.2, 2), DEEP, 0, 1.05, 0.9));                                // seat back / cowl
      // penguin driver and a penguin passenger
      for (const [z, s] of [[0.5, 1], [-1.3, 0.85]] as const) {
        p.push(part(rbox(0.6, 0.8, 0.55, 0.22, 2), INK, 0, 0.95 + 0.4 * s, z, 0, 0, 0, s, s, s), part(rbox(0.1, 0.6, 0.42, 0.04, 1), SNOW, 0, 0.95 + 0.4 * s, z + 0.28 * s, 0, Math.PI / 2, 0, s, s, s));
        p.push(part(sph(0.26, 10, 8), INK, 0, 1.55 + 0.35 * s, z, 0, 0, 0, s, s, s), part(cone(0.08, 0.22, 5), CARROT, 0, 1.52 + 0.35 * s, z + 0.3 * s, Math.PI / 2, 0, 0, s, s, s));
      }
      p.push(part(cyl(0.2, 0.2, 0.08, 10), AURORA_G, 0, 2.05, 0.5));                                   // driver's beanie pompom
      return { geometry: merge(p), material: toy(), castShadow: true };
    },
  },
};
// the traffic default key (`hazard_car`) resolves to the sled train too, so a HAZ without `prop=` still fits the theme
FROSTBYTE_PROPS['hazard_car'] = FROSTBYTE_PROPS['hazard_sled_train']!;
// dressing rows use `tree_pine_snow` / `tree_birch` (same models) so Low / Medium thin them like every other tree kind
FROSTBYTE_PROPS['tree_pine_snow'] = FROSTBYTE_PROPS['pine_snow']!;
FROSTBYTE_PROPS['tree_birch'] = FROSTBYTE_PROPS['birch']!;
// left-side chevron board (arrows point forward on side=L rows)
FROSTBYTE_PROPS['ad_board_b_l'] = AD_BOARD_B_L;

export const FROSTBYTE_PALETTE = { SNOW, ICE, DEEP, AURORA_G, AURORA_V } as const;
