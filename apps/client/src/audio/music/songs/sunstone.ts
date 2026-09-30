// Sunstone Desert — a: oud-flavoured synth 110 BPM (D Phrygian dominant, sunstone_bazaar); b: driving percussion surf-rock 140 BPM (sandglass_canyon).
import { defineSong } from '../engine.ts';

export default defineSong({
  id: 'sunstone',
  a: { bpm: 110, root: 62, scale: 'phrygianDom', prog: [0, 1, 0, 6], progB: [0, 5, 6, 0], drums: 'darbuka', bass: 'sustain', harmony: 'pad', voices: { lead: 'oud', harm: 'strings', bass: 'subbass', pad: 'darkpad' }, leadDensity: 0.62, seed: 21 },
  b: { bpm: 140, root: 62, scale: 'phrygianDom', prog: [0, 5, 6, 0], progB: [0, 1, 0, 6], drums: 'surf', bass: 'root8', harmony: 'strum', voices: { lead: 'surf', harm: 'surf', bass: 'synthbass', pad: 'darkpad' }, leadDensity: 0.55, seed: 22 },
});
