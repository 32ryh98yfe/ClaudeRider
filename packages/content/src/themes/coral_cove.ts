import { defineTheme } from '../define.ts';

export default defineTheme({
  id: 'coral_cove',
  nameKey: 'themes.coral_cove.name',
  palette: ['#1FB5C9', '#7FE3D6', '#F6E3B4', '#8B5A2B', '#D94F4F'],
  sky: 'day',
  sunDir: [0.4, 0.9, -0.2],
  fog: { color: '#bfeff2', near: 140, far: 1000 },
  songId: 'coral',
  headlights: false,
});
