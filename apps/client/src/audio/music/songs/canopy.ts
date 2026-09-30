// Canopy Forest — a: acoustic folk-pop with pizzicato 118 BPM (G major, fernwood_hollow); b: taiko + flute 138 BPM (D dorian, cascade_slalom).
import { defineSong } from '../engine.ts';

export default defineSong({
  id: 'canopy',
  a: { bpm: 118, root: 55, scale: 'major', prog: [0, 3, 4, 0], progB: [5, 3, 0, 4], drums: 'pop', bass: 'rootFifth', harmony: 'arp', voices: { lead: 'guitar', harm: 'pizz', bass: 'roundbass', pad: 'warmpad' }, leadDensity: 0.55, leadOctave: 2, seed: 41 },
  b: { bpm: 138, root: 62, scale: 'dorian', prog: [0, 3, 0, 6], progB: [3, 6, 0, 4], drums: 'taiko', bass: 'sustain', harmony: 'pad', voices: { lead: 'flute', harm: 'strings', bass: 'subbass', pad: 'choirpad' }, leadDensity: 0.5, seed: 42 },
});
