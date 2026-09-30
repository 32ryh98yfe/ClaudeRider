// Track progress, key gates, laps, finish detection, wrong-way and respawn triggers (ADR-004/006).
// Threshold crossings use (prev <= g < new): quantization may land a stored value exactly on a gate.
import { Phase, type KartState, type WorldState } from '../core/state.ts';
import { DT } from '../core/units.ts';
import { COS110 } from '../core/math.ts';
import type { StepContext } from '../api.ts';
import { copyLoc } from '../track/BakedTrack.ts';
import { evKey } from '../kart/evkey.ts';
import { startRespawn } from './respawn.ts';

const WRONG_WAY_BANNER = 72, WRONG_WAY_RESPAWN = 240, OFF_GRAPH_RESPAWN = 180, NO_GROUND_RESPAWN = 72;

export function updateProgress(w: WorldState, k: KartState, ctx: StepContext): void {
  const T = ctx.track, r = k.race, b = k.body, loc = ctx.scratch.loc;
  if (r.respawnPhase !== 0) return;
  const L = T.lapLength;
  const prevS = r.loc.sMain;
  const ok = T.locate(b.px, b.py, b.pz, r.loc, loc);
  const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
  let accepted = false;
  if (ok) {
    // anti-cut: new progress must be reachable within v·dt + 10 m (circular distance on closed main line)
    let dS = loc.sMain - prevS;
    if (T.topology === 'circuit') { if (dS > L / 2) dS -= L; else if (dS < -L / 2) dS += L; }
    const lim = speed * DT * 1.5 + 10;
    if (dS <= lim && dS >= -lim) accepted = true;
  }
  if (accepted) {
    const newS = loc.sMain;
    copyLoc(r.loc, loc);
    if (b.grounded) copyLoc(r.lastValid, loc);
    r.offGraphTicks = 0;
    advanceLaps(w, k, ctx, prevS, newS, L);
  } else {
    r.offGraphTicks++;
    r.loc.valid = 0;
  }

  // ground loss (outside declared jump spans), kill plane
  if (!b.grounded) {
    r.noGroundTicks++;
    let inJump = false;
    for (const j of T.jumps) if (j.path === r.loc.path && r.loc.s >= j.lipS - 5 && r.loc.s <= j.landS1 + 10) { inJump = true; break; }
    if (inJump && r.noGroundTicks < 400) r.noGroundTicks = Math.min(r.noGroundTicks, NO_GROUND_RESPAWN - 1);
  } else if (r.noGroundTicks < 9999) r.noGroundTicks = 0;

  // wrong way: heading vs track tangent
  const f = ctx.scratch.frame;
  T.frameAt(r.loc.path, r.loc.s, f);
  const dotT = b.fx * f.tx + b.fy * f.ty + b.fz * f.tz;
  const vdot = b.vx * f.tx + b.vy * f.ty + b.vz * f.tz;
  if (w.phase >= Phase.RACING && r.finishTick < 0 && dotT < COS110 && speed > 4 && vdot < 0) {
    r.wrongWayTicks++;
    if (r.wrongWayTicks === WRONG_WAY_BANNER) ctx.events.push({ t: 'wrongWay', kart: k.slot, on: true, tick: w.tick, key: evKey(w.tick, 40, k.slot) });
  } else {
    if (r.wrongWayTicks >= WRONG_WAY_BANNER) ctx.events.push({ t: 'wrongWay', kart: k.slot, on: false, tick: w.tick, key: evKey(w.tick, 41, k.slot) });
    r.wrongWayTicks = 0;
  }

  if (b.py < T.killY || r.noGroundTicks >= NO_GROUND_RESPAWN || r.offGraphTicks >= OFF_GRAPH_RESPAWN || r.wrongWayTicks >= WRONG_WAY_RESPAWN) {
    startRespawn(w, k, ctx);
  }
}

function advanceLaps(w: WorldState, k: KartState, ctx: StepContext, prevS: number, newS: number, L: number): void {
  const T = ctx.track, r = k.race, gates = T.keyGates, nKeys = gates.length, full = nKeys >= 31 ? 0x7fffffff : (1 << nKeys) - 1;
  if (T.topology === 'circuit') {
    // key gates, in order
    if (r.lap >= 0 && newS > prevS) {
      for (let g = 0; g < nKeys; g++) {
        const gs = gates[g]!;
        if (prevS <= gs && newS > gs && (g === 0 || (r.keyMask & (1 << (g - 1))) !== 0)) r.keyMask |= 1 << g;
      }
    }
    const wrapFwd = prevS > L - 60 && newS < 60;
    const wrapBack = prevS < 60 && newS > L - 60;
    if (wrapFwd) {
      if (r.lap < 0) { r.lap = 0; r.keyMask = 0; r.lapStartTick = w.goTick; }
      else if (r.keyMask === full) {
        r.lap++; r.keyMask = 0;
        const frac = crossFrac(prevS, newS, L);
        const lapTicks = w.tick - 1 + frac - r.lapStartTick;
        const lt = Math.round(lapTicks * 64) / 64; // 1/64-tick resolution so lap and race clocks agree to <0.3 ms
        const best = r.bestLapTicks === 0 || lt < r.bestLapTicks;
        if (best) r.bestLapTicks = lt;
        r.lastLapTicks = lt;
        r.lapStartTick = w.tick - 1 + frac;
        ctx.events.push({ t: 'lap', kart: k.slot, lap: r.lap, lapTicks: lt, best, tick: w.tick, key: evKey(w.tick, 42, k.slot) });
        if (r.lap === ctx.cfg.laps - 1) ctx.events.push({ t: 'finalLap', kart: k.slot, tick: w.tick, key: evKey(w.tick, 43, k.slot) });
        if (r.lap >= ctx.cfg.laps && r.finishTick < 0) finish(w, k, ctx, frac);
      }
    } else if (wrapBack && r.lap >= 0) {
      r.lap--; r.keyMask = full;
    }
    r.raceDist = r.lap * L + newS;
  } else {
    // point-to-point: sMain measured from the start line (negative on the grid); finish at L
    if (r.lap < 0 && prevS <= 0 && newS > 0) { r.lap = 0; r.lapStartTick = w.goTick; }
    for (let g = 0; g < nKeys; g++) {
      const gs = gates[g]!;
      if (prevS <= gs && newS > gs && (g === 0 || (r.keyMask & (1 << (g - 1))) !== 0)) r.keyMask |= 1 << g;
    }
    if (r.finishTick < 0 && r.lap >= 0 && prevS <= L && newS > L && r.keyMask === full) {
      const frac = newS > prevS ? (L - prevS) / (newS - prevS) : 1;
      r.lap = 1;
      r.lastLapTicks = r.bestLapTicks = Math.round((w.tick - 1 + frac - r.lapStartTick) * 64) / 64;
      finish(w, k, ctx, frac);
    }
    r.raceDist = newS;
  }
}

function crossFrac(prevS: number, newS: number, L: number): number {
  const a = L - prevS, b = newS;
  return a + b > 1e-9 ? a / (a + b) : 1;
}

function finish(w: WorldState, k: KartState, ctx: StepContext, frac: number): void {
  const r = k.race;
  r.finishTick = w.tick;
  r.finishFrac = frac;
  if (w.firstFinishTick < 0) {
    w.firstFinishTick = w.tick;
    ctx.events.push({ t: 'retireTimer', endsTick: w.tick + ctx.cfg.rules.retireTicks, tick: w.tick, key: evKey(w.tick, 44, 0) });
  }
  let rank = 1;
  for (const o of w.karts) if (o.active && o !== k && o.race.finishTick >= 0) rank++;
  ctx.events.push({ t: 'finish', kart: k.slot, rank, raceTicks: raceTicksOf(w, k), frac, tick: w.tick, key: evKey(w.tick, 45, k.slot) });
}

/** Race time in (fractional) ticks since GO. */
export function raceTicksOf(w: WorldState, k: KartState): number {
  const r = k.race;
  if (r.finishTick < 0) return w.tick - w.goTick;
  return r.finishTick - 1 + r.finishFrac - w.goTick;
}
