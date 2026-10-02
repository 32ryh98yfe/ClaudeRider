// Coral Cove — a tropical harbour at bright noon: sun-warmed sandstone cobbles, turquoise-and-white kerbs, lifebuoy
// barriers, sandy berms running down into a turquoise sea, palms, a moored galleon, a striped lighthouse and a cute kraken.
// The sea is a prop (`sea`, one per track). The kit factory sees the track's THEME line, so Kraken Lighthouse
// (sky=sunset) gets the late-afternoon look while Coral Cove Docks keeps the noon one.
import type { ContentTables } from '@cr/content';
import { makeKit, type ThemeKit, type ThemeLook } from '../kit.ts';
import { CORAL_PROPS } from './props.ts';
import { CORAL_DRESSING } from './dressing.ts';

// Stylized arcade read (2026-10 pass, docs/design/34-stylized-pass.md): a clear blue gradient sky instead of the hazy
// Preetham dome, a sun that out-weighs the sky fill so shadows read on the sand, a warm sand-bounce ground fill, a
// shadowless back fill for the chase camera, weak rims and day-time bloom. Cobbles stay sandstone (the theme's
// identity) but a step darker and cooler, so the karts and the white lane paint read against them.
export const CORAL_LOOK: Partial<ThemeLook> = {
  road: { style: 'cobble', a: '#7a7066', b: '#8d8377', line: '#fbf6ea' },
  shoulder: { a: '#e3cc96', b: '#efdcae' },
  terrain: { a: '#ead7a4', b: '#a9c96f', rock: '#b99e7c' },
  wall: { kind: 'panel', a: '#fafafa', b: '#d94f4f' },
  kerb: ['#1fb5c9', '#fafafa'],
  sky: { turbidity: 2.0, rayleigh: 1.1, elevationDeg: 58, azimuthDeg: 160, exposure: 1.0, top: '#2f8ee0', bottom: '#9fd9ef' },
  sun: { color: '#fff3de', intensity: 3.0 },
  hemi: { sky: '#cdeefa', ground: '#bfa77e', intensity: 1.4 },
  fill: { color: '#ffe8d2', intensity: 0.45 },
  shadowStrength: 0.6,
  fogColor: '#bfe7f2',
  horizon: '#c6edf5',
  skyStyle: 'gradient',
  clouds: 0.32,
  envIntensity: 0.45,
  rimBoost: 0.45,
  bloom: 0.25,
  wind: 1.0,
  grade: { tint: '#ffffff', saturation: 1.05, shadows: '#eef6ff', highlights: '#fffaf2' },
};

/** Late-afternoon variant for kraken_lighthouse (THEME sky=sunset): warm low key, cool back fill, lamps on. */
export const CORAL_SUNSET_LOOK: Partial<ThemeLook> = {
  ...CORAL_LOOK,
  // the gradient dome mixes the horizon colour up to ~33° (most of what the chase camera sees of the sky), so the band
  // stays a pale peach and the sunset warmth lives in the key light; a saturated #ffcaa0 band tinted the whole frame.
  // Final pass: the dome bottom, fog and highlight grade are near-neutral (#f0d4c4 / #d9d5dc / #fff8f2): the peach fog
  // and a warm highlight split-tone together gave the whole frame an orange cast. The warmth is the sun (#ffc28c).
  sky: { turbidity: 5.5, rayleigh: 2.4, elevationDeg: 8, azimuthDeg: 255, exposure: 1.0, top: '#34488f', bottom: '#f0d4c4' },
  horizon: '#f7dcc8',
  sun: { color: '#ffc28c', intensity: 2.9 },
  // the low sun lights mostly the sides of things: a near-neutral sky fill and a soft cool back fill keep the shaded
  // sides of the karts in their own colours (review round: the lilac #d6cdf2 fill turned the asphalt purple, #5b5068;
  // the warmth stays in the sun, the horizon stays pale)
  hemi: { sky: '#d9d4dc', ground: '#a8826a', intensity: 1.25 },
  fill: { color: '#d0d8ee', intensity: 0.35 },
  fogColor: '#d9d5dc',
  shadowStrength: 0.55,
  clouds: 0.28,
  rimBoost: 0.9,
  bloom: 0.3,
  grade: { tint: '#ffffff', saturation: 1.04, shadows: '#eef0ff', highlights: '#fff8f2' },
};

export default (c: ContentTables, env?: Readonly<Record<string, string>>): ThemeKit =>
  makeKit(c.themes.get('coral_cove'), env?.['sky'] === 'sunset' ? CORAL_SUNSET_LOOK : CORAL_LOOK, { ...CORAL_PROPS, ...CORAL_DRESSING });
