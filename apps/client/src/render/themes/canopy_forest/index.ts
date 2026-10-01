// Canopy Forest — a morning rainforest of giant trunks and karst pillars: packed-earth trails, mossy stone walls,
// deep leaf greens, glossy toy mushrooms and a soft green-gold mist (art bible §3.2: leaf, moss, bark, mushroom, mist).
import type { ContentTables } from '@cr/content';
import { MaterialLibrary } from '../../materials/library.ts';
import { makeKit, type ThemeKit, type ThemeLook } from '../kit.ts';
import { CANOPY_PROPS } from './props.ts';
import { CANOPY_DRESSING } from './dressing.ts';

// Stylized arcade read (2026-10 pass, docs/design/34-stylized-pass.md): a clear morning gradient sky with a green-gold
// horizon instead of the Preetham haze, a key sun that out-weighs the fill so the trunk shadows read, a warm sandy trail
// (the karts and the next corner pop against it), mid-value greens instead of near-black foliage, and the mist pushed
// back (the content fog started at 45 m and greyed the whole frame) so the forest layers read as depth, not murk.
export const CANOPY_LOOK: Partial<ThemeLook> = {
  road: { style: 'dirt', a: '#a27a52', b: '#b28a60', line: '#f1e6c8' },
  shoulder: { a: '#55863a', b: '#649545' },
  terrain: { a: '#4c8538', b: '#679c47', rock: '#8c8778' },
  wall: { kind: 'stone', a: '#a19d8a', b: '#7d8a5e' },
  kerb: ['#c9512f', '#f4ecd6'],
  sky: { turbidity: 3.0, rayleigh: 1.5, elevationDeg: 30, azimuthDeg: 120, exposure: 1.0, top: '#4f95d6', bottom: '#a9d2e2' },
  sun: { color: '#ffecc4', intensity: 3.0 },
  // cool sky over a warm leaf-litter ground (≈ 2.5 : 1 against the sun) and a shadowless back fill so the chase camera,
  // which looks into the low morning sun on both tracks' grids, still sees the mascots in their own colours
  hemi: { sky: '#d3e6ff', ground: '#7a6448', intensity: 1.4 },
  fill: { color: '#ffe6cc', intensity: 0.45 },
  shadowStrength: 0.62,
  fogColor: '#c7e2d6',
  horizon: '#cfe8dc',
  fog: { near: 140, far: 950 },
  skyStyle: 'gradient',
  hour: 8.5,
  clouds: 0.3,
  envIntensity: 0.4,
  rimBoost: 0.45,
  bloom: 0.25,
  wind: 0.9,
  grade: { tint: '#ffffff', saturation: 1.06, shadows: '#eef6f0', highlights: '#fffaf0' },
};

export default (c: ContentTables): ThemeKit => {
  const kit = makeKit(c.themes.get('canopy_forest'), CANOPY_LOOK, { ...CANOPY_DRESSING, ...CANOPY_PROPS });
  const base = kit.materials;
  // theme-tinted variants of the per-surface / per-wall-type slots the .vis bakes (TrackView resolves `family:variant`);
  // the tint argument divides out the per-surface vertex tint trackc bakes (TrackView SURFACE_TINT / WALL_TINT)
  kit.materials = () => ({
    ...base(),
    // leaf-litter shoulders a shade darker and greener than the trail, so the road edge reads at speed
    'shoulder:dirt': MaterialLibrary.road({ style: 'dirt', a: '#7a6142', b: '#86704a', line: '#f1e6c8', tint: [1.25, 1.0, 0.75], shoulder: true }),
    'road:wood': MaterialLibrary.road({ style: 'wood', a: '#9a6a3c', b: '#b07c48', line: '#f1e6c8', tint: [1.3, 1.0, 0.7] }),
    // mossy stone blocks: rhythm from the courses, moss-green mortar tone, no extra noise
    'wall:rock': MaterialLibrary.wall('stone', '#a6a291', '#7f8c60', 0.8),
    'wall:fence': MaterialLibrary.wall('ranch', '#efe2c4', '#6b4a33', 1),
    underside: MaterialLibrary.world({ color: '#6f5a40', color2: '#5e4c36', roughness: 0.95, vertexAO: true }),
  });
  return kit;
};
