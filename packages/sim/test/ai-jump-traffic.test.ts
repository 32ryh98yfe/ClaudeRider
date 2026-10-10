import { describe, expect, it } from 'vitest';
import { AI_TIERS, createAiDriver, makeInput } from '@cr/sim';
import { planLane, type LaneQuery, type LaneResult } from '../src/ai/avoid.ts';
import { InputDelayLine } from '../src/ai/lookahead.ts';
import { NEUTRAL_PERSONALITY, resolveProfile } from '../src/ai/profiles.ts';
import { flatPlane, jumpKit } from './fixtures/kits.ts';
import { getContent } from './rig.ts';
import { place, racingRig } from './util.ts';

function laneThreats(others: { gap: number; speed: number; height?: number; falling?: boolean }[]): LaneResult {
  const track = flatPlane().track, rig = racingRig(track, { slots: [{}, ...others.map(() => ({}))] });
  const own = place(rig, 0, { s: 300, speed: 17 });
  others.forEach((o, i) => {
    const kart = place(rig, i + 1, { s: 300 + o.gap, speed: o.speed, h: o.height ?? 0 });
    if (o.falling) { kart.body.grounded = 0; kart.body.vy = -5; }
  });
  const q: LaneQuery = {
    slot: 0, sMain: own.race.loc.sMain, path: 0, u: 0, vS: 17, vU: 0, tx: 1, tz: 0, rx: 0, rz: -1,
    hw: 1.4, lineAbs: 0, laneOff: 0, la: 0, straight: false, nextCornerDir: 0,
    nextCornerDist: 100, lineWeight: 1, draftActive: false, wish: NaN, horizon: 1.5, blocks: null,
  };
  const result: LaneResult = { laneOff: 0, ttc: Infinity, closing: 0, actualClosing: 0, drafting: false, overtaking: false, urgent: false };
  planLane(rig.w, track, q, resolveProfile(AI_TIERS.pro, {}, NEUTRAL_PERSONALITY, null), result);
  return result;
}

function followJump(ownSpeed: number, frontSpeed: number, separation: number, declared = true, ticks = 180) {
  const kit = jumpKit(2, declared), rig = racingRig(kit.track, { slots: Array.from({ length: 5 }, () => ({})) });
  rig.run(180);
  const kart = place(rig, 0, { s: kit.lipS - 45, speed: ownSpeed });
  // Occupy all five lane candidates with a four-kart row, without any overlapping bodies.
  [-6, -2, 2, 6].forEach((u, i) => place(rig, i + 1, { s: kit.lipS - 45 + separation, u, speed: frontSpeed }));
  const driver = createAiDriver(kit.track, getContent(), 0, AI_TIERS.pro, { noJitter: true, lookaheadTicks: 8, lineNoise: 0, mistakeRate: 0 }, 41);
  const delay = new InputDelayLine(8), output = makeInput();
  const decisions: { throttle: number; brake: number }[] = [];
  let takeoffSpeed = 0, landed = false;
  rig.run(ticks, (_world, inputs) => {
    driver.decide(rig.w, output); delay.push(output, inputs[0]!);
    decisions.push({ throttle: output.throttle, brake: output.brake });
    for (let i = 1; i < inputs.length; i++) inputs[i]!.throttle = 15;
    if (kart.body.airTicks === 1 && takeoffSpeed === 0) takeoffSpeed = Math.hypot(kart.body.vx, kart.body.vy, kart.body.vz);
    if (takeoffSpeed > 0 && kart.body.grounded && kart.race.loc.s > kit.landS0) landed = true;
  });
  return { decisions, takeoffSpeed, landed, stats: kart.stats, minimum: kit.track.jumps[0]?.vMin ?? 0 };
}

describe('jump approach traffic', () => {
  it('retains lane-spacing caution while distinguishing a faster leader from physical closing', () => {
    const r = laneThreats([{ gap: 2.6, speed: 19 }]);
    expect(r.ttc).toBeCloseTo(0.4, 3);
    expect(r.closing).toBe(2);
    expect(r.actualClosing).toBe(-2);
  });

  it('keeps a second real approach even when a faster leader has the earlier synthetic TTC', () => {
    const r = laneThreats([{ gap: 2.6, speed: 19 }, { gap: 4.3, speed: 12 }]);
    expect(r.ttc).toBeCloseTo(0.4, 3);
    expect(r.closing).toBe(2);
    expect(r.actualClosing).toBe(5);
  });

  it('does not hide an already overlapping slower kart behind a faster forward leader', () => {
    const r = laneThreats([{ gap: 2.6, speed: 19 }, { gap: 1, speed: 12 }]);
    expect(r.ttc).toBeCloseTo(0.4, 3);
    expect(r.actualClosing).toBe(5);
  });

  it('ignores a jumper already falling below the ramp while retaining nearby airborne traffic', () => {
    const below = laneThreats([{ gap: 12, speed: -10, height: -3, falling: true }]);
    expect(below.ttc).toBe(Infinity); expect(below.actualClosing).toBe(0);
    const above = laneThreats([{ gap: 12, speed: -10, height: 1, falling: true }]);
    expect(above.ttc).toBeLessThan(0.5); expect(above.actualClosing).toBe(27);
  });

  it('accelerates below the lip minimum behind faster traffic and clears a real gap', () => {
    const r = followJump(17, 19, 4.7);
    expect(r.decisions.slice(0, 12).every((d) => d.throttle === 15 && d.brake === 0)).toBe(true);
    expect(r.takeoffSpeed).toBeGreaterThanOrEqual(r.minimum);
    expect(r.landed).toBe(true);
    expect(r.stats.respawns).toBe(0);
    expect(r.stats.hardHits).toBe(0);
  });

  it('still brakes above the launch floor for a genuinely slower row on the jump approach', () => {
    const r = followJump(32, 15, 15, true, 20);
    expect(r.decisions.some((d) => d.brake === 15 && d.throttle === 0)).toBe(true);
  });

  it('keeps the launch floor when traffic closing would otherwise brake a committed jumper below it', () => {
    const r = followJump(23, 15, 7, true, 20);
    expect(r.decisions.every((d) => d.brake === 0 && d.throttle === 15)).toBe(true);
  });

  it('leaves the existing traffic response unchanged without a declared jump', () => {
    const r = followJump(17, 19, 4.7, false, 20);
    expect(r.decisions.some((d) => d.throttle === 0 && d.brake === 0)).toBe(true);
  });
});
