// Ember Mine — a: industrial funk 128 BPM (A minor, geode_rail_quarry); b: heavy synth-rock 160 BPM (E minor, magma_switchback).
import { defineSong } from '../engine.ts';

export default defineSong({
  id: 'ember',
  a: { bpm: 128, root: 57, scale: 'minor', prog: [0, 0, 5, 6], progB: [3, 3, 5, 6], drums: 'funk', bass: 'slap', harmony: 'stabs', voices: { lead: 'powersaw', harm: 'clav', bass: 'distbass', pad: 'darkpad' }, leadDensity: 0.5, seed: 51 },
  b: { bpm: 160, root: 64, scale: 'minor', prog: [0, 5, 3, 6], progB: [0, 6, 5, 4], drums: 'rock', bass: 'octave', harmony: 'strum', voices: { lead: 'supersaw', harm: 'powersaw', bass: 'distbass', pad: 'darkpad' }, leadDensity: 0.6, seed: 52 },
});
