import { describe, expect, it } from 'vitest';
import { Edge, makeInput, packInput, sanitizeInput, unpackInput } from '@cr/sim';

describe('input packing with latched Drift', () => {
  it('keeps all seven edge bits separate from held, aim and emote in packed ghosts', () => {
    const out = makeInput();
    for (let edges = 0; edges < 128; edges++) {
      for (const steer of [-127, 0, 127]) for (const aim of [0, 7, 255]) for (const emote of [0, 1, 15]) {
        const input = { steer, throttle: 15, brake: 15, held: 7, edges, aim, emote };
        const packed = packInput(input);
        expect(Number.isSafeInteger(packed)).toBe(true);
        expect(unpackInput(packed, out)).toEqual(input);
      }
    }
  });

  it('sanitizes the reserved high edge bit while preserving a short Drift press', () => {
    const input = { ...makeInput(), held: 255, edges: 255 };
    sanitizeInput(input);
    expect(input.held).toBe(7);
    expect(input.edges).toBe(127);
    expect(input.edges & Edge.DRIFT).toBe(Edge.DRIFT);
  });
});
