// Lantern Hollow — a cosy autumn-night festival under a big moon: violet cobbles, indigo sky with a purple horizon,
// pumpkin-orange kerbs and warm lantern light everywhere (art bible §3.2: indigo, purple, pumpkin, moon, wisp).
// Night readability: a cool moon key plus a lilac hemisphere fill keep karts and mascots at ≥ 3:1 contrast.
import type { ContentTables } from '@cr/content';
import { makeKit, type ThemeKit } from '../kit.ts';
import { LANTERN_PROPS } from './props.ts';
import { LANTERN_DRESSING } from './dressing.ts';

export default (c: ContentTables): ThemeKit => {
  const kit = makeKit(c.themes.get('lantern_hollow'), {
    // stylized pass (2026-10): the night stays night, but the road is a lighter, low-saturation grey-violet (the moon
    // light is already blue; a violet road went saturated blue) so the karts and the pumpkin kerbs of the next corner
    // read first; grass is a mid-value moss, never black
    // review round: pale lilac-white edge paint (#e9e2f5): the warm line at half cobble paint strength read lavender
    // final pass: the cobbles are a neutral warm grey (#6b6864 / #7b7873); with the violet sky fill and a 1.12 grade
    // saturation the grey-violet road turned the whole frame one violet hue. The violet lives in the sky only.
    road: { style: 'cobble', a: '#6b6864', b: '#7b7873', line: '#e9e2f5' },
    shoulder: { a: '#4f7658', b: '#5e8664' },
    terrain: { a: '#476a55', b: '#577c5f', rock: '#78729a' },
    wall: { kind: 'stone', a: '#8c8598', b: '#6a6178' },
    kerb: ['#ff9f1c', '#3a3160'],
    sky: { turbidity: 1, rayleigh: 1, elevationDeg: 42, azimuthDeg: 215, exposure: 1, night: true, top: '#0c0a2a', bottom: '#4e3889' },
    horizon: '#6a4aa0',
    sun: { color: '#c9d3ff', intensity: 1.7 },
    // a brighter lilac sky fill (×0.55 at night) and a shadowless warm back fill — the lanterns' bounce — so the chase
    // camera sees the karts' shaded sides in their own colours; shadows stay soft (moonlight), rims a touch lower.
    // Final pass: the sky fill is a desaturated lavender-grey (#a6a3c4), and the look and kit grades hold saturation
    // at 1.0 (the look grade wins over the kit grade in resolveLook, so both are set)
    hemi: { sky: '#a6a3c4', ground: '#64506a', intensity: 1.65 },
    fill: { color: '#ffc690', intensity: 0.45 },
    shadowStrength: 0.6,
    exposure: 1.22,
    envIntensity: 0.32,
    // review round: rims up (1.6 → 1.9) and the back fill up (0.34 → 0.45) so the karts separate from the road in value
    rimBoost: 1.9,
    bloom: 0.36,
    fogColor: '#2e2756',
    grade: { saturation: 1.0, tint: '#ffffff', shadows: '#e4e0ff', highlights: '#fff4e6' },
  }, { ...LANTERN_PROPS, ...LANTERN_DRESSING });
  return { ...kit, grade: { slope: 1.06, saturation: 1.0 } };
};
