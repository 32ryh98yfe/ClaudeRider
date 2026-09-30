import { defineTrack } from '../define.ts';

export default defineTrack({
  id: 'sunset_arena_rally',
  themeId: 'spark_circuit',
  difficulty: 3,
  laps: 2,
  modes: ['speed', 'item'],
  topology: 'circuit',
  lapLengthM: 1950,
  refLapTicks: 3520, // Legend ghost from `trackc build --ghost` (58.7 s; roster target 55.7 s ±8%)
  nameKey: 'tracks.sunset_arena_rally.name',
  onRoster: true,
});
