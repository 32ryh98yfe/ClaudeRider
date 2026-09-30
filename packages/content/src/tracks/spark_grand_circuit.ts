import { defineTrack } from '../define.ts';

export default defineTrack({
  id: 'spark_grand_circuit',
  themeId: 'spark_circuit',
  difficulty: 1,
  laps: 3,
  modes: ['speed', 'item'],
  topology: 'circuit',
  lapLengthM: 1500,
  refLapTicks: 0,
  nameKey: 'tracks.spark_grand_circuit.name',
  onRoster: true,
});
