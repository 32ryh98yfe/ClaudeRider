// Key gates baked a hair below a grid point (1299.9999999999998) must still be credited when a kart's raw station
// lands between the gate and the grid point: quantizeWorld rounds sMain past the gate before the next tick compares.
import { describe, expect, it } from 'vitest';
import { advanceLaps } from '../src/race/progress.ts';
import { bakedTrack, makeRig } from './rig.ts';

describe('key gates on the sMain grid', () => {
  it('a gate just below a grid point is credited when quantization rounds the station past it', () => {
    const track = bakedTrack('spark_circuit/spark_grand_circuit');
    const gates = track.keyGates;
    const g = gates.findIndex((s) => Math.abs(s - Math.round(s)) > 0 && Math.abs(s - Math.round(s)) < 1e-9);
    expect(g, 'the roster track still has a gate baked just off the grid').toBeGreaterThanOrEqual(0);
    const rig = makeRig(track, { mode: 'speed' });
    const k = rig.w.karts[0]!;
    k.race.lap = 0; k.race.keyMask = g === 0 ? 0 : (1 << g) - 1;
    const gs = gates[g]!, grid = Math.round(gs * 4096) / 4096;
    // tick A: the raw station stops between the baked gate and its grid point (not past the baked value)
    const rawA = gs - 1e-13;
    advanceLaps(rig.w, k, rig.ctx, gs - 0.5, rawA, track.lapLength);
    // quantizeWorld then stores sMain on the grid, at the grid point above the baked gate
    const stored = Math.round(rawA * 4096) / 4096;
    expect(stored).toBe(grid);
    // tick B: the kart moves on from the stored station
    advanceLaps(rig.w, k, rig.ctx, stored, stored + 0.6, track.lapLength);
    expect((k.race.keyMask >> g) & 1, `gate ${g} at ${gs} credited`).toBe(1);
  });
});
