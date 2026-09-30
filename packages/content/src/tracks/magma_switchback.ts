import { defineTrack } from '../define.ts';

export default defineTrack({
  id: 'magma_switchback',
  themeId: 'ember_mine',
  difficulty: 5,
  laps: 2,
  modes: ['speed', 'item'],
  topology: 'circuit',
  lapLengthM: 1850,
  refLapTicks: 0,
  nameKey: 'tracks.magma_switchback.name',
  onRoster: true,
});
