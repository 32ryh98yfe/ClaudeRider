// Frostbyte Glacier — a penguin village in a snow globe, crystal caves and a night ski resort: packed-snow road with
// ice-blue paint, snow shoulders and banks, pale rock walls, glossy ice. The kit look is the bright cloudy day of Snowglobe
// Halfpipe; Aurora Summit sets `sky=aurora time=22 headlights=on` in its THEME line, and the factory (which receives
// those THEME attributes) switches to the night rig below.
import type { ContentTables } from '@cr/content';
import { MaterialLibrary } from '../../materials/library.ts';
import { makeKit, type ThemeKit, type ThemeLook } from '../kit.ts';
import { FROSTBYTE_PROPS, fairyLights } from './props.ts';
import { softAoTerrain } from '../sunstone_desert/terrain.ts';
import { halfpipeRoad } from './halfpipe.ts';

// Stylized arcade read (2026-10 pass, docs/design/34-stylized-pass.md): snow is matte white-blue around #e8eef5 (never
// clipped to white under ACES), the road is a cool neutral grey so karts and the next corner read first, kerbs are red
// and white against the snow, barriers are white panels with a navy band, and only ice is glossy.
export const FROSTBYTE_LOOK: Partial<ThemeLook> = {
  // a warm-grey road (the cooler slate read dark navy against the snow). Under the clear day key the old #7a7876 /
  // #858381 rendered a cool #778091 at ≈ 125 luma: a darker, warmer stone renders a neutral grey near 110
  road: { style: 'asphalt', a: '#6c645c', b: '#766e65', line: '#cdeefa' },
  shoulder: { a: '#dde6ef', b: '#e6edf4' },
  terrain: { a: '#e3eaf2', b: '#d5dfe9', rock: '#8e99a7' },
  wall: { kind: 'stone', a: '#d2dde7', b: '#97a7b6' },
  kerb: ['#d9453c', '#f1f4f7'],
  sky: { turbidity: 6, rayleigh: 0.9, elevationDeg: 28, azimuthDeg: 200, exposure: 0.85, top: '#7aa6d6', bottom: '#cdd9e5' },
  // Snowglobe runs THEME sky=day under the kit's thick cloud (the overcast kind's weak key left the village shadowless,
  // snow the same value as the sky): this clear key at ≈ 2.7 : 1 over the hemisphere gives the karts real shadows.
  // On aurora skies resolveEnvLook uses the sky kind's key (2.6 × sunK) instead
  sun: { color: '#eef6ff', intensity: 2.2 },
  hemi: { sky: '#e4eefa', ground: '#b4c0cd', intensity: 0.8 },
  // a warm, shadowless back fill: the shaded side of karts and mascots keeps its colour against the white snow
  fill: { color: '#fff1e2', intensity: 0.65 },
  fogColor: '#dbe5ee',
  horizon: '#e2eaf1',
  skyStyle: 'gradient',
  exposure: 1.05,
  bloom: 0.25,
  hour: 13,
  clouds: 0.75,
  envIntensity: 0.45,
  // stars/moon/aurora are left to the sky kind, so only Aurora Summit's `sky=aurora` night gets them
  ambient: 'snow',
  shadowStrength: 0.68,
  rimBoost: 0.6,
  grade: { tint: '#ffffff', saturation: 1.06, shadows: '#eef3ff', highlights: '#fbfdff' },
  // no global water plane: the frozen lake and the rink are ice road surfaces
};

/** Aurora Summit (22:00): moonlit snow, a cool back fill and strong rims so karts read; never turned into daytime. */
const NIGHT_LOOK: Partial<ThemeLook> = {
  // a mid-grey night road so the lane paint, the karts and the next corner separate from the dark verges
  road: { style: 'asphalt', a: '#6e7684', b: '#7a8290', line: '#bee9f7' },
  // the aurora dome reads sky.top / bottom / horizon too: keep them night colours (the day kit's would wash it white)
  sky: { turbidity: 6, rayleigh: 0.9, elevationDeg: 28, azimuthDeg: 200, exposure: 1, top: '#050c22', bottom: '#14345e' },
  horizon: '#21507a',
  // moonlight: a near-neutral sky fill and a grey bounce (the bluer #c0c9dc / #5a6274 pair cast the road #25314b and the
  // snow navy), plus a warm-neutral back fill for the chase camera; the blue stays in the sky, fog and aurora, and the
  // sun-like key stays the weak moon, so it is still night
  hemi: { sky: '#cdd0d8', ground: '#606470', intensity: 2.4 },
  fill: { color: '#d8d4e2', intensity: 0.9 },
  fogColor: '#26374f',
  exposure: 1.08,
  bloom: 0.3,
  envIntensity: 0.35,
  shadowStrength: 0.7,
  rimBoost: 1.9,
  grade: { tint: '#ffffff', saturation: 0.9, shadows: '#e8ebf3', highlights: '#f8faff' },
};

export default (c: ContentTables, env: Readonly<Record<string, string>> = {}): ThemeKit => {
  const night = env['sky'] === 'aurora' || env['sky'] === 'night';
  // fairy-light bulbs bloom only at night; by day (gain 1.0) they read as coloured bulbs rather than glowing orbs
  const props = night ? FROSTBYTE_PROPS : { ...FROSTBYTE_PROPS, fairy_lights: fairyLights(1.0) };
  const kit = makeKit(c.themes.get('frostbyte_glacier'), night ? { ...FROSTBYTE_LOOK, ...NIGHT_LOOK } : FROSTBYTE_LOOK, props);
  const base = kit.materials;
  const T = kit.look.terrain;
  kit.materials = () => ({
    ...base(),
    // bright snow: keep 60 % of the baked terrain AO by day (soft, clean ground; wall bases and gullies keep their
    // shade); 40 % at night, where the strong sky fill turned the baked AO into smeared dark blotches on the snow
    terrain: softAoTerrain(T.a, T.b, T.rock, night ? 0.4 : 0.6),
    // halfpipe walls (part of the road ribbon): packed snow → ice at the lip, navy top band
    road: halfpipeRoad(MaterialLibrary.road(kit.look.road)),
    'road:ice': MaterialLibrary.road({ style: 'ice', a: '#9fd3ea', b: '#c0e6f5', line: '#f1f6fa', tint: [1.2, 1.4, 1.6] }),
    'road:snow': MaterialLibrary.road({ style: 'snow', a: '#dfe7ef', b: '#e8eef5', line: '#bee9f7', tint: [1.7, 1.75, 1.8] }),
    'shoulder:snow': MaterialLibrary.road({ style: 'snow', a: '#dce5ee', b: '#e6edf4', line: '#bee9f7', tint: [1.7, 1.75, 1.8], shoulder: true }),
    // resort safety barrier: white panels, navy top band (the default glacier wall kind is stone)
    // under the blue night rig the day navy turns royal blue: a greyer navy keeps the barrier calm at night
    'wall:barrier': MaterialLibrary.wall('barrier', '#e9eef3', night ? '#3a4d6a' : '#2f5f96', 1),
    'wall:rock': MaterialLibrary.wall('rock', '#a3b1bf', '#7b8796', 0.85),
    'wall:building': MaterialLibrary.wall('building', '#8a6a52', '#e8eef5', 0.9),
    'wall:parapet': MaterialLibrary.wall('parapet', '#e6edf3', '#b4dbef', 0.95),
    'wall:fence': MaterialLibrary.wall('fence', '#e8eef5', '#2f6fa6', 1),
    // deck skirts and cliff faces under the road: pale granite (the night rig turned the old grey into a navy block),
    // with broad, low-contrast tone patches (the 0.3 noise smeared into streaks on the tall cliff skirts)
    underside: MaterialLibrary.world({ color: '#a9b4c1', color2: '#9eaab8', roughness: 0.92, noiseScale: 0.08, vertexAO: true }),
  });
  return kit;
};
