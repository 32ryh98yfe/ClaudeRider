// Ember Mine — an underground quarry lit by amber lanterns, cyan/violet geodes and lava. Roads are cool grey basalt
// (so the coral mascots pop against them) with amber edge paint; the hemisphere mixes crystal-violet light from
// above with a lava bounce from below. The night-sky shader stands in for the cave roof.
import type { ContentTables } from '@cr/content';
import { makeKit, type ThemeKit } from '../kit.ts';
import { EMBER_PROPS } from './props.ts';

export default (c: ContentTables): ThemeKit => makeKit(c.themes.get('ember_mine'), {
  road: { style: 'dirt', a: '#4f4a55', b: '#5d5762', line: '#ffb347' },
  shoulder: { a: '#3a3440', b: '#453e48' },
  terrain: { a: '#2c2830', b: '#3a3238', rock: '#1b181d' },
  wall: { kind: 'stone', a: '#3d3742', b: '#5a4a48' },
  kerb: ['#e8622a', '#2a232c'],
  sky: { turbidity: 1, rayleigh: 0.5, elevationDeg: 70, azimuthDeg: 200, exposure: 0.8, night: true, top: '#050408', bottom: '#241018' },
  sun: { color: '#ffd2a0', intensity: 1.25 },
  hemi: { sky: '#8f9ce0', ground: '#c46a42', intensity: 1.0 },
  fogColor: '#1e1520',
}, EMBER_PROPS);
