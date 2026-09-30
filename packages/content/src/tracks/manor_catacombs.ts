import { defineTrack } from '../define.ts';

export default defineTrack({
  id: 'manor_catacombs',
  themeId: 'lantern_hollow',
  difficulty: 4,
  laps: 2,
  modes: ['speed', 'item'],
  topology: 'circuit',
  lapLengthM: 1800,
  refLapTicks: 3265, // §12 reference lap (speed); the baked .ctrk carries the ghost value
  nameKey: 'tracks.manor_catacombs.name',
  onRoster: true,
});
