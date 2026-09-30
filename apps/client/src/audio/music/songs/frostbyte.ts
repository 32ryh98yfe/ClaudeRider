// Frostbyte Glacier — a: glockenspiel electro 124 BPM (E major, snowglobe_halfpipe); b: epic synth-orchestral with timpani 150 BPM (E minor, aurora_summit).
import { defineSong } from '../engine.ts';

export default defineSong({
  id: 'frostbyte',
  a: { bpm: 124, root: 64, scale: 'major', prog: [0, 4, 5, 3], progB: [5, 3, 0, 4], drums: 'fourFloor', bass: 'octave', harmony: 'arp', voices: { lead: 'glock', harm: 'chip', bass: 'subbass', pad: 'glasspad' }, leadDensity: 0.5, seed: 31 },
  b: { bpm: 150, root: 64, scale: 'minor', prog: [0, 5, 2, 6], progB: [3, 4, 0, 6], drums: 'taiko', bass: 'octave', harmony: 'pad', voices: { lead: 'brass', harm: 'orch', bass: 'synthbass', pad: 'glasspad' }, leadDensity: 0.45, seed: 32 },
});
