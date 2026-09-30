import { defineTrack } from '../define.ts';

export default defineTrack({
  id: 'coral_cove_docks',
  themeId: 'coral_cove',
  difficulty: 2,
  laps: 3,
  modes: ['speed', 'item'],
  topology: 'circuit',
  lapLengthM: 1350,
  refLapTicks: 0,
  nameKey: 'tracks.coral_cove_docks.name',
  onRoster: true,
});
