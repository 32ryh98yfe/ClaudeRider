// Orbital Nexus — a: glitch-house 124 BPM (G minor, token_foundry); b: cinematic trance with supersaw 145 BPM (C minor, orbital_express).
import { defineSong } from '../engine.ts';

export default defineSong({
  id: 'orbital',
  a: { bpm: 124, root: 55, scale: 'minor', prog: [0, 5, 3, 6], progB: [3, 5, 6, 0], drums: 'fourFloor', bass: 'syncop', harmony: 'stutter', voices: { lead: 'bell', harm: 'chip', bass: 'subbass', pad: 'glasspad' }, leadDensity: 0.5, leadOctave: 2, seed: 101 },
  b: { bpm: 145, root: 60, scale: 'minor', prog: [0, 5, 2, 6], progB: [3, 4, 5, 6], drums: 'fourFloor', bass: 'octave', harmony: 'arp', voices: { lead: 'supersaw', harm: 'supersaw', bass: 'synthbass', pad: 'glasspad' }, leadDensity: 0.5, seed: 102 },
});
