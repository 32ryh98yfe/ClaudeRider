import { defineTrack } from '../define.ts';

export default defineTrack({
  id: 'rainline_blvd',
  themeId: 'neon_harbor',
  difficulty: 3,
  laps: 3,
  modes: ['speed', 'item'],
  topology: 'circuit',
  lapLengthM: 1350,
  refLapTicks: 2338,
  nameKey: 'tracks.rainline_blvd.name',
  onRoster: true,
});
