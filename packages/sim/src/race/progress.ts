// Track progress, key gates, laps, finish detection, wrong-way and respawn triggers (ADR-004/006, 10-sim-spec §12).
// Threshold crossings use (prev <= g < new): quantization may land a stored value exactly on a gate.
import { Attach, Phase, type KartState, type TrackLoc, type WorldState } from '../core/state.ts';
import { DT } from '../core/units.ts';
import { Q } from '../core/quant.ts';
import { COS110 } from '../core/math.ts';
import type { StepContext } from '../api.ts';
import type { BakedTrack } from '../track/BakedTrack.ts';
import { SFLAG } from '../track/format.ts';
import { copyLoc } from '../track/BakedTrack.ts';
import { evKey } from '../kart/evkey.ts';
import { KILL_FLAG } from '../kart/motion.ts';
import { inKillZone, sampleFlags } from '../kart/zones.ts';
import { railLoc, tryCaptureRail } from '../kart/rail.ts';
import { tryEnterWarp, updateWarp } from '../kart/warp.ts';
import { trackInfo } from '../kart/trackinfo.ts';
import { startRespawn } from './respawn.ts';

export const WRONG_WAY_BANNER = 72, WRONG_WAY_RESPAWN = 240, OFF_GRAPH_RESPAWN = 180, NO_GROUND_RESPAWN = 72;
export const JUMP_AIR_GRACE_TICKS = 400;
/** After this many ticks off-graph the global (grid) search replaces the graph-local one (§12.1). */
const GLOBAL_SEARCH_AFTER = 60;
/** Anti-cut slack (ADR-006): accept Δs ≤ |v|·DT·(1 + ticks off-graph) + 10 m. */
const CUT_SLACK = 10;

const FR = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 };

/** Inside a declared jump span (sample flag or JumpBaked lip → landing zone): air time and anti-cut are exempt. */
export function inJumpSpan(T: BakedTrack, loc: Readonly<TrackLoc>): boolean {
  const J = T.jumps;
  for (let i = 0; i < J.length; i++) {
    const j = J[i]!;
    if (j.path === loc.path && loc.s >= j.lipS - 5 && loc.s <= j.landS1 + 10) return true;
  }
  if (!J.length) return false;
  return (sampleFlags(T, loc.path, loc.s) & SFLAG.JUMP) !== 0;
}

/** Anti-cut is exempt inside declared jump, rail and warp spans (ADR-006). */
function exemptSpan(T: BakedTrack, loc: Readonly<TrackLoc>, info: { rails: boolean; warps: boolean }): boolean {
  if (inJumpSpan(T, loc)) return true;
  if (!info.rails && !info.warps) return false;
  return (sampleFlags(T, loc.path, loc.s) & (SFLAG.RAIL | SFLAG.WARP)) !== 0;
}

export function updateProgress(w: WorldState, k: KartState, ctx: StepContext): void {
  const kill = KILL_FLAG[k.slot] === 1;
  KILL_FLAG[k.slot] = 0;
  const T = ctx.track, r = k.race, b = k.body, loc = ctx.scratch.loc;
  if (r.respawnPhase !== 0) return;
  const L = T.lapLength;
  const prevS = r.loc.sMain, prevPath = r.loc.path, prevPathS = r.loc.s;

  // attachments move the kart along baked paths: progress follows without a search
  if (b.attachKind === Attach.WARP) {
    if (updateWarp(w, k, ctx)) {
      r.offGraphTicks = 0; r.noGroundTicks = 0;
      if (r.loc.path === 0) copyLoc(r.lastValid, r.loc);
      advanceLaps(w, k, ctx, prevS, r.loc.sMain, L);
    }
    return;
  }
  if (b.attachKind === Attach.RAIL) {
    railLoc(k, ctx, r.loc);
    r.offGraphTicks = 0; r.noGroundTicks = 0;
    if (r.wrongWayTicks >= WRONG_WAY_BANNER) ctx.events.push({ t: 'wrongWay', kart: k.slot, on: false, tick: w.tick, key: evKey(w.tick, 41, k.slot) });
    r.wrongWayTicks = 0;
    advanceLaps(w, k, ctx, prevS, r.loc.sMain, L);
    return;
  }

  const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
  const info = trackInfo(T);
  const exemptPrev = exemptSpan(T, r.loc, info);
  let ok = T.locate(b.px, b.py, b.pz, r.loc, loc) && onSample(T, k, loc);
  if (!ok && (r.offGraphTicks >= GLOBAL_SEARCH_AFTER || exemptPrev)) ok = T.locateGlobal(b.px, b.py, b.pz, loc) && onSample(T, k, loc);
  let accepted = false;
  if (ok) {
    let dS = loc.sMain - prevS;
    if (T.topology === 'circuit') { if (dS > L / 2) dS -= L; else if (dS < -L / 2) dS += L; }
    const lim = speed * DT * (1 + r.offGraphTicks) + CUT_SLACK;
    accepted = (dS <= lim && dS >= -lim) || exemptPrev || exemptSpan(T, loc, info);
  }
  if (accepted) {
    const newS = loc.sMain;
    copyLoc(r.loc, loc);
    if (b.grounded && loc.path === 0 && !kill && respawnSafe(T, loc)) copyLoc(r.lastValid, loc);
    r.offGraphTicks = 0;
    advanceLaps(w, k, ctx, prevS, newS, L);
    if (info.warps && tryEnterWarp(w, k, ctx, prevPath, prevPathS)) return;
    if (info.rails) tryCaptureRail(w, k, ctx);
  } else {
    r.offGraphTicks++;
    r.loc.valid = 0;
  }

  // ground loss outside declared jump spans
  if (!b.grounded && b.attachKind === Attach.NONE) {
    r.noGroundTicks++;
    if (inJumpSpan(T, r.loc) && b.airTicks < JUMP_AIR_GRACE_TICKS) r.noGroundTicks = Math.min(r.noGroundTicks, NO_GROUND_RESPAWN - 1);
  } else r.noGroundTicks = 0;

  // wrong way: heading against the track tangent while moving backwards along it
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

  // finished karts cruise on past the line (and off the end of point-to-point tracks): only kills respawn them
  const lost = r.finishTick < 0 && (r.noGroundTicks >= NO_GROUND_RESPAWN || r.offGraphTicks >= OFF_GRAPH_RESPAWN || r.wrongWayTicks >= WRONG_WAY_RESPAWN);
  if (kill || b.py < T.killY || (T.zones.length > 0 && inKillZone(k, T)) || lost) startRespawn(w, k, ctx);
}

/**
 * Rejects a location whose sample lies more than 2 m along the tangent from the kart. The graph search clamps its
 * projection to segment ends, so a kart flying over a gap could otherwise be "located" far behind itself.
 */
function onSample(T: BakedTrack, k: Readonly<KartState>, loc: Readonly<TrackLoc>): boolean {
  T.frameAt(loc.path, loc.s, FR);
  const b = k.body;
  const along = (b.px - FR.px) * FR.tx + (b.py - FR.py) * FR.ty + (b.pz - FR.pz) * FR.tz;
  return along <= 2 && along >= -2;
}

/** Respawn anchors stay out of declared jumps and their 60 m run-up, so a respawned kart can reach take-off speed. */
function respawnSafe(T: BakedTrack, loc: Readonly<TrackLoc>): boolean {
  const J = T.jumps;
  for (let i = 0; i < J.length; i++) {
    const j = J[i]!;
    if (j.path === loc.path && loc.s >= j.lipS - 60 && loc.s <= j.landS1 + 10) return false;
  }
  return true;
}

/**
 * A station on the grid `sMain` is stored on (quantizeWorld, Q.POS). Gates baked a hair below a grid point
 * (1299.9999999999998) were missed when a kart's raw station landed between the two: it was not past the gate this
 * tick, and quantizing rounded it past the gate for the next one, so the lap needed one more lap to count.
 */
const onGrid = (s: number): number => Math.round(s * Q.POS) / Q.POS;

export function advanceLaps(w: WorldState, k: KartState, ctx: StepContext, prevS: number, newS: number, L: number): void {
  const T = ctx.track, r = k.race, gates = T.keyGates, nKeys = gates.length, full = nKeys >= 31 ? 0x7fffffff : (1 << nKeys) - 1;
  if (T.topology === 'circuit') {
    // key gates, in order
    if (r.lap >= 0 && newS > prevS) {
      for (let g = 0; g < nKeys; g++) {
        const gs = onGrid(gates[g]!);
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
      const gs = onGrid(gates[g]!);
      if (prevS <= gs && newS > gs && (g === 0 || (r.keyMask & (1 << (g - 1))) !== 0)) r.keyMask |= 1 << g;
    }
    const Lg = onGrid(L);
    if (r.finishTick < 0 && r.lap >= 0 && prevS <= Lg && newS > Lg && r.keyMask === full) {
      const frac = newS > prevS ? (Lg - prevS) / (newS - prevS) : 1;
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
