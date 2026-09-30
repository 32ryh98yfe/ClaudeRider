// Lantern Hollow — a: swing-spooky big band 126 BPM (C minor, pumpkin_lane); b: harpsichord drum-and-bass, half-time 150 BPM (D minor, manor_catacombs).
import { defineSong } from '../engine.ts';

export default defineSong({
  id: 'lantern',
  a: { bpm: 126, root: 60, scale: 'harmonicMinor', prog: [0, 3, 4, 0], progB: [5, 3, 4, 4], feel: 'swing', drums: 'swing', bass: 'walking', harmony: 'stabs', voices: { lead: 'theremin', harm: 'brass', bass: 'roundbass', pad: 'darkpad' }, leadDensity: 0.45, seed: 61 },
  b: { bpm: 150, root: 62, scale: 'harmonicMinor', prog: [0, 5, 3, 4], progB: [0, 3, 5, 4], drums: 'dnb', bass: 'syncop', harmony: 'arp', voices: { lead: 'bell', harm: 'harpsi', bass: 'subbass', pad: 'darkpad' }, leadDensity: 0.5, seed: 62 },
});
