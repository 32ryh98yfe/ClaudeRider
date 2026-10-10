import { describe, expect, it } from 'vitest';
import { appendDriftRequest, driftRequestAt, driftRequestCount, Edge, makeInput, type InputFrame } from '@cr/sim';
import { NetClient, loopbackPair } from '@cr/net';
import { LocalAuthority } from '../src/net/localAuthority.ts';
import { InputTimeline } from '../src/input/timeline.ts';
import type { DriveActions } from '../src/input/actionFilter.ts';
import { raceConfig, testContent, testTrack } from '../../../packages/net/test/helpers.ts';

const raw = (): DriveActions => ({ up: false, down: false, left: false, right: false, drift: false, boost: false });
const requests = (f: InputFrame): number[] => Array.from({ length: driftRequestCount(f.driftRequests) }, (_, i) => driftRequestAt(f.driftRequests, i));

// These include overlapping left/right keys, six distinct Shift pulses inside one physics tick, boost and a short pedal pulse.
const changes: [number, keyof DriveActions, boolean][] = [
  [0, 'up', true], [0, 'left', true], [42, 'drift', true], [44, 'drift', false],
  [45, 'right', true], [46, 'drift', true], [47, 'drift', false], [48, 'left', false],
  [71, 'drift', true], [72, 'drift', false], [73, 'drift', true], [74, 'drift', false],
  [75, 'drift', true], [76, 'drift', false], [77, 'drift', true], [78, 'drift', false],
  [79, 'drift', true], [80, 'drift', false], [81, 'drift', true], [82, 'drift', false],
  [105, 'left', true], [108, 'right', false], [116, 'boost', true], [119, 'boost', false],
  [135, 'down', true], [138, 'down', false], [182, 'left', false], [218, 'up', false],
];

function execute(hz: number, stall = false): { predicted: InputFrame[]; applied: InputFrame[] } {
  const timeline = new InputTimeline(), state = raw(), predicted: InputFrame[] = [], applied: InputFrame[] = [];
  const [client, authority] = loopbackPair(0);
  const track = testTrack(), content = testContent(), cfg = raceConfig({ humans: 1, empty: 7 });
  const local = new LocalAuthority({ config: cfg, track, content, slot: 0, transport: authority });
  local.room.inputObserver = (_tick, slot, input) => { if (slot === 0) applied.push({ ...input }); };
  let now = 0, change = 0;
  const net = new NetClient({ transport: client, track, content, cfg, slot: 0, nowMs: () => now, mode: 'free', maxSteps: 15,
    inputProvider: (_world, out, boundary) => timeline.sample(boundary, out), onOwnInput: (_tick, input) => predicted.push({ ...input }),
  });
  net.update(0);
  for (let frame = 1; frame <= Math.ceil(hz * 0.4); frame++) {
    now = Math.min(400, frame * 1000 / hz);
    // A 150ms main-thread stall delivers all queued DOM transitions together; their source timestamps remain intact.
    if (stall && now > 35 && now < 185) continue;
    while (change < changes.length && changes[change]![0] <= now) {
      const [at, key, on] = changes[change++]!;
      Object.assign(state, { [key]: on }); timeline.enqueue(state, at, on ? [key] : []);
    }
    net.update(now);
  }
  now = 400; net.update(now);
  net.close();
  return { predicted, applied };
}

describe('ordered raw input to authoritative ticks', () => {
  it('preserves every direction and Shift request identically at 30/60/120/144Hz, including a150ms delivery stall', () => {
    const baseline = execute(60);
    expect(baseline.predicted).toHaveLength(24);
    expect(baseline.applied).toEqual(baseline.predicted);
    expect(baseline.predicted.flatMap(requests)).toEqual([-1, 1, 1, 1, 1, 1, 1, 1]);
    for (const hz of [30, 60, 120, 144]) for (const stall of [false, true]) {
      const run = execute(hz, stall);
      expect(run.predicted, `${hz}Hz stall=${stall}`).toEqual(baseline.predicted);
      expect(run.applied, `${hz}Hz authority`).toEqual(run.predicted);
    }
  });

  it('uses last pressed direction during overlap and returns to the remaining held key', () => {
    const timeline = new InputTimeline(), state = raw(), out = makeInput();
    state.left = true; timeline.enqueue(state, 0, ['left']); timeline.sample(40, out);
    state.right = true; timeline.enqueue(state, 40, ['right']); timeline.sample(60, out);
    expect(out.steerIntent).toBe(1); expect(out.steer).toBeGreaterThan(0);
    state.right = false; timeline.enqueue(state, 60); timeline.sample(90, out);
    expect(out.steerIntent).toBe(-1); expect(out.steer).toBeLessThan(0);
  });

  it('gives digital keyboard steering priority over residual analog input and conserves overflow in FIFO order', () => {
    const timeline = new InputTimeline(), state = raw(), out = makeInput();
    state.left = true; state.analogSteer = 0.05; timeline.enqueue(state, 0, ['left']);
    for (let i = 1; i <= 7; i++) timeline.enqueue(state, i, ['drift']);
    timeline.sample(16, out); expect(out.steer).toBeLessThan(0); expect(requests(out)).toEqual([-1, -1, -1, -1]);
    timeline.sample(32, out); expect(requests(out)).toEqual([-1, -1, -1]);
    timeline.sample(48, out); expect(requests(out)).toEqual([]); expect(out.edges & Edge.DRIFT).toBe(0);
  });

  it('cancels unsampled transitions and overflow on reset without replaying them', () => {
    const timeline = new InputTimeline(), state = raw(), out = makeInput();
    state.up = true; timeline.enqueue(state, 4, ['up', 'drift']); timeline.reset(5); timeline.sample(20, out);
    expect(out).toEqual(makeInput());
    expect(appendDriftRequest(0, -1)).toBe(5);
  });
});
