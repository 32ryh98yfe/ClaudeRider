import { defineTrack } from '../define.ts';

export default defineTrack({
  id: 'proving_ring',
  themeId: 'spark_circuit',
  difficulty: 1,
  laps: 5,
  modes: ['speed', 'item'],
  topology: 'circuit',
  lapLengthM: 700,
  refLapTicks: 0,
  nameKey: 'tracks.proving_ring.name',
  onRoster: false,
});
