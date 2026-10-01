// Scripted 10 s input logs for the flat-plane oracle (10-sim-spec §14.7): straight, slalom, drift chain, booster,
// instant boost and a mixed log, plus the six M5 technique logs of doc 15 §5 (post-boost, drag, tap, cut and
// reverse gauge, brake turn and spin, gears). Each returns the sim input for tick t (0-based) given the kart state.
import { Edge, Held, type InputFrame, type KartState } from '@cr/sim';
import { steerLeft } from './util.ts';

export interface OracleLog { name: string; v0: number; boosters: number; frame(t: number, k: KartState, out: InputFrame): void }

const set = (o: InputFrame, steer: number, thr: number, drift = false, edges = 0, brake = 0): void => {
  o.steer = steerLeft(steer); o.throttle = thr ? 15 : 0; o.brake = brake ? 15 : 0; o.held = drift ? Held.DRIFT : 0; o.edges = edges; o.aim = 255; o.emote = 0;
};

export const ORACLE_LOGS: OracleLog[] = [
  { name: 'straight', v0: 0, boosters: 0, frame: (_t, _k, o) => set(o, 0, 1) },
  { name: 'slalom', v0: 25, boosters: 0, frame: (t, _k, o) => set(o, Math.sin((t / 60) * Math.PI) * (t % 240 < 120 ? 1 : 0.6), 1) },
  {
    name: 'drift chain', v0: 32, boosters: 0,
    // alternate 1.5 s drifts: 0.2 s drift press with steer, hold steer, counter-steer to exit
    frame: (t, _k, o) => {
      const ph = t % 90, dir = Math.floor(t / 90) % 2 === 0 ? 1 : -1;
      if (ph < 12) set(o, dir, 1, true);
      else if (ph < 55) set(o, dir * 0.7, 1, ph < 30);
      else if (ph < 70) set(o, -dir, 1);
      else set(o, 0, 1);
    },
  },
  {
    name: 'double drift', v0: 33, boosters: 0,
    // tap to enter, re-press 12 ticks later (double drift), hold, counter-steer out; alternate sides every 2 s
    frame: (t, _k, o) => {
      const ph = t % 120, dir = Math.floor(t / 120) % 2 === 0 ? 1 : -1;
      if (ph < 5) set(o, dir, 1, true);
      else if (ph < 12) set(o, dir, 1, false);
      else if (ph < 45) set(o, dir * 0.9, 1, true);
      else if (ph < 65) set(o, -dir, 1);
      else set(o, 0, 1);
    },
  },
  {
    name: 'booster', v0: 30, boosters: 2,
    frame: (t, _k, o) => set(o, t > 300 && t < 360 ? 0.4 : 0, 1, false, t === 10 || t === 176 || t === 420 ? Edge.USE_ITEM : 0),
  },
  {
    name: 'instant boost', v0: 30, boosters: 0,
    // full drift (≥ 15 ticks, deep slip), exit by counter-steer, then release and re-press the throttle
    frame: (t, k, o) => {
      const ph = t % 150;
      if (ph < 10) set(o, 1, 1, true);
      else if (ph < 40) set(o, 1, 1, true);
      else if (ph < 60) set(o, -1, k.drive.drift ? 1 : 0);
      else if (ph < 64) set(o, 0, 0);
      else set(o, 0, 1);
    },
  },
  {
    name: 'mixed', v0: 20, boosters: 1,
    frame: (t, k, o) => {
      const r = Math.sin(t * 0.37) + Math.sin(t * 0.113);
      const drift = (t % 200 > 40 && t % 200 < 70) || (t % 330 > 100 && t % 330 < 112);
      const brake = t % 400 > 380 && k.body.vx * k.body.fx + k.body.vz * k.body.fz > 12 ? 1 : 0;
      set(o, Math.max(-1, Math.min(1, r)), t % 97 < 90 ? 1 : 0, drift, t === 250 ? Edge.USE_ITEM : 0, brake);
    },
  },
  // ------------------------------------------------------------------ M5 driving techniques (doc 15 §5 item 9)
  // These scripts depend on t only, so the inputs never follow a diverging state.
  {
    name: 'post-boost', v0: 34, boosters: 2,
    // bleed with ↑ held (a brake inside it), a released-↑ bleed, re-press, then a drift entry cancels it; cut out,
    // re-press the throttle inside the instant window (an instant boost after a bleed)
    frame: (t, _k, o) => {
      const use = t === 0 || t === 240 ? Edge.USE_ITEM : 0;
      if (t >= 188 && t < 192) set(o, 0, 1, false, use, 1);
      else if (t >= 410 && t < 432) set(o, 0, 0, false, use);
      else if (t >= 440 && t < 466) set(o, 1, 1, true, use);
      else if (t >= 466 && t < 476) set(o, -1, 1, false, use);
      else if (t >= 486 && t < 490) set(o, 0, 0, false, use);
      else set(o, t >= 520 && t < 560 ? 0.3 : 0, 1, false, use);
    },
  },
  {
    name: 'drag', v0: 45, boosters: 2,
    // left drift into a neutral drag; boosted counter-steer with DRIFT held (reverse gauge), then a cut; a right
    // drag interrupted by a throttle lift; the boost expiring mid-drift; a second boost with a brake-ended drag
    frame: (t, _k, o) => {
      const use = t === 0 || t === 300 ? Edge.USE_ITEM : 0;
      if (t >= 20 && t < 44) set(o, 1, 1, true, use);
      else if (t >= 44 && t < 100) set(o, 0, 1, true, use);
      else if (t >= 100 && t < 110) set(o, -1, 1, true, use);
      else if (t >= 110 && t < 116) set(o, -1, 1, false, use);
      else if (t >= 130 && t < 154) set(o, -1, 1, true, use);
      else if (t >= 154 && t < 200) set(o, 0, t >= 160 && t < 166 ? 0 : 1, true, use);
      else if (t >= 200 && t < 214) set(o, 1, 1, false, use);
      else if (t >= 320 && t < 344) set(o, 1, 1, true, use);
      else if (t >= 344 && t < 400) set(o, t >= 380 ? 0.6 : 0, 1, true, use, t >= 360 && t < 363 ? 1 : 0);
      else if (t >= 400 && t < 410) set(o, -1, 1, false, use);
      else set(o, 0, 1, false, use);
    },
  },
  {
    name: 'tap', v0: 45, boosters: 2,
    // left drag with TAP_L every 8 ticks (2-tick steer presses), the chained booster at 170, mashing every 4 ticks,
    // wrong-side TAP_R edges, then a right drag with TAP_R every 14 ticks
    frame: (t, _k, o) => {
      const use = t === 0 || t === 170 ? Edge.USE_ITEM : 0;
      if (t >= 20 && t < 44) { set(o, 1, 1, true, use); return; }
      if (t >= 48 && t < 200) {
        const m = (t - 48) % 8;
        set(o, m < 2 ? 1 : 0, 1, true, use | (m === 0 ? Edge.TAP_L : 0));
        return;
      }
      if (t >= 200 && t < 240) { const m = (t - 200) % 4; set(o, m < 2 ? 1 : 0, 1, true, use | (m === 0 ? Edge.TAP_L : 0)); return; }
      if (t >= 240 && t < 270) { set(o, 0, 1, true, use | ((t - 240) % 8 === 0 ? Edge.TAP_R : 0)); return; }
      if (t >= 270 && t < 280) { set(o, -1, 1, false, use); return; }
      if (t >= 300 && t < 324) { set(o, -1, 1, true, use); return; }
      if (t >= 328 && t < 450) { const m = (t - 328) % 14; set(o, m < 2 ? -1 : 0, 1, true, use | (m === 0 ? Edge.TAP_R : 0)); return; }
      if (t >= 450 && t < 460) { set(o, 1, 1, false, use); return; }
      set(o, 0, 1, false, use);
    },
  },
  {
    name: 'cut and reverse gauge', v0: 40, boosters: 2,
    // unboosted cut; a half counter-steer that does not cut; boosted counter-steer with DRIFT held (×3 gauge, no
    // cut) then released (cut); a right-hand version; half counter while boosting (×3, no counter ticks)
    frame: (t, _k, o) => {
      const use = t === 120 || t === 360 ? Edge.USE_ITEM : 0;
      if (t >= 10 && t < 40) set(o, 1, 1, true, use);
      else if (t >= 40 && t < 50) set(o, -1, 1, false, use);
      else if (t >= 60 && t < 90) set(o, -1, 1, true, use);
      else if (t >= 90 && t < 105) set(o, 0.6, 1, false, use);
      else if (t >= 130 && t < 160) set(o, 1, 1, true, use);
      else if (t >= 160 && t < 170) set(o, -1, 1, true, use);
      else if (t >= 170 && t < 180) set(o, -1, 1, false, use);
      else if (t >= 200 && t < 226) set(o, -1, 1, true, use);
      else if (t >= 226 && t < 234) set(o, 1, 1, true, use);
      else if (t >= 234 && t < 244) set(o, 1, 1, false, use);
      else if (t >= 380 && t < 410) set(o, 1, 1, true, use);
      else if (t >= 410 && t < 440) set(o, -0.5, 1, true, use);
      else if (t >= 440 && t < 450) set(o, -1, 1, false, use);
      else set(o, 0, 1, false, use);
    },
  },
  {
    name: 'brake turn and spin', v0: 40, boosters: 2,
    // an 8-tick brake turn inside a boosted drift; an 11-tick brake (spin-out, boost cancelled, stun) with ↑ held
    // through the stun; brake held from the drift entry for 9 ticks; a 10-tick brake (no spin); a 15-tick brake
    frame: (t, _k, o) => {
      const use = t === 0 || t === 200 ? Edge.USE_ITEM : 0;
      if (t >= 20 && t < 60) set(o, 1, 1, true, use, t >= 40 && t < 48 ? 1 : 0);
      else if (t >= 60 && t < 70) set(o, -1, 1, false, use);
      else if (t >= 90 && t < 131) set(o, -1, 1, true, use, t >= 120 ? 1 : 0);
      else if (t >= 220 && t < 250) set(o, 1, 1, true, use, t < 229 ? 1 : 0);
      else if (t >= 250 && t < 260) set(o, -1, 1, false, use);
      else if (t >= 300 && t < 340) set(o, -1, 1, true, use, t >= 320 && t < 330 ? 1 : 0);
      else if (t >= 340 && t < 350) set(o, 1, 1, false, use);
      else if (t >= 400 && t < 440) set(o, 0.8, 1, true, use, t >= 415 && t < 430 ? 1 : 0);
      else set(o, 0, 1, false, use);
    },
  },
  {
    name: 'gears', v0: 20, boosters: 0,
    // coast (N); brake to STOP, R after 6 ticks; coast in R; reverse again with steer; ↑ in R → D; coast; brake to
    // STOP and R, then release ↓ in R so it rolls back to exactly 0 (STOP); drive off
    frame: (t, _k, o) => {
      if (t < 90) set(o, 0, 0);
      else if (t < 230) set(o, 0, 0, false, 0, 1);
      else if (t < 260) set(o, 0, 0);
      else if (t < 290) set(o, t >= 270 ? 0.7 : 0, 0, false, 0, 1);
      else if (t < 350) set(o, t >= 300 && t < 340 ? 0.5 : 0, 1);
      else if (t < 420) set(o, 0, 0);
      else if (t < 455) set(o, 0, 0, false, 0, 1);
      else if (t < 540) set(o, 0, 0);
      else set(o, t >= 555 && t < 590 ? -0.6 : 0, 1);
    },
  },
];
