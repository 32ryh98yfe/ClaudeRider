// Lantern Hollow — a cosy autumn-night festival under a big moon: violet cobbles, indigo sky with a purple horizon,
// pumpkin-orange kerbs and warm lantern light everywhere (art bible §3.2: indigo, purple, pumpkin, moon, wisp).
// Night readability: a cool moon key plus a lilac hemisphere fill keep karts and mascots at ≥ 3:1 contrast.
import type { ContentTables } from '@cr/content';
import { makeKit, type ThemeKit } from '../kit.ts';
import { LANTERN_PROPS } from './props.ts';
import { LANTERN_DRESSING } from './dressing.ts';

export default (c: ContentTables): ThemeKit => {
  const kit = makeKit(c.themes.get('lantern_hollow'), {
    // stylized pass (2026-10): the night stays night, but the road is a lighter, cooler violet so the karts and the
    // pumpkin kerbs of the next corner read first; grass is a mid-value moss, never black
    road: { style: 'cobble', a: '#5f5a84', b: '#716b98', line: '#ffcf8a' },
    shoulder: { a: '#47684f', b: '#56795a' },
    terrain: { a: '#365644', b: '#466850', rock: '#6a6488' },
    wall: { kind: 'stone', a: '#837aa8', b: '#5c5282' },
    kerb: ['#ff9f1c', '#3a3160'],
    sky: { turbidity: 1, rayleigh: 1, elevationDeg: 42, azimuthDeg: 215, exposure: 1, night: true, top: '#0c0a2a', bottom: '#4e3889' },
    horizon: '#6a4aa0',
    sun: { color: '#c9d3ff', intensity: 1.7 },
    // a brighter lilac sky fill (×0.55 at night) and a shadowless warm back fill — the lanterns' bounce — so the chase
    // camera sees the karts' shaded sides in their own colours; shadows stay soft (moonlight), rims a touch lower
    hemi: { sky: '#8f84e0', ground: '#5a4468', intensity: 1.65 },
    fill: { color: '#ffc690', intensity: 0.34 },
    shadowStrength: 0.6,
    envIntensity: 0.32,
    rimBoost: 1.6,
    bloom: 0.36,
    fogColor: '#2e2756',
    grade: { saturation: 1.08, tint: '#ffffff', shadows: '#e4e0ff', highlights: '#fff4e6' },
  }, { ...LANTERN_PROPS, ...LANTERN_DRESSING });
  return { ...kit, grade: { slope: 1.06, saturation: 1.12 } };
};
