import { defineTrack } from '../define.ts';

export default defineTrack({
  id: 'kraken_lighthouse',
  themeId: 'coral_cove',
  difficulty: 3,
  laps: 3,
  modes: ['speed', 'item'],
  topology: 'circuit',
  lapLengthM: 1400,
  refLapTicks: 0,
  nameKey: 'tracks.kraken_lighthouse.name',
  onRoster: true,
});
