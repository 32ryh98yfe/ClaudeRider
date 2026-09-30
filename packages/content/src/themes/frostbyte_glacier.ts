import { defineTheme } from '../define.ts';

export default defineTheme({
  id: 'frostbyte_glacier',
  nameKey: 'themes.frostbyte_glacier.name',
  palette: ['#BEE9F7', '#F7FBFF', '#2F6FA6', '#6CF2C2', '#B57CFF'],
  sky: 'overcast',
  sunDir: [0.2, 0.7, 0.5],
  fog: { color: '#dff2fb', near: 100, far: 800 },
  songId: 'frostbyte',
  headlights: false,
});
