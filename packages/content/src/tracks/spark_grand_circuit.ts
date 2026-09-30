import { defineTrack } from '../define.ts';

export default defineTrack({
  id: 'spark_grand_circuit',
  themeId: 'spark_circuit',
  difficulty: 1,
  laps: 3,
  modes: ['speed', 'item'],
  topology: 'circuit',
  lapLengthM: 1500,
  refLapTicks: 2415, // Legend ghost from `trackc build --ghost` (40.25 s; roster target 40.5 s)
  nameKey: 'tracks.spark_grand_circuit.name',
  onRoster: true,
});
