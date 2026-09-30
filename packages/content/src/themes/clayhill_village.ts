import { defineTheme } from '../define.ts';

export default defineTheme({
  id: 'clayhill_village',
  nameKey: 'themes.clayhill_village.name',
  palette: ['#D97757', '#F4EFE6', '#8FB573', '#9FD3F5', '#5A6B7B'],
  sky: 'goldenHour',
  sunDir: [0.45, 0.8, 0.35],
  fog: { color: '#cfe6f5', near: 120, far: 900 },
  songId: 'clayhill',
  headlights: false,
});
