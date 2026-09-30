import { defineTheme } from '../define.ts';

export default defineTheme({
  id: 'orbital_nexus',
  nameKey: 'themes.orbital_nexus.name',
  palette: ['#EEF3F8', '#7DE2FC', '#D97757', '#0B1026', '#A6FFCB'],
  sky: 'space',
  sunDir: [0.3, 0.8, 0.5],
  fog: { color: '#0b1026', near: 200, far: 1400 },
  songId: 'orbital',
  headlights: false,
});
