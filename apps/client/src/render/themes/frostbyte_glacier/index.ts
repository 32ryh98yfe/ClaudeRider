// Frostbyte Glacier — a penguin village in a snow globe, crystal caves and a night ski resort: packed-snow road with
// ice-blue paint, snow shoulders and banks, pale rock walls, glossy ice. The kit look is the soft overcast of Snowglobe
// Halfpipe; Aurora Summit sets `sky=aurora time=22 headlights=on` in its THEME line and the aurora/stars below kick in.
import type { ContentTables } from '@cr/content';
import { MaterialLibrary } from '../../materials/library.ts';
import { makeKit, type ThemeKit, type ThemeLook } from '../kit.ts';
import { FROSTBYTE_PROPS } from './props.ts';

export const FROSTBYTE_LOOK: Partial<ThemeLook> = {
  // snow is near-white, so the light rig runs lower than the other kits to keep the road and props readable
  road: { style: 'asphalt', a: '#56616f', b: '#667282', line: '#bee9f7' },
  shoulder: { a: '#d9e4ed', b: '#e7eef4' },
  terrain: { a: '#e4ecf3', b: '#d2dee9', rock: '#7f8b99' },
  wall: { kind: 'stone', a: '#d2dde7', b: '#97a7b6' },
  kerb: ['#2f6fa6', '#f7fbff'],
  sky: { turbidity: 6, rayleigh: 0.9, elevationDeg: 28, azimuthDeg: 200, exposure: 0.85 },
  sun: { color: '#eef6ff', intensity: 1.6 },
  hemi: { sky: '#dcecff', ground: '#b9cad8', intensity: 1.05 },
  fogColor: '#d3e6f2',
  exposure: 0.85,
  bloom: 0.25,
  hour: 13,
  clouds: 0.75,
  // stars/moon/aurora are left to the sky kind, so only Aurora Summit's `sky=aurora` night gets them
  ambient: 'snow',
  shadowStrength: 0.55,
  rimBoost: 1.3,
  grade: { tint: '#eef7ff', saturation: 1.05, highlights: '#f4fbff' },
  // no global water plane: the frozen lake and the rink are ice road surfaces
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
