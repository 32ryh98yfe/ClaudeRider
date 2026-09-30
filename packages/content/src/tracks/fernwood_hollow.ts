import { defineTrack } from '../define.ts';

export default defineTrack({
  id: 'fernwood_hollow',
  themeId: 'canopy_forest',
  difficulty: 1,
  laps: 3,
  modes: ['speed', 'item'],
  topology: 'circuit',
  lapLengthM: 1350,
  refLapTicks: 0,
  nameKey: 'tracks.fernwood_hollow.name',
  onRoster: true,
});
