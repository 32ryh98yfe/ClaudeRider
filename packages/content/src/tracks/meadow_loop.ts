import { defineTrack } from '../define.ts';

export default defineTrack({
  id: 'meadow_loop',
  themeId: 'clayhill_village',
  difficulty: 1,
  laps: 3,
  modes: ['speed', 'item'],
  topology: 'circuit',
  lapLengthM: 1400,
  refLapTicks: 2270, // §12 reference lap (speed); the baked .ctrk carries the ghost value
  nameKey: 'tracks.meadow_loop.name',
  onRoster: true,
});
