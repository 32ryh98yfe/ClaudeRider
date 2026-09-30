import { defineTheme } from '../define.ts';

export default defineTheme({
  id: 'ember_mine',
  nameKey: 'themes.ember_mine.name',
  palette: ['#2B2320', '#FF6A2B', '#FFC857', '#7FDBFF', '#C77DFF'],
  sky: 'underground',
  sunDir: [0.1, 1.0, 0.1],
  fog: { color: '#1e1520', near: 45, far: 420 },
  songId: 'ember',
  headlights: true,
});
