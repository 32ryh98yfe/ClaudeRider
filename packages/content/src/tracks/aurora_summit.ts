import { defineTrack } from '../define.ts';

export default defineTrack({
  id: 'aurora_summit',
  themeId: 'frostbyte_glacier',
  difficulty: 5,
  laps: 1,
  modes: ['speed', 'item'],
  topology: 'p2p',
  lapLengthM: 3700,
  refLapTicks: 0,
  nameKey: 'tracks.aurora_summit.name',
  onRoster: true,
});
