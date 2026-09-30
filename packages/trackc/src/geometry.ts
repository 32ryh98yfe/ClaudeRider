// Compatibility shim: the M1 geometry module became paths.ts/turtle.ts/frames.ts. aibake.ts (lane L3) and older
// tools import the sample type from here.
export type { Sample, PathModel, TrackModel } from './paths.ts';
export { computeFrames } from './frames.ts';
