import { describe, expect, it } from 'vitest';
import { AI_TIERS, Edge, Held, copyInput, makeInput } from '@cr/sim';
import { createItemBrain, decideItem } from '../src/ai/items/index.ts';
import { InputDelayLine } from '../src/ai/lookahead.ts';
import { EF, EFlag, Res } from '../src/items/codes.ts';
import { scheduleEffect } from '../src/items/effects.ts';
import { scenario } from './items-rig.ts';

function setup() {
  const sc = scenario({ count: 1 });
  sc.until(() => sc.w.tick >= sc.w.goTick + 120);
  return { sc, brain: createItemBrain(0, AI_TIERS.pro, {}, 5) };
}

function frame() { const out = makeInput(); out.steer = -76; out.edges = Edge.TAP_L; return out; }

describe('Mirror compensation at queued input application time', () => {
  it('stops compensating when an active effect expires inside the eight-tick queue', () => {
    const { sc, brain } = setup();
    const effect = scheduleEffect(sc.w, sc.ctx, EF.mirror, 0, 0, sc.w.tick - 10, 15, 0, 0, 1)!;
    effect.flags |= EFlag.RESOLVED;
    const lastActive = frame();
    decideItem(brain, sc.w, sc.ctx, lastActive, effect.end - 1);
    expect(lastActive.steer).toBe(76);
    expect(lastActive.edges & (Edge.TAP_L | Edge.TAP_R)).toBe(Edge.TAP_R);
    const expired = frame();
    decideItem(brain, sc.w, sc.ctx, expired, sc.w.tick + 9);
    expect(expired.steer).toBe(-76);
    expect(expired.edges & (Edge.TAP_L | Edge.TAP_R)).toBe(Edge.TAP_L);
  });

  it('compensates a telegraphed future start only when the queued input reaches that interval', () => {
    const { sc, brain } = setup();
    const effect = scheduleEffect(sc.w, sc.ctx, EF.mirror, 0, 0, sc.w.tick + 6, 150, 0, 0, 2)!;
    const before = frame();
    decideItem(brain, sc.w, sc.ctx, before, effect.start - 1);
    expect(before.steer).toBe(-76);
    const atStart = frame();
    decideItem(brain, sc.w, sc.ctx, atStart, effect.start);
    expect(atStart.steer).toBe(76);
    expect(atStart.edges & (Edge.TAP_L | Edge.TAP_R)).toBe(Edge.TAP_R);
    // It is still a forecast: querying it must not resolve or otherwise mutate the effect.
    expect(effect.flags & EFlag.RESOLVED).toBe(0);
  });

  it('defaults to the next physics tick, including exact start and exclusive end boundaries', () => {
    const { sc, brain } = setup();
    const effect = scheduleEffect(sc.w, sc.ctx, EF.mirror, 0, 0, sc.w.tick + 1, 150, 0, 0, 3)!;
    const start = frame();
    decideItem(brain, sc.w, sc.ctx, start);
    expect(start.steer).toBe(76);
    effect.start = sc.w.tick - 10; effect.end = sc.w.tick + 1; effect.flags |= EFlag.RESOLVED;
    const end = frame();
    decideItem(brain, sc.w, sc.ctx, end);
    expect(end.steer).toBe(-76);
  });

  it.each([EFlag.DEAD, EFlag.ENDED])('does not compensate a cancelled Mirror interval (flag %i)', (flag) => {
    const { sc, brain } = setup();
    const effect = scheduleEffect(sc.w, sc.ctx, EF.mirror, 0, 0, sc.w.tick + 1, 150, 0, 0, 4)!;
    effect.flags |= flag;
    const out = frame(); decideItem(brain, sc.w, sc.ctx, out, sc.w.tick + 9);
    expect(out.steer).toBe(-76);
  });

  it('does not compensate an effect already resolved as shielded', () => {
    const { sc, brain } = setup();
    const effect = scheduleEffect(sc.w, sc.ctx, EF.mirror, 0, 0, sc.w.tick, 150, 0, 0, 5)!;
    effect.flags |= EFlag.RESOLVED; effect.result = Res.SHIELDED;
    const out = frame(); decideItem(brain, sc.w, sc.ctx, out, sc.w.tick + 9);
    expect(out.steer).toBe(-76);
  });

  it.each([0, 8])('keeps real kart motion identical across Mirror start/end with a %i-tick input queue', (delay) => {
    const { sc, brain } = setup(), control = setup().sc;
    const start = sc.w.tick + 13, end = start + 20;
    scheduleEffect(sc.w, sc.ctx, EF.mirror, 0, 0, start, end - start, 0, 0, 6);
    const queue = new InputDelayLine(delay), plainQueue = new InputDelayLine(delay);
    const intended = makeInput(), compensated = makeInput(), applied = makeInput(), plainApplied = makeInput();
    let sawDrift = false;
    for (let i = 0; i < 66; i++) {
      const applyTick = sc.w.tick + 1 + delay;
      intended.throttle = 15; intended.steer = -76;
      intended.held = applyTick >= end + 4 && applyTick < end + 10 ? Held.DRIFT : 0;
      intended.edges = applyTick === end + 4 ? Edge.TAP_L : 0;
      copyInput(compensated, intended);
      decideItem(brain, sc.w, sc.ctx, compensated, applyTick);
      queue.push(compensated, applied); plainQueue.push(intended, plainApplied);
      sc.tick((_w, inputs) => copyInput(inputs[0]!, applied));
      control.tick((_w, inputs) => copyInput(inputs[0]!, plainApplied));
      expect(sc.w.karts[0]!.body, `motion at tick ${sc.w.tick}`).toEqual(control.w.karts[0]!.body);
      expect(sc.w.karts[0]!.drive.driftDir).toBe(1);
      if (sc.w.karts[0]!.drive.drift) sawDrift = true;
    }
    expect(sawDrift).toBe(true);
  });
});
