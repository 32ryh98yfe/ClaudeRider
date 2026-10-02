// Lantern Hollow — a cosy autumn-night festival under a big moon: warm-grey cobbles, indigo sky with a purple horizon,
// pumpkin-orange kerbs and warm lantern light everywhere (art bible §3.2: indigo, purple, pumpkin, moon, wisp).
// Night readability: a cool moon key plus a lilac hemisphere fill keep karts and mascots at ≥ 3:1 contrast.
// The kit factory sees the track's THEME line: Manor Catacombs (mood=manor) gets a cooler night over pale stone
// parapets, so it does not read as a re-skin of Pumpkin Lane.
import type { ContentTables } from '@cr/content';
import { makeKit, type ThemeKit, type ThemeLook } from '../kit.ts';
import { LANTERN_PROPS } from './props.ts';
import { LANTERN_DRESSING } from './dressing.ts';

export const LANTERN_LOOK: Partial<ThemeLook> = {
  // stylized pass (2026-10): the night stays night, but the road is a lighter, low-saturation grey-violet (the moon
  // light is already blue; a violet road went saturated blue) so the karts and the pumpkin kerbs of the next corner
  // read first; grass is a mid-value moss, never black
  // review round: pale lilac-white edge paint (#e9e2f5): the warm line at half cobble paint strength read lavender
  // final pass: the cobbles are a neutral warm grey (#6b6864 / #7b7873); with the violet sky fill and a 1.12 grade
  // saturation the grey-violet road turned the whole frame one violet hue. The violet lives in the sky only.
  road: { style: 'cobble', a: '#6b6864', b: '#7b7873', line: '#e9e2f5' },
  shoulder: { a: '#4f7658', b: '#5e8664' },
  // final pass: verges and infield one step lighter (#56805e / #679066) and a warm-grey ground bounce (#786a6c): the
  // old moss and plum bounce read near-black navy under the moon
  terrain: { a: '#56805e', b: '#679066', rock: '#78729a' },
  // final pass: warm stone walls (were lilac #8c8598 / #6a6178, which lined Pumpkin Lane's straights in violet)
  wall: { kind: 'stone', a: '#8b8782', b: '#6d6964' },
  kerb: ['#ff9f1c', '#3a3160'],
  sky: { turbidity: 1, rayleigh: 1, elevationDeg: 42, azimuthDeg: 215, exposure: 1, night: true, top: '#0c0a2a', bottom: '#4e3889' },
  horizon: '#6a4aa0',
  sun: { color: '#c9d3ff', intensity: 1.7 },
  // a brighter lilac sky fill (×0.55 at night) and a shadowless warm back fill — the lanterns' bounce — so the chase
  // camera sees the karts' shaded sides in their own colours; shadows stay soft (moonlight), rims a touch lower.
  // Final pass: the sky fill is a desaturated lavender-grey (#a6a3c4), and the look and kit grades hold saturation
  // at 1.0 (the look grade wins over the kit grade in resolveLook, so both are set)
  hemi: { sky: '#a6a3c4', ground: '#786a6c', intensity: 1.65 },
  fill: { color: '#ffc690', intensity: 0.45 },
  shadowStrength: 0.6,
  exposure: 1.22,
  envIntensity: 0.32,
  // review round: rims up (1.6 → 1.9) and the back fill up (0.34 → 0.45) so the karts separate from the road in value
  rimBoost: 1.9,
  bloom: 0.36,
  fogColor: '#2e2756',
  grade: { saturation: 1.0, tint: '#ffffff', shadows: '#e4e0ff', highlights: '#fff4e6' },
};

/**
 * Manor Catacombs (THEME mood=manor): a colder, bluer night (the dome bottom, horizon and fog shift from violet to
 * slate blue) over a pale stone parapet. Road, grass, kerbs and the lantern fill stay the Lantern Hollow ones.
 */
export const LANTERN_MANOR_LOOK: Partial<ThemeLook> = {
  ...LANTERN_LOOK,
  sky: { ...LANTERN_LOOK.sky!, bottom: '#2c3466' },
  horizon: '#3e4a80',
  // the far garden fades into the slate horizon rather than a violet haze
  fogColor: '#262c52',
  // manor walls are `parapet` slots, which take the look's wall colours (TrackView resolveMaterial)
  wall: { kind: 'stone', a: '#9a94a0', b: '#817b88' },
};

export default (c: ContentTables, env?: Readonly<Record<string, string>>): ThemeKit => {
  const kit = makeKit(c.themes.get('lantern_hollow'), env?.['mood'] === 'manor' ? LANTERN_MANOR_LOOK : LANTERN_LOOK, { ...LANTERN_PROPS, ...LANTERN_DRESSING });
  return { ...kit, grade: { slope: 1.06, saturation: 1.0 } };
};
