// F5: analytic hazards. HAZ lines bake to parameters; BakedTrack.hazardPose is a pure function of the tick.
import { describe, expect, it } from 'vitest';
import { CTRK_MAGIC, CTRK_VERSION, CVIS_MAGIC, CVIS_VERSION, SMP, readContainer, toArrayBuffer, type HazardPose } from '@cr/sim';
import { bake, bakeSrc, frame, reload } from './helpers.ts';
import { TrackDslError } from '../src/dsl.ts';

const r = bake('_test/f5_hazards.ctd');
const t = reload(r);
const H = (name: string): number => t.hazards.findIndex((h) => h.name === name);
const pose = (): HazardPose => ({ x: 0, y: 0, z: 0, active: 0, telegraph: 0, fx: 0, fy: 0, fz: 0, ux: 0, uy: 0, uz: 0, phase: 0 });

/** pose relative to the track frame at s: (along, across, up) */
function local(s: number, p: HazardPose): { a: number; u: number; h: number } {
  const f = frame();
  t.frameAt(0, s, f);
  const dx = p.x - f.px, dy = p.y - f.py, dz = p.z - f.pz;
  return { a: dx * f.tx + dy * f.ty + dz * f.tz, u: dx * f.rx + dy * f.ry + dz * f.rz, h: dx * f.ux + dy * f.uy + dz * f.uz };
}

describe('F5 hazard fixture', () => {
  it('bakes with zero errors; all five kinds, traffic expanded per vehicle into one group', () => {
    expect(r.findings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(t.hazards.map((h) => h.id)).toEqual(t.hazards.map((_, i) => i));
    expect(new Set(t.hazards.map((h) => h.kind))).toEqual(new Set(['geyser', 'press', 'train', 'traffic', 'swinger']));
    const cars = t.hazards.filter((h) => h.kind === 'traffic');
    expect(cars.length).toBe(5);
    expect(new Set(cars.map((h) => h.group))).toEqual(new Set([cars[0]!.id]));
    expect(t.hazards.filter((h) => h.kind !== 'traffic').every((h) => h.group === undefined)).toBe(true);
    const g = t.hazards[H('vent2')]!;
    expect([g.periodTicks, g.activeFrom, g.activeTo, g.telegraphTicks, g.offsetTicks]).toEqual([216, 0, 60, 48, 72]);
    expect(g.effect).toBe('launch');
    expect(t.hazards[H('stamp')]!.effect).toBe('squash');
    expect(t.hazards[H('freight')]!.effect).toBe('spin');
  });

  it('the .vis carries one hazard record per baked hazard, with its kit prop and size', () => {
    const vis = readContainer(toArrayBuffer(r.vis), CVIS_MAGIC, CVIS_VERSION);
    const hz = (vis.meta as { hazards: { id: number; kind: string; size: number[]; prop: string; shape: string }[] }).hazards;
    expect(hz.length).toBe(t.hazards.length);
    for (const [i, h] of t.hazards.entries()) {
      expect(hz[i]!.id).toBe(h.id);
      expect(hz[i]!.kind).toBe(h.kind);
      expect(hz[i]!.size).toEqual(h.size);
      expect(hz[i]!.prop).toMatch(/^hazard_/);
    }
    expect(hz[H('freight')]!.shape).toBe('box');
    expect(hz[H('vent1')]!.shape).toBe('cyl');
  });

  it('geyser: active for `on`, telegraphed for `tele` before it, phase-shifted by `offset`', () => {
    const p = pose(), h = t.hazards[H('vent2')]!;
    const at = (tick: number): [number, number] => { t.hazardPose(H('vent2'), tick, p); return [p.active, p.telegraph]; };
    // offset 72: phase = (tick + 72) mod 216
    expect(at(144)).toEqual([1, 0]);          // phase 0
    expect(at(144 + 59)).toEqual([1, 0]);     // phase 59
    expect(at(144 + 60)).toEqual([0, 0]);     // phase 60
    expect(at(144 - 48)).toEqual([0, 1]);     // phase 168 = 216 − 48
    expect(at(144 - 49)).toEqual([0, 0]);
    expect(at(144 + 216 * 7)).toEqual([1, 0]);
    const q = local(h.s, p);
    expect(q.u).toBeCloseTo(-3, 6);
    expect(Math.abs(q.a)).toBeLessThan(1e-6);
    expect(q.h).toBeCloseTo(0, 6);
  });

  it('press: raised by `rise` while idle, down on the road mid-stroke, eased at both ends', () => {
    const p = pose(), i = H('stamp'), h = t.hazards[i]!;
    t.hazardPose(i, 200, p); expect(p.active).toBe(0); expect(local(h.s, p).h).toBeCloseTo(4, 6);
    t.hazardPose(i, 45, p); expect(p.active).toBe(1); expect(local(h.s, p).h).toBeCloseTo(0, 6);
    t.hazardPose(i, 6, p); expect(local(h.s, p).h).toBeCloseTo(2, 6);   // half-way down its 12-tick ramp
    t.hazardPose(i, 239, p); expect(p.telegraph).toBe(1);
  });

  it('pendulum swinger: hangs straight down at phase 0, swings amp° across the road at phase ¼', () => {
    const p = pose(), i = H('pendulum'), h = t.hazards[i]!;
    t.hazardPose(i, 0, p);
    let q = local(h.s, p);
    expect(q.u).toBeCloseTo(0, 6); expect(q.h).toBeCloseTo(1.5, 6);   // pivot 7.5 − arm 6
    t.hazardPose(i, 45, p);                                             // period 180 → phase ¼
    q = local(h.s, p);
    expect(q.u).toBeCloseTo(6 * Math.sin(Math.PI / 3), 4);
    expect(q.h).toBeCloseTo(7.5 - 6 * Math.cos(Math.PI / 3), 4);
    expect(p.active).toBe(1);
  });

  it('flat sweeper: one turn per period at pivot height, tip down-track at phase 0 and to the right at ¼', () => {
    const p = pose(), i = H('sweeper'), h = t.hazards[i]!;
    t.hazardPose(i, 0, p);
    let q = local(h.s, p);
    expect(q.a).toBeCloseTo(6, 4); expect(q.u).toBeCloseTo(0, 4); expect(q.h).toBeCloseTo(1, 6);
    t.hazardPose(i, 60, p);
    q = local(h.s, p);
    expect(q.a).toBeCloseTo(0, 4); expect(q.u).toBeCloseTo(6, 4);
  });

  it('train: crosses the road −span → +span during the active window, parked well off it otherwise', () => {
    const p = pose(), i = H('freight'), h = t.hazards[i]!;
    // offset 240 → phase 0 at tick 480
    t.hazardPose(i, 480, p); expect(p.active).toBe(1); expect(local(h.s, p).u).toBeCloseTo(-25, 4);
    t.hazardPose(i, 480 + 90, p); expect(local(h.s, p).u).toBeCloseTo(0, 4);
    t.hazardPose(i, 480 + 200, p); expect(p.active).toBe(0); expect(Math.abs(local(h.s, p).u)).toBeGreaterThan(40);
    t.hazardPose(i, 480 - 60, p); expect(p.telegraph).toBe(1);
  });

  it('traffic: vehicles run their lane at speed, `spacing` apart, and wrap without a jump', () => {
    const cars = t.hazards.map((h, i) => ({ h, i })).filter((c) => c.h.kind === 'traffic');
    const lane = cars.filter((c) => c.h.u === -6);
    const p = pose(), f = frame();
    const sOf = (i: number, tick: number): number => {
      t.hazardPose(i, tick, p);
      // project back onto the path: the pose sits on the centreline offset by u
      const h = t.hazards[i]!, mo = h.motion!;
      let best = 0, bd = 1e30;
      for (let s = mo.s0!; s <= mo.s1!; s += 0.25) {
        t.frameAt(0, s, f);
        const d = (f.px + f.rx * h.u - p.x) ** 2 + (f.pz + f.rz * h.u - p.z) ** 2;
        if (d < bd) { bd = d; best = s; }
      }
      return best;
    };
    const span = lane[0]!.h.motion!.s1! - lane[0]!.h.motion!.s0!;
    for (const tick of [0, 500, 1285]) {
      const s0 = sOf(lane[0]!.i, tick), s1 = sOf(lane[1]!.i, tick);
      const gap = (((s0 - s1) % span) + span) % span;
      expect(Math.abs(gap - 45)).toBeLessThan(0.6);
    }
    // continuity: ≤ v·dt per tick everywhere except the single wrap back to s0
    let wraps = 0, prev = sOf(lane[0]!.i, 0);
    for (let tick = 1; tick <= lane[0]!.h.periodTicks + 2; tick += 1) {
      const s = sOf(lane[0]!.i, tick);
      const d = s - prev;
      if (d < -span / 2) wraps++; else expect(Math.abs(d - 14 / 60)).toBeLessThan(0.3);
      prev = s;
    }
    expect(wraps).toBe(1);
  });

  it('poses are pure functions of the tick (same inputs → identical bits, any evaluation order)', () => {
    const a = pose(), b = pose();
    for (let i = 0; i < t.hazards.length; i++) {
      for (const tick of [0, 17, 999, 123457]) {
        t.hazardPose(i, tick, a);
        t.hazardPose((i + 3) % t.hazards.length, tick + 5, b);
        t.hazardPose(i, tick, b);
        expect(b).toEqual(a);
      }
    }
  });

  it('no respawn slot within 8 m (plus the reach) of a fixed hazard', () => {
    const c = readContainer(toArrayBuffer(r.ctrk), CTRK_MAGIC, CTRK_VERSION);
    const smp = c.arrays.get('p0.smp')!, rok = c.arrays.get('p0.rok') as Uint8Array;
    for (const h of t.hazards) {
      if (h.motion?.type === 'lane') continue;
      for (let i = 0; i < rok.length; i++) {
        const s = smp[i * SMP.STRIDE + SMP.S]!;
        if (Math.abs(s - h.s) < 8) expect(rok[i], `${h.name} s=${s}`).toBe(0);
      }
    }
  });
});

// ------------------------------------------------------------------------------------------------ V12 + syntax
const RING = (haz: string, extra = ''): string => `TRACK v12 name="V12" theme=spark_circuit diff=2 laps=3 topo=circuit
DEFAULTS w=16 surf=asphalt wall=barrier:1.0
START pos=(0,0,0) hdg=0
S ?a @home
C R60 180 L
S ?a @back
C R60 180 L
CLOSE solve=[?a] length=1200
${haz}
${extra}
`;
const v12 = (src: string): string[] => bakeSrc(src).findings.filter((f) => f.rule === 'V12').map((f) => f.msg);

describe('V12 hazard fairness (seeded violations)', () => {
  it('a fair geyser passes', () => {
    expect(v12(RING('HAZ geyser at=@home+100 d=0 r=3 period=3.6 on=0-1.0 tele=0.8 offset=0'))).toEqual([]);
  });
  it('period < 2 s', () => {
    expect(v12(RING('HAZ geyser at=@home+100 d=0 r=3 period=1.5 on=0-0.5 tele=0.7 offset=0'))).toEqual([expect.stringMatching(/period 90 ticks < 120/)]);
  });
  it('active more than half the period', () => {
    expect(v12(RING('HAZ press at=@home+100 d=0 period=4 on=0-2.5 tele=0.8 offset=0'))).toEqual([expect.stringMatching(/active 150 of 240/)]);
  });
  it('telegraph < 0.6 s', () => {
    expect(v12(RING('HAZ geyser at=@home+100 d=0 r=3 period=4 on=0-1 tele=0.3 offset=0'))).toEqual([expect.stringMatching(/telegraph 18 ticks < 36/)]);
  });
  it('traffic that leaves no safe lane', () => {
    const lanes = 'lanes=[(d -6, speed 12, count 2, spacing 50),(d -2, speed 12, count 2, spacing 50),(d 2, speed 12, count 2, spacing 50),(d 6, speed 12, count 2, spacing 50)]';
    expect(v12(RING(`HAZ traffic at=@back+50 to=@back+300 ${lanes}`))).toEqual([expect.stringMatching(/no safe lane/)]);
  });
  it('an item row inside a traffic run or within 15 m of a hazard', () => {
    expect(v12(RING('HAZ traffic at=@back+50 to=@back+300 lanes=[(d -5, speed 12, count 2, spacing 50)]', 'ITEMS at=@back+200 n=5'))).toEqual([expect.stringMatching(/within ±15 m of an item row/)]);
    expect(v12(RING('HAZ geyser at=@home+100 d=0 r=3 period=3.6 on=0-1 tele=0.8 offset=0', 'ITEMS at=@home+110 n=5'))).toEqual([expect.stringMatching(/within ±15 m of an item row/)]);
  });
});

describe('HAZ syntax', () => {
  it('rejects unknown kinds, bad boxes, bad effects and lanes that go nowhere', () => {
    expect(() => bakeSrc(RING('HAZ volcano at=10 d=0'))).toThrow(TrackDslError);
    expect(() => bakeSrc(RING('HAZ press at=10 d=0 box=(4,4)'))).toThrow(/box=\(along,across,up\)/);
    expect(() => bakeSrc(RING('HAZ geyser at=10 d=0 effect=explode'))).toThrow(/effect=explode/);
    expect(() => bakeSrc(RING('HAZ traffic at=10 to=200 lanes=[(d 0, speed 0.2, count 1, spacing 10)]'))).toThrow(/lane speed/);
  });
  it('the same source bakes to identical bytes', () => {
    const src = RING('HAZ swinger at=@home+100 d=0 motion=rotate plane=flat arm=5 period=3');
    expect(Buffer.compare(Buffer.from(bakeSrc(src).ctrk), Buffer.from(bakeSrc(src).ctrk))).toBe(0);
    expect(reload(bakeSrc(src)).hazards[0]!.motion).toEqual({ type: 'rotate', arm: 5, pivotH: 6.5, plane: 'flat' });
  });
});
