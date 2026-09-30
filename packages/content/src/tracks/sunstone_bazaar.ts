import { defineTrack } from '../define.ts';

export default defineTrack({
  id: 'sunstone_bazaar',
  themeId: 'sunstone_desert',
  difficulty: 1,
  laps: 3,
  modes: ['speed', 'item'],
  topology: 'circuit',
  lapLengthM: 1450,
  refLapTicks: 0,
  nameKey: 'tracks.sunstone_bazaar.name',
  onRoster: true,
});
