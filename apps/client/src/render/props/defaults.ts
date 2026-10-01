// Default prop factories (vertex-coloured, merged, instanced). ThemeKits override kinds with their own looks.
import * as THREE from 'three/webgpu';
import { MaterialLibrary } from '../materials/library.ts';
import { merge, paint, place, rbox, box, cyl, cone, ico, sph, sparkleGeometry } from '../util/geo.ts';

export interface PropFactory { build(pal: readonly string[]): { geometry: THREE.BufferGeometry; material: THREE.Material; castShadow?: boolean }; maxInstances?: number }

const lit = (): THREE.Material => MaterialLibrary.vertexLit(0.8, 0);
/** Trees and bushes sway in the wind (positionNode, masked by height so trunks stay planted). */
const leafy = (): THREE.Material => MaterialLibrary.foliageLit();

export const DEFAULT_PROPS: Record<string, PropFactory> = {
  tree_round: {
    build: (pal) => ({
      geometry: merge([
        paint(place(cyl(0.25, 0.35, 2.4, 7), 0, 1.2, 0), '#6b4a33'),
        paint(place(ico(1.9, 1), 0, 3.6, 0, 0, 0, 0, 1, 0.9, 1), pal[2] ?? '#6fae4b', 0.12, 3),
        paint(place(ico(1.3, 1), 0.9, 4.4, 0.4), pal[2] ?? '#7cbd55', 0.12, 5),
      ]), material: leafy(), castShadow: true,
    }),
  },
  tree_pine: {
    build: () => ({
      geometry: merge([
        paint(place(cyl(0.2, 0.3, 1.6, 6), 0, 0.8, 0), '#5b3d2a'),
        paint(place(cone(1.7, 2.6, 7), 0, 2.4, 0), '#3f7d45', 0.1, 7),
        paint(place(cone(1.3, 2.2, 7), 0, 3.6, 0), '#4a8f4f', 0.1, 9),
        paint(place(cone(0.8, 1.6, 7), 0, 4.7, 0), '#56a05a', 0.1, 11),
      ]), material: leafy(), castShadow: true,
    }),
  },
  bush: { build: (pal) => ({ geometry: merge([paint(place(ico(0.9, 1), 0, 0.5, 0, 0, 0, 0, 1.3, 0.8, 1.1), pal[2] ?? '#5d9a42', 0.15, 13)]), material: leafy() }) },
  house: {
    build: (pal) => ({
      geometry: merge([
        paint(place(box(6, 4, 5), 0, 2, 0), pal[1] ?? '#f4efe6'),
        paint(place(cone(4.6, 2.6, 4), 0, 5.3, 0, 0, Math.PI / 4, 0, 1, 1, 0.8), pal[0] ?? '#d97757'),
        paint(place(box(1.1, 1.8, 0.1), 0, 0.9, 2.52), '#6b4a33'),
        paint(place(box(1, 0.9, 0.1), -1.8, 2.4, 2.52), '#9fd3f5'), paint(place(box(1, 0.9, 0.1), 1.8, 2.4, 2.52), '#9fd3f5'),
        paint(place(box(0.7, 1.4, 0.7), 1.6, 6, -0.6), '#a8663f'),
      ]), material: lit(), castShadow: true,
    }),
  },
  windmill_small: {
    build: (pal) => {
      const blades: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 4; i++) blades.push(paint(place(box(0.5, 3.4, 0.08), Math.sin((i * Math.PI) / 2) * 1.7, 7.2 + Math.cos((i * Math.PI) / 2) * 1.7, 1.25, 0, 0, (i * Math.PI) / 2), '#faf9f5'));
      return {
        geometry: merge([
          paint(place(cyl(1.3, 1.8, 6.5, 8), 0, 3.25, 0), pal[1] ?? '#f4efe6'),
          paint(place(cone(1.6, 1.8, 8), 0, 7.4, 0), pal[0] ?? '#d97757'),
          paint(place(cyl(0.2, 0.2, 0.6, 6), 0, 7.2, 1.0, Math.PI / 2, 0, 0), '#6b4a33'),
          ...blades,
        ]), material: lit(), castShadow: true,
      };
    },
  },
  fence: {
    build: () => ({
      geometry: merge([
        paint(place(box(0.12, 1.0, 0.12), -1.5, 0.5, 0), '#b89068'), paint(place(box(0.12, 1.0, 0.12), 1.5, 0.5, 0), '#b89068'),
        paint(place(box(3.2, 0.12, 0.08), 0, 0.75, 0), '#d8b48a'), paint(place(box(3.2, 0.12, 0.08), 0, 0.4, 0), '#d8b48a'),
      ]), material: lit(),
    }),
  },
  lamp: {
    build: () => ({
      geometry: merge([
        paint(place(cyl(0.08, 0.12, 4.2, 6), 0, 2.1, 0), '#3a3d42'),
        paint(place(box(0.9, 0.12, 0.2), 0.35, 4.2, 0), '#3a3d42'),
        paint(place(sph(0.22, 8, 6), 0.75, 4.05, 0), '#fff2c4'),
      ]), material: lit(),
    }),
  },
  chevron: {
    build: () => {
      // board facing +Z with three yellow chevrons pointing +X (variant 1 = left turn → arrows mirrored by scale)
      const parts = [paint(place(rbox(2.4, 1.0, 0.12, 0.05, 2), 0, 0.9, 0), '#1c1f26'), paint(place(box(0.1, 0.9, 0.1), -1.0, 0.45, -0.05), '#6b6f78'), paint(place(box(0.1, 0.9, 0.1), 1.0, 0.45, -0.05), '#6b6f78')];
      for (let i = 0; i < 3; i++) {
        const x = -0.6 + i * 0.6;
        parts.push(paint(place(box(0.14, 0.5, 0.05), x - 0.08, 1.06, 0.07, 0, 0, -0.7), '#ffd23f'));
        parts.push(paint(place(box(0.14, 0.5, 0.05), x - 0.08, 0.74, 0.07, 0, 0, 0.7), '#ffd23f'));
      }
      return { geometry: merge(parts), material: MaterialLibrary.vertexLit(0.4, 0) };
    },
  },
  gantry: { build: (pal) => ({ geometry: startGantry(pal[0] ?? '#d97757'), material: lit(), castShadow: true }) },
  rock: { build: () => ({ geometry: merge([paint(place(ico(1.2, 0), 0, 0.5, 0, 0.3, 0.5, 0.2, 1.4, 0.8, 1.1), '#8b8680', 0.1, 17)]), material: lit() }) },
  // .vis v2 compiler props (L4-vis-v2 §5)
  gore_cushion: {
    build: () => {
      // crash cushion at a split gore: stacked impact drums with an arrow board facing the oncoming traffic (−Z)
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 3; i++) for (let j = 0; j <= i; j++) parts.push(paint(place(cyl(0.42, 0.42, 0.9, 10), (j - i / 2) * 0.85, 0.45, -i * 0.8), i % 2 ? '#1c1f26' : '#ffd23f'));
      parts.push(paint(place(rbox(1.6, 0.8, 0.1, 0.04, 2), 0, 1.35, 0.4), '#1c1f26'));
      for (const x of [-0.45, 0.45]) { parts.push(paint(place(box(0.12, 0.44, 0.04), x - 0.08, 1.46, 0.46, 0, 0, -0.7), '#ffd23f'), paint(place(box(0.12, 0.44, 0.04), x - 0.08, 1.2, 0.46, 0, 0, 0.7), '#ffd23f')); }
      return { geometry: merge(parts), material: MaterialLibrary.vertexLit(0.5, 0), castShadow: true };
    },
  },
  pillar: {
    // support column under elevated decks, 6 m per height class (TrackView scales y by the prop variant)
    build: (pal) => ({ geometry: merge([paint(place(rbox(1.1, 6, 1.1, 0.12, 2), 0, 3, 0), '#9a968f', 0.05, 23), paint(place(box(1.5, 0.3, 1.5), 0, 5.85, 0), pal[1] ?? '#b8b2a8')]), material: lit(), castShadow: true }),
  },
};

/** Visible placeholder for unknown prop kinds (never crash). */
// generic kinds the track DSL emits when a theme has no named variant
DEFAULT_PROPS['tree'] ??= DEFAULT_PROPS['tree_round']!;
DEFAULT_PROPS['pine'] ??= DEFAULT_PROPS['tree_pine']!;

export const PLACEHOLDER_PROP: PropFactory = { build: () => ({ geometry: paint(place(box(1, 1, 1), 0, 0.5, 0), '#ff00ff'), material: lit() }) };

/**
 * Start/finish gantry (local X across the road, ±Z along it; scaled by road width / 16 by trackc).
 * Two lattice towers on hazard-striped feet carry a header with checker bands, the parametric sparkle
 * emblem (never the Claude logo) and five start lamps over the grid side, so the line reads from the grid
 * and from the far end of the straight.
 */
function startGantry(accent: string): THREE.BufferGeometry {
  const DARK = '#262a33', STEEL = '#9aa3ad', WHITE = '#f6f4ef', INK = '#16181d', YEL = '#f2c230';
  const p: THREE.BufferGeometry[] = [];
  for (const x of [-9.4, 9.4]) {
    // tower: four chords and zig-zag braces on the two faces seen from the road
    for (const dx of [-0.36, 0.36]) for (const dz of [-0.36, 0.36]) p.push(paint(place(box(0.13, 6.6, 0.13), x + dx, 3.4, dz), DARK));
    for (let i = 0; i < 6; i++) {
      const y = 0.75 + i * 1.0, tilt = i % 2 ? 0.8 : -0.8;
      for (const dz of [-0.36, 0.36]) p.push(paint(place(box(0.08, 1.25, 0.08), x, y, dz, 0, 0, tilt), STEEL));
      for (const dx of [-0.36, 0.36]) p.push(paint(place(box(0.08, 1.25, 0.08), x + dx, y, 0, tilt, 0, 0), STEEL));
    }
    // concrete foot with yellow/black hazard bands
    p.push(paint(place(rbox(1.3, 0.7, 1.3, 0.08, 1), x, 0.25, 0), '#c9c6bf'));
    for (let i = 0; i < 4; i++) p.push(paint(place(box(1.32, 0.12, 1.32), x, 0.06 + i * 0.16, 0), i % 2 ? INK : YEL));
  }
  // header: dark frame, white panels front and back, checker bands, accent end caps
  p.push(paint(place(box(20.2, 1.9, 0.7), 0, 7.35, 0), DARK));
  for (const z of [-0.37, 0.37]) {
    p.push(paint(place(box(19.4, 1.1, 0.04), 0, 7.35, z), WHITE));
    for (let i = 0; i < 48; i++) for (const [y, o] of [[8.12, 0], [6.58, 1]] as const) p.push(paint(place(box(0.4, 0.3, 0.05), -9.4 + i * 0.4, y, z * 1.03), (i + o) % 2 ? INK : WHITE));
    p.push(paint(place(sparkleGeometry(0.62, 0.06, 7), 0, 7.35, z * 1.06, 0, z > 0 ? 0 : Math.PI, 0), accent));
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) p.push(paint(place(box(0.5, 0.18, 0.05), sx * (2.4 + k * 0.75), 7.35, z * 1.04, 0, 0, sx * 0.6), accent), paint(place(box(0.5, 0.18, 0.05), sx * (2.4 + k * 0.75), 7.05, z * 1.04, 0, 0, -sx * 0.6), accent));
  }
  for (const x of [-10.1, 10.1]) p.push(paint(place(rbox(0.5, 2.1, 0.9, 0.08, 1), x, 7.35, 0), accent));
  // start lamps on the grid side (−Z faces the karts on the grid)
  for (let i = 0; i < 5; i++) {
    const x = -2.4 + i * 1.2;
    p.push(paint(place(rbox(0.9, 0.62, 0.5, 0.08, 1), x, 6.05, -0.25), INK));
    for (const dx of [-0.2, 0.2]) p.push(paint(place(cyl(0.15, 0.15, 0.06, 10), x + dx, 6.05, -0.52, Math.PI / 2, 0, 0), '#e5484d'));
  }
  return merge(p);
}
