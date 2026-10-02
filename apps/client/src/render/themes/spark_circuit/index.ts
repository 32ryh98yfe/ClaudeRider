// Spark Circuit — a pro racing league: neutral tarmac, red/white kerbs, lush infield grass, ivory-and-red safety
// barriers, grandstands full of crowd cards, pit garages and original sponsor-free banners. The day look serves
// Proving Ring and Spark Grand Circuit; Sunset Arena Rally (THEME sky=sunset) gets the sunset look (L12-track-env:
// the kit factory sees the track's THEME attributes).
import type { ContentTables } from '@cr/content';
import { MaterialLibrary } from '../../materials/library.ts';
import { makeKit, type ThemeKit, type ThemeLook } from '../kit.ts';
import { SPARK_PROPS } from './props.ts';
import { sparkBarrier } from './barrier.ts';
import { sparkLampLit } from './lamps.ts';
import type { PropFactory } from '../../props/defaults.ts';

// Stylized arcade read (2026-10 pass, docs/design/34-stylized-pass.md): the Meadow Loop day recipe on a racing
// venue — a clear blue gradient sky instead of the peach Preetham haze, a key sun clearly over the fill, neutral grey
// tarmac (the old blue-black read as a hole and hid the kart shadows), natural greens, signal-red/white kerbs and
// barriers in the shared trackside palette.
export const SPARK_LOOK: Partial<ThemeLook> = {
  // a touch warm: the neutral grey read cool blue-grey next to the green infield
  road: { style: 'asphalt', a: '#5e5a58', b: '#6b6764', line: '#fbf8f0' },
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
 * a warm key that still out-weighs the fill, a near-neutral shadowless back fill (the chase camera faces the setting
 * sun on the bowl straight), shadows that never go navy, mid rims, and bloom held for the floodlights.
 */
export const SPARK_SUNSET_LOOK: Partial<ThemeLook> = {
  ...SPARK_LOOK,
  terrain: { a: '#5b8a3e', b: '#76a050', rock: '#a0907f' },
  // first cut (horizon #ffc48e, bottom #f3a36a, fog #e9b48e) turned every view salmon: the dome mixes the horizon
  // up to ~33° and the chase camera sees little else (doc 34 §3). The warmth lives in a pale peach band (warmed a
  // touch since the highlight grade went neutral) and the key. elevationDeg is unused: the track's THEME time sets the
  // sun (17:20 → 10°, the sunset ceiling in env/look.ts)
  sky: { turbidity: 5.0, rayleigh: 2.2, elevationDeg: 15, azimuthDeg: 250, exposure: 1.0, top: '#48528f', bottom: '#efc299' },
  // the warmth lives in the key, but an orange #ffa45e one at 3.4 dyed every vertical surface (the white gantry rendered
  // #d69c7c): a pale amber key keeps whites white while the sky, the low sun disc and the long shadows say sunset
  sun: { color: '#ffbd85', intensity: 3.1 },
  // with the sun this low the road takes most of its light from the hemisphere and the dome's violet zenith: a lilac
  // sky term and a cool back fill turned the asphalt violet-navy. The shade still went near-black (asphalt #2f2830,
  // black grass under the stands; the grid sits in the tunnel stand's shadow): a light neutral-grey tarmac, a strong
  // near-neutral sky term over a warm ground, more back fill and env light, and a neutral shadow grade. Measured in
  // the grid shade: #2b232b before, #564f53 now (target ≈ #55504f or lighter)
  road: { style: 'asphalt', a: '#75736f', b: '#817e7a', line: '#fbf8f0' },
  hemi: { sky: '#d4d0d6', ground: '#86664f', intensity: 2.4 },
  fill: { color: '#e6e2dc', intensity: 0.9 },
  shadowStrength: 0.62,
  fogColor: '#e6d2c2',
  horizon: '#f4d3b4',
  fog: { near: 220, far: 1300 },
  clouds: 0.3,
  envIntensity: 0.45,
  rimBoost: 0.8,
  bloom: 0.35,
  grade: { tint: '#ffffff', saturation: 1.0, shadows: '#f2f2f0', highlights: '#ffffff' },
};

export default (c: ContentTables, env?: Readonly<Record<string, string>>): ThemeKit => {
  const sunset = env?.['sky'] === 'sunset';
  // at sunset the floodlights are on: their lamp faces (and the stadium stands' lamp heads) glow (lamps.ts)
  const lampsOn = (f: PropFactory): PropFactory => ({ ...f, build: (pal) => ({ ...f.build(pal), material: sparkLampLit(1.1) }) });
  const props = sunset ? { ...SPARK_PROPS, floodlight: lampsOn(SPARK_PROPS['floodlight']!), stadium: lampsOn(SPARK_PROPS['stadium']!) } : SPARK_PROPS;
  const kit = makeKit(c.themes.get('spark_circuit'), sunset ? SPARK_SUNSET_LOOK : SPARK_LOOK, props);
  const base = kit.materials;
  // theme-tinted variants of the per-surface slots the .vis bakes; the tint divides out trackc's per-surface tint
  // (built inside materials(): the library is configured for the tier and cleared between scenes before this runs)
  kit.materials = () => {
    const barrier = sparkBarrier('#f1eee6', '#d8423a', '#2f4a7a');
    return {
      ...base(),
      // run-off gravel and the rally stage in warm, clean beige so the asphalt edge and kerbs read against it
      'shoulder:gravel': MaterialLibrary.road({ style: 'gravel', a: '#b6a68c', b: '#c8b99e', line: '#fbf8f0', tint: [1.2, 1.15, 1.08], shoulder: true }),
      'road:gravel': MaterialLibrary.road({ style: 'gravel', a: '#a8977c', b: '#baa98d', line: '#fbf8f0', tint: [1.2, 1.15, 1.08] }),
      'road:dirt': MaterialLibrary.road({ style: 'dirt', a: '#9c7552', b: '#ab8460', line: '#fbf8f0', tint: [1.25, 1.0, 0.75] }),
      'wall:fence': MaterialLibrary.wall('ranch', '#f6f3ec', '#5b4a3a', 1),
      // ivory barrier with a red top band and a navy kick strip (barrier.ts) for the barrier and gore walls
      wall: barrier,
      'wall:gore': barrier,
    };
  };
  return kit;
};
