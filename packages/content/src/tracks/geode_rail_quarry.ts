import { defineTrack } from '../define.ts';

export default defineTrack({
  id: 'geode_rail_quarry',
  themeId: 'ember_mine',
  difficulty: 3,
  laps: 3,
  modes: ['speed', 'item'],
  topology: 'circuit',
  lapLengthM: 1375,
  refLapTicks: 2495,
  nameKey: 'tracks.geode_rail_quarry.name',
  onRoster: true,
});
