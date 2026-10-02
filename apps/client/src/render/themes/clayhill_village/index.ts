// Clayhill Village — Claude's terracotta hill town: warm cobbles and stone parapets, cream plaster, sage meadows,
// clay roofs, bunting and a bell tower. The kit look is the late-morning meadow light; tracks pick their time of day
// in their THEME line (Meadow Loop 10:00, Belltower Piazza golden hour 17:30).
import type { ContentTables } from '@cr/content';
import { MaterialLibrary } from '../../materials/library.ts';
import { makeKit, type ThemeKit, type ThemeLook } from '../kit.ts';
import { CLAYHILL_PROPS } from './props.ts';

// Stylized arcade read (2026-10 pass): a clear blue gradient sky instead of the peach Preetham haze, a key sun that
// out-weighs the sky fill so shadows read, neutral asphalt so the karts and the lane paint pop, natural (not lime)
// greens, and red/white kerbs that mark the corners.
export const CLAYHILL_LOOK: Partial<ThemeLook> = {
  road: { style: 'asphalt', a: '#605e5f', b: '#6e6c6c', line: '#fbf7ec' },
  shoulder: { a: '#4f8a3b', b: '#5d9441' },
  terrain: { a: '#5a8f40', b: '#7aa656', rock: '#a8957c' },
  wall: { kind: 'stone', a: '#e6d6b8', b: '#c9ab84' },
  kerb: ['#d9453c', '#f6f4ef'],
  sky: { turbidity: 2.6, rayleigh: 1.3, elevationDeg: 48, azimuthDeg: 135, exposure: 1.0, top: '#4f97e0', bottom: '#9fc6e8' },
  sun: { color: '#fff0da', intensity: 3.1 },
  // cool sky / warm ground fill at ≈ 2.5 : 1 against the sun, plus a shadowless back fill (environment.ts) so the
  // chase camera, which faces the sun on the grid, still sees the mascots' shaded side in their own colour
  hemi: { sky: '#cfe0ff', ground: '#8a6a55', intensity: 1.45 },
  fill: { color: '#ffe6d2', intensity: 0.45 },
  shadowStrength: 0.62,
  fogColor: '#b3d0ea',
  horizon: '#bcd8f0',
  skyStyle: 'gradient',
  hour: 10.5,
  clouds: 0.35,
  envIntensity: 0.42,
  rimBoost: 0.4,
  bloom: 0.25,
  wind: 0.8,
  grade: { tint: '#ffffff', saturation: 1.06, shadows: '#eef3ff', highlights: '#fffaf2' },
};

// Golden hour (Belltower Piazza): the same organised palette under a low warm key. The zenith stays clear blue and
// only the horizon warms, so the frame never turns into the orange haze the old Preetham sky gave. The sun sits
// behind-right of the start straight, so long shadows fall across the road ahead instead of backlighting the grid.
// Also a warmer fill and a little more rim, so the mascots' shaded sides keep their colour.
export const CLAYHILL_GOLDEN: Partial<ThemeLook> = {
  // first cut (peach horizon #f4dabd, sun #ffd9ab, warm fog) turned the whole frame orange: the dome mixes the
  // horizon colour up to ~33° and the chase camera sees little else, so the warmth now lives in a pale band, the
  // key light and the long shadows. The shade fill and shadow grade are near-neutral: a blue-lilac sky term and a
  // blue shadow grade on warm cobbles mixed to mauve (#5e545c) wherever the townhouses shade the street
  sky: { ...CLAYHILL_LOOK.sky!, azimuthDeg: -35, top: '#4f86d6', bottom: '#eadbc8' },
  sun: { color: '#ffe2b8', intensity: 3.0 },
  hemi: { sky: '#d3d8e0', ground: '#8f6e5a', intensity: 1.35 },
  fill: { color: '#ffe2cc', intensity: 0.45 },
  fogColor: '#e4ddd4',
  horizon: '#f1e4d3',
  clouds: 0.3,
  rimBoost: 0.6,
  grade: { tint: '#ffffff', saturation: 1.04, shadows: '#f2f2f0', highlights: '#fff6ea' },
};

export default (c: ContentTables, env?: Readonly<Record<string, string>>): ThemeKit => {
  const golden = env?.['sky'] === 'goldenHour' || env?.['sky'] === 'sunset';
  const kit = makeKit(c.themes.get('clayhill_village'), golden ? { ...CLAYHILL_LOOK, ...CLAYHILL_GOLDEN } : CLAYHILL_LOOK, CLAYHILL_PROPS);
  const base = kit.materials;
  // theme-tinted variants of the per-surface / per-wall-type slots the .vis bakes (TrackView resolves `family:variant`)
  kit.materials = () => ({
    ...base(),
    // warm grey setts rather than pink-brown ones: those read mauve wherever a townhouse shades the street
    'road:cobble': MaterialLibrary.road({ style: 'cobble', a: '#86807a', b: '#928b80', line: '#fbf3df', tint: [1.08, 1.02, 0.95] }),
    'road:gravel': MaterialLibrary.road({ style: 'gravel', a: '#9c8e7a', b: '#b3a58f', line: '#fbf3df', tint: [1.2, 1.15, 1.08] }),
    'wall:parapet': MaterialLibrary.wall('parapet', '#e8d9bd', '#c9a57f', 0.95),
    'wall:building': MaterialLibrary.wall('building', '#f4efe6', '#d97757', 0.9),
    // white post-and-rail fence (see-through): an ordered, light roadside edge for the pastoral tracks
    'wall:fence': MaterialLibrary.wall('ranch', '#f6f3ec', '#5b4a3a', 1),
    'wall:planter': MaterialLibrary.wall('planter', '#c9a57f', '#7aa452', 0.85),
    underside: MaterialLibrary.world({ color: '#b9a387', color2: '#a38e73', roughness: 0.92, noiseScale: 0.3, vertexAO: true }),
  });
  return kit;
};
