// Neon Harbor — a: synthwave 118 BPM (F♯ minor, rainline_blvd); b: future-funk 142 BPM (B♭ minor, skyway_interchange).
import { defineSong } from '../engine.ts';

export default defineSong({
  id: 'neon',
  a: { bpm: 118, root: 54, scale: 'minor', prog: [0, 5, 2, 6], progB: [3, 6, 5, 4], drums: 'pop', bass: 'arp', harmony: 'pad', voices: { lead: 'pulse', harm: 'supersaw', bass: 'synthbass', pad: 'warmpad' }, leadDensity: 0.45, leadOctave: 2, seed: 81 },
  b: { bpm: 142, root: 58, scale: 'dorian', prog: [0, 3, 6, 5], progB: [3, 6, 2, 5], drums: 'funk', bass: 'slap', harmony: 'stutter', voices: { lead: 'supersaw', harm: 'rhodes', bass: 'slapbass', pad: 'choirpad' }, leadDensity: 0.5, seed: 82 },
});
