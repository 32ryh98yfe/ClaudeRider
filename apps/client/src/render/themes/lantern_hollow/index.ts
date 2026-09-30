// Lantern Hollow — a cosy autumn-night festival under a big moon: violet cobbles, indigo sky with a purple horizon,
// pumpkin-orange kerbs and warm lantern light everywhere (art bible §3.2: indigo, purple, pumpkin, moon, wisp).
// Night readability: a strong cool moon key plus a lilac hemisphere fill keep karts and mascots at ≥ 3:1 contrast.
import type { ContentTables } from '@cr/content';
import { makeKit, type ThemeKit } from '../kit.ts';
import { LANTERN_PROPS } from './props.ts';

export default (c: ContentTables): ThemeKit => {
  const kit = makeKit(c.themes.get('lantern_hollow'), {
    road: { style: 'cobble', a: '#57517a', b: '#6a6390', line: '#ffcf8a' },
    shoulder: { a: '#3f5c4c', b: '#4d6b58' },
    terrain: { a: '#2f4a40', b: '#3f5d4b', rock: '#5d5878' },
    wall: { kind: 'stone', a: '#7a70a0', b: '#554b7a' },
    kerb: ['#ff9f1c', '#3a3160'],
    sky: { turbidity: 1, rayleigh: 1, elevationDeg: 42, azimuthDeg: 215, exposure: 1, night: true, top: '#0b0a26', bottom: '#4b3580' },
    sun: { color: '#c9d3ff', intensity: 1.7 },
    hemi: { sky: '#8577d6', ground: '#3b2c4c', intensity: 1.3 },
    fogColor: '#2c2552',
  }, LANTERN_PROPS);
  return { ...kit, grade: { slope: 1.06, saturation: 1.12 } };
};
