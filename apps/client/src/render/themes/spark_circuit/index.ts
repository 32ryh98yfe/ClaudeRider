// Spark Circuit — a pro racing league in golden late-afternoon light: dark tarmac, red/white kerbs, lush infield grass,
// ivory-and-red safety barriers, grandstands full of crowd cards, pit garages and original sponsor-free banners.
// One look serves all three tracks until per-track THEME lighting reaches the kit (docs/design/contract-requests/L12-track-env.md).
import type { ContentTables } from '@cr/content';
import { makeKit, type ThemeKit, type ThemeLook } from '../kit.ts';
import { SPARK_PROPS } from './props.ts';

export const SPARK_LOOK: Partial<ThemeLook> = {
  road: { style: 'asphalt', a: '#3b3e45', b: '#4b4f58', line: '#ffffff' },
  shoulder: { a: '#4f9c46', b: '#66b25a' },
  terrain: { a: '#5aa64c', b: '#80c268', rock: '#8e8a82' },
  wall: { kind: 'panel', a: '#fafafa', b: '#e63946' },
  kerb: ['#e63946', '#fafafa'],
  sky: { turbidity: 4.2, rayleigh: 1.9, elevationDeg: 19, azimuthDeg: 235, exposure: 1.0 },
  sun: { color: '#ffd6a6', intensity: 2.7 },
  hemi: { sky: '#ffe2cc', ground: '#5d7d4c', intensity: 1.05 },
  fogColor: '#f1caa8',
};

/** Sunset variant for sunset_arena_rally (selected once the kit can see the track's THEME line). */
export const SPARK_SUNSET_LOOK: Partial<ThemeLook> = {
  ...SPARK_LOOK,
  sky: { turbidity: 6.5, rayleigh: 2.6, elevationDeg: 6, azimuthDeg: 250, exposure: 0.95 },
  sun: { color: '#ffae70', intensity: 2.4 },
  hemi: { sky: '#ffcaa8', ground: '#5a6f4a', intensity: 1.0 },
  fogColor: '#f0a878',
};

export default (c: ContentTables): ThemeKit => makeKit(c.themes.get('spark_circuit'), SPARK_LOOK, SPARK_PROPS);
