import { defineTrack } from '../define.ts';

export default defineTrack({
  id: 'sunset_arena_rally',
  themeId: 'spark_circuit',
  difficulty: 3,
  laps: 2,
  modes: ['speed', 'item'],
  topology: 'circuit',
  lapLengthM: 1950,
  refLapTicks: 0,
  nameKey: 'tracks.sunset_arena_rally.name',
  onRoster: true,
});
