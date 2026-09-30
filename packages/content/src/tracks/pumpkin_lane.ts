import { defineTrack } from '../define.ts';

export default defineTrack({
  id: 'pumpkin_lane',
  themeId: 'lantern_hollow',
  difficulty: 2,
  laps: 3,
  modes: ['speed', 'item'],
  topology: 'circuit',
  lapLengthM: 1300,
  refLapTicks: 0,
  nameKey: 'tracks.pumpkin_lane.name',
  onRoster: true,
});
