// Frostbyte Glacier — a penguin village in a snow globe, crystal caves and a night ski resort: packed-snow road with
// ice-blue paint, snow shoulders and banks, pale rock walls, glossy ice. The kit look is the soft overcast of Snowglobe
// Halfpipe; Aurora Summit sets `sky=aurora time=22 headlights=on` in its THEME line and the aurora/stars below kick in.
import type { ContentTables } from '@cr/content';
import { MaterialLibrary } from '../../materials/library.ts';
import { makeKit, type ThemeKit, type ThemeLook } from '../kit.ts';
import { FROSTBYTE_PROPS } from './props.ts';

export const FROSTBYTE_LOOK: Partial<ThemeLook> = {
  road: { style: 'asphalt', a: '#6f7d8c', b: '#8391a0', line: '#bee9f7' },
  shoulder: { a: '#e6eff6', b: '#f4f9fc' },
  terrain: { a: '#f2f7fb', b: '#dfeaf3', rock: '#8e9aa8' },
  wall: { kind: 'stone', a: '#dfe8f0', b: '#a9b8c6' },
  kerb: ['#2f6fa6', '#f7fbff'],
  sky: { turbidity: 6, rayleigh: 0.9, elevationDeg: 28, azimuthDeg: 200, exposure: 0.95 },
  sun: { color: '#eef6ff', intensity: 1.9 },
  hemi: { sky: '#e4f2ff', ground: '#c9d9e6', intensity: 1.45 },
  fogColor: '#dff2fb',
  hour: 13,
  clouds: 0.75,
  // stars/moon/aurora are left to the sky kind, so only Aurora Summit's `sky=aurora` night gets them
  ambient: 'snow',
  shadowStrength: 0.55,
  rimBoost: 1.3,
  grade: { tint: '#eef7ff', saturation: 1.05, highlights: '#f4fbff' },
  water: { level: -0.5, shallow: '#bfeaf5', deep: '#2f6fa6', foam: '#ffffff' },
};

export default (c: ContentTables): ThemeKit => {
  const kit = makeKit(c.themes.get('frostbyte_glacier'), FROSTBYTE_LOOK, FROSTBYTE_PROPS);
  const base = kit.materials;
  kit.materials = () => ({
    ...base(),
    'road:ice': MaterialLibrary.road({ style: 'ice', a: '#9fd8ee', b: '#c6ecf8', line: '#f7fbff', tint: [0.95, 1.05, 1.15] }),
    'road:snow': MaterialLibrary.road({ style: 'sand', a: '#e8f0f6', b: '#f7fbff', line: '#bee9f7', tint: [1.6, 1.65, 1.7] }),
    'shoulder:snow': MaterialLibrary.road({ style: 'sand', a: '#e6eff6', b: '#f7fbff', line: '#bee9f7', tint: [1.6, 1.65, 1.7], shoulder: true }),
    'wall:rock': MaterialLibrary.wall('rock', '#a9b8c6', '#7d8a98', 0.85),
    'wall:building': MaterialLibrary.wall('building', '#8a6a52', '#f7fbff', 0.9),
    'wall:parapet': MaterialLibrary.wall('parapet', '#f2f7fb', '#bee9f7', 0.95),
    'wall:fence': MaterialLibrary.wall('fence', '#f7fbff', '#2f6fa6', 1),
    underside: MaterialLibrary.world({ color: '#9aa8b6', color2: '#7f8d9b', roughness: 0.9, noiseScale: 0.3, vertexAO: true }),
  });
  return kit;
};
