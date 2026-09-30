import { defineTrack } from '../define.ts';

export default defineTrack({
  id: 'manor_catacombs',
  themeId: 'lantern_hollow',
  difficulty: 4,
  laps: 2,
  modes: ['speed', 'item'],
  topology: 'circuit',
  lapLengthM: 1850,
  refLapTicks: 0,
  nameKey: 'tracks.manor_catacombs.name',
  onRoster: true,
});
