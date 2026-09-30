import { defineTrack } from '../define.ts';

export default defineTrack({
  id: 'cascade_slalom',
  themeId: 'canopy_forest',
  difficulty: 4,
  laps: 2,
  modes: ['speed', 'item'],
  topology: 'circuit',
  lapLengthM: 1900,
  refLapTicks: 0,
  nameKey: 'tracks.cascade_slalom.name',
  onRoster: true,
});
