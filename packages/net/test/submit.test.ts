// NetClient.submit (B9): the client samples input once per rendered frame and the predictor consumes it once per
// tick. Brake and throttle presses shorter than a tick (a 1-frame tap at 144 Hz, a sample whose frame advanced no
// tick at 60 Hz) must still reach a tick, and a frame that advances two ticks must not stretch its sample over both.
import { describe, expect, it } from 'vitest';
import { Edge, Held, hashWorld, makeInput, type InputFrame } from '@cr/sim';
import { NetClient, type Transport } from '../src/index.ts';
import { mulberry, raceConfig, testContent, testTrack } from './helpers.ts';

const track = testTrack();
const content = testContent();
const cfg = raceConfig({ humans: 1, empty: 7 });

const nowhere = (): Transport => ({ id: 'nowhere', onMessage: null, onClose: null, send: () => { /* offline */ }, close: () => { /* offline */ }, bufferedAmount: () => 0 });

/** A 'free' (local 60 Hz clock) NetClient that records `field` of every predicted tick's own frame. */
function client(field: 'brake' | 'throttle'): { nc: NetClient; got: number[]; at: (ms: number) => void } {
  let now = 0;
  const got: number[] = [];
  const nc = new NetClient({
    transport: nowhere(), track, content, cfg, slot: 0, nowMs: () => now, mode: 'free', maxSteps: 5,
    onOwnInput: (_t, f) => { got.push(f[field]); },
  });
  return { nc, got, at: (ms) => { now = ms; } };
}

/** One rendered frame like the client's Session: sample → submit → update. */
function frame(c: ReturnType<typeof client>, ms: number, field: 'brake' | 'throttle', value: number): void {
  const f: InputFrame = makeInput();
  f[field] = value;
  c.at(ms);
  c.nc.submit(f);
  c.nc.update(ms);
}

/**
 * Frames at `hz` (frame k at phase + k/hz, ± `jitterMs` of vsync jitter) with `field` = 15 on frames
 * [from, from + frames) and `base` elsewhere. Returns the field per predicted tick.
 */
function render(hz: number, phaseMs: number, field: 'brake' | 'throttle', from: number, frames: number, jitterMs = 0, seed = 1): number[] {
  const c = client(field), rnd = mulberry(seed);
  for (let k = 0; k < from + frames + Math.ceil(hz / 6); k++) {
    frame(c, phaseMs + (k * 1000) / hz + (jitterMs ? (rnd() * 2 - 1) * jitterMs : 0), field, k >= from && k < from + frames ? 15 : 0);
  }
  return c.got;
}
const pressed = (xs: number[]): number => xs.filter((x) => x > 0).length;
/** Number of separate runs of pressed ticks. */
const runs = (xs: number[]): number => xs.filter((x, i) => x > 0 && !(xs[i - 1]! > 0)).length;

describe('NetClient.submit: every sample reaches one tick', () => {
  it('merges a sub-tick drift press/release into exactly one latched edge while retaining the released held state', () => {
    let now = 0;
    const got: InputFrame[] = [];
    const nc = new NetClient({ transport: nowhere(), track, content, cfg, slot: 0, nowMs: () => now,
      mode: 'free', maxSteps: 5, onOwnInput: (_t, f) => { got.push({ ...f }); },
    });
    const send = (ms: number, held = 0, edges = 0): void => {
      now = ms; nc.submit({ ...makeInput(), steer: 127, throttle: 15, held, edges }); nc.update(now);
    };
    send(0); send(5, Held.DRIFT, Edge.DRIFT); send(10); send(17);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ steer: 127, throttle: 15, held: 0, edges: Edge.DRIFT });
    send(34); send(67);
    expect(got.slice(1).every((f) => f.edges === 0 && f.held === 0)).toBe(true);
    nc.close();
  });

  it('entering a menu clears unsent Drift/steering and held fallback without changing the world or sent tick history', () => {
    let now = 0;
    const got: { tick: number; input: InputFrame }[] = [];
    const nc = new NetClient({ transport: nowhere(), track, content, cfg, slot: 0, nowMs: () => now,
      mode: 'free', maxSteps: 5, onOwnInput: (tick, f) => { got.push({ tick, input: { ...f } }); },
    });
    const advance = (ms: number): void => { now = ms; nc.update(now); };
    advance(0);
    nc.submit({ ...makeInput(), steer: 127, throttle: 15, held: Held.DRIFT, edges: Edge.DRIFT });
    advance(17);
    expect(got).toHaveLength(1);
    nc.submit({ ...makeInput(), steer: -127, throttle: 15, held: Held.DRIFT, edges: Edge.DRIFT | Edge.USE_ITEM });
    advance(22); // no tick: this sample is still queued when Escape opens the menu
    const stateBefore = hashWorld(nc.world), tickBefore = nc.world.tick;
    const sentBefore = structuredClone(got);
    nc.clearPendingInput();
    expect(hashWorld(nc.world)).toBe(stateBefore);
    expect(nc.world.tick).toBe(tickBefore);
    expect(got).toEqual(sentBefore);
    advance(67); // no new sample: every fallback tick after the menu must now be neutral
    expect(got.slice(1).map((entry) => entry.tick)).toEqual([tickBefore + 1, tickBefore + 2, tickBefore + 3]);
    for (const entry of got.slice(1)) expect(entry.input).toEqual(makeInput());
    expect(got[0]).toEqual(sentBefore[0]);
    nc.submit({ ...makeInput(), steer: -127, throttle: 15, edges: Edge.DRIFT });
    advance(84);
    expect(got.at(-1)?.input).toMatchObject({ steer: -127, throttle: 15, edges: Edge.DRIFT });
    nc.close();
  });

  it('a 1-frame tap in a frame that advanced no tick is merged into the next tick, not lost', () => {
    // free clock (the first update only starts it): 16.7 ms → one tick; +10 ms → 0.6 ticks (none); +23.4 ms → two:
    // A goes to the first of them, B to the second
    for (const [a, b, want] of [[15, 0, [0, 15, 0]], [0, 15, [0, 0, 15]]] as const) {
      const c = client('brake');
      frame(c, 0, 'brake', 0);
      frame(c, 16.7, 'brake', 0);
      frame(c, 26.7, 'brake', a);
      expect(c.got).toEqual([0]);
      frame(c, 50.1, 'brake', b);
      expect(c.got).toEqual(want);
    }
    // three samples, one tick: the press wins (brake and throttle keep their strongest sample)
    const c = client('brake');
    frame(c, 0, 'brake', 0); frame(c, 5, 'brake', 0); frame(c, 10, 'brake', 15); frame(c, 17, 'brake', 0);
    expect(c.got).toEqual([15]);
  });

  it('a frame that advances two ticks does not stretch its 1-frame tap over both', () => {
    // 16.7 ms → one tick; 50 ms → two more: the first of them holds the previous sample, the tap lands on the second
    const c = client('brake');
    frame(c, 0, 'brake', 0);
    frame(c, 16.7, 'brake', 0);
    frame(c, 50.01, 'brake', 15);
    frame(c, 66.7, 'brake', 0);
    expect(c.got).toEqual([0, 0, 15, 0]);
  });

  it('60 Hz: an N-frame brake tap is N ± 1 brake ticks (never 0), one run, in every phase and with ±1 ms or ±3 ms vsync jitter', () => {
    for (let N = 1; N <= 12; N++) {
      for (const jit of [0, 1, 3]) {
        for (let ph = 0; ph < 24; ph++) {
          const ticks = render(60, (ph * 1000) / 60 / 24, 'brake', 20, N, jit, ph + 1);
          const n = pressed(ticks), at = `N ${N} ±${jit} phase ${ph}`;
          expect(n, at).toBeGreaterThanOrEqual(Math.max(1, N - 1));
          expect(n, at).toBeLessThanOrEqual(N + 1);
          expect(runs(ticks), at).toBe(1);
        }
      }
    }
  });

  it('144 Hz: a 1-frame brake tap is never lost; N-frame taps give the ticks they overlap (⌊N·60/144⌋ … ⌈N·60/144⌉ + 1)', () => {
    for (let N = 1; N <= 24; N++) {
      for (const jit of [0, 1]) {
        for (let ph = 0; ph < 24; ph++) {
          const ticks = render(144, (ph * 1000) / 144 / 24, 'brake', 30, N, jit, ph + 1);
          const n = pressed(ticks), span = (N * 60) / 144, at = `N ${N} ±${jit} phase ${ph}`;
          expect(n, at).toBeGreaterThanOrEqual(Math.max(1, Math.floor(span)));
          expect(n, at).toBeLessThanOrEqual(Math.ceil(span) + 1);
          expect(runs(ticks), at).toBe(1);
          expect(ticks.at(-1), at).toBe(0); // released afterwards: a merged press is never reused
        }
      }
    }
  });

  it('144 Hz: a 1-frame throttle re-press reaches a tick that follows a released one (the instant-boost edge)', () => {
    for (let ph = 0; ph < 24; ph++) {
      const ticks = render(144, (ph * 1000) / 144 / 24, 'throttle', 30, 1, 1, ph + 1);
      expect(pressed(ticks), `phase ${ph}`).toBeGreaterThanOrEqual(1);
      expect(ticks[ticks.findIndex((x) => x > 0) - 1], `phase ${ph}`).toBe(0);
    }
  });
});
