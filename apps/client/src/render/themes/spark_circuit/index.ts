// Spark Circuit — pro racing league at sunset: dark tarmac, red/white kerbs, lush infield, stadium orange sky.
import type { ContentTables } from '@cr/content';
import { makeKit, type ThemeKit } from '../kit.ts';

export default (c: ContentTables): ThemeKit => makeKit(c.themes.get('spark_circuit'), {
  road: { style: 'asphalt', a: '#3a3d44', b: '#4a4e57', line: '#ffffff' },
  shoulder: { a: '#4e9a45', b: '#63b057' },
  terrain: { a: '#5ba84d', b: '#7cc166', rock: '#8e8a82' },
  wall: { kind: 'panel', a: '#ffffff', b: '#e63946' },
  kerb: ['#e63946', '#ffffff'],
  sky: { turbidity: 6, rayleigh: 2.4, elevationDeg: 8, azimuthDeg: 250, exposure: 0.95 },
  sun: { color: '#ffb27a', intensity: 2.4 },
  hemi: { sky: '#ffd0b0', ground: '#5a7a4a', intensity: 1.0 },
});
