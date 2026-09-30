import { defineTheme } from '../define.ts';

export default defineTheme({
  id: 'lantern_hollow',
  nameKey: 'themes.lantern_hollow.name',
  palette: ['#1E1B3A', '#6B4FA0', '#FF9F1C', '#5FFBF1', '#FFF3C4'],
  sky: 'night',
  sunDir: [-0.3, 0.6, 0.4],
  fog: { color: '#241f45', near: 60, far: 520 },
  songId: 'lantern',
  headlights: true,
});
