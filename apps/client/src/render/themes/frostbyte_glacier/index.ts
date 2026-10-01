// Frostbyte Glacier — a penguin village in a snow globe, crystal caves and a night ski resort: packed-snow road with
// ice-blue paint, snow shoulders and banks, pale rock walls, glossy ice. The kit look is the bright overcast of Snowglobe
// Halfpipe; Aurora Summit sets `sky=aurora time=22 headlights=on` in its THEME line, and the factory (which receives
// those THEME attributes) switches to the night rig below.
import type { ContentTables } from '@cr/content';
import { MaterialLibrary } from '../../materials/library.ts';
import { makeKit, type ThemeKit, type ThemeLook } from '../kit.ts';
import { FROSTBYTE_PROPS } from './props.ts';

// Stylized arcade read (2026-10 pass, docs/design/34-stylized-pass.md): snow is matte white-blue around #e8eef5 (never
// clipped to white under ACES), the road is a cool neutral grey so karts and the next corner read first, kerbs are red
// and white against the snow, barriers are white panels with a navy band, and only ice is glossy.
export const FROSTBYTE_LOOK: Partial<ThemeLook> = {
  road: { style: 'asphalt', a: '#5b6068', b: '#686d75', line: '#cdeefa' },
  shoulder: { a: '#dde6ef', b: '#e6edf4' },
  terrain: { a: '#e3eaf2', b: '#d5dfe9', rock: '#7f8b99' },
  wall: { kind: 'stone', a: '#d2dde7', b: '#97a7b6' },
  kerb: ['#d9453c', '#f1f4f7'],
  sky: { turbidity: 6, rayleigh: 0.9, elevationDeg: 28, azimuthDeg: 200, exposure: 0.85, top: '#9db7d2', bottom: '#cdd9e5' },
  sun: { color: '#eef6ff', intensity: 1.6 },
  hemi: { sky: '#e4eefa', ground: '#b4c0cd', intensity: 0.8 },
  // a warm, shadowless back fill: the shaded side of karts and mascots keeps its colour against the white snow
  fill: { color: '#fff1e2', intensity: 0.5 },
  fogColor: '#dbe5ee',
  horizon: '#e2eaf1',
  skyStyle: 'gradient',
  exposure: 0.82,
  bloom: 0.25,
  hour: 13,
  clouds: 0.75,
  envIntensity: 0.45,
  // stars/moon/aurora are left to the sky kind, so only Aurora Summit's `sky=aurora` night gets them
  ambient: 'snow',
  shadowStrength: 0.68,
  rimBoost: 0.6,
  grade: { tint: '#ffffff', saturation: 1.06, shadows: '#eef3ff', highlights: '#fbfdff' },
  // no global water plane: the frozen lake and the rink are ice road surfaces
};

/** Aurora Summit (22:00): moonlit snow, a cool back fill and strong rims so karts read; never turned into daytime. */
const NIGHT_LOOK: Partial<ThemeLook> = {
  road: { style: 'asphalt', a: '#4d535d', b: '#59606a', line: '#bee9f7' },
  hemi: { sky: '#90aee0', ground: '#3c4862', intensity: 1.55 },
  fill: { color: '#a9c6ff', intensity: 0.6 },
  fogColor: '#1c3552',
  exposure: 1.0,
  bloom: 0.3,
  envIntensity: 0.35,
  shadowStrength: 0.7,
  rimBoost: 1.7,
  grade: { tint: '#f4f7ff', saturation: 1.05, shadows: '#dfe6ff', highlights: '#f6faff' },
};

export default (c: ContentTables, env: Readonly<Record<string, string>> = {}): ThemeKit => {
  const night = env['sky'] === 'aurora' || env['sky'] === 'night';
  const kit = makeKit(c.themes.get('frostbyte_glacier'), night ? { ...FROSTBYTE_LOOK, ...NIGHT_LOOK } : FROSTBYTE_LOOK, FROSTBYTE_PROPS);
  const base = kit.materials;
  kit.materials = () => ({
    ...base(),
    'road:ice': MaterialLibrary.road({ style: 'ice', a: '#9fd3ea', b: '#c0e6f5', line: '#f1f6fa', tint: [1.2, 1.4, 1.6] }),
    'road:snow': MaterialLibrary.road({ style: 'snow', a: '#dfe7ef', b: '#e8eef5', line: '#bee9f7', tint: [1.7, 1.75, 1.8] }),
    'shoulder:snow': MaterialLibrary.road({ style: 'snow', a: '#dce5ee', b: '#e6edf4', line: '#bee9f7', tint: [1.7, 1.75, 1.8], shoulder: true }),
    // resort safety barrier: white panels, navy top band (the default glacier wall kind is stone)
    'wall:barrier': MaterialLibrary.wall('barrier', '#e9eef3', '#2f5f96', 1),
    'wall:rock': MaterialLibrary.wall('rock', '#a3b1bf', '#7b8796', 0.85),
    'wall:building': MaterialLibrary.wall('building', '#8a6a52', '#e8eef5', 0.9),
    'wall:parapet': MaterialLibrary.wall('parapet', '#e6edf3', '#b4dbef', 0.95),
    'wall:fence': MaterialLibrary.wall('fence', '#e8eef5', '#2f6fa6', 1),
    underside: MaterialLibrary.world({ color: '#9aa8b6', color2: '#7f8d9b', roughness: 0.9, noiseScale: 0.3, vertexAO: true }),
  });
  return kit;
};
