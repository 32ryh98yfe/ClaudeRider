import { defineTrack } from '../define.ts';

export default defineTrack({
  id: 'orbital_express',
  themeId: 'orbital_nexus',
  difficulty: 5,
  laps: 1,
  modes: ['speed', 'item'],
  topology: 'p2p',
  lapLengthM: 3800,
  refLapTicks: 0,
  nameKey: 'tracks.orbital_express.name',
  onRoster: true,
});
