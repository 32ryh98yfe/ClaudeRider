import { defineTheme } from '../define.ts';

export default defineTheme({
  id: 'neon_harbor',
  nameKey: 'themes.neon_harbor.name',
  palette: ['#1C1F26', '#FF3EA5', '#3EE6FF', '#FFB347', '#6A4C93'],
  sky: 'night',
  sunDir: [0.2, 0.5, 0.6],
  fog: { color: '#1b1d2e', near: 70, far: 600 },
  songId: 'neon',
  headlights: true,
});
