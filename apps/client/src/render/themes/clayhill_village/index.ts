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
  shoulder: { a: '#5a9440', b: '#72a850' },
  terrain: { a: '#5f9a42', b: '#82b55a', rock: '#a8957c' },
  wall: { kind: 'stone', a: '#e6d6b8', b: '#c9ab84' },
  kerb: ['#d9453c', '#f6f4ef'],
  sky: { turbidity: 2.6, rayleigh: 1.3, elevationDeg: 48, azimuthDeg: 135, exposure: 1.0, top: '#2f7fd6', bottom: '#a9d3f2' },
  sun: { color: '#fff4e2', intensity: 3.1 },
  hemi: { sky: '#dde6f0', ground: '#93a56f', intensity: 1.05 },
  fogColor: '#c6e2f7',
  horizon: '#cfe8fa',
  skyStyle: 'gradient',
  hour: 10.5,
  clouds: 0.35,
  envIntensity: 0.42,
  rimBoost: 0.4,
  wind: 0.8,
  grade: { tint: '#ffffff', saturation: 1.06, shadows: '#eef3ff', highlights: '#fffaf2' },
};

export default (c: ContentTables): ThemeKit => {
  const kit = makeKit(c.themes.get('clayhill_village'), CLAYHILL_LOOK, CLAYHILL_PROPS);
  const base = kit.materials;
  // theme-tinted variants of the per-surface / per-wall-type slots the .vis bakes (TrackView resolves `family:variant`)
  kit.materials = () => ({
    ...base(),
    'road:cobble': MaterialLibrary.road({ style: 'cobble', a: '#8c7c6c', b: '#a69280', line: '#fbf3df', tint: [1.08, 1.02, 0.95] }),
    'road:gravel': MaterialLibrary.road({ style: 'gravel', a: '#9c8e7a', b: '#b3a58f', line: '#fbf3df', tint: [1.2, 1.15, 1.08] }),
    'wall:parapet': MaterialLibrary.wall('parapet', '#e8d9bd', '#c9a57f', 0.95),
    'wall:building': MaterialLibrary.wall('building', '#f4efe6', '#d97757', 0.9),
    // white post-and-rail fence (see-through): an ordered, light roadside edge for the pastoral tracks
    'wall:fence': MaterialLibrary.wall('ranch', '#f3efe6', '#8f8270', 1),
    'wall:planter': MaterialLibrary.wall('planter', '#c9a57f', '#7aa452', 0.85),
    underside: MaterialLibrary.world({ color: '#b9a387', color2: '#a38e73', roughness: 0.92, noiseScale: 0.3, vertexAO: true }),
  });
  return kit;
};
