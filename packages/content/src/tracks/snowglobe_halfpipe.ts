import { defineTrack } from '../define.ts';

export default defineTrack({
  id: 'snowglobe_halfpipe',
  themeId: 'frostbyte_glacier',
  difficulty: 2,
  laps: 3,
  modes: ['speed', 'item'],
  topology: 'circuit',
  lapLengthM: 1300,
  refLapTicks: 2167, // §12 reference lap (speed); the baked .ctrk carries the ghost value
  nameKey: 'tracks.snowglobe_halfpipe.name',
  onRoster: true,
});
