import { defineTrack } from '../define.ts';

export default defineTrack({
  id: 'token_foundry',
  themeId: 'orbital_nexus',
  difficulty: 3,
  laps: 3,
  modes: ['speed', 'item'],
  topology: 'circuit',
  lapLengthM: 1350,
  refLapTicks: 0,
  nameKey: 'tracks.token_foundry.name',
  onRoster: true,
});
