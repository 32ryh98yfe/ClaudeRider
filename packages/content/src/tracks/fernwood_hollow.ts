import { defineTrack } from '../define.ts';

export default defineTrack({
  id: 'fernwood_hollow',
  themeId: 'canopy_forest',
  difficulty: 1,
  laps: 3,
  modes: ['speed', 'item'],
  topology: 'circuit',
  lapLengthM: 1350,
  refLapTicks: 2189, // §12 reference lap (speed); the baked .ctrk carries the ghost value
  nameKey: 'tracks.fernwood_hollow.name',
  onRoster: true,
});
