import { defineTrack } from '../define.ts';

export default defineTrack({
  id: 'coral_cove_docks',
  themeId: 'coral_cove',
  difficulty: 2,
  laps: 3,
  modes: ['speed', 'item'],
  topology: 'circuit',
  lapLengthM: 1350,
  refLapTicks: 2344, // Legend ghost (39.1 s; roster target 37.5 s ±8%)
  nameKey: 'tracks.coral_cove_docks.name',
  onRoster: true,
});
