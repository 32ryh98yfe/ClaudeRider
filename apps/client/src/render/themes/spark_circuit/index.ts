// Spark Circuit — a pro racing league: neutral tarmac, red/white kerbs, lush infield grass, ivory-and-red safety
// barriers, grandstands full of crowd cards, pit garages and original sponsor-free banners. The day look serves
// Proving Ring and Spark Grand Circuit; Sunset Arena Rally (THEME sky=sunset) gets the sunset look (L12-track-env:
// the kit factory sees the track's THEME attributes).
import type { ContentTables } from '@cr/content';
import { MaterialLibrary } from '../../materials/library.ts';
import { makeKit, type ThemeKit, type ThemeLook } from '../kit.ts';
import { SPARK_PROPS } from './props.ts';

// Stylized arcade read (2026-10 pass, docs/design/34-stylized-pass.md): the Meadow Loop day recipe on a racing
// venue — a clear blue gradient sky instead of the peach Preetham haze, a key sun clearly over the fill, neutral grey
// tarmac (the old blue-black read as a hole and hid the kart shadows), natural greens, signal-red/white kerbs and
// barriers in the shared trackside palette.
export const SPARK_LOOK: Partial<ThemeLook> = {
  road: { style: 'asphalt', a: '#5a595b', b: '#676668', line: '#fbf8f0' },
  shoulder: { a: '#4f8a3b', b: '#5d9441' },
  terrain: { a: '#5a8f40', b: '#78a654', rock: '#a39d90' },
  wall: { kind: 'panel', a: '#f4f1ea', b: '#d8423a' },
  kerb: ['#d9453c', '#f6f4ef'],
  sky: { turbidity: 2.6, rayleigh: 1.3, elevationDeg: 50, azimuthDeg: 235, exposure: 1.0, top: '#4f97e0', bottom: '#9fc6e8' },
  sun: { color: '#fff0da', intensity: 3.1 },
  hemi: { sky: '#cfe0ff', ground: '#86695a', intensity: 1.45 },
  fill: { color: '#ffe6d2', intensity: 0.45 },
  shadowStrength: 0.62,
  fogColor: '#b3d0ea',
  horizon: '#bcd8f0',
  fog: { near: 250, far: 1500 },
  skyStyle: 'gradient',
  clouds: 0.35,
  envIntensity: 0.42,
  rimBoost: 0.4,
  bloom: 0.25,
  wind: 0.8,
  grade: { tint: '#ffffff', saturation: 1.06, shadows: '#eef3ff', highlights: '#fffaf2' },
};

/**
 * Sunset look for Sunset Arena Rally: keeps the low orange sun and the violet-to-amber sky, but fixes the readability —
 * a warm key that still out-weighs the fill, a cool shadowless back fill (the chase camera faces the setting sun on the
 * bowl straight), shadows that never go navy, mid rims, and bloom held for the floodlights.
 */
export const SPARK_SUNSET_LOOK: Partial<ThemeLook> = {
  ...SPARK_LOOK,
  terrain: { a: '#5b8a3e', b: '#76a050', rock: '#a0907f' },
  sky: { turbidity: 5.0, rayleigh: 2.2, elevationDeg: 8, azimuthDeg: 250, exposure: 1.0, top: '#4a4f8f', bottom: '#f3a36a' },
  sun: { color: '#ffb67c', intensity: 2.9 },
  hemi: { sky: '#d9c6e6', ground: '#7a5844', intensity: 1.35 },
  fill: { color: '#c9d6ff', intensity: 0.5 },
  shadowStrength: 0.6,
  fogColor: '#e9b48e',
  horizon: '#ffc48e',
  fog: { near: 220, far: 1300 },
  clouds: 0.3,
  envIntensity: 0.45,
  rimBoost: 0.8,
  bloom: 0.35,
  grade: { tint: '#ffffff', saturation: 1.05, shadows: '#eeeefc', highlights: '#fff3e4' },
};

export default (c: ContentTables, env?: Readonly<Record<string, string>>): ThemeKit => {
  const sunset = env?.['sky'] === 'sunset';
  const kit = makeKit(c.themes.get('spark_circuit'), sunset ? SPARK_SUNSET_LOOK : SPARK_LOOK, SPARK_PROPS);
  const base = kit.materials;
  // theme-tinted variants of the per-surface slots the .vis bakes; the tint divides out trackc's per-surface tint
  kit.materials = () => ({
    ...base(),
    // run-off gravel and the rally stage in warm, clean beige so the asphalt edge and kerbs read against it
    'shoulder:gravel': MaterialLibrary.road({ style: 'gravel', a: '#b6a68c', b: '#c8b99e', line: '#fbf8f0', tint: [1.2, 1.15, 1.08], shoulder: true }),
    'road:gravel': MaterialLibrary.road({ style: 'gravel', a: '#a8977c', b: '#baa98d', line: '#fbf8f0', tint: [1.2, 1.15, 1.08] }),
    'road:dirt': MaterialLibrary.road({ style: 'dirt', a: '#9c7552', b: '#ab8460', line: '#fbf8f0', tint: [1.25, 1.0, 0.75] }),
    'wall:fence': MaterialLibrary.wall('ranch', '#f6f3ec', '#5b4a3a', 1),
  });
  return kit;
};
