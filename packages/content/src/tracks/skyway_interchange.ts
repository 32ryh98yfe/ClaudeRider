import { defineTrack } from '../define.ts';

export default defineTrack({
  id: 'skyway_interchange',
  themeId: 'neon_harbor',
  difficulty: 4,
  laps: 2,
  modes: ['speed', 'item'],
  topology: 'circuit',
  lapLengthM: 2000,
  refLapTicks: 3513,
  nameKey: 'tracks.skyway_interchange.name',
  onRoster: true,
});
