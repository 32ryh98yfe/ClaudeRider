// Sunstone Desert — a caravan town and its sandstone canyon under a hot hazy sky: sandstone paving with gold edge
// paint, sand shoulders, adobe walls with teal trim, red-rock canyon walls and a warm bounce light from the sand.
// Tracks set their hour in the THEME line (Sunstone Bazaar 16:00 heat haze, Sandglass Canyon harsh noon).
import type { ContentTables } from '@cr/content';
import { MaterialLibrary } from '../../materials/library.ts';
import { makeKit, type ThemeKit, type ThemeLook } from '../kit.ts';
import { SUNSTONE_PROPS } from './props.ts';

export const SUNSTONE_LOOK: Partial<ThemeLook> = {
  road: { style: 'cobble', a: '#8e7760', b: '#a58a6f', line: '#ffe2a0' },
  shoulder: { a: '#e3c48a', b: '#efd39c' },
  terrain: { a: '#e8c27a', b: '#dcb06a', rock: '#c98b4e' },
  wall: { kind: 'stone', a: '#dcb27c', b: '#c48e57' },
  kerb: ['#c96442', '#f4e3c3'],
  sky: { turbidity: 5.5, rayleigh: 1.5, elevationDeg: 40, azimuthDeg: 235, exposure: 1.0 },
  sun: { color: '#ffe0ae', intensity: 3.0 },
  hemi: { sky: '#fbe6c6', ground: '#e8a060', intensity: 1.15 },
  fogColor: '#f3dcae',
  hour: 16,
  ambient: 'dust',
  grade: { tint: '#ffe9c2', saturation: 1.08 },
  water: { level: -0.4, shallow: '#7fe3d6', deep: '#1fb5c9', foam: '#f6e7c1' },
};

export default (c: ContentTables): ThemeKit => {
  const kit = makeKit(c.themes.get('sunstone_desert'), SUNSTONE_LOOK, SUNSTONE_PROPS);
  const base = kit.materials;
  kit.materials = () => ({
    ...base(),
    'road:stone': MaterialLibrary.road({ style: 'cobble', a: '#9a8166', b: '#b0957a', line: '#ffe2a0', tint: [1.05, 1.03, 1.0] }),
    'road:sand': MaterialLibrary.road({ style: 'sand', a: '#d8b27a', b: '#e6c48e', line: '#ffe2a0', tint: [1.45, 1.3, 0.95] }),
    'shoulder:sand': MaterialLibrary.road({ style: 'sand', a: '#e0bc82', b: '#ecce98', line: '#ffe2a0', tint: [1.45, 1.3, 0.95], shoulder: true }),
    'wall:building': MaterialLibrary.wall('building', '#ecd3a6', '#3fb8af', 0.9),
    'wall:rock': MaterialLibrary.wall('rock', '#c98b4e', '#9c6538', 0.85),
    'wall:parapet': MaterialLibrary.wall('parapet', '#dcb27c', '#b98a55', 0.95),
    underside: MaterialLibrary.world({ color: '#b57c47', color2: '#9c6a3c', roughness: 0.92, noiseScale: 0.3, vertexAO: true }),
  });
  return kit;
};
