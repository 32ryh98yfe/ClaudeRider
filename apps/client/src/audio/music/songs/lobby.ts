// Lobby — chill lo-fi / city-pop, 92 BPM, D major: Rhodes, vinyl crackle, brushed kit, round bass, FM bell lead.
import { defineSong } from '../engine.ts';

export default defineSong({
  id: 'lobby',
  a: { bpm: 92, root: 62, scale: 'major', prog: [0, 5, 1, 4], progB: [3, 4, 2, 5], feel: 'swing', drums: 'brush', bass: 'rootFifth', harmony: 'stabs', voices: { lead: 'bell', harm: 'rhodes', bass: 'roundbass', pad: 'warmpad' }, leadDensity: 0.35, texture: 'vinyl', seed: 3 },
});
