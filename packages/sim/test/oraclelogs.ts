// Scripted 10 s input logs for the flat-plane oracle (10-sim-spec §14.7): straight, slalom, drift chain, booster,
// instant boost and a mixed log. Each returns the sim input for tick t (0-based) given the kart state.
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
];
