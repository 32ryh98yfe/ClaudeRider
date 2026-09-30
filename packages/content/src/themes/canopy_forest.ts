import { defineTheme } from '../define.ts';

export default defineTheme({
  id: 'canopy_forest',
  nameKey: 'themes.canopy_forest.name',
  palette: ['#4E9F3D', '#9BC53D', '#6B4226', '#E4572E', '#DCEFE3'],
  sky: 'day',
  sunDir: [0.5, 0.85, 0.1],
  fog: { color: '#d6ecdc', near: 80, far: 700 },
  songId: 'canopy',
  headlights: false,
});
