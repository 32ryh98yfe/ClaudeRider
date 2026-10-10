import { describe, expect, it } from 'vitest';
import { appendDriftRequest, driftRequestAt, driftRequestCount, Edge, makeInput, type InputFrame } from '@cr/sim';
import { encodeWith, InputMsg, loopbackPair } from '@cr/net';
import { RaceRoom } from '../src/RaceRoom.ts';
import { raceConfig, testContent, testTrack } from '../../net/test/helpers.ts';

const frame = (directions: number[]): InputFrame => {
  let driftRequests = 0; for (const direction of directions) driftRequests = appendDriftRequest(driftRequests, direction);
  return { ...makeInput(), throttle: 15, steer: 80, steerIntent: 1, edges: Edge.DRIFT, driftRequests };
};
const directions = (input: InputFrame): number[] => Array.from({ length: driftRequestCount(input.driftRequests) }, (_, i) => driftRequestAt(input.driftRequests, i));

describe('authoritative ordered late inputs', () => {
  it('preserves13requests across late/current packets, four per tick, without duplicating other one-shots', () => {
    const room = new RaceRoom({ config: raceConfig({ humans: 1, empty: 7 }), track: testTrack(), content: testContent() });
    const [client, server] = loopbackPair(0);
    room.attach({ id: 'ordered', slot: 0, transport: server, resumeToken: '0'.repeat(32) });
    for (let i = 0; i < 10; i++) room.tick();
    const got: InputFrame[] = [];
    room.inputObserver = (_tick, slot, input) => { if (slot === 0) got.push({ ...input }); };
    const late = [frame([-1, 1, 0]), frame([1, -1, 1]), frame([0, 0, -1]), frame([-1, -1, 1])];
    client.send(encodeWith(InputMsg, { firstTick: 2, ackEventSeq: 0, frames: late }));
    const current = frame([1]); current.edges |= Edge.USE_ITEM;
    client.send(encodeWith(InputMsg, { firstTick: 11, ackEventSeq: 0, frames: [current] }));
    for (let i = 0; i < 5; i++) room.tick();
    expect(got.map((f) => driftRequestCount(f.driftRequests))).toEqual([4,4,4,1,0]);
    expect(got.flatMap(directions)).toEqual([...late.flatMap(directions), 1]);
    expect(got.map((f) => !!(f.edges & Edge.USE_ITEM))).toEqual([true,false,false,false,false]);
  });
});
