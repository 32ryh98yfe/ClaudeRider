// Orbital Nexus — a clean orbital token factory and the station city around it, under a starfield with a ringed
// planet. Two moods from one kit, picked by the track's THEME line (registry passes it as `env`): Orbital Express
// is the cool station (white hull, cyan guidance light, orange accents) and Token Foundry (`mood=foundry`) the
// factory floor under amber work light, with hazard-striped barrier caps.
// Stylized pass (2026-10, 34-stylized-pass): the black, starry sky stays, but the scene gets a fill so shadows keep
// ≥ 50 % of the lit value, a matte satin deck road with lit guidance lines replaces the chrome tread plate (which
// mirrored the black sky), the barriers carry a cyan LED strip, the station floor below is panel plating with lit
// seams, no fog haze, and only beacons and nav lights bloom. The old grade multiplied the shadows by a near-black
// navy, which crushed everything below mid-grey to black; both moods now use a light split-tone.
import type { ContentTables } from '@cr/content';
import { MaterialLibrary } from '../../materials/library.ts';
import { makeKit, type ThemeKit, type ThemeLook } from '../kit.ts';
import { ORBITAL_PROPS } from './props.ts';
import { deckRoad, ledBarrier, paving } from '../neon_harbor/surfaces.ts';

/** Space station (Orbital Express). The `space` sky kind supplies the white key light; these set fill, sky and grade. */
export const ORBITAL_LOOK: Partial<ThemeLook> = {
  road: { style: 'metal', a: '#6b7383', b: '#747d8e', line: '#7de2fc', glow: '#7de2fc' },
  shoulder: { a: '#3a4458', b: '#424d63' },
  terrain: { a: '#3a4458', b: '#424d63', rock: '#2a3242' },
  wall: { kind: 'panel', a: '#eef3f8', b: '#d97757' },
  kerb: ['#d97757', '#eef3f8'],
  sky: { turbidity: 1, rayleigh: 0.3, elevationDeg: 35, azimuthDeg: 120, exposure: 0.9, night: true, top: '#02040d', bottom: '#0b1026' },
  horizon: '#141c40',
  sun: { color: '#f2f6ff', intensity: 2.0 },
  // a cool sky fill and the warm planet bounce from below at ≈ 1 : 2 against the key, plus a shadowless back fill
  hemi: { sky: '#9fbcff', ground: '#e8a07a', intensity: 3.0 },
  fill: { color: '#cfe0ff', intensity: 0.55 },
  fogColor: '#0b1026',
  stars: 1,
  planet: { color: '#d98a5f', ring: '#e8d2b8', dir: [-0.55, 0.42, -0.72], size: 0.15 },
  bloom: 0.4,
  rimBoost: 1.35,
  envIntensity: 0.35,
  shadowStrength: 0.55,
  ambient: 'motes',
  grade: { tint: '#f6f9ff', saturation: 1.06, shadows: '#e6ecff', highlights: '#fff6ee' },
};

/** Factory floor (Token Foundry): the same sky, warmer work light and hazard-striped caps. */
export const ORBITAL_FOUNDRY_LOOK: Partial<ThemeLook> = {
  ...ORBITAL_LOOK,
  road: { style: 'metal', a: '#6e727c', b: '#787c86', line: '#ffc36b', glow: '#ffc36b' },
  hemi: { sky: '#a8bcff', ground: '#f0a874', intensity: 3.0 },
  fill: { color: '#ffd8a8', intensity: 0.6 },
  grade: { tint: '#fffaf4', saturation: 1.06, shadows: '#ece9ff', highlights: '#fff3e6' },
};

export default (c: ContentTables, env?: Readonly<Record<string, string>>): ThemeKit => {
  const foundry = env?.['mood'] === 'foundry';
  const kit = makeKit(c.themes.get('orbital_nexus'), foundry ? ORBITAL_FOUNDRY_LOOK : ORBITAL_LOOK, ORBITAL_PROPS);
  const base = kit.materials;
  const mood = foundry ? 'foundry' : 'station';
  // vis road slots bake a per-surface tint (metal 1.15 / 1.18 / 1.22) that the deck material divides back out
  const deck = foundry
    ? { a: '#6e727c', b: '#787c86', seam: '#3c4048', paint: '#f2efe6', glow: '#ffc36b', gain: 0.85 }
    : { a: '#6b7383', b: '#747d8e', seam: '#3a4150', paint: '#eef3f8', glow: '#7de2fc', gain: 0.95 };
  kit.materials = () => ({
    ...base(),
    road: deckRoad(mood, deck),
    'road:metal': deckRoad(`${mood}-metal`, { ...deck, tint: [1.15, 1.18, 1.22] }),
    // hull barriers: white panels with an orange cap (hazard-striped in the foundry) and a cyan LED strip
    wall: ledBarrier(`orbital-${mood}`, { body: '#dfe5ec', base: '#7a8494', cap: foundry ? '#22262e' : '#d97757', hazard: foundry ? '#f2c230' : undefined, strip: '#7de2fc', gain: 0.9, rough: 0.7 }),
    // the station floor below the decks: hull plating with a lit seam every fourth plate row (no fog haze to hide it)
    terrain: paving(`orbital-${mood}`, foundry
      ? { a: '#5d626c', b: '#666b75', joint: '#3a3e46', size: 3, wall: '#5e636e', rough: 0.8, band: '#ffc36b', bandGain: 0.6 }
      : { a: '#3d475c', b: '#455066', joint: '#252c3a', size: 4, wall: '#48546c', lines: '#3f8fd0', rough: 0.75, band: '#7de2fc', bandGain: 0.7 }),
    // floating decks: white hull undersides
    underside: MaterialLibrary.world({ color: '#c9d3de', color2: '#8e9aab', roughness: 0.6, metalness: 0.2, noiseScale: 0.25, vertexAO: true }),
  });
  return kit;
};
