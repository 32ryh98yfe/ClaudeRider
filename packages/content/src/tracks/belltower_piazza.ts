import { defineTrack } from '../define.ts';

export default defineTrack({
  id: 'belltower_piazza',
  themeId: 'clayhill_village',
  difficulty: 2,
  laps: 3,
  modes: ['speed', 'item'],
  topology: 'circuit',
  lapLengthM: 1350,
  refLapTicks: 0,
  nameKey: 'tracks.belltower_piazza.name',
  onRoster: true,
});
