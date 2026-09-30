// Self-prediction through the lookahead pipe (14-ai §1). A room applies a bot's frame `lookahead` ticks
// after it was decided, so the driver must steer the kart it WILL have, not the one it sees. A plain
// p + v·t extrapolation is fine on straights but lags badly in hairpins and at drift entry/exit, so this
// replays the bot's own pending frames through a light copy of the kart model (yaw law, lateral damping,
// slip cap, drift entry/exit, base acceleration) — no walls, no contacts, flat ground. ~0.3 µs per frame.
import type { KartState } from '../core/state.ts';
import { DT } from '../core/units.ts';
import type { KartParams } from '../kart/params.ts';

const decay = (k: number): number => { const x = k * DT; return 1 / (1 + x * (1 + x * (0.5 + x / 6))); };
const DEC12 = decay(12), DEC6 = decay(6);
const KICK_C = Math.cos(0.06981317007977318), KICK_S = Math.sin(0.06981317007977318), RE_C = Math.cos(0.05235987755982988), RE_S = Math.sin(0.05235987755982988);
const SIN6 = Math.sin(6 * Math.PI / 180), SIN8 = Math.sin(8 * Math.PI / 180), SIN55 = Math.sin(55 * Math.PI / 180);

export class SelfPredictor {
  readonly n: number;
  private readonly qSteer: Float64Array;   // σ, + = left
  private readonly qHeld: Uint8Array;      // DRIFT held
  private readonly qThr: Uint8Array;
  private readonly qBrk: Uint8Array;
  private head = 0; private count = 0;
  // predicted state at the apply tick (2D: X = x, Y = −z)
  px = 0.5; py = 0.5; hx = 0.5; hy = 0.5; vx = 0.5; vy = 0.5; yaw = 0.5;
  drift = 0; dir = 1; dTicks = 0; peak = 0.5; lock = 0;
  /** Instant-boost window ticks remaining at the apply tick (0 = none). */
  win = 0;
  /** True if a drift ends inside the pipe (the exit is already committed). */
  exited = false;

  constructor(lookahead: number) {
    this.n = lookahead;
    const m = Math.max(1, lookahead);
    this.qSteer = new Float64Array(m); this.qHeld = new Uint8Array(m); this.qThr = new Uint8Array(m); this.qBrk = new Uint8Array(m);
  }

  reset(): void { this.count = 0; this.head = 0; }

  /** Records the frame just decided (it applies `n` ticks from now). */
  push(steerLeft: number, held: boolean, thr: boolean, brk: boolean): void {
    if (this.n === 0) return;
    this.qSteer[this.head] = steerLeft; this.qHeld[this.head] = held ? 1 : 0; this.qThr[this.head] = thr ? 1 : 0; this.qBrk[this.head] = brk ? 1 : 0;
    this.head = (this.head + 1) % this.n;
    if (this.count < this.n) this.count++;
  }

  /** Predicts the kart state after the pending frames. `vMul` is the bot's speed cap multiplier. */
  run(k: Readonly<KartState>, P: KartParams, vMul: number): void {
    const b = k.body, d = k.drive;
    let hx = b.fx, hy = -b.fz;
    const hl = Math.sqrt(hx * hx + hy * hy) || 1; hx /= hl; hy /= hl;
    let px = b.px, py = -b.pz, vx = b.vx, vy = -b.vz, yaw = b.yawRate;
    let drift = d.drift, dir: number = d.driftDir, dT = d.driftTicks, peak = d.driftPeak, lock = d.reDriftLock;
    let win = d.instWindow, boost = d.boostTicks + d.startTicks, prevHeld = (d.prevHeld & 1) !== 0;
    this.exited = false;
    const grounded = b.grounded === 1;
    const steps = this.count;
    // the oldest pending frame is applied first
    let idx = (this.head - steps + this.n) % (this.n || 1);
    for (let q = 0; q < steps; q++) {
      const sig = this.qSteer[idx]!, held = this.qHeld[idx] === 1, thr = this.qThr[idx] === 1, brk = this.qBrk[idx] === 1;
      idx = (idx + 1) % this.n;
      if (lock > 0) lock--;
      if (win > 0) win--;
      if (boost > 0) boost--;
      if (!grounded) { px += vx * DT; py += vy * DT; prevHeld = held; continue; }
      let u = vx * hx + vy * hy;
      // drift entry / double drift
      if (drift === 0) {
        if (held && (sig >= 0.3 || sig <= -0.3) && u >= 10 && lock <= 0) {
          drift = 1; dir = sig > 0 ? 1 : -1; dT = 0; peak = 0;
          yaw += dir * 1.2; const nx = hx * KICK_C - hy * KICK_S * dir, ny = hx * KICK_S * dir + hy * KICK_C; hx = nx; hy = ny;
          vx *= 0.99; vy *= 0.99;
        }
      } else if (held && !prevHeld && dT >= 9) {
        yaw += dir * 0.8; const nx = hx * RE_C - hy * RE_S * dir, ny = hx * RE_S * dir + hy * RE_C; hx = nx; hy = ny;
        vx *= 0.99; vy *= 0.99;
      }
      prevHeld = held;
      u = vx * hx + vy * hy;
      // yaw law
      const sIn = sig * dir;
      let rT: number;
      if (drift === 0) { const uu = u > 0 ? u : 0, q = uu / P.gripV1; rT = sig * (P.yGrip * uu) / (uu + P.gripV0) / (1 + q * q); }
      else rT = dir * (0.6 / (1 + dT / 36) + 1.2 * sIn + (held ? 0.7 : 0));
      yaw += (rT - yaw) * (1 - (drift === 0 ? DEC12 : DEC6));
      {
        // small-angle rotation (|yaw·DT| < 0.1 rad) + renormalisation
        const a = yaw * DT, a2 = a * a, sa = a * (1 - a2 / 6), ca = 1 - a2 * 0.5 * (1 - a2 / 12);
        const nx = hx * ca - hy * sa, ny = hx * sa + hy * ca, nl = Math.sqrt(nx * nx + ny * ny) || 1;
        hx = nx / nl; hy = ny / nl;
      }
      // lateral damping with momentum retention
      u = vx * hx + vy * hy;
      let w = -vx * hy + vy * hx;
      let v = Math.sqrt(u * u + w * w);
      let kL: number, eta: number;
      if (drift === 0) { kL = 18; eta = 0.1; }
      else {
        eta = 0.8;
        if (sIn >= 0.3) kL = P.kLatNeutral + (P.kLatIn - P.kLatNeutral) * ((sIn - 0.3) / 0.7);
        else if (sIn > -0.3) kL = P.kLatNeutral;
        else kL = P.kLatNeutral + (9 - P.kLatNeutral) * ((-sIn - 0.3) / 0.7);
        if (held) kL *= 0.85;
      }
      const xk = kL * DT, w2 = w / (1 + xk * (1 + xk * (0.5 + xk / 6)));
      const vRaw = Math.sqrt(u * u + w2 * w2);
      if (vRaw > 1e-6) { const f = (vRaw + eta * (v - vRaw)) / vRaw; u *= f; w = w2 * f; } else w = w2;
      v = Math.sqrt(u * u + w * w);
      let sb = 0;
      if (drift === 1) {
        const sm = SIN55 * v; if (w > sm || w < -sm) { w = w > 0 ? sm : -sm; u = Math.sqrt(Math.max(0, v * v - w * w)); }
        sb = v > 0.1 ? (-dir * w) / v : 0;
        dT++; if (sb > peak) peak = sb;
        if ((dT >= 8 && sb < SIN6) || u < 5) {
          drift = 0; lock = 6; this.exited = true;
          if (dT >= 15 && peak >= SIN8) win = 30;
        }
      }
      // longitudinal (base or boost law, drift accel cap, brake, coast, drift drag)
      const vT = (boost > 0 ? P.vBoost : P.vGrip) * vMul;
      let a: number;
      if (thr) {
        if (u < vT) {
          if (boost > 0) { a = 4 * (vT - u); if (a > 25) a = 25; }
          else { const qq = u / vT; a = P.a0 * (1 - qq * qq); if (drift === 1 && a > 5) a = 5; }
        } else a = -0.9 * (u - vT);
      } else { a = -2.5; if (u > vT) a -= 0.9 * (u - vT); }
      if (brk && u > 0.5) a = -(drift === 1 ? 14 : 24);
      u += a * DT;
      if (drift === 1 && sb > 0) { let f = 1 - P.cBeta * sb * sb * DT; if (f < 0) f = 0; u *= f; w *= f; }
      vx = u * hx - w * hy; vy = u * hy + w * hx;
      px += vx * DT; py += vy * DT;
    }
    this.px = px; this.py = py; this.hx = hx; this.hy = hy; this.vx = vx; this.vy = vy; this.yaw = yaw;
    this.drift = drift; this.dir = dir; this.dTicks = dT; this.peak = peak; this.lock = lock; this.win = win;
  }
}
