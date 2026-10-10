// FROZEN (contracts.lock). World construction and allocation-free copying.
import type { ContentTables } from '@cr/content';
import type { BakedTrack } from '../track/BakedTrack.ts';
import { MAX_KARTS } from './units.ts';
import {
  Phase, type EffectInstance, type HazardState, type KartState, type ProjectileState, type RaceConfig, type TrackLoc, type WorldState,
} from './state.ts';

export const emptyLoc = (): TrackLoc => ({ path: 0, i: 0, s: 0, u: 0, h: 0, sMain: 0, valid: 0 });

export function newKart(slot: number): KartState {
  return {
    slot, team: 0, spec: 1, active: 0,
    body: { px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0, fx: 0, fy: 0, fz: -1, nx: 0, ny: 1, nz: 0, yawRate: 0, grounded: 0, coyote: 0, airTicks: 0, surf: 0, wallContact: 0, ghostTicks: 0, attachKind: 0, attachId: 0, attachS: 0, attachT: 0 },
    drive: {
      drift: 0, driftDir: 1, driftTicks: 0, driftPeak: 0, driftIntentTicks: 0, driftArmed: 0, driftEngagement: 0, driftTightness: 0, driftTarget: 0, driftRecovering: 0, pendingDriftDir: 0, reDriftLock: 0, gauge: 0, fatigueTicks: 0, boosters: 0, teamBoosters: 0,
      boostTicks: 0, boostKind: 0, startTicks: 0, wheelspinTicks: 0, instWindow: 0, instTicks: 0, stunTicks: 0, draftCharge: 0,
      draftTicks: 0, prevHeld: 0, prevThrottle: 0, lowSpeedTicks: 0, startPressTick: -1,
      gear: 0, postTicks: 0, dragTicks: 0, tapStreak: 0, tapGap: 255, counterTicks: 0, brakeTicks: 0,
    },
    items: { slot0: 0, slot1: 0, rouletteSlot: -1, rouletteEnd: 0, rouletteBox: -1, lastUseTick: -1000, aimLockTicks: 0, aimTarget: 255 },
    status: { cc: 0, ccStart: 0, ccEnd: 0, immuneUntil: 0, shieldUntil: 0, shieldGraceUntil: 0, haloUntil: 0, mashCredits: 0, lastTapDir: 0, lastTapTick: -1000, modMask: 0 },
    race: {
      loc: emptyLoc(), lastValid: emptyLoc(), lap: 0, keyMask: 0, raceDist: 0, lapStartTick: 0, bestLapTicks: 0, lastLapTicks: 0,
      finishTick: -1, finishFrac: 0, rank: slot + 1, wrongWayTicks: 0, offGraphTicks: 0, noGroundTicks: 0, respawnPhase: 0,
      respawnUntil: 0, manualCooldownUntil: 0, slowTicks: 0, retired: 0,
    },
    stats: { drifts: 0, instantBoosts: 0, boostsUsed: 0, startTier: 0, wallHits: 0, hardHits: 0, attacksLanded: 0, attacksBlocked: 0, hitsTaken: 0, itemsUsed: 0, respawns: 0, driftMeters: 0, draftBursts: 0 },
  };
}

export function createWorld(cfg: RaceConfig, track: BakedTrack, content: ContentTables): WorldState {
  const karts: KartState[] = [];
  for (let s = 0; s < MAX_KARTS; s++) {
    const k = newKart(s);
    const sc = cfg.slots[s];
    if (sc && sc.kind !== 'empty') {
      k.active = 1;
      k.team = sc.team;
      k.spec = content.karts.get(sc.kartBodyId).code;
      const g = track.grid[s] ?? track.grid[0]!;
      k.body.px = g.x; k.body.py = g.y; k.body.pz = g.z;
      k.body.fx = g.fx; k.body.fy = g.fy; k.body.fz = g.fz;
      k.body.grounded = 1;
      track.locateGlobal(g.x, g.y, g.z, k.race.loc);
      copyLocInto(k.race.lastValid, k.race.loc);
      // grid slots sit behind the line: progress is negative relative to the first lap
      const L = track.lapLength;
      if (track.topology === 'circuit') {
        const behind = k.race.loc.sMain > L * 0.5;
        k.race.lap = behind ? -1 : 0;
        k.race.raceDist = behind ? k.race.loc.sMain - L : k.race.loc.sMain;
      } else {
        k.race.lap = k.race.loc.sMain < 0 ? -1 : 0;
        k.race.raceDist = k.race.loc.sMain;
      }
    }
    karts.push(k);
  }
  const nTeams = cfg.teams === 'solo' ? 1 : cfg.teams === 'duo' ? 4 : 2;
  const introTicks = cfg.introTicks;
  return {
    tick: 0,
    phase: Phase.PRE,
    goTick: introTicks + cfg.countdownTicks,
    firstFinishTick: -1,
    endTick: -1,
    karts,
    teams: Array.from({ length: nTeams }, () => ({ gauge: 0, granted: 0 })),
    effects: [],
    projectiles: [],
    hazards: [],
    boxRespawn: new Int32Array(Math.max(1, track.boxes.length) * MAX_KARTS),
    seq: cfg.seed >>> 0,
    nextObjId: 1,
    decisions: { items: [] },
  };
}

function copyLocInto(d: TrackLoc, s: Readonly<TrackLoc>): void {
  d.path = s.path; d.i = s.i; d.s = s.s; d.u = s.u; d.h = s.h; d.sMain = s.sMain; d.valid = s.valid;
}

function copyKart(d: KartState, s: Readonly<KartState>): void {
  d.slot = s.slot; d.team = s.team; d.spec = s.spec; d.active = s.active;
  Object.assign(d.body, s.body);
  Object.assign(d.drive, s.drive);
  Object.assign(d.items, s.items);
  Object.assign(d.status, s.status);
  const dr = d.race, sr = s.race;
  const loc = dr.loc, lv = dr.lastValid;
  Object.assign(dr, sr);
  dr.loc = loc; dr.lastValid = lv;
  copyLocInto(loc, sr.loc); copyLocInto(lv, sr.lastValid);
  Object.assign(d.stats, s.stats);
}

function copyArr<T extends object>(dst: T[], src: readonly T[]): void {
  for (let i = 0; i < src.length; i++) {
    const e = dst[i];
    if (e) Object.assign(e, src[i]); else dst.push({ ...src[i]! });
  }
  dst.length = src.length;
}

/** Deep copy src into dst. Allocation-free once dst has grown to the needed sizes. */
export function copyWorld(dst: WorldState, src: Readonly<WorldState>): void {
  dst.tick = src.tick; dst.phase = src.phase; dst.goTick = src.goTick; dst.firstFinishTick = src.firstFinishTick; dst.endTick = src.endTick;
  for (let i = 0; i < src.karts.length; i++) copyKart(dst.karts[i]!, src.karts[i]!);
  copyArr(dst.teams, src.teams);
  copyArr<EffectInstance>(dst.effects, src.effects);
  copyArr<ProjectileState>(dst.projectiles, src.projectiles);
  copyArr<HazardState>(dst.hazards, src.hazards);
  if (dst.boxRespawn.length !== src.boxRespawn.length) dst.boxRespawn = new Int32Array(src.boxRespawn.length);
  dst.boxRespawn.set(src.boxRespawn);
  dst.seq = src.seq; dst.nextObjId = src.nextObjId;
  dst.decisions = src.decisions; // immutable log shared by reference
}

export function cloneWorld(src: Readonly<WorldState>): WorldState {
  const w: WorldState = {
    tick: 0, phase: 0, goTick: 0, firstFinishTick: -1, endTick: -1,
    karts: src.karts.map((_, i) => newKart(i)), teams: [], effects: [], projectiles: [], hazards: [],
    boxRespawn: new Int32Array(src.boxRespawn.length), seq: 0, nextObjId: 1, decisions: { items: [] },
  };
  copyWorld(w, src);
  return w;
}
