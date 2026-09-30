// Coral Cove — a tropical harbour at bright noon: sun-warmed sandstone cobbles, turquoise-and-white kerbs, lifebuoy
// barriers, sandy berms running down into a turquoise sea, palms, a moored galleon, a striped lighthouse and a cute kraken.
// The sea is a prop (`sea`, one per track) because the kit has no environment hook yet; see
// docs/design/contract-requests/L12-track-env.md for per-track lighting (Kraken Lighthouse wants sunset).
import type { ContentTables } from '@cr/content';
import { makeKit, type ThemeKit, type ThemeLook } from '../kit.ts';
import { CORAL_PROPS } from './props.ts';

export const CORAL_LOOK: Partial<ThemeLook> = {
  road: { style: 'cobble', a: '#8f8373', b: '#a59886', line: '#fbf6ea' },
  shoulder: { a: '#e6d19c', b: '#f1e1b5' },
  terrain: { a: '#ead7a4', b: '#a9c96f', rock: '#b99e7c' },
  wall: { kind: 'panel', a: '#fafafa', b: '#d94f4f' },
  kerb: ['#1fb5c9', '#fafafa'],
  sky: { turbidity: 2.0, rayleigh: 1.1, elevationDeg: 58, azimuthDeg: 160, exposure: 1.05 },
  sun: { color: '#fff5e3', intensity: 2.9 },
  hemi: { sky: '#c4f0fb', ground: '#e8d6a6', intensity: 1.2 },
  fogColor: '#c9f0f0',
};

/** Sunset variant for kraken_lighthouse (selected once the kit can see the track's THEME line). */
export const CORAL_SUNSET_LOOK: Partial<ThemeLook> = {
  ...CORAL_LOOK,
  sky: { turbidity: 5.5, rayleigh: 2.4, elevationDeg: 7, azimuthDeg: 255, exposure: 0.95 },
  sun: { color: '#ffb47a', intensity: 2.5 },
  hemi: { sky: '#ffd2b4', ground: '#b08a6a', intensity: 1.0 },
  fogColor: '#f3c3a0',
};

export default (c: ContentTables): ThemeKit => makeKit(c.themes.get('coral_cove'), CORAL_LOOK, CORAL_PROPS);
