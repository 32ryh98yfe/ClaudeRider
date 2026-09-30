// AI racer: port of the validated gap-2 aiDriver (pure pursuit + drift trigger + yaw-budget speed profile)
// onto baked per-sample AI tables and the 3D kart frame. Runs ONLY on the authority (server / offline worker).
import type { ContentTables } from '@cr/content';
import type { InputFrame } from '../core/input.ts';
import { Held, Edge } from '../core/input.ts';
import { Phase, type WorldState } from '../core/state.ts';
import { DT } from '../core/units.ts';
import type { AiSample, BakedTrack, FrameSample } from '../track/BakedTrack.ts';
import { gripGain, paramsFor, type KartParams } from '../kart/params.ts';
import type { AiDriver, AiProfile } from './api.ts';
import { AI_TIERS } from './api.ts';

const deg = Math.PI / 180;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (r: () => number): number => { const u = Math.max(1e-9, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

const A = { Lk0: 6, Lk1: 0.35, trigDeg: 25, trigLook: 40, rBias: 0.6, gripFrac: 0.9, tLead: 0.5, outBias: 0.6, tHead: 0.45, kHead: 2.5, kLatPos: 0.6, eExit: 0.05, ehShift: 0.4, rekT: 0.3, ehRekick: 0.8, sInMax: 0.8, sbHi: 0.42, sbShiftMax: 0.4, outBite: 0.35, tPred: 0.25, rLead: 25, shTap: 0.1 };

export function createAiDriver(track: BakedTrack, content: ContentTables, slot: number, profile: AiProfile = AI_TIERS.pro, personality: Partial<AiProfile> = {}, seed = 1): AiDriver {
  const prof: AiProfile = { ...profile, ...personality };
  const R = rng(seed ^ (slot * 0x9e3779b1));
  const F: FrameSample = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 };
  const F2: FrameSample = { ...F };
  const AS: AiSample = { lineU: 0, vLim: 99, kappa: 0, turnAhead40: 0, driftZone: 0, width: 8 };
  let shT = 0, rek = 0, prevBoost = false, noise = 0, noiseT = 0;
  let instDelay = -1, startDelay = -1, falseStart = false;
  let P: KartParams | null = null;

  return {
    slot,
    decide(w: Readonly<WorldState>, out: InputFrame): void {
      const k = w.karts[slot]!;
      out.steer = 0; out.throttle = 0; out.brake = 0; out.held = 0; out.edges = 0; out.aim = 255; out.emote = 0;
      if (!k.active) return;
      if (!P) P = paramsFor(content.karts.byCode[k.spec]!);
      const b = k.body, d = k.drive, loc = k.race.loc;
      // ---- start: press throttle around GO with tier-dependent timing
      if (w.phase < Phase.RACING || w.tick < w.goTick + 30) {
        if (startDelay < 0) {
          falseStart = R() < prof.falseStartProb;
          startDelay = falseStart ? -30 - Math.floor(R() * 20) : prof.startDelayTicks[0] + Math.floor(R() * (prof.startDelayTicks[1] - prof.startDelayTicks[0] + 1));
        }
        const pressAt = w.goTick + startDelay;
        out.throttle = w.tick >= pressAt ? 15 : 0;
        if (w.phase < Phase.RACING) return;
      }
      // 2D mapping: X = x, Y = -z → CCW math frame where + = left turn
      const hx = b.fx, hy = -b.fz;
      const hl = Math.hypot(hx, hy) || 1;
      const kx = b.px, ky = -b.pz;
      const vx2 = b.vx, vy2 = -b.vz;
      const v = Math.hypot(vx2, vy2);
      const Lk = A.Lk0 + A.Lk1 * v;
      track.frameAt(loc.path, loc.s + Lk, F);
      const hw = Math.max(3, Math.min(F.wL, F.wR) - 3);
      track.aiAt(loc.path, loc.s, AS);
      const dPsi = AS.turnAhead40;
      const vLim = AS.vLim * prof.vMul;
      // upcoming corner: first sample where centreline curvature exceeds grip capability at current speed
      let dCorner = 1e9, cornerDir = 0, cornerR = 1e9;
      const gripKap = gripGain(v, P) / Math.max(v, 1);
      for (let s = 0; s <= A.trigLook; s += 1) {
        track.aiAt(loc.path, loc.s + s, AS);
        const cr = AS.kappa;
        if (Math.abs(cr) * (1 / (1 + A.rBias * hw * Math.abs(cr))) > A.gripFrac * gripKap) { dCorner = s; cornerDir = cr > 0 ? 1 : -1; cornerR = 1 / Math.abs(cr); break; }
      }
      // slowly varying lateral noise (line imperfection)
      if (--noiseT <= 0) { noise = gauss(R) * prof.lineNoise; noiseT = 60 + Math.floor(R() * 60); }
      let steer: number, thr = 1, brk = 0, drift = false, boost = false;
      if (d.drift === 0) {
        let off = noise;
        if (dCorner < 1e8) off += -cornerDir * A.outBias * (hw - 1.5);
        // pursue an offset point (left normal of the track tangent = (-ty, tx) in 2D)
        const ttx = F.tx, tty = -F.tz;
        const gx = F.px - tty * off, gy = -F.pz + ttx * off;
        const ex = gx - kx, ey = gy - ky;
        const ed = Math.max(1, Math.hypot(ex, ey));
        const aH2 = Math.atan2(-ex * hy + ey * hx, ex * hx + ey * hy);
        steer = clampSteer((2 * Math.sin(aH2) / ed) * v, v, P);
        const lead = v * A.tLead * Math.max(0.3, Math.min(1, A.rLead / cornerR));
        const skillOk = R() < 0.85 + 0.15 * prof.driftSkill;
        if (Math.abs(dPsi) > A.trigDeg * deg && v > 15 && dCorner <= lead && d.reDriftLock <= 0 && skillOk) { drift = true; steer = cornerDir; shT = A.shTap; rek = 0; }
        if (d.instWindow > 0) {
          if (instDelay < 0) instDelay = R() < prof.instBoostRate ? Math.floor(R() * (prof.instJitterTicks + 1)) : 999;
          if (instDelay === 0) thr = d.prevThrottle === 1 ? 0 : 1; else if (instDelay < 900) instDelay--;
        } else instDelay = -1;
      } else {
        const dd = d.driftDir;
        track.frameAt(loc.path, loc.s + Math.max(4, v * A.tHead), F2);
        const tpx = F2.tx, tpy = -F2.tz;
        const eh = Math.atan2((hx / hl) * tpy - (hy / hl) * tpx, (hx / hl) * tpx + (hy / hl) * tpy) * dd;
        track.frameAt(loc.path, loc.s, F2);
        const qtx = F2.tx, qty = -F2.tz;
        const dDot = -vx2 * qty + vy2 * qtx;           // lateral velocity w.r.t. track (left +)
        const dLeft = -loc.u;                           // loc.u is right-positive
        const outside = -dd * (dLeft + dDot * A.tPred) / hw;
        const wl = -vx2 * (hy / hl) + vy2 * (hx / hl);
        const sb = -dd * wl / Math.max(v, 1);
        const e = eh + A.kLatPos * outside;
        let sIn = A.kHead * e;
        if (sIn > A.sInMax) sIn = A.sInMax;
        if (sb > A.sbHi || (outside > A.outBite && eh > 0)) { if (sIn > 0.3) sIn = 0.3; }
        if (e < -A.eExit) sIn = -1;
        sIn = sIn > 1 ? 1 : sIn < -1 ? -1 : sIn;
        if (shT > 0) { drift = true; shT -= DT; if (sIn < 0.6) sIn = 0.6; }
        else if (eh > A.ehShift && sb < A.sbShiftMax) {
          if (d.driftTicks * DT > A.rekT && eh > A.ehRekick && rek === 0) { rek = 1; drift = false; }
          else drift = true;
          if (sIn < 0.6) sIn = 0.6;
        }
        steer = sIn * dd;
        if (sIn < -0.3) thr = 0;
      }
      if (v > vLim + 0.5) { brk = 1; thr = 0; } else if (v > vLim) thr = 0;
      if (d.boosters + d.teamBoosters > 0 && d.drift === 0 && Math.abs(dPsi) < 12 * deg && d.boostTicks < 12 && !prevBoost) boost = true;
      prevBoost = boost;
      // stuck recovery: reverse briefly, then respawn
      if (d.lowSpeedTicks > 120 && w.tick > w.goTick + 120) { thr = 0; brk = 1; steer = -steer; }
      if (d.lowSpeedTicks > 300) out.edges |= Edge.RESPAWN;
      out.steer = Math.round(-steer * 127);
      out.throttle = thr > 0 ? 15 : 0;
      out.brake = brk > 0 ? 15 : 0;
      out.held = drift ? Held.DRIFT : 0;
      if (boost && w.phase >= Phase.RACING) out.edges |= Edge.USE_ITEM;
      if (k.race.wrongWayTicks > 90) out.edges |= Edge.RESPAWN;
    },
  };
}

function clampSteer(r: number, v: number, P: KartParams): number {
  const g = gripGain(v, P);
  const s = g > 1e-3 ? r / g : 0;
  return s > 1 ? 1 : s < -1 ? -1 : s;
}
