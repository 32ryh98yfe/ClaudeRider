import { defineTrack } from '../define.ts';

export default defineTrack({
  id: 'cascade_slalom',
  themeId: 'canopy_forest',
  difficulty: 4,
  laps: 2,
  modes: ['speed', 'item'],
  topology: 'circuit',
  lapLengthM: 1950,
  refLapTicks: 3353, // §12 reference lap (speed); the baked .ctrk carries the ghost value
  nameKey: 'tracks.cascade_slalom.name',
  onRoster: true,
});
