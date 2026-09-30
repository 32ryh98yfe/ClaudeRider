// Coral Cove — a: steel-drum pop 122 BPM (C major, coral_cove_docks); b: sea-shanty electro in 6/8, 136 BPM (A minor, kraken_lighthouse).
import { defineSong } from '../engine.ts';

export default defineSong({
  id: 'coral',
  a: { bpm: 122, root: 60, scale: 'major', prog: [0, 3, 4, 3], progB: [5, 3, 4, 0], drums: 'pop', bass: 'rootFifth', harmony: 'offbeat', voices: { lead: 'steel', harm: 'marimba', bass: 'roundbass', pad: 'warmpad' }, leadDensity: 0.6, seed: 71 },
  b: { bpm: 136, root: 57, scale: 'minor', prog: [0, 5, 6, 4], progB: [0, 3, 6, 4], feel: 'six8', drums: 'shanty', bass: 'rootFifth', harmony: 'waltz', voices: { lead: 'pulse', harm: 'accordion', bass: 'synthbass', pad: 'warmpad' }, leadDensity: 0.6, seed: 72 },
});
