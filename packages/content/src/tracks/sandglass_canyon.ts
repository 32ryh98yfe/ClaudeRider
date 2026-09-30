import { defineTrack } from '../define.ts';

export default defineTrack({
  id: 'sandglass_canyon',
  themeId: 'sunstone_desert',
  difficulty: 4,
  laps: 2,
  modes: ['speed', 'item'],
  topology: 'circuit',
  lapLengthM: 1950,
  refLapTicks: 0,
  nameKey: 'tracks.sandglass_canyon.name',
  onRoster: true,
});
