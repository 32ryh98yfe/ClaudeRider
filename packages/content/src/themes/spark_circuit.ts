import { defineTheme } from '../define.ts';

export default defineTheme({
  id: 'spark_circuit',
  nameKey: 'themes.spark_circuit.name',
  palette: ['#3A3D42', '#E63946', '#FFFFFF', '#5BAA4A', '#FF8C42'],
  sky: 'sunset',
  sunDir: [-0.6, 0.35, 0.3],
  fog: { color: '#f2b48a', near: 160, far: 1100 },
  songId: 'spark',
  headlights: false,
});
