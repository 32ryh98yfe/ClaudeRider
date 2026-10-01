// Coral Cove dressing (2026-10 stylized pass, docs/design/34-stylized-pass.md §6): themed versions of the shared
// dressing kinds (dune grass, beach flora, tropical shrubs, sandstone, palm pairs, far palm islets, harbour lamps,
// a beach grandstand) plus beach and harbour life (umbrellas, huts, surf racks, dock crates, sailboats, gulls).
// Same frame as props.ts: +X faces the road, +Z along the track, y = 0 is road height − 0.2 m. The coral tracks have
// no terrain, so ground cover only goes where a `beach` / `cliff` prop lies under it; anything over open water floats
// at SEA_Y (sailboats, islets) and is only placed beside sea-level stretches of road.
import * as THREE from 'three/webgpu';
import { MaterialLibrary } from '../../materials/library.ts';
import type { PropFactory } from '../../props/defaults.ts';
import { merge, paint, place, rbox, box, cyl, cone, sph, ico, sparkleGeometry } from '../../util/geo.ts';
import { part, seeded, tubeThrough } from '../clayhill_village/toyshapes.ts';
import { hdr } from '../canopy_forest/shapes.ts';
import { glowLit } from '../lantern_hollow/glow.ts';
import { SEA_Y } from './props.ts';

const matte = (): THREE.Material => MaterialLibrary.vertexLit(0.8, 0);
const paintGloss = (): THREE.Material => MaterialLibrary.vertexLit(0.4, 0);
const leafy = (): THREE.Material => MaterialLibrary.foliageLit();

const K = {
  dune: '#9fb25f', duneLight: '#c2c97c', duneDry: '#d7bf78', leaf: '#3f9e4d', leafDeep: '#2f8441', leafLight: '#5cb85a',
  trunk: '#8a6340', trunkDark: '#6f4c2f', coconut: '#5a3a22', sand: '#f3dfae', sandWet: '#d9c08a', shallows: '#8fe0d6',
  sandstone: '#d2b085', sandstoneDk: '#b48f66', sandstoneLt: '#e4caa0', turq: '#1fb5c9', turqLight: '#7fe3d6', white: '#fafafa',
  red: '#d94f4f', yellow: '#f5c230', navy: '#2d4a6b', coral: '#ff7a6b', pink: '#ff6fa8', wood: '#b9854f', woodPale: '#d9b98a',
  woodDark: '#8b5a2b', iron: '#2f3136', gull: '#f4f6f8', gullGrey: '#a9b4bf', beak: '#f5b041',
} as const;

/**
 * Coconut palm into `parts`: a curved trunk of `segs` 1 m rings bending toward local −X, then turned by `yaw` and moved
 * to (ox, oz). Seven two-piece fronds and a coconut bunch at the crown.
 */
function palmInto(parts: THREE.BufferGeometry[], ox: number, oz: number, segs: number, bend: number, yaw: number, y0 = -0.35): void {
  const own: THREE.BufferGeometry[] = [];
  let x = 0, y = y0;
  for (let i = 0; i < segs; i++) {
    const r = 0.3 - i * 0.014;
    own.push(paint(place(cyl(r - 0.02, r, 1.05, 7), x, y + 0.5, 0, 0, 0, -0.05 - i * bend), i % 2 ? K.trunk : K.trunkDark));
    x -= 0.05 + i * bend * 1.3; y += 1.0;
  }
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.3, cx = Math.cos(a), cz = Math.sin(a);
    own.push(paint(place(box(2.2, 0.08, 0.75), x + cx * 1.0, y + 0.25, cz * 1.0, 0, -a, 0.25), k % 2 ? K.leaf : K.leafLight, 0.08, k + 1));
    own.push(paint(place(box(1.9, 0.08, 0.6), x + cx * 2.8, y - 0.35, cz * 2.8, 0, -a, -0.55), k % 2 ? K.leafLight : K.leafDeep, 0.08, k + 9));
  }
  for (let k = 0; k < 3; k++) own.push(paint(place(sph(0.22, 6, 4), x + Math.cos(k * 2.1) * 0.35, y - 0.2, Math.sin(k * 2.1) * 0.35), K.coconut));
  parts.push(place(merge(own), ox, 0, oz, 0, yaw, 0));
}

/** Striped beach umbrella (8 panels) on a pole, with its towel. */
function umbrellaInto(parts: THREE.BufferGeometry[], x: number, z: number, a: string, b: string, towel: string, tilt: number): void {
  parts.push(part(cyl(0.035, 0.035, 2.4, 5), K.white, x, 1.2, z, tilt, 0, 0));
  for (let k = 0; k < 8; k++) {
    // closed wedge: its base cap is the underside the karts see from below
    const g = new THREE.ConeGeometry(1.35, 0.55, 8, 1, false, (k / 8) * Math.PI * 2, Math.PI / 4);
    parts.push(part(g, k % 2 ? a : b, x, 2.45, z + Math.sin(tilt) * 1.2, tilt, 0, 0));
  }
  parts.push(part(sph(0.07, 6, 4), K.white, x, 2.78, z + Math.sin(tilt) * 1.3));
  parts.push(part(box(0.9, 0.03, 1.8), towel, x - 0.9, 0.24, z + 0.2, 0, 0.25, 0), part(box(0.92, 0.035, 0.25), K.white, x - 0.9, 0.245, z - 0.45, 0, 0.25, 0));
}

/** One dune-grass tuft (8 blades) at (x, z), scaled by k. */
function tuftInto(p: THREE.BufferGeometry[], x: number, z: number, k: number, r: () => number): void {
  for (let i = 0; i < 8; i++) {
    const a = r() * Math.PI * 2, d = r() * 0.22 * k, h = (0.4 + r() * 0.45) * k;
    p.push(part(cone(0.04 * k, h, 3), [K.dune, K.duneLight, K.duneDry][i % 3]!, x + Math.cos(a) * d, h / 2 - 0.02, z + Math.sin(a) * d, (r() - 0.5) * 0.8, a, (r() - 0.5) * 0.8));
  }
}
function groundPatch(seed: number, fill: (p: THREE.BufferGeometry[], r: () => number) => void): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  fill(p, seeded(seed));
  return merge(p);
}

/** Flat sail panel from a 2D outline, extruded 4 cm so both faces render with the shared single-sided material. */
function sail(pts: ReadonlyArray<readonly [number, number]>): THREE.BufferGeometry {
  return new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), { depth: 0.04, bevelEnabled: false });
}

export const CORAL_DRESSING: Record<string, PropFactory> = {
  // ---- ground cover and shrubs on the sand ------------------------------------------------------------------------
  grass_tuft: {
    // dune grass: thin sage and straw blades splayed out of the sand
    maxInstances: 6000,
    build: () => {
      const p: THREE.BufferGeometry[] = [], r = seeded(141);
      for (let i = 0; i < 8; i++) {
        const a = r() * Math.PI * 2, d = r() * 0.22, h = 0.4 + r() * 0.45;
        p.push(part(cone(0.04, h, 3), [K.dune, K.duneLight, K.duneDry][i % 3]!, Math.cos(a) * d, h / 2 - 0.02, Math.sin(a) * d, (r() - 0.5) * 0.8, a, (r() - 0.5) * 0.8));
      }
      return { geometry: merge(p), material: leafy() };
    },
  },
  flower_patch: {
    // beach flora: a mat of ice plant with pink and yellow flowers, a scallop shell and a starfish
    maxInstances: 3000,
    build: () => {
      const p: THREE.BufferGeometry[] = [part(ico(0.42, 1), '#5c9a48', 0, 0.04, 0, 0, 0, 0, 1.4, 0.28, 1.1, 0.08, 3)];
      const r = seeded(143);
      for (let i = 0; i < 6; i++) {
        const a = r() * Math.PI * 2, d = 0.15 + r() * 0.4;
        p.push(part(ico(0.08, 0), i % 3 ? K.pink : K.yellow, Math.cos(a) * d * 1.3, 0.15, Math.sin(a) * d));
      }
      p.push(part(new THREE.SphereGeometry(0.16, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), '#f6d7c3', 0.75, -0.02, 0.45, 0, 0, 0, 1, 0.45, 1));
      for (let k = 0; k < 5; k++) p.push(part(box(0.24, 0.05, 0.07), K.coral, -0.7 + Math.cos(k * 1.2566) * 0.11, 0.0, -0.4 + Math.sin(k * 1.2566) * 0.11, 0, -k * 1.2566, 0));
      return { geometry: merge(p), material: leafy() };
    },
  },
  bush_round: {
    // tropical shrub: big glossy-free leaf blobs and red / coral hibiscus
    maxInstances: 1500,
    build: () => {
      const p: THREE.BufferGeometry[] = [
        part(ico(0.85, 1), K.leafDeep, 0, 0.6, 0, 0, 0, 0, 1.15, 0.85, 1.1, 0.08, 3),
        part(ico(0.62, 1), K.leaf, 0.55, 0.78, 0.3, 0, 0, 0, 1, 0.9, 1, 0.08, 5),
        part(ico(0.55, 1), K.leafLight, -0.5, 0.52, -0.25, 0, 0, 0, 1, 0.85, 1, 0.08, 7),
      ];
      const r = seeded(147);
      for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2 + r() * 0.4; p.push(part(box(1.05, 0.05, 0.34), k % 2 ? K.leaf : K.leafLight, Math.cos(a) * 0.75, 0.42 + r() * 0.3, Math.sin(a) * 0.75, 0, -a, -0.35)); }
      for (let k = 0; k < 8; k++) { const a = r() * Math.PI * 2, e = 0.3 + r() * 0.8; p.push(part(ico(0.13, 0), [K.red, K.coral, K.pink][k % 3]!, Math.cos(a) * 0.95 * Math.cos(e), 0.6 + Math.sin(e) * 0.75, Math.sin(a) * 0.9 * Math.cos(e))); }
      return { geometry: merge(p), material: leafy(), castShadow: true };
    },
  },
  rock_cluster: {
    // warm sandstone boulders
    maxInstances: 800,
    build: () => ({
      geometry: merge([
        part(ico(0.75, 0), K.sandstone, 0, 0.28, 0, 0.3, 0.5, 0.2, 1.3, 0.75, 1.0, 0.1, 11),
        part(ico(0.48, 0), K.sandstoneDk, 0.85, 0.16, 0.3, 0.2, 1.2, 0.1, 1.1, 0.7, 1, 0.1, 13),
        part(ico(0.32, 0), K.sandstoneLt, -0.65, 0.1, 0.55, 0, 0.4, 0.3, 1, 0.8, 1.2, 0.08, 17),
      ]), material: matte(), castShadow: true,
    }),
  },
  tree_round_big: {
    // shade layer: two coconut palms leaning apart over a sandy shrub
    maxInstances: 800,
    build: () => {
      const p: THREE.BufferGeometry[] = [];
      palmInto(p, 0.6, -0.5, 9, 0.032, 0.5);
      palmInto(p, -0.6, 0.6, 7, 0.045, 2.6);
      p.push(part(ico(0.7, 1), K.leafDeep, 0.2, 0.3, 0.1, 0, 0, 0, 1.3, 0.6, 1.2, 0.08, 19));
      return { geometry: merge(p), material: leafy(), castShadow: true };
    },
  },
  tree_clump: {
    // far layer over the water: a little sand islet with four palms and a rock (floats at sea level)
    maxInstances: 300,
    build: () => {
      const p: THREE.BufferGeometry[] = [
        part(sph(7, 14, 5), K.sand, 0, SEA_Y - 4.1, 0, 0, 0, 0, 1.35, 0.68, 1, 0.04, 3),
        part(cyl(10.2, 10.8, 0.2, 18), K.shallows, 0, SEA_Y - 0.05, 0, 0, 0, 0, 1.3, 1, 1),
        part(ico(1.6, 0), K.sandstoneDk, 3.5, SEA_Y + 0.6, -1.5, 0.3, 0.6, 0, 1.2, 0.8, 1, 0.1, 7),
      ];
      const r = seeded(151);
      for (let i = 0; i < 4; i++) palmInto(p, (r() - 0.5) * 7, (r() - 0.5) * 6, 6 + Math.floor(r() * 4), 0.03 + r() * 0.03, r() * 6.28, SEA_Y + 0.6);
      return { geometry: merge(p), material: leafy(), castShadow: true };
    },
  },
  grass_patch: {
    // a 12 × 6 m clump of the ground-cover layer (dune grass, flora, a shrub, stones) for hand-placed PROP lines where
    // PROPS rows are excluded (start line, pads, item rows): it reads like the row layers next to it
    maxInstances: 80,
    build: () => ({ geometry: groundPatch(171, (p, r) => {
      for (let i = 0; i < 26; i++) tuftInto(p, -r() * 6, (r() - 0.5) * 12, 1 + r() * 0.8, r);
      for (let i = 0; i < 5; i++) { const x = -0.6 - r() * 5, z = (r() - 0.5) * 11; p.push(part(ico(0.3, 1), '#5c9a48', x, 0.03, z, 0, 0, 0, 1.4, 0.28, 1.1), part(ico(0.08, 0), i % 2 ? K.pink : K.yellow, x, 0.14, z)); }
      p.push(part(ico(0.8, 1), K.leafDeep, -4.2, 0.55, 2.5, 0, 0, 0, 1.15, 0.85, 1.1, 0.08, 3), part(ico(0.55, 1), K.leafLight, -3.7, 0.7, 3.0), part(ico(0.13, 0), K.red, -3.5, 1.2, 2.4));
      p.push(part(ico(0.6, 0), K.sandstone, -2.8, 0.2, -3.8, 0.3, 0.5, 0.2, 1.3, 0.7, 1.0, 0.1, 11), part(ico(0.35, 0), K.sandstoneDk, -2.1, 0.12, -3.2));
    }), material: leafy() }),
  },
  // ---- racing furniture, harbour style ----------------------------------------------------------------------------
  lamp_post: {
    // harbour lamp: navy post with a white lantern head (its panes glow at dusk; below the bloom threshold at noon)
    maxInstances: 200,
    build: () => ({
      geometry: merge([
        part(cyl(0.2, 0.25, 0.4, 8), K.navy, 0, 0.2, 0), part(cyl(0.07, 0.09, 3.9, 8), K.navy, 0, 2.15, 0),
        part(new THREE.TorusGeometry(0.32, 0.035, 5, 12, Math.PI), K.navy, 0.32, 4.05, 0, 0, 0, 0),
        part(rbox(0.42, 0.52, 0.42, 0.06, 1), K.white, 0.64, 3.55, 0), part(box(0.34, 0.38, 0.44), hdr('#fff1c8', 1.55), 0.64, 3.55, 0),
        part(cone(0.32, 0.26, 8), K.navy, 0.64, 3.94, 0), part(sph(0.06, 6, 4), K.yellow, 0.64, 4.1, 0),
      ]), material: glowLit(0.6, 1.2), castShadow: true,
    }),
  },
  grandstand: {
    // beach grandstand: five white tiers with turquoise / coral / yellow seats, a crowd and a striped sun canopy
    maxInstances: 4,
    build: () => {
      const p: THREE.BufferGeometry[] = [];
      const L = 24, r = seeded(131);
      const SEATS = [K.turq, K.white, K.coral, K.yellow, K.turqLight];
      for (let i = 0; i < 5; i++) {
        const x = -1.6 - i * 1.25, top = 0.55 + i * 0.5;
        p.push(part(box(1.25, top + 0.6, L), '#e9e4da', x, (top - 0.6) / 2, 0));
        for (let k = 0; k < 12; k++) p.push(part(box(0.5, 0.18, 1.8), SEATS[(i + k) % SEATS.length]!, x + 0.2, top + 0.09, -L / 2 + 1 + k * 2));
        for (let k = 0; k < 7; k++) {
          if (r() < 0.25) continue;
          const z = -L / 2 + 1.2 + k * 3.4 + r() * 1.2, col = ['#e84a3c', '#3d7bd9', '#f2c14e', '#ffffff', '#56b45a', '#ff8fb1'][Math.floor(r() * 6)]!;
          p.push(part(rbox(0.42, 0.55, 0.42, 0.12, 1), col, x + 0.15, top + 0.46, z), part(sph(0.2, 8, 6), ['#f0c9a0', '#c98e62', '#8a5a3c'][k % 3]!, x + 0.15, top + 0.9, z));
          if (k % 3 === 0) p.push(part(cyl(0.3, 0.3, 0.05, 10), ['#f5c230', '#ffffff', '#ff8fb1'][k % 3]!, x + 0.15, top + 1.08, z)); // sun hats
        }
      }
      const back = -1.6 - 5 * 1.25;
      p.push(part(box(0.3, 5.4, L + 0.6), K.white, back - 0.15, 2.1, 0));
      p.push(part(box(0.25, 1.0, L), K.white, -0.85, 0.5, 0), part(box(0.06, 0.4, L - 0.2), K.turq, -0.7, 0.75, 0));
      for (const z of [-L / 2 + 0.4, -L / 6, L / 6, L / 2 - 0.4]) p.push(part(cyl(0.12, 0.12, 5.6, 8), K.navy, -0.9, 2.8, z));
      for (let k = 0; k < 13; k++) p.push(part(box(8.6, 0.22, L / 13 + 0.02), k % 2 ? K.white : K.turq, back / 2 - 0.4, 5.85, -L / 2 + (k + 0.5) * (L / 13), 0, 0, -0.12));
      for (let k = 0; k < 24; k++) p.push(part(cone(0.32, 0.55, 3), k % 2 ? K.turq : K.white, -0.55, 5.32, -L / 2 + 0.5 + k, Math.PI, 0, 0));
      p.push(paint(place(sparkleGeometry(0.9, 0.08, 9), -0.6, 4.4, 0, 0, Math.PI / 2, 0), K.coral));
      return { geometry: merge(p), material: matte(), castShadow: true };
    },
  },
  quay: {
    // 12.4 m of stone quay outside a harbour-side road edge: paved deck 0.2 m under the road (7 m wide), granite
    // coping, a wall down into the sea with rubber fenders and iron rings, so lamps and dock clutter have ground
    maxInstances: 120,
    build: () => {
      const p: THREE.BufferGeometry[] = [
        part(box(7.2, 0.3, 12.4), '#cfc6b6', -3.5, -0.15, 0), part(box(0.6, 0.34, 12.4), '#e2dccf', -7.0, -0.1, 0),
        part(box(7.0, 3.4, 12.4), '#a99e8c', -3.6, -2.0, 0, 0, 0, 0, 1, 1, 1, 0.05, 3),
      ];
      for (let k = 0; k < 6; k++) p.push(part(box(7.18, 0.02, 0.06), '#b5ac9c', -3.5, 0.005, -6 + k * 2.4)); // paving joints
      for (const z of [-4.2, 0, 4.2]) p.push(part(box(0.35, 1.6, 0.9), '#2f3136', -7.25, -1.0, z), part(new THREE.TorusGeometry(0.18, 0.04, 4, 10), '#2f3136', -7.32, -0.35, z + 1.6, 0, Math.PI / 2, 0));
      p.push(part(box(7.1, 0.25, 12.42), '#7fae9a', -3.6, SEA_Y + 0.05, 0)); // weed line at the waterline
      return { geometry: merge(p), material: matte(), castShadow: true };
    },
  },
  // ---- beach and harbour life ---------------------------------------------------------------------------------------
  beach_umbrella: {
    // two striped umbrellas with towels, a deck chair and a cool box
    maxInstances: 200,
    build: () => {
      const p: THREE.BufferGeometry[] = [];
      umbrellaInto(p, -1.2, -1.6, K.red, K.white, K.turq, 0.12);
      umbrellaInto(p, -2.4, 1.9, K.turq, K.white, K.yellow, -0.1);
      // deck chair: frame and a striped canvas sling
      p.push(part(box(0.06, 0.06, 1.3), K.woodPale, -0.1, 0.35, 0.3, -0.5, 0, 0), part(box(0.6, 0.04, 1.1), K.coral, -0.1, 0.42, 0.25, -0.55, 0, 0));
      p.push(part(box(0.62, 0.05, 0.3), K.white, -0.1, 0.43, 0.25, -0.55, 0, 0));
      p.push(part(rbox(0.6, 0.45, 0.4, 0.06, 1), K.white, -3.0, 0.22, -0.3), part(box(0.62, 0.12, 0.42), K.turq, -3.0, 0.4, -0.3));
      return { geometry: merge(p), material: matte(), castShadow: true };
    },
  },
  beach_hut: {
    // three striped bathing huts on short stilts (each 2.6 m wide), pastel doors
    maxInstances: 60,
    build: () => {
      const p: THREE.BufferGeometry[] = [];
      const cols = [K.turq, K.coral, K.yellow];
      for (let h = 0; h < 3; h++) {
        const z = -3.2 + h * 3.2, x = -2.4;
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) p.push(part(box(0.14, 0.7, 0.14), K.woodDark, x + dx * 1.0, 0.15, z + dz * 1.1));
        p.push(part(box(2.3, 0.14, 2.6), K.woodPale, x, 0.55, z));
        for (let s = 0; s < 6; s++) p.push(part(box(2.0, 2.2, 0.37), s % 2 ? K.white : cols[h]!, x - 0.1, 1.72, z - 1.11 + s * 0.444));
        p.push(part(box(2.6, 0.16, 2.9), cols[h]!, x, 3.0, z, 0, 0, 0.0), part(cone(1.95, 0.9, 4), K.white, x, 3.5, z, 0, Math.PI / 4, 0, 0.95, 1, 1.05));
        p.push(part(box(0.06, 1.5, 0.9), K.white, x + 0.92, 1.45, z), part(sph(0.05, 5, 3), K.navy, x + 0.96, 1.45, z + 0.3));
        p.push(part(box(0.7, 0.08, 1.0), K.woodPale, x + 1.5, 0.3, z, 0, 0, -0.5));
      }
      return { geometry: merge(p), material: matte(), castShadow: true };
    },
  },
  surf_rack: {
    // a timber rack with four surfboards standing in it
    maxInstances: 120,
    build: () => {
      const p: THREE.BufferGeometry[] = [part(box(0.14, 1.1, 0.14), K.woodDark, -0.8, 0.55, -1.4), part(box(0.14, 1.1, 0.14), K.woodDark, -0.8, 0.55, 1.4), part(box(0.12, 0.12, 3.0), K.wood, -0.8, 1.0, 0)];
      const cols = [K.turq, K.coral, K.yellow, K.white];
      for (let k = 0; k < 4; k++) {
        const z = -1.05 + k * 0.7;
        p.push(part(sph(0.5, 10, 6), cols[k]!, -0.5, 1.15, z, -0.2, 0, 0.0, 0.08, 2.4, 0.42), part(box(0.07, 2.0, 0.06), k % 2 ? K.white : K.navy, -0.46, 1.15, z, -0.2, 0, 0));
      }
      return { geometry: merge(p), material: paintGloss(), castShadow: true };
    },
  },
  crate_stack: {
    // dock clutter: a stack of fish crates, a mooring bollard with a coiled rope and a lifebuoy stand
    maxInstances: 200,
    build: () => {
      const p: THREE.BufferGeometry[] = [];
      for (const [x, y, z, c] of [[-1.0, 0, -0.8, K.woodPale], [-1.0, 0, 0.5, K.wood], [-1.0, 0.62, -0.15, K.turq], [-2.1, 0, -0.2, K.woodPale]] as const) {
        p.push(part(rbox(1.0, 0.6, 1.2, 0.05, 1), c, x, y + 0.3, z));
        p.push(part(box(1.02, 0.06, 1.22), K.woodDark, x, y + 0.48, z));
      }
      p.push(part(cyl(0.22, 0.28, 0.6, 10), K.iron, -0.2, 0.3, 1.6), part(cyl(0.3, 0.3, 0.12, 10), K.iron, -0.2, 0.62, 1.6));
      p.push(part(new THREE.TorusGeometry(0.34, 0.08, 6, 14), '#e0c79a', -0.6, 0.1, 2.3, Math.PI / 2, 0, 0), part(new THREE.TorusGeometry(0.22, 0.08, 6, 12), '#e0c79a', -0.6, 0.2, 2.3, Math.PI / 2, 0, 0));
      p.push(part(box(0.12, 1.5, 0.12), K.white, -0.3, 0.75, -2.0));
      for (let k = 0; k < 4; k++) {
        const g = new THREE.TorusGeometry(0.42, 0.13, 6, 16, Math.PI / 2);
        p.push(part(g, k % 2 ? K.white : K.red, -0.2, 1.45, -2.0, 0, Math.PI / 2, (k * Math.PI) / 2));
      }
      return { geometry: merge(p), material: matte(), castShadow: true };
    },
  },
  sailboat: {
    // small sailboat at anchor: white hull, turquoise stripe, mast and a striped mainsail and jib (bow toward +Z)
    maxInstances: 80,
    build: () => ({
      geometry: merge([
        part(rbox(2.0, 1.0, 6.0, 0.4, 3), K.white, 0, SEA_Y + 0.3, 0),
        part(cone(1.0, 1.6, 8), K.white, 0, SEA_Y + 0.3, 3.6, Math.PI / 2, 0, 0, 1, 1, 0.5),
        part(box(2.05, 0.18, 5.9), K.turq, 0, SEA_Y + 0.55, 0), part(box(1.4, 0.5, 2.0), K.woodPale, 0, SEA_Y + 0.95, -1.4),
        part(cyl(0.06, 0.08, 8.5, 5), K.woodPale, 0, SEA_Y + 5.0, 0.6),
        // sails are thin extrusions so they read from both sides; shape x runs aft (mainsail) / forward (jib)
        ...[0, 1, 2, 3].map((k) => part(sail([[0, k * 1.8], [0, (k + 1) * 1.8], [-3.4 * (1 - (k + 1) / 4.3), (k + 1) * 1.8], [-3.4 * (1 - k / 4.3), k * 1.8]]), k % 2 ? K.coral : K.white, 0, SEA_Y + 1.4, 0.55, 0, -Math.PI / 2, 0)),
        part(sail([[0, 0], [0, 7.2], [2.6, 0]]), K.white, 0, SEA_Y + 1.4, 0.7, 0, -Math.PI / 2, 0),
      ]), material: paintGloss(), castShadow: true,
    }),
  },
  seagull: {
    // three gulls gliding high over the water (no collision; the kart never reaches them)
    maxInstances: 80,
    build: () => {
      const p: THREE.BufferGeometry[] = [], r = seeded(161);
      for (let i = 0; i < 3; i++) {
        const x = (r() - 0.5) * 8, y = 9 + r() * 6, z = (r() - 0.5) * 10, bank = (r() - 0.5) * 0.5;
        p.push(part(sph(0.22, 8, 6), K.gull, x, y, z, 0, 0, 0, 1, 0.8, 2.0), part(cone(0.06, 0.22, 4), K.beak, x, y, z + 0.5, Math.PI / 2, 0, 0));
        for (const s of [-1, 1]) {
          p.push(part(box(1.1, 0.04, 0.32), K.gull, x + s * 0.6, y + 0.12, z, 0, 0, s * (0.35 + bank)));
          p.push(part(box(0.5, 0.045, 0.24), K.gullGrey, x + s * 1.3, y + 0.42, z - 0.04, 0, 0, s * (-0.25 + bank)));
        }
      }
      return { geometry: merge(p), material: matte() };
    },
  },
  palm_planter: {
    // promenade planter: a white rendered box with a short palm and flowers (lines the start straight)
    maxInstances: 120,
    build: () => {
      const p: THREE.BufferGeometry[] = [part(rbox(1.6, 0.8, 1.6, 0.1, 2), K.white, 0, 0.4, 0), part(box(1.62, 0.12, 1.62), K.turq, 0, 0.72, 0), part(box(1.4, 0.1, 1.4), '#6b4a33', 0, 0.8, 0)];
      palmInto(p, 0, 0, 5, 0.03, 0.8, 0.5);
      for (let k = 0; k < 6; k++) p.push(part(ico(0.12, 0), k % 2 ? K.pink : K.yellow, Math.cos(k) * 0.55, 0.92, Math.sin(k) * 0.55));
      return { geometry: merge(p), material: leafy(), castShadow: true };
    },
  },
  bunting_line: {
    // pennant line strung between two white poles along the promenade (12 m span)
    maxInstances: 120,
    build: () => {
      const p: THREE.BufferGeometry[] = [part(cyl(0.06, 0.07, 5.2, 6), K.white, 0, 2.6, -6), part(cyl(0.06, 0.07, 5.2, 6), K.white, 0, 2.6, 6)];
      const cols = [K.red, K.white, K.turq, K.yellow];
      for (let k = 0; k < 16; k++) {
        const t = (k + 0.5) / 16, z = -6 + t * 12, y = 5.0 - Math.sin(t * Math.PI) * 0.9;
        p.push(part(cone(0.25, 0.55, 3), cols[k % 4]!, 0, y - 0.3, z, Math.PI, 0, 0, 0.2, 1, 1));
      }
      const rope: [number, number, number][] = [];
      for (let k = 0; k <= 8; k++) { const t = k / 8; rope.push([0, 5.0 - Math.sin(t * Math.PI) * 0.9, -6 + t * 12]); }
      p.push(part(tubeThrough(rope, 0.025, 16, 3), K.iron));
      return { geometry: merge(p), material: matte() };
    },
  },
};
