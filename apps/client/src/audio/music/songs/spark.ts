// Spark Circuit — a: stadium EDM 128 BPM (A major, spark_grand_circuit + proving_ring); b: anthemic rock-EDM 134 BPM (D major, sunset_arena_rally).
import { defineSong } from '../engine.ts';

export default defineSong({
  id: 'spark',
  a: { bpm: 128, root: 57, scale: 'major', prog: [0, 4, 5, 3], progB: [5, 3, 0, 4], drums: 'fourFloor', bass: 'octave', harmony: 'stabs', voices: { lead: 'supersaw', harm: 'supersaw', bass: 'synthbass', pad: 'choirpad' }, leadDensity: 0.55, texture: 'crowd', seed: 91 },
  b: { bpm: 134, root: 62, scale: 'major', prog: [0, 4, 5, 3], progB: [3, 0, 4, 4], drums: 'rock', bass: 'root8', harmony: 'strum', voices: { lead: 'supersaw', harm: 'powersaw', bass: 'distbass', pad: 'choirpad' }, leadDensity: 0.55, texture: 'crowd', seed: 92 },
});
