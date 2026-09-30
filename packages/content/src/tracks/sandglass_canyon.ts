import { defineTrack } from '../define.ts';

export default defineTrack({
  id: 'sandglass_canyon',
  themeId: 'sunstone_desert',
  difficulty: 4,
  laps: 2,
  modes: ['speed', 'item'],
  topology: 'circuit',
  lapLengthM: 1920,
  refLapTicks: 3441, // §12 reference lap (speed); the baked .ctrk carries the ghost value
  nameKey: 'tracks.sandglass_canyon.name',
  onRoster: true,
});
