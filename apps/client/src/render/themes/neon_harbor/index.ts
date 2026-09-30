// Neon Harbor — a rain-wet harbour city from dusk into night: dark wet asphalt with cyan lane paint, magenta kerbs,
// grey concrete barriers with a magenta stripe, towers that read as silhouettes with warm/cyan windows, and a
// violet-over-coral light rig. Rainline Boulevard runs it at night (`sky=night`), Skyway Interchange at dusk.
import type { ContentTables } from '@cr/content';
import { MaterialLibrary } from '../../materials/library.ts';
import { makeKit, type ThemeKit, type ThemeLook } from '../kit.ts';
import { NEON_PROPS } from './props.ts';

export const NEON_LOOK: Partial<ThemeLook> = {
  road: { style: 'asphalt', a: '#2e3140', b: '#3a3e50', line: '#6ff3ff', wet: true },
  shoulder: { a: '#2a2d38', b: '#343846' },
  terrain: { a: '#23262f', b: '#2d313c', rock: '#1a1c22' },
  wall: { kind: 'barrier', a: '#b9bdc8', b: '#ff3ea5' },
  kerb: ['#ff3ea5', '#1d1f2a'],
  sky: { turbidity: 4, rayleigh: 2.2, elevationDeg: 4, azimuthDeg: 250, exposure: 0.75, top: '#150f38', bottom: '#ff7a59' },
  sun: { color: '#ffb38a', intensity: 1.1 },
  hemi: { sky: '#6a7cff', ground: '#ff5fa0', intensity: 0.95 },
  fogColor: '#241c3a',
  stars: 0.25,
  ambient: 'rain',
  wet: 0.65,
  bloom: 0.55,
  rimBoost: 1.4,
  headlights: true,
  shadowStrength: 0.5,
  grade: { tint: '#f2ecff', saturation: 1.12, shadows: '#1c1638', highlights: '#ffe9f4' },
};

export default (c: ContentTables): ThemeKit => {
  const kit = makeKit(c.themes.get('neon_harbor'), NEON_LOOK, NEON_PROPS);
  const base = kit.materials;
  kit.materials = () => ({
    ...base(),
    'road:cobble': MaterialLibrary.road({ style: 'cobble', a: '#3a3440', b: '#4a4250', line: '#ffb347', wet: true }),
    'wall:building': MaterialLibrary.wall('building', '#2a2f3e', '#ffd98a', 0.9),
    // skyway decks and ramps: dark concrete undersides with a cool tint instead of the default warm grey
    underside: MaterialLibrary.world({ color: '#4a4e5c', color2: '#3b3f4b', roughness: 0.88, noiseScale: 0.3, vertexAO: true }),
  });
  return kit;
};
