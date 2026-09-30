import { defineTrack } from '../define.ts';

export default defineTrack({
  id: 'spark_grand_circuit',
  themeId: 'spark_circuit',
  difficulty: 1,
  laps: 3,
  modes: ['speed', 'item'],
  topology: 'circuit',
  lapLengthM: 1500,
  refLapTicks: 2444, // Legend ghost (40.7 s; roster target 40.5 s ±8%)
  nameKey: 'tracks.spark_grand_circuit.name',
  onRoster: true,
});
