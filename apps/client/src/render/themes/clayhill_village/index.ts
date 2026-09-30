// Clayhill Village — Claude's terracotta hill town: warm cobbles and stone parapets, cream plaster, sage meadows,
// clay roofs, bunting and a bell tower. The kit look is the late-morning meadow light; tracks pick their time of day
// in their THEME line (Meadow Loop 10:00, Belltower Piazza golden hour 17:30).
import type { ContentTables } from '@cr/content';
import { MaterialLibrary } from '../../materials/library.ts';
import { makeKit, type ThemeKit, type ThemeLook } from '../kit.ts';
import { CLAYHILL_PROPS } from './props.ts';

export const CLAYHILL_LOOK: Partial<ThemeLook> = {
  road: { style: 'asphalt', a: '#55565e', b: '#686971', line: '#fbf3df' },
  shoulder: { a: '#79ad4f', b: '#98c463' },
  terrain: { a: '#86b85a', b: '#a9cf72', rock: '#b59a7a' },
  wall: { kind: 'stone', a: '#e6d6b8', b: '#c9ab84' },
  kerb: ['#d97757', '#faf9f5'],
  sky: { turbidity: 2.6, rayleigh: 1.3, elevationDeg: 48, azimuthDeg: 135, exposure: 1.05 },
  sun: { color: '#fff0d8', intensity: 2.8 },
  hemi: { sky: '#d6ebff', ground: '#96b86b', intensity: 1.15 },
  fogColor: '#d8ecf6',
  hour: 10.5,
  clouds: 0.2,
  wind: 0.8,
  grade: { tint: '#fff1e6', saturation: 1.12 },
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
    'wall:fence': MaterialLibrary.wall('fence', '#b08658', '#d2ab7c', 1),
    'wall:planter': MaterialLibrary.wall('planter', '#c9a57f', '#7aa452', 0.85),
    underside: MaterialLibrary.world({ color: '#b9a387', color2: '#a38e73', roughness: 0.92, noiseScale: 0.3, vertexAO: true }),
  });
  return kit;
};
