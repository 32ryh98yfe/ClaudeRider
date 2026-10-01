// Sunstone Desert — a caravan town and its sandstone canyon under a hot clear sky: sandstone paving with gold edge
// paint, sand shoulders, adobe walls with teal trim, red-rock canyon walls and a warm bounce light from the sand.
// Tracks set their hour in the THEME line (Sunstone Bazaar 16:00, Sandglass Canyon harsh noon); the kit factory
// receives those attributes and warms the afternoon key a little without tinting the whole frame.
import type { ContentTables } from '@cr/content';
import { MaterialLibrary } from '../../materials/library.ts';
import { makeKit, type ThemeKit, type ThemeLook } from '../kit.ts';
import { SUNSTONE_PROPS } from './props.ts';
import { softAoTerrain } from './terrain.ts';
import { paving } from './paving.ts';

// Stylized arcade read (2026-10 pass, docs/design/34-stylized-pass.md): the Preetham sky plus a peach grade washed
// every desert frame orange. Now a clear blue gradient sky with a pale warm horizon, a neutral grade, a key sun that
// clearly beats the fill, a warm (not orange) sand bounce, and a sandstone road a step darker and greyer than the sand
// so the karts and the next corner read first. Sand, rock and adobe are matte; only kart paint keeps its gloss.
export const SUNSTONE_LOOK: Partial<ThemeLook> = {
  road: { style: 'cobble', a: '#857868', b: '#968877', line: '#ffe2a0' },
  shoulder: { a: '#d9bf8e', b: '#e2c999' },
  terrain: { a: '#dcc08e', b: '#d3b47f', rock: '#b98560' },
  wall: { kind: 'stone', a: '#dcc09a', b: '#c29a70' },
  kerb: ['#d4553c', '#f6f1e6'],
  sky: { turbidity: 2.4, rayleigh: 1.2, elevationDeg: 55, azimuthDeg: 235, exposure: 1.0, top: '#3f88d8', bottom: '#a9c9e6' },
  sun: { color: '#fff3e2', intensity: 3.1 },
  // cool sky / warm sand fill at ≈ 2.5 : 1 under the sun; the sand bounce stays a light tan so it never turns orange
  hemi: { sky: '#d2e2fb', ground: '#9c8266', intensity: 1.35 },
  fill: { color: '#ffeadb', intensity: 0.42 },
  shadowStrength: 0.6,
  fogColor: '#cbdcea',
  horizon: '#d3e1ec',
  skyStyle: 'gradient',
  hour: 12,
  clouds: 0.18,
  envIntensity: 0.4,
  rimBoost: 0.4,
  bloom: 0.25,
  wind: 0.7,
  // no dust particles: the shared smoke quads read as dark rotated squares on the bright sand (a frame-wide noise)
  ambient: 'none',
  grade: { tint: '#ffffff', saturation: 1.04, shadows: '#eef2ff', highlights: '#fffaf3' },
  // no global water plane: the only water is the oasis_pond prop (a sea level would flood the dune-top dip)
};

export default (c: ContentTables, env: Readonly<Record<string, string>> = {}): ThemeKit => {
  // afternoon tracks (Sunstone Bazaar 16:00) get their own light; the sun elevation follows the THEME time
  const hour = env['time'] ? Number(env['time'].split(':')[0]) : 12;
  const look: Partial<ThemeLook> = hour >= 15
    // 16:00: a warm, lower key (the THEME time puts the sun ≈ 31° up), a pale warm horizon and fog, neutral grade
    ? { ...SUNSTONE_LOOK, sun: { color: '#ffdcae', intensity: 2.9 }, fill: { color: '#ffe6d2', intensity: 0.5 }, horizon: '#e4dccf', fogColor: '#ddd6cb' }
    : SUNSTONE_LOOK;
  const kit = makeKit(c.themes.get('sunstone_desert'), look, SUNSTONE_PROPS);
  const base = kit.materials;
  const T = kit.look.terrain;
  kit.materials = () => ({
    ...base(),
    // bright sand: keep 60 % of the baked terrain AO (soft, clean ground; wall bases and gullies keep their shade)
    terrain: softAoTerrain(T.a, T.b, T.rock, 0.6),
    // sandstone paving: warm grey stone in a narrow tone range with soft joints (the karts read against it), gold paint
    'road:stone': paving({ a: '#8f8270', b: '#968977', line: '#ffe2a0', tint: [1.05, 1.03, 1.0] }),
    // the kit road and the Bazaar shortcut's cobble lane use the same calm paving
    road: paving({ a: '#8f8270', b: '#968977', line: '#ffe2a0', tint: [1, 1, 1] }),
    'road:cobble': paving({ a: '#8f8270', b: '#968977', line: '#ffe2a0', tint: [1.08, 1.02, 0.95] }),
    'road:sand': MaterialLibrary.road({ style: 'sand', a: '#cfb283', b: '#dcc193', line: '#ffe2a0', tint: [1.45, 1.3, 0.95] }),
    'shoulder:sand': MaterialLibrary.road({ style: 'sand', a: '#d6bb8a', b: '#e0c697', line: '#ffe2a0', tint: [1.45, 1.3, 0.95], shoulder: true }),
    'wall:building': MaterialLibrary.wall('building', '#ead6b2', '#3fa8a0', 0.9),
    // red-rock canyon walls: terracotta strata, a step deeper than the sand so the corridor has an edge
    'wall:rock': MaterialLibrary.wall('rock', '#cc966c', '#ab7754', 0.85),
    'wall:parapet': MaterialLibrary.wall('parapet', '#e2c8a0', '#bf9a70', 0.95),
    underside: MaterialLibrary.world({ color: '#b07e55', color2: '#9a6c48', roughness: 0.92, noiseScale: 0.3, vertexAO: true }),
  });
  return kit;
};
