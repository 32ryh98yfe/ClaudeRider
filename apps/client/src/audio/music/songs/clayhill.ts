// Clayhill Village — a: marimba + ukulele pop 120 BPM (F major, meadow_loop); b: accordion + strings waltz-pop 132 BPM (B♭ major, belltower_piazza).
import { defineSong } from '../engine.ts';

export default defineSong({
  id: 'clayhill',
  a: { bpm: 120, root: 65, scale: 'major', prog: [0, 4, 5, 3], progB: [3, 4, 0, 4], drums: 'pop', bass: 'slap', harmony: 'strum', voices: { lead: 'marimba', harm: 'uke', bass: 'slapbass', pad: 'warmpad' }, leadDensity: 0.6, seed: 11 },
  b: { bpm: 132, root: 58, scale: 'major', prog: [0, 3, 4, 0], progB: [5, 3, 1, 4], feel: 'six8', drums: 'march', bass: 'rootFifth', harmony: 'waltz', voices: { lead: 'accordion', harm: 'strings', bass: 'roundbass', pad: 'warmpad' }, leadDensity: 0.55, seed: 12 },
});
