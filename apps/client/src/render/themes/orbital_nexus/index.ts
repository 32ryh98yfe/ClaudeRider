// Orbital Nexus — a clean orbital token factory and the station city around it, under a starfield with a ringed
// planet. Metal decks with cyan lane light and orange kerbs, white hull walls with an orange stripe, a cool key
// light from the sun and a warm planet bounce from below.
import type { ContentTables } from '@cr/content';
import { MaterialLibrary } from '../../materials/library.ts';
import { makeKit, type ThemeKit, type ThemeLook } from '../kit.ts';
import { ORBITAL_PROPS } from './props.ts';

export const ORBITAL_LOOK: Partial<ThemeLook> = {
  road: { style: 'metal', a: '#5a6272', b: '#6a7384', line: '#7de2fc', glow: '#7de2fc' },
  shoulder: { a: '#2a3348', b: '#323c52' },
  terrain: { a: '#1a2238', b: '#222b44', rock: '#131a2c' },
  wall: { kind: 'panel', a: '#eef3f8', b: '#d97757' },
  kerb: ['#d97757', '#eef3f8'],
  sky: { turbidity: 1, rayleigh: 0.3, elevationDeg: 35, azimuthDeg: 120, exposure: 0.9, night: true, top: '#02040d', bottom: '#0b1026' },
  sun: { color: '#f2f6ff', intensity: 2.0 },
  hemi: { sky: '#8fb4ff', ground: '#d97757', intensity: 0.85 },
  fogColor: '#0b1026',
  stars: 1,
  planet: { color: '#d98a5f', ring: '#e8d2b8', dir: [-0.55, 0.35, -0.75], size: 0.32 },
  bloom: 0.5,
  rimBoost: 1.3,
  envIntensity: 0.8,
  shadowStrength: 0.7,
  ambient: 'motes',
  grade: { tint: '#f4f8ff', saturation: 1.08, shadows: '#0e1430' },
};

export default (c: ContentTables): ThemeKit => {
  const kit = makeKit(c.themes.get('orbital_nexus'), ORBITAL_LOOK, ORBITAL_PROPS);
  const base = kit.materials;
  kit.materials = () => ({
    ...base(),
    // floating decks: white hull undersides with a navy panel pattern
    underside: MaterialLibrary.world({ color: '#c9d3de', color2: '#8e9aab', roughness: 0.6, metalness: 0.3, noiseScale: 0.25, vertexAO: true }),
  });
  return kit;
};
