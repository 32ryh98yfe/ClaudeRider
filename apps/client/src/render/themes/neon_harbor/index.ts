// Neon Harbor — a harbour city of neon arcades, shop fronts and container cranes. Two moods from one kit, picked by
// the track's THEME sky (registry passes it as `env`): Rainline Boulevard runs it as a rain-wet night, Skyway
// Interchange at dusk.
// Stylized pass (2026-10, 34-stylized-pass): readability comes from light that means something, not a brighter sky.
// The night keeps its dark violet sky and rain, but the road and the karts get a cool sky fill and a warm sodium
// back fill, the barriers carry a cyan LED strip under a magenta cap (road edge = magenta, guidance = cyan, street
// light = warm), kerbs are magenta/white, the sidewalks are slab paving with puddles, and only real lamps and neon
// tubes bloom. The old grade multiplied the shadows by a near-black violet, which crushed everything below
// mid-grey to black; both moods now use a light split-tone.
import type { ContentTables } from '@cr/content';
import { MaterialLibrary } from '../../materials/library.ts';
import { makeKit, type ThemeKit, type ThemeLook } from '../kit.ts';
import { NEON_PROPS } from './props.ts';
import { ledBarrier, paving, shopWall } from './surfaces.ts';

/** Rainy night (Rainline Boulevard). The `night` sky kind supplies its own moon key; these set fill, sky and grade. */
export const NEON_NIGHT_LOOK: Partial<ThemeLook> = {
  road: { style: 'asphalt', a: '#434652', b: '#4d5160', line: '#8ff4ff', wet: true },
  shoulder: { a: '#454956', b: '#4f5361' },
  terrain: { a: '#4a4e5a', b: '#545866', rock: '#3a3d47' },
  wall: { kind: 'barrier', a: '#a3a7b2', b: '#d83a8e' },
  kerb: ['#ff3ea5', '#efeaf4'],
  sky: { turbidity: 4, rayleigh: 2.2, elevationDeg: 24, azimuthDeg: 250, exposure: 1, top: '#0a0b24', bottom: '#2a1f48' },
  horizon: '#5b3d7c',
  sun: { color: '#b8c8ff', intensity: 1 },
  // cool sky fill from above, warm sodium bounce from the street, and a sodium back fill so the karts' shaded side
  // keeps its colour against the moon
  hemi: { sky: '#8290ff', ground: '#ffae7c', intensity: 2.4 },
  fill: { color: '#ffc890', intensity: 0.8 },
  fogColor: '#2b2244',
  stars: 0.25,
  ambient: 'rain',
  wet: 0.65,
  bloom: 0.45,
  rimBoost: 1.7,
  envIntensity: 0.6,
  headlights: true,
  shadowStrength: 0.55,
  grade: { tint: '#f8f5ff', saturation: 1.08, shadows: '#e2e4ff', highlights: '#fff2f6' },
};

/** Dusk (Skyway Interchange): low warm sun over the harbour, violet zenith, city lights already on. */
export const NEON_DUSK_LOOK: Partial<ThemeLook> = {
  skyKind: 'sunset',
  road: { style: 'asphalt', a: '#55575f', b: '#60636b', line: '#f4f6ff' },
  shoulder: { a: '#6d6f77', b: '#777982' },
  terrain: { a: '#74767e', b: '#7e8089', rock: '#5c5e66' },
  wall: { kind: 'barrier', a: '#b9bcc6', b: '#d83a8e' },
  kerb: ['#ff3ea5', '#f1eef6'],
  sky: { turbidity: 4, rayleigh: 2.2, elevationDeg: 7, azimuthDeg: 250, exposure: 1, top: '#273070', bottom: '#5a3d62' },
  horizon: '#ff9c6c',
  skyStyle: 'gradient',
  clouds: 0.2,
  sun: { color: '#ffb27c', intensity: 2.7 },
  hemi: { sky: '#9ea8ff', ground: '#ff9f7c', intensity: 1.25 },
  fill: { color: '#a6b6ff', intensity: 0.45 },
  fogColor: '#b98a92',
  bloom: 0.3,
  rimBoost: 1.15,
  envIntensity: 0.5,
  headlights: true,
  shadowStrength: 0.6,
  grade: { tint: '#ffffff', saturation: 1.06, shadows: '#ece9ff', highlights: '#fff3e8' },
};

/** The theme's default mood (menus and previews without a track THEME line). */
export const NEON_LOOK = NEON_NIGHT_LOOK;

export default (c: ContentTables, env?: Readonly<Record<string, string>>): ThemeKit => {
  const dusk = env?.['sky'] === 'sunset' || env?.['sky'] === 'goldenHour' || env?.['sky'] === 'day';
  const kit = makeKit(c.themes.get('neon_harbor'), dusk ? NEON_DUSK_LOOK : NEON_NIGHT_LOOK, NEON_PROPS);
  const base = kit.materials;
  const mood = dusk ? 'dusk' : 'night';
  const barrier = { body: dusk ? '#b3b6c0' : '#a3a7b2', base: dusk ? '#6a6d77' : '#575a65', cap: '#d83a8e', strip: '#5fe8ff', gain: dusk ? 0.7 : 0.95 };
  kit.materials = () => ({
    ...base(),
    // barriers: concrete with a magenta cap and a segmented cyan LED strip (the road edge reads at night)
    wall: ledBarrier(`neon-${mood}`, barrier),
    'wall:parapet': ledBarrier(`neon-${mood}-parapet`, { ...barrier, body: dusk ? '#c2bdb6' : '#a8a39c', tint: 0.95 }),
    'wall:building': shopWall(`neon-${mood}`, { body: '#3e3648', trim: '#7a6a82', glass: '#ffcf8a', gain: 0.7, tint: 0.9 }),
    // sidewalks and plazas: slab paving (wet at night), plain retaining walls on the ramp embankments
    terrain: paving(`neon-${mood}`, dusk
      ? { a: '#7a7c84', b: '#858790', joint: '#55575f', size: 1.6, wall: '#6a6c74' }
      : { a: '#4a4e5a', b: '#545866', joint: '#2c2e36', size: 1.6, wall: '#4c4f59', wet: 0.85 }),
    'road:cobble': MaterialLibrary.road({ style: 'cobble', a: '#4a4450', b: '#5a5260', line: '#ffb347', wet: !dusk }),
    // skyway decks and ramps: dark concrete undersides with a cool tint instead of the default warm grey
    underside: MaterialLibrary.world({ color: '#5a5e6c', color2: '#4b4f5b', roughness: 0.88, noiseScale: 0.3, vertexAO: true }),
  });
  return kit;
};
