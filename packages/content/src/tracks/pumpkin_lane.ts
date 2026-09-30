import { defineTrack } from '../define.ts';

export default defineTrack({
  id: 'pumpkin_lane',
  themeId: 'lantern_hollow',
  difficulty: 2,
  laps: 3,
  modes: ['speed', 'item'],
  topology: 'circuit',
  lapLengthM: 1300,
  refLapTicks: 2167, // §12 reference lap (speed); the baked .ctrk carries the ghost value
  nameKey: 'tracks.pumpkin_lane.name',
  onRoster: true,
});
