// Canopy Forest — a morning rainforest of giant trunks and karst pillars: packed-earth trails, mossy stone walls,
// deep leaf greens, glossy toy mushrooms and a soft green-gold mist (art bible §3.2: leaf, moss, bark, mushroom, mist).
import type { ContentTables } from '@cr/content';
import { makeKit, type ThemeKit } from '../kit.ts';
import { CANOPY_PROPS } from './props.ts';

export default (c: ContentTables): ThemeKit => {
  const kit = makeKit(c.themes.get('canopy_forest'), {
    // mid-tone packed earth (luminance ≈ 0.3) so karts pop; pale edge paint reads like trodden borders
    road: { style: 'dirt', a: '#7b5d40', b: '#8f6d4b', line: '#efe2c4' },
    shoulder: { a: '#5f7f33', b: '#779540' },
    terrain: { a: '#3c6f2e', b: '#5a8a3a', rock: '#6f6a5c' },
    wall: { kind: 'stone', a: '#7f866a', b: '#58703f' },
    kerb: ['#6b4226', '#efe2c4'],
    // low morning sun raking through the trunks
    sky: { turbidity: 4.5, rayleigh: 1.9, elevationDeg: 16, azimuthDeg: 120, exposure: 1.0 },
    sun: { color: '#ffe3a6', intensity: 2.7 },
    hemi: { sky: '#d2f0dc', ground: '#4d7a36', intensity: 1.25 },
    fogColor: '#d9eedb',
  }, CANOPY_PROPS);
  return { ...kit, grade: { slope: 1.04, saturation: 1.12 } };
};
