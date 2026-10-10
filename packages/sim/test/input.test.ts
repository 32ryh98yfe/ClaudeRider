import { describe, expect, it } from 'vitest';
import { appendDriftRequest, driftRequestAt, driftRequestCount, validDriftRequests, Edge, makeInput, packInput, sanitizeInput, unpackInput } from '@cr/sim';

describe('input packing with latched Drift', () => {
  it('keeps all seven edge bits separate from held, aim and emote in packed ghosts', () => {
    const out = makeInput();
    for (let edges = 0; edges < 128; edges++) {
      for (const steer of [-127, 0, 127]) for (const aim of [0, 7, 255]) for (const emote of [0, 1, 15]) {
        const input = { ...makeInput(), steer, throttle: 15, brake: 15, held: 7, edges, aim, emote };
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


describe('ordered drift request encoding', () => {
  it('round-trips every valid request FIFO with every steering intent inside49 exact bits', () => {
    for (let queue = 0; queue < 512; queue++) {
      if (!validDriftRequests(queue)) continue;
      const count = driftRequestCount(queue);
      expect(count).toBeLessThanOrEqual(4);
      let rebuilt = 0;
      for (let i = 0; i < count; i++) rebuilt = appendDriftRequest(rebuilt, driftRequestAt(queue, i));
      expect(rebuilt).toBe(queue);
      for (const steerIntent of [-1, 0, 1]) {
        const input = { ...makeInput(), steer: -127, steerIntent, driftRequests: queue, throttle: 15, brake: 15, held: 7, edges: 127, aim: 255, emote: 15 };
        const packed = packInput(input);
        expect(Number.isSafeInteger(packed)).toBe(true); expect(packed).toBeLessThan(2 ** 49);
        expect(unpackInput(packed, makeInput())).toEqual(input);
      }
    }
  });
  it('rejects malformed request queues and refuses silent overflow', () => {
    for (const value of [1, 3, 7, 511, 512, -1, NaN, 1.5]) expect(validDriftRequests(value)).toBe(false);
    let queue = 0; for (let i = 0; i < 4; i++) queue = appendDriftRequest(queue, i % 2 ? 1 : -1);
    expect(() => appendDriftRequest(queue, 1)).toThrow(RangeError);
    expect(sanitizeInput({ ...makeInput(), driftRequests: 511, steerIntent: 5 })).toMatchObject({ driftRequests: 0, steerIntent: 1 });
  });
});
