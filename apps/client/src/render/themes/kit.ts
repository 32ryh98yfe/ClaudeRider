// ThemeKit contract + default kit built from ThemeDataDef (content). Theme lanes add render/themes/<id>/index.ts overrides.
import * as THREE from 'three/webgpu';
import type { ThemeDataDef } from '@cr/content';
import { MaterialLibrary, type RoadStyle } from '../materials/library.ts';
import { DEFAULT_PROPS, type PropFactory } from '../props/defaults.ts';

export interface ThemeLook {
  road: { style: RoadStyle; a: string; b: string; line: string };
  shoulder: { a: string; b: string };
  terrain: { a: string; b: string; rock: string };
  wall: { kind: 'panel' | 'stone'; a: string; b: string };
  kerb: [string, string];
  sky: { turbidity: number; rayleigh: number; elevationDeg: number; azimuthDeg: number; exposure: number; night?: boolean; top?: string; bottom?: string };
  sun: { color: string; intensity: number };
  hemi: { sky: string; ground: string; intensity: number };
  fogColor?: string;
}

export interface ThemeKit {
  id: string;
  data: ThemeDataDef;
  look: ThemeLook;
  materials(): Record<string, THREE.Material>;
  props: Record<string, PropFactory>;
  grade: { slope: number; saturation: number };
}

export const DEFAULT_LOOK: ThemeLook = {
  road: { style: 'asphalt', a: '#474a52', b: '#5a5e67', line: '#f4f1e6' },
  shoulder: { a: '#6fa04a', b: '#86b85a' },
  terrain: { a: '#76ad4f', b: '#9cc767', rock: '#9b8f7e' },
  wall: { kind: 'panel', a: '#faf9f5', b: '#d97757' },
  kerb: ['#e84a3c', '#fafafa'],
  sky: { turbidity: 2.2, rayleigh: 1.2, elevationDeg: 38, azimuthDeg: 140, exposure: 1 },
  sun: { color: '#fff4e0', intensity: 2.6 },
  hemi: { sky: '#cfe6ff', ground: '#8fb573', intensity: 1.1 },
};

export function makeKit(data: ThemeDataDef, look: Partial<ThemeLook> = {}, props: Record<string, PropFactory> = {}): ThemeKit {
  const L: ThemeLook = { ...DEFAULT_LOOK, ...look };
  return {
    id: data.id,
    data,
    look: L,
    materials: () => ({
      road: MaterialLibrary.road(L.road),
      kerb: MaterialLibrary.kerb(L.kerb[0], L.kerb[1]),
      shoulder: MaterialLibrary.terrain(L.shoulder.a, L.shoulder.b, L.terrain.rock),
      wall: MaterialLibrary.wall(L.wall.kind, L.wall.a, L.wall.b),
      underside: MaterialLibrary.world({ color: '#8d8a84', color2: '#77736d', roughness: 0.9, vertexAO: true }),
      terrain: MaterialLibrary.terrain(L.terrain.a, L.terrain.b, L.terrain.rock),
      startline: MaterialLibrary.startLine(),
      boostpad: MaterialLibrary.boostPad(),
    }),
    props: { ...DEFAULT_PROPS, ...props },
    grade: { slope: 1.05, saturation: 1.1 },
  };
}
