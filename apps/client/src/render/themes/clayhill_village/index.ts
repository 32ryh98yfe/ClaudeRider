// Clayhill Village — Claude's terracotta hill town: warm cobbles, cream walls, sage meadows, golden-hour sun.
import type { ContentTables } from '@cr/content';
import { makeKit, type ThemeKit } from '../kit.ts';

export default (c: ContentTables): ThemeKit => makeKit(c.themes.get('clayhill_village'), {
  road: { style: 'asphalt', a: '#50515a', b: '#63646c', line: '#fbf3df' },
  shoulder: { a: '#79ad4f', b: '#98c463' },
  terrain: { a: '#86b85a', b: '#a9cf72', rock: '#b59a7a' },
  wall: { kind: 'panel', a: '#faf9f5', b: '#d97757' },
  kerb: ['#d97757', '#faf9f5'],
  sky: { turbidity: 3.2, rayleigh: 1.6, elevationDeg: 24, azimuthDeg: 210, exposure: 1.05 },
  sun: { color: '#ffe2b8', intensity: 2.8 },
  hemi: { sky: '#d6ebff', ground: '#96b86b', intensity: 1.15 },
});
