// Default prop factories (vertex-coloured, merged, instanced). ThemeKits override kinds with their own looks.
import * as THREE from 'three/webgpu';
import { MaterialLibrary } from '../materials/library.ts';
import { merge, paint, place, rbox, box, cyl, cone, ico, sph } from '../util/geo.ts';

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
  gantry: {
    build: (pal) => ({
      geometry: merge([
        paint(place(rbox(0.8, 6.5, 0.8, 0.2, 2), -9, 3.25, 0), '#2b2d33'), paint(place(rbox(0.8, 6.5, 0.8, 0.2, 2), 9, 3.25, 0), '#2b2d33'),
        paint(place(rbox(19, 1.4, 0.9, 0.3, 2), 0, 6.6, 0), pal[0] ?? '#d97757'),
        paint(place(box(12, 0.8, 0.95), 0, 6.6, 0), '#faf9f5'),
      ]), material: lit(), castShadow: true,
    }),
  },
  rock: { build: () => ({ geometry: merge([paint(place(ico(1.2, 0), 0, 0.5, 0, 0.3, 0.5, 0.2, 1.4, 0.8, 1.1), '#8b8680', 0.1, 17)]), material: lit() }) },
};

/** Visible placeholder for unknown prop kinds (never crash). */
export const PLACEHOLDER_PROP: PropFactory = { build: () => ({ geometry: paint(place(box(1, 1, 1), 0, 0.5, 0), '#ff00ff'), material: lit() }) };
