import { defineTrack } from '../define.ts';

export default defineTrack({
  id: 'meadow_loop',
  themeId: 'clayhill_village',
  difficulty: 1,
  laps: 3,
  modes: ['speed', 'item'],
  topology: 'circuit',
  lapLengthM: 1400,
  refLapTicks: 0,
  nameKey: 'tracks.meadow_loop.name',
  onRoster: true,
});
