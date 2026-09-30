import { defineTheme } from '../define.ts';

export default defineTheme({
  id: 'sunstone_desert',
  nameKey: 'themes.sunstone_desert.name',
  palette: ['#E8C27A', '#C98B4E', '#3FB8AF', '#F6D7A7', '#7EC8E3'],
  sky: 'day',
  sunDir: [0.3, 0.9, 0.2],
  fog: { color: '#f3dcae', near: 140, far: 1000 },
  songId: 'sunstone',
  headlights: false,
});
