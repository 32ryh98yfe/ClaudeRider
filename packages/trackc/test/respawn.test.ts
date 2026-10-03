// Respawn tables × jumps: a kart that dies in a J gap must come back past the gap, not on the ramp at v = 0
// (which cannot reach vMin, so it fell into the same gap forever: the meadow_loop item-race regression).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CTRK_MAGIC, CTRK_VERSION, SMP, StartTier, copyLoc, readContainer, toArrayBuffer, type BakedTrack, type SimEvent, type TrackLoc } from '@cr/sim';
import { bake, reload } from './helpers.ts';
import { place, simRig, type SimRig } from './simrig.ts';
import { runUp } from '../src/respawn.ts';

const r = bake('_test/f2_jumps.ctd');
const t = reload(r);
const J = t.jumps[0]!;
const ramp = J.rampS ?? J.lipS;
const c = readContainer(toArrayBuffer(r.ctrk), CTRK_MAGIC, CTRK_VERSION);
const smp = c.arrays.get('p0.smp')!, rok = c.arrays.get('p0.rok') as Uint8Array, rto = c.arrays.get('p0.rto') as Int32Array;
const sAt = (i: number): number => smp[i * SMP.STRIDE + SMP.S]!;
const sMainAt = (i: number): number => smp[i * SMP.STRIDE + SMP.SMAIN]!;
const n = rto.length;

/** L1's respawn.ts copies respawnLoc() into race.loc and lastValid once it adopts docs/design/contract-requests/L4-respawn-jumps.md. */
const RESPAWN_SRC = readFileSync(new URL('../../sim/src/race/respawn.ts', import.meta.url), 'utf8');
const L1_ADOPTED = RESPAWN_SRC.includes('respawnLoc');

describe('respawn target table (p0.rto)', () => {
  it('ships one target per sample, and every target is itself an ok sample that maps to itself', () => {
    expect(rto.length).toBe(rok.length);
    for (let i = 0; i < n; i++) {
      const j = rto[i]!;
      if (j < 0) continue;
      expect(rok[j]).toBe(1);
      expect(rto[j]).toBe(j);
    }
  });

  it('nothing between the run-up start and the landing window is a respawn slot', () => {
    for (let i = 0; i < n; i++) {
      const s = sAt(i);
      if (s >= ramp - runUp(J.vMin) && s < J.landS0 + 5) expect(rok[i], `s=${s}`).toBe(0);
    }
  });

  it('ramp, lip and gap respawn on the landing side, inside the landing window', () => {
    let seen = 0;
    for (let i = 0; i < n; i++) {
      const s = sAt(i);
      if (s < ramp || s >= J.landS0) continue;
      const ts = sAt(rto[i]!);
      expect(ts, `s=${s}`).toBeGreaterThanOrEqual(J.landS0);
      expect(ts, `s=${s}`).toBeLessThanOrEqual(J.landS1);
      seen++;
    }
    expect(seen).toBeGreaterThan(15);
  });

  it('the run-up respawns far enough back to reach vMin from a standing start (2× the distance)', () => {
    expect(runUp(J.vMin)).toBeGreaterThan(50); // vMin 22 m/s: ~27 m from rest at 9 m/s², doubled
    for (let i = 0; i < n; i++) {
      const s = sAt(i);
      if (s < ramp - runUp(J.vMin) || s >= ramp) continue;
      expect(sAt(rto[i]!), `s=${s}`).toBeLessThanOrEqual(ramp - runUp(J.vMin));
    }
  });

  it('no target crosses the finish line, or a key gate going forwards', () => {
    const L = t.lapLength;
    const wrap = (d: number): number => ((d % L) + L) % L;
    for (let i = 0; i < n - 1; i++) {
      const j = rto[i]!;
      if (j < 0 || j === i) continue;
      const a = sMainAt(i), b = sMainAt(j), fwd = wrap(b - a) < L / 2;
      const d = fwd ? wrap(b - a) : wrap(a - b);
      if (fwd) {
        for (const g of t.keyGates) { const e = wrap(g - a); expect(e > 0 && e <= d, `s=${a} → ${b} over key ${g}`).toBe(false); }
        expect(wrap(L - a) > 0 && wrap(L - a) <= d, `s=${a} → ${b} over the finish`).toBe(false);
      } else expect(a < d, `s=${a} → ${b} back over the finish`).toBe(false);
    }
  });

  it('respawnLoc and respawnPose agree with the table', () => {
    const loc: TrackLoc = { path: 0, i: 0, s: 0, u: 0, h: 0, sMain: 0, valid: 1 } as TrackLoc;
    const out = { ...loc };
    const pose = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 1 };
    for (const s of [J.lipS - 0.4, J.lipS + 3, J.landS0 - 1]) {
      t.locateGlobal(0, 0, 0, loc);
      loc.path = 0; loc.s = s; loc.u = 2; loc.valid = 1;
      t.respawnLoc!(loc, out);
      expect(out.s).toBeGreaterThanOrEqual(J.landS0);
      expect(out.u).toBe(0);
      t.respawnPose(loc, pose);
      const f = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 };
      t.frameAt(0, out.s, f);
      expect(Math.abs(pose.x - f.px) + Math.abs(pose.z - f.pz)).toBeLessThan(1e-6);
    }
  });
});

// ------------------------------------------------------------------------------------------------ sim
/** Runs kart 0 at full throttle for `ticks`, returning its respawn 'in' events. Until L1 adopts the contract, the rig
 *  applies the same two lines right after the placement tick so the test pins the L4 behaviour either way. */
function drive(rig: SimRig, T: BakedTrack, ticks: number, shim: boolean): { at: number[]; placedS: number[] } {
  const k = rig.w.karts[0]!, at: number[] = [], placedS: number[] = [];
  const tmp = { ...k.race.loc };
  for (let i = 0; i < ticks; i++) {
    const e0 = rig.events.length;
    rig.tick(1, (_w, inp) => { inp.throttle = 15; inp.steer = 0; });
    for (let e = e0; e < rig.events.length; e++) {
      const ev = rig.events[e]! as SimEvent & { phase?: string; kart?: number };
      if (ev.t !== 'respawn' || ev.phase !== 'in' || ev.kart !== 0) continue;
      if (shim) { T.respawnLoc!(k.race.lastValid, tmp); copyLoc(k.race.loc, tmp); copyLoc(k.race.lastValid, tmp); }
      at.push(rig.w.tick);
      placedS.push(k.race.loc.s);
    }
  }
  return { at, placedS };
}

function dropCases(shim: boolean): void {
  it('a kart that rolls off the lip too slowly falls in, respawns once past the gap, then drives on', () => {
    const rig = simRig(t);
    place(rig, 0, J.lipS - 3, 0, 6);
    // This is a slow mid-race roll-off, not a GO-window launch. The stronger
    // calibrated launch would otherwise accelerate this artificial placement across the gap.
    rig.w.karts[0]!.stats.startTier = StartTier.NONE;
    const res = drive(rig, t, 60 * 8, shim);
    const k = rig.w.karts[0]!;
    expect(res.placedS.length).toBe(1);
    expect(res.placedS[0]!).toBeGreaterThanOrEqual(J.landS0);
    expect(res.placedS[0]!).toBeLessThanOrEqual(J.landS1);
    expect(k.stats.respawns).toBe(1);
    expect(k.race.loc.valid).toBe(1);
    expect(k.race.loc.s).toBeGreaterThan(J.landS1 + 30);
  });

  it('a kart dropped into the middle of the gap (last valid in the gap) comes back on the landing side', () => {
    const rig = simRig(t);
    place(rig, 0, (J.lipS + J.landS0) / 2, 0, 0);
    const res = drive(rig, t, 60 * 8, shim);
    const k = rig.w.karts[0]!;
    expect(k.stats.respawns).toBe(1);
    expect(res.placedS[0]!).toBeGreaterThanOrEqual(J.landS0);
    expect(k.race.loc.s).toBeGreaterThan(J.landS1 + 30);
  });
}

describe('dropping a kart into the J gap (sim, contract applied by the rig)', () => dropCases(true));
describe.skipIf(!L1_ADOPTED)('dropping a kart into the J gap (sim, respawn.ts as shipped)', () => dropCases(false));
