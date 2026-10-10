// AI racer (14-ai §3): the validated gap-2 controller (pure pursuit, yaw-budget speed, drift trigger,
// heading-pursuit drift control) on the dense per-track plan, plus tier execution (per-corner drift plans,
// instant-boost and start rolls, line noise, mistakes, booster discipline), personalities, lane choice
// (avoidance, slipstream, overtakes), stuck recovery, lookahead self-prediction and the L2 item hook.
// Runs ONLY on the authority (server / offline worker); it reads the world and writes an InputFrame.
// No per-tick allocation: all state lives in fields of one object per bot.
import type { ContentTables } from '@cr/content';
import type { InputFrame } from '../core/input.ts';
import { Held, Edge } from '../core/input.ts';
import { Attach, Phase, type KartState, type WorldState } from '../core/state.ts';
import { DT } from '../core/units.ts';
import type { BakedTrack, FrameSample } from '../track/BakedTrack.ts';
import { gripGain, paramsFor, type KartParams } from '../kart/params.ts';
import type { AiDriver, AiProfile } from './api.ts';
import { AI_TIERS } from './api.ts';
import { AiRng, mixSeed } from './rng.ts';
import { planFor, gripTable, type PathPlan, type TrackPlan, type Corner } from './plan.ts';
import { AI_GHOST_PROFILE, personalityOf, resolveProfile, type EffectiveProfile } from './profiles.ts';
import { planLane, type LaneQuery, type LaneResult } from './avoid.ts';
import { makeBlocks, scanHazards } from './hazards.ts';
import { Recovery, type RecoveryIn, type RecoveryOut } from './recovery.ts';
import { SelfPredictor } from './predict.ts';
import type { AiDriverArgs, AiItemPolicy, AiItemView, AiRole } from './hooks.ts';
import { createItemBrain, decideItem, type ItemBrain, type ItemEnv } from './items/index.ts';
import { EF } from '../items/codes.ts';

/** status.modMask bit of the Redaction overlay (perception noise, 14-ai §6). */
const REDACTION_BIT = 1 << (EF.redaction - 1);

const DEG = Math.PI / 180;
const RAIL_INTENT: Readonly<Record<string, number>> = { rookie: 0.3, racer: 0.6, pro: 1, legend: 1 };
/** A split this far behind the kart's located s still counts as taken (the sim relocates onto the branch late). */
const FORK_GRACE = 40;
/** Branch ends converge into the host over this many metres; queries there resolve onto the host. */
const MERGE_BLEND = 20;
/** Counter-steer of a trim: just under the cut threshold (cutSteer 0.7 on the wire grid: 86/127 = 0.677). */
const TRIM_SIN = 0.677;
/** Validated gap-2 controller constants (docs/research/sim-prototype.md aiDriver). */
const A = {
  Lk0: 6, Lk1: 0.35, trigDeg: 25, trigLook: 40, gripFrac: 0.9, tLead: 0.5, outBias: 0.6, tHead: 0.45, kHead: 2.5, kLatPos: 0.6,
  eExit: 0.05, ehShift: 0.4, rekTicks: 18, ehRekick: 0.8, sInMax: 0.8, sbHi: 0.42, sbShiftMax: 0.4, outBite: 0.35, tPred: 0.25, rLead: 25,
  // the prototype's 0.1 s tap, decremented in float seconds, held DRIFT for 8 frames: keep exactly that
  tapFrames: 8,
} as const;

/**
 * Controller knobs shared by every bot (mutable only for tools/balance experiments; never per bot).
 * Drift styles are flavour and must stay inside the tier band on every track: chopping a corner into chained drifts
 * (corners with chainMinTurn ≤ turn ≤ chainMaxTurn) cost 2–4% on sandglass/spark/proving, so the 'chain' style now
 * shows as earlier cuts (chainEExit), re-kicks and its extra instant-boost rate; 'long' exits later and shifts later.
 */
export const AI_TUNING = {
  lineClampFrac: 9, holdTurn: 0.5, holdMinSIn: -0.3, holdMode: 0, holdKeyEh: -0.05, holdSbMax: 0.45, minZones: 6, eExit: 0.05, hazards: 1,
  chainMinTurn: 0, chainMaxTurn: 0, chainEExit: -0.02, chainShift: 0.35, longEExit: 0.03, longShift: 0.3, longRekickTurn: 2.0,
  // M5 drift exit (15-driving-techniques §4.5): a full counter-steer cuts (β → 0 at once, the drift ends). The exit
  // cuts only when the corner is done (≤ cutTurn rad left), the nose is at most cutPsi rad past the local tangent and
  // cutRoom m are free on the inside; otherwise the counter-steer is a trim below the threshold (the old gradual exit).
  cut: 1, cutTurn: 0.5, cutPsi: 0.3, cutRoom: 1.5, forkTrimM: 120,
  // neutral drift style: shift (keep DRIFT, s_in ≥ 0.6) while eh > ehShift (gap-2 0.4; M5 roster sweep: 0.3 is ≈ 1% faster for
  // every style, the chain/long values above moved by the same −0.1); double drift once eh > ehRekick
  ehShift: 0.3, ehRekick: 0.8,
  // brake in a drift is a brake turn (heading ×2): only while the nose lags the track by more than brakeEh rad
  brakeEh: 0.2,
  // drag control (끌기, 14-ai §3.11): wheel inside the neutral band while the nose is within [dragEhLo, dragEhHi] rad of
  // the track, the kart is not heading for the outer wall (outside < dragOut) and more than dragEndTurn rad is left;
  // taps (톡톡이) every tapGap ticks while the nose is not well ahead of the track (eh > tapEhMin)
  drag: 1, dragEhLo: -0.12, dragEhHi: 0.35, dragOut: 0.45, dragEndTurn: 0.2, tapEhMin: -0.1, tapGap: 8,
  // a boosted drift (v > fastHoldV·vGrip) holding through a long corner may counter-steer down to the trim (not -0.3)
  fastHoldV: 1.1,
  // share of the drag's neutral band (|sIn| < 0.3) the heading controller may use while dragging
  dragTrim: 0.93,
  // keep boosted drifts on corners without a drag plan out of the drag state (wheel just outside the neutral band)
  dragAvoid: 1,
  // no drift trigger while the velocity already points more than ~trigVPsi rad inside the track tangent
  trigVPsi: 0.2,
  // hazards that stay active longer than this (ticks) are not waited for (lane choice only)
  hazardMaxWait: 300,
  // side-contact reflex: karts within sideDs m along and sideGap m across that close at ≥ sideClose m/s
  sideRepel: 0.6, sideDs: 4.5, sideGap: 3.2, sideClose: 0.5, sideMax: 0.6,
  // … and in a drift (× sideDrift on sIn; an inside rival eases sIn no lower than sideDriftMin)
  sideDrift: 1, sideDriftMin: -0.3,
  // build-up to the entry window (first dragBuildMaxTicks of the drift): dragBuildSIn in-steer while the nose lags by
  // more than dragBuildEhLo and the yaw is below the wanted yaw + dragBuildYaw; DRIFT re-pressed only past dragRekickEh;
  // the boost must outlast dragBoostMin ticks
  dragBuildMaxTicks: 40, dragBuildEhLo: 0.1, dragBuildSIn: 1, dragBoostMin: 20, dragBuildYaw: 1.2, dragRekickEh: 0.35,
  // drag yaw regulation: heading gain (1/s) on e, damping on the yaw excess (per rad/s), taps while the yaw is below the
  // wanted yaw + tapYawMargin
  dragKh: 2, dragKd: 0.5, tapYawMargin: 0.6, dragKapLead: 0.2, dragHeldSwap: 0.15, dragYawRelease: 0.3,
  // the drag also stops when the kart runs to the inside (outside < -dragIn, a share of the half-width)
  dragIn: 0.45,
  // boosters are kept for a planned drag corner up to dragHoldM ahead, unless one fired now still covers its entry
  dragHoldM: 150, dragCoverS: 1.2,
  // deliberate brake turn (고속턴) on a rolled hairpin: one ~5-frame tap while the nose lags by more than bturnEh rad
  bturnFrames: 5, bturnEh: 0.45, hairpinTurn: 2.0, hairpinR: 20, dragMaxTurn: 2.6,
  // Pro/Legend fire straight-line boosters so they run out inside a drift (a drift cancels the bleed): wait at most
  // expiryWaitS for that, assuming the boost covers expirySpeed·boost time metres
  expiryWaitS: 0.4, expirySpeed: 0.95,
};

/** Drift execution plan for one corner on one lap (14-ai §3.9). */
export const DriftPlan = { OPTIMAL: 0, SLOPPY: 1, GRIP: 2 } as const;
/** Mistakes (14-ai §3.9): late brake (or a panic brake where no braking is needed), over-held drift, running wide. */
export const Mistake = { NONE: 0, LATE_BRAKE: 1, OVERHOLD: 2, WIDE: 3, PANIC_BRAKE: 4 } as const;

/** Counters a driver keeps about itself (tests, tools/balance). Plain numbers; never read by the sim. */
export interface AiDriverStats {
  plans: [number, number, number];   // optimal / sloppy / grip plans on drift-worthy corners
  mistakes: number;
  instRolls: number; instPlanned: number;
  boostsFired: number;
  laneChanges: number; overtakeLanes: number; draftFollows: number;
  recoveries: number; resets: number;
  /** Branch forks passed / taken (14-ai §4.1). */
  forksSeen: number; forksTaken: number;
  /** Σ|u − line| and Σ signed personality bias, sampled every tick (line accuracy / style metrics). */
  sumAbsLineDev: number; sumBias: number; samples: number;
  /** Technique plans (M5): drag, tap and brake-turn plans rolled on eligible corners, taps pressed, boosters fired
   *  into a planned drag corner, straight-line boosters held back so they expire in a drift. */
  dragPlans: number; tapPlans: number; brakeTurnPlans: number; tapsPressed: number; dragBoosts: number; expiryWaits: number;
  /** Longest run of consecutive brake frames committed while drifting. */
  maxDriftBrakeRun: number;
}

/** The driver interface plus introspection used by tests/tools (a superset of B8 `AiDriver`). */
export interface AiDriverEx extends AiDriver {
  readonly profile: Readonly<EffectiveProfile>;
  readonly stats: AiDriverStats;
  readonly role: AiRole;
  /** Forget per-lap plans, pipe and recovery state (e.g. when a takeover driver is re-attached). */
  resync(): void;
}

/**
 * B8 factory. `personality` may carry AiProfile overrides and the driver extras (hooks.ts: character, lookahead,
 * role, cfg, …). `cfg` may also be passed as a 7th argument (the L2 call-site request's form); with a config the
 * driver runs L2's item brain at the end of every decide().
 */
export function createAiDriver(track: BakedTrack, content: ContentTables, slot: number, profile: AiProfile = AI_TIERS.pro, personality: AiDriverArgs = {}, seed = 1,
  cfg?: AiDriverArgs['cfg']): AiDriverEx {
  return new BotDriver(track, content, slot, profile, cfg && !personality.cfg ? { ...personality, cfg } : personality, seed);
}

class BotDriver implements AiDriverEx {
  readonly slot: number;
  readonly profile: EffectiveProfile;
  readonly role: AiRole;
  readonly stats: AiDriverStats = {
    plans: [0, 0, 0], mistakes: 0, instRolls: 0, instPlanned: 0, boostsFired: 0, laneChanges: 0, overtakeLanes: 0, draftFollows: 0,
    recoveries: 0, resets: 0, forksSeen: 0, forksTaken: 0, sumAbsLineDev: 0, sumBias: 0, samples: 0,
    dragPlans: 0, tapPlans: 0, brakeTurnPlans: 0, tapsPressed: 0, dragBoosts: 0, expiryWaits: 0, maxDriftBrakeRun: 0,
  };
  private readonly track: BakedTrack;
  private readonly content: ContentTables;
  private readonly plan: TrackPlan;
  private readonly rng: AiRng;
  private readonly LA: number;
  private readonly item: AiItemPolicy | null;
  private readonly wantBoxes: boolean;
  private readonly cruiseProfile: EffectiveProfile;
  private readonly pred: SelfPredictor;
  private readonly brain: ItemBrain | null;
  private readonly itemEnv: ItemEnv | null;
  // ---- route (branch choice): per-fork decision for the current lap, and the origin of route-relative queries
  private readonly forkTake: Uint8Array;
  private readonly forkLap: Int32Array;
  private routePath = -1; private routeS0 = 0.5; private onRiskBranch = false;
  private forkNear = 0; private forkTakeNear = false; private forkNoDrift = false; private mergeSide = 0; private forkNearRailVMin = 0;
  /** A branch split within AI_TUNING.forkTrimM ahead: drift exits trim instead of cutting (keeps the split approach). */
  private forkSoon = false;
  private readonly warpTake: Uint8Array; private readonly warpLap: Int32Array;
  private warpNear = false; private warpU0 = 0.5; private warpU1 = 0.5; private warpDist = 0.5;
  private P: KartParams | null = null;
  private grip: Float64Array[] | null = null;

  // ---- sampling scratch (resolved path/index/fraction of the last `at()` call)
  private rp: PathPlan;
  private ri = 0; private rj = 0; private rf = 0.5; private rs = 0.5; private rsCur = 0.5; private qs = 0.5;

  // ---- start
  private pressAt = -1e9; private startRolled = false; private readonly startOffset: number;
  // ---- line noise (Ornstein–Uhlenbeck, σ = lineNoise, τ = 90 ticks, advanced at 20 Hz)
  private noise = 0.5;
  // ---- drift state
  private tapLeft = 0; private tapDir = 1; private rek = 0;
  private predDrifting = false;
  private brakeRun = 0; // diagnostics: actual continuous brake requests
  private lastHeld = false; // DRIFT held in the last committed frame
  private instOk = true; private instHandled = true; private instPressAt = -1; private instArmed = false;
  private holdExtra = 0; private cornerDrifts = 0;
  // ---- per-corner plan
  private cCorner = -2; private cPath = -1;
  private cPlan: number = DriftPlan.OPTIMAL; private cLate = 0.5; private cHold = 0; private cMistake: number = Mistake.NONE;
  private lateBrakeLeft = 0; private wideT = 0.5; private cChain = true; private panicLeft = 0;
  // ---- per-corner technique plan (M5): drag (끌기), tap boost (톡톡이), brake drift turn (고속턴)
  private cDrag = false; private cTap = false; private cBrakeTurn = false; private bturnDone = false; private bturnLeft = 0;
  private tapNext = 8; private dragging = false;
  // drag plans are rolled once per corner pass (key = the lap of the pass), early when the booster hold looks ahead
  private readonly dragKey: Int32Array[]; private readonly dragPlan: Uint8Array[];
  // ---- boosters
  private boostReadyAt = -1; private prevBoost = false; private expiryDeadline = -1; private raceDistNow = 0.5;
  // ---- lanes
  private laneOff = 0.5; private laneTarget = 0.5; private laneTtc = 1e9; private laneClosing = 0.5; private laneActualClosing = 0.5; private laneDrafting = false;
  private startLaneSet = false;
  // ---- recovery
  private readonly rec = new Recovery();
  private readonly recIn: RecoveryIn = { sinceGo: 0, v: 0.5, vFwd: 0.5, aTarget: 0.5, aTrack: 0.5, lowSpeedTicks: 0, wrongWayTicks: 0, canAct: false, sinceRespawn: 0, raceDist: 0.5, sinceCc: 999, sinceWall: 999 };
  private lastCcTick = -1000; private lastWallTick = -1000;
  private readonly recOut: RecoveryOut = { steer: 0.5, thr: 0.5, brk: 0.5, reset: false };
  private readonly surfaceFrame: FrameSample = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: -1, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, wL: 6, wR: 6, sMain: 0, flags: 0 };
  private lastRespawnTick = -1000; private prevRespawns = 0;
  // ---- mash-out
  private nextTap = 0; private mashDir = 1;
  // ---- avoidance scratch
  private readonly lq: LaneQuery = {
    slot: 0, sMain: 0.5, path: 0, u: 0.5, vS: 0.5, vU: 0.5, tx: 0.5, tz: 0.5, rx: 0.5, rz: 0.5, hw: 8.5, lineAbs: 0.5, laneOff: 0.5, la: 0.5,
    straight: false, nextCornerDir: 0, nextCornerDist: 0.5, lineWeight: 1.5, draftActive: false, wish: NaN, horizon: 1.5, blocks: null,
  };
  private readonly blocks = makeBlocks();
  private hazardCap = 99; private hazardLane = false;
  private readonly lr: LaneResult = { laneOff: 0.5, ttc: 1e9, closing: 0.5, actualClosing: 0.5, drafting: false, overtaking: false, urgent: false };
  private laneUrgent = false;
  private readonly view: { -readonly [K in keyof AiItemView]: AiItemView[K] };

  constructor(track: BakedTrack, content: ContentTables, slot: number, profile: AiProfile, args: AiDriverArgs, seed: number) {
    this.slot = slot;
    this.track = track;
    this.content = content;
    this.plan = planFor(track);
    this.rp = this.plan.paths[0]!;
    this.role = args.role ?? 'racer';
    const ghost = this.role === 'ghost';
    this.rng = new AiRng(mixSeed(seed, slot, 0x41490001));
    const pers = personalityOf(content, ghost ? undefined : args.character);
    this.profile = resolveProfile(ghost ? AI_GHOST_PROFILE : profile, ghost ? {} : args, pers, args.noJitter || ghost ? null : this.rng, ghost);
    // finished karts cruise with Rookie noise and no items (10-sim §12.8, 14-ai §10)
    this.cruiseProfile = resolveProfile(AI_TIERS.rookie, {}, pers, null, false);
    this.LA = Math.max(0, Math.min(30, Math.floor(args.lookaheadTicks ?? 0)));
    this.pred = new SelfPredictor(this.LA);
    const ip = args.itemPolicy;
    this.item = typeof ip === 'function' ? ip(slot, this.profile, mixSeed(seed, slot, 0x49544d31)) : ip ?? null;
    // L2 item brain (ai/items): needs the race config for team rules
    this.itemEnv = args.cfg ? { track, content, cfg: args.cfg } : null;
    this.brain = args.cfg && !ghost ? createItemBrain(slot, this.profile, { itemHoarding: pers.itemHoarding, aggression: pers.aggression }, mixSeed(seed, slot, 0x49544d32)) : null;
    this.wantBoxes = this.item !== null || args.mode === 'item' || args.cfg?.mode === 'item';
    this.forkTake = new Uint8Array(this.plan.forks.length);
    this.warpTake = new Uint8Array(track.warps.length); this.warpLap = new Int32Array(track.warps.length).fill(-999);
    this.forkLap = new Int32Array(this.plan.forks.length).fill(-999);
    this.dragKey = this.plan.paths.map((pp) => new Int32Array(pp.corners.length).fill(-999));
    this.dragPlan = this.plan.paths.map((pp) => new Uint8Array(pp.corners.length));
    this.startOffset = args.startOffsetTicks ?? NaN;
    this.laneOff = 0; this.laneTarget = 0; this.hazardLane = false; this.noise = 0; this.laneTtc = Infinity; this.laneClosing = 0; this.laneActualClosing = 0;
    this.view = {
      w: null as unknown as WorldState, track, slot, profile: this.profile, applyTick: 0, highRate: false, s: 0, u: 0, turnAhead40: 0, straightAhead: 0, busy: false,
    };
  }

  resync(): void {
    this.cCorner = -2; this.rec.reset(); this.laneOff = 0; this.laneTarget = 0; this.hazardLane = false; this.boostReadyAt = -1;
    this.instHandled = true; this.instPressAt = -1; this.holdExtra = 0; this.tapLeft = 0; this.rek = 0; this.pred.reset();
  }

  // ------------------------------------------------------------------------------------------------ sampling
  /**
   * Resolves (path, s) to a sample pair on the plan: sets rp/ri/rj/rf/rs. Queries on the bot's current path are
   * route-relative: past a fork it chose they continue on the branch; past the end of a branch on its host.
   */
  private at(path: number): void {
    // the station comes in through a field: a double argument to a non-inlined call is boxed on every call
    const s = this.qs;
    const paths = this.plan.paths;
    let pp = paths[path] ?? paths[0]!;
    let ss = s;
    let from = path === this.routePath ? this.routeS0 : NaN;
    for (let hop = 0; hop < 4; hop++) {
      let moved = false;
      if (from === from) {
        const forks = pp.forks;
        for (let q = 0; q < forks.length; q++) {
          const f = forks[q]!;
          if (this.forkTake[f.id] !== 1) continue;
          // signed distance from the route origin to the split; the sim keeps locating a kart on the host for a
          // few metres into the branch, so a split up to FORK_GRACE behind still counts as taken
          let d = f.at - from;
          if (pp.closed) { const L = pp.length; if (d < -L / 2) d += L; else if (d >= L / 2) d -= L; }
          if (d >= -FORK_GRACE && from + d <= ss) {
            ss = f.toS + (ss - (from + d)); from = f.toS + (d < 0 ? -d : 0); pp = paths[f.to] ?? pp; moved = true; break;
          }
        }
      }
      // the last MERGE_BLEND metres of a branch overlap the host road: steer by the host there
      if (!moved && !pp.closed && pp.next && ss > pp.next.at - MERGE_BLEND) {
        ss = pp.next.s + (ss - pp.next.at); from = pp.next.s; pp = paths[pp.next.path] ?? pp; moved = true;
      }
      if (!moved) break;
    }
    if (pp.closed) { const L = pp.length; ss -= L * Math.floor(ss / L); }
    else if (ss < 0) ss = 0; else if (ss > pp.length) ss = pp.length;
    const x = ss / pp.ds;
    let i = Math.floor(x);
    let f = x - i;
    if (pp.closed) { if (i >= pp.n) i -= pp.n; this.rj = i + 1 >= pp.n ? 0 : i + 1; }
    else { if (i >= pp.n - 1) { i = pp.n - 1; f = 0; } this.rj = i + 1 < pp.n ? i + 1 : i; }
    this.rp = pp; this.ri = i; this.rf = f; this.rs = ss;
  }


  // ------------------------------------------------------------------------------------------------ decide
  decide(w: Readonly<WorldState>, out: InputFrame): void {
    out.steerIntent = 0; out.driftRequests = 0;
    out.steer = 0; out.throttle = 0; out.brake = 0; out.held = 0; out.edges = 0; out.aim = 255; out.emote = 0;
    const k = w.karts[this.slot];
    if (!k || !k.active) return;
    if (k.race.finishTick >= 0 || k.race.retired || w.phase === Phase.DONE) { this.commit(out); return; }
    this.decideDriving(w, k, out);
    // L2 item brain: the single item call site, after the driving controls are final (it may add item edges, aim
    // and LOOK_BACK, and counter-steer under Mirror Mode). Never while cruising after the finish or on a kill-risk branch.
    if (this.brain && this.itemEnv && k.race.finishTick < 0 && this.role !== 'cruise') {
      decideItem(this.brain, w, this.itemEnv, out, w.tick + 1 + this.LA);
      if (this.onRiskBranch) out.edges &= ~Edge.USE_ITEM;
    }
  }

  private decideDriving(w: Readonly<WorldState>, k: KartState, out: InputFrame): void {
    if (!this.P) { this.P = paramsFor(this.content.karts.byCode[k.spec]!); this.grip = gripTable(this.plan, this.P); }
    const applyTick = w.tick + 1 + this.LA;
    if (k.stats.respawns !== this.prevRespawns) { this.prevRespawns = k.stats.respawns; this.lastRespawnTick = w.tick; }
    if (w.phase < Phase.RACING || applyTick <= w.goTick + 24) {
      // start: press throttle around GO with the tier's timing (10-sim §7.1); hold it once pressed
      if (!this.startRolled) this.rollStart(w);
      if (applyTick >= this.pressAt) out.throttle = 15;
      if (w.phase < Phase.RACING || applyTick < this.pressAt) { this.commit(out); return; }
    }
    if (w.phase === Phase.DONE) { this.commit(out); return; }
    if (k.body.attachKind !== Attach.NONE) {
      // on a rail or inside a warp the kart is kinematic: hold the throttle, wheel straight, no drift
      this.rec.reset(); this.tapLeft = 0; this.predDrifting = false; this.holdExtra = 0;
      out.throttle = 15;
      this.commit(out);
      return;
    }
    if (k.race.respawnPhase !== 0) {
      // inputs are ignored while respawning; hold throttle so the kart launches the moment control returns
      this.rec.reset(); this.cCorner = -2; this.holdExtra = 0; this.tapLeft = 0; this.predDrifting = false;
      out.throttle = 15;
      this.commit(out);
      return;
    }
    this.drive(w, k, out, applyTick, this.role === 'cruise');
    this.commit(out, k);
  }

  /** Commit the actual requested brake to the lookahead model; there is no timed spin-out to work around. */
  private commit(out: InputFrame, k?: KartState): void {
    const ctx = (out.held & Held.DRIFT) !== 0 || this.pred.drift === 1 || (k !== undefined && k.drive.drift === 1);
    const air = k !== undefined && k.body.grounded === 0 && k.body.coyote <= 0;
    if (air) out.brake = 0;
    if (out.brake > 0 && ctx) { this.brakeRun++; this.stats.maxDriftBrakeRun = Math.max(this.stats.maxDriftBrakeRun, this.brakeRun); }
    else this.brakeRun = 0;
    this.lastHeld = (out.held & Held.DRIFT) !== 0;
    this.pred.push(-out.steer / 127, this.lastHeld, out.throttle > 0, out.brake > 0, out.edges, (out.edges & Edge.USE_ITEM) !== 0);
  }

  private rollStart(w: Readonly<WorldState>): void {
    this.startRolled = true;
    const p = this.profile;
    // a takeover or late-attached driver after GO just drives
    if (w.tick >= w.goTick || this.role === 'cruise' || this.role === 'takeover' && w.tick >= w.goTick - 30) { this.pressAt = -1e9; return; }
    if (this.startOffset === this.startOffset) { this.pressAt = w.goTick + this.startOffset; return; }
    if (this.rng.next() < p.falseStartProb) this.pressAt = w.goTick - this.rng.int(13, 20);
    else this.pressAt = w.goTick + this.rng.int(p.startDelayTicks[0], p.startDelayTicks[1]);
  }

  private drive(w: Readonly<WorldState>, k: KartState, out: InputFrame, applyTick: number, cruising: boolean): void {
    const P = this.P!, prof = cruising ? this.cruiseProfile : this.profile, ex = prof.exec;
    const b = k.body, d = k.drive, loc = k.race.loc;
    const highRate = (w.tick + this.slot) % 3 === 0;
    // ---- perception at the apply tick: replay our own pending frames (14-ai §1)
    const pr = this.pred;
    const surf = this.content.surfaceByCode[b.surf];
    pr.run(k, P, prof.vMul, surf ? surf.grip : 1, surf ? surf.vMul : 1);
    const hx = pr.hx, hy = pr.hy, vx = pr.vx, vy = pr.vy, kx = pr.px, ky = pr.py;
    const v = Math.sqrt(vx * vx + vy * vy);
    const drifting = pr.drift === 1;
    const locPath = loc.path;
    this.routePath = locPath; this.routeS0 = loc.s;
    this.decideForks(k, prof);
    this.qs = loc.s; this.at(locPath);
    const tX0 = (this.rp.TX[this.ri]! + (this.rp.TX[this.rj]! - this.rp.TX[this.ri]!) * this.rf), tY0 = (this.rp.TY[this.ri]! + (this.rp.TY[this.rj]! - this.rp.TY[this.ri]!) * this.rf);
    // predicted track coordinates: a linear step in the current frame, then a projection onto the route path
    // (past a chosen fork the kart is measured against the branch even while the sim still locates it on main)
    let path = locPath, s = loc.s, u = loc.u;
    {
      const dx = kx - b.px, dy = ky + b.pz;
      s += dx * tX0 + dy * tY0; u += dx * tY0 - dy * tX0;
      this.qs = s; this.at(locPath);
      if (this.LA > 0 || this.rp.index !== locPath) {
        const cx = (this.rp.X[this.ri]! + (this.rp.X[this.rj]! - this.rp.X[this.ri]!) * this.rf), cy = (this.rp.Y[this.ri]! + (this.rp.Y[this.rj]! - this.rp.Y[this.ri]!) * this.rf), tx = (this.rp.TX[this.ri]! + (this.rp.TX[this.rj]! - this.rp.TX[this.ri]!) * this.rf), ty = (this.rp.TY[this.ri]! + (this.rp.TY[this.rj]! - this.rp.TY[this.ri]!) * this.rf);
        const e1 = kx - cx, e2 = ky - cy;
        s = this.rs + e1 * tx + e2 * ty; u = e1 * ty - e2 * tx;
        if (this.rp.index !== locPath) {
          if (Math.abs(u) > (this.rp.WALL[this.ri]! + (this.rp.WALL[this.rj]! - this.rp.WALL[this.ri]!) * this.rf) + 1.5 && this.abandonFork(locPath, this.rp.index)) {
            // not actually in the branch (blocked or missed the gore): stay on the host this lap
            this.qs = loc.s; this.at(locPath);
            s = loc.s + dx * tX0 + dy * tY0; u = loc.u + dx * tY0 - dy * tX0;
          } else { path = this.rp.index; this.routePath = path; this.routeS0 = s; }
        }
      }
    }
    this.qs = s; this.at(path);
    const ppS = this.rp;
    this.rsCur = this.rs;
    const tXs = (ppS.TX[this.ri]! + (ppS.TX[this.rj]! - ppS.TX[this.ri]!) * this.rf), tYs = (ppS.TY[this.ri]! + (ppS.TY[this.rj]! - ppS.TY[this.ri]!) * this.rf);
    const vS = vx * tXs + vy * tYs, vU = vx * tYs - vy * tXs; // along-track, right-positive lateral
    const vFwd = vx * hx + vy * hy;
    const hw = (ppS.HW[this.ri]! + (ppS.HW[this.rj]! - ppS.HW[this.ri]!) * this.rf);
    const t40 = (ppS.T40[this.ri]! + (ppS.T40[this.rj]! - ppS.T40[this.ri]!) * this.rf);
    const straightAhead = ppS.STRAIGHT[this.ri]!;
    const ci = ppS.CORNER[this.ri]!;
    const corner: Corner | null = ci >= 0 ? ppS.corners[ci]! : null;
    let cornerDist = 1e9, inCorner = false;
    if (corner) {
      cornerDist = corner.s0 - this.rs;
      if (ppS.closed && cornerDist < -ppS.length / 2) cornerDist += ppS.length;
      if (cornerDist <= 0) { inCorner = true; cornerDist = 0; }
    }
    // ---- next jump on the route (14-ai §4.2): lip distance and the validated lip-speed window
    let dLip = 1e9, jvMin = 0, jvMax = 99;
    {
      const js = ppS.jumps;
      for (let q = 0; q < js.length; q++) {
        const j = js[q]!;
        let d = j.lipS - this.rs;
        if (ppS.closed && d < -50) d += ppS.length;
        if (d > -2 && d < dLip) { dLip = d; jvMin = j.vMin; jvMax = j.vMax; }
      }
    }
    const jumpNear = dLip < 60 || ppS.RMF[this.ri] === 1; // loops / zero-g: no drift, straight line (14-ai §4.5)
    // ---- per-corner execution plan, rolled once per corner per pass
    this.raceDistNow = k.race.raceDist;
    if (ci !== this.cCorner || ppS.index !== this.cPath) this.rollCorner(ci, ppS, corner, prof);
    // ---- line noise (OU at 20 Hz: dt = 3 ticks, τ = 90 ticks)
    if (highRate) {
      // Redaction doubles perception noise (14-ai §6); on halfpipe walls the line is held twice as tightly (§4.4)
      const sig = prof.lineNoise * ((k.status.modMask & REDACTION_BIT) !== 0 ? 2 : 1) * (ppS.PIPE[this.ri] ? 0.5 : 1);
      if (sig > 0) {
        const a = 3 / 90;
        this.noise += -a * this.noise + sig * Math.sqrt(2 * a) * this.rng.gauss();
        const nl = Math.max(0, hw - 1.5);
        if (this.noise > nl) this.noise = nl; else if (this.noise < -nl) this.noise = -nl;
      } else this.noise = 0;
    }

    // ---- upcoming corner at the current speed: first sample in 40 m where the width-allowed curvature beats grip
    const qk = v / P.gripV1, gripKap = (P.yGrip * v) / (v + P.gripV0) / (1 + qk * qk) / (v > 1 ? v : 1);
    let dCorner = 1e9, cornerDir = 0, cornerR = 1e9;
    {
      const thr = A.gripFrac * gripKap;
      // the scan usually stays on one path: resolve both ends, and when the far end is the same path exactly
      // trigLook metres on, index the samples directly instead of resolving the route 41 times
      this.qs = s; this.at(path);
      const pp0 = this.rp, rs0 = this.rs;
      this.qs = s + A.trigLook; this.at(path);
      let span = this.rs - rs0;
      if (pp0.closed && span < 0) span += pp0.length;
      if (this.rp === pp0 && Math.abs(span - A.trigLook) < 1e-6) {
        const n0 = pp0.n, KE = pp0.KEFF;
        for (let q = 0; q <= A.trigLook; q++) {
          let ss = rs0 + q;
          if (pp0.closed) { if (ss >= pp0.length) ss -= pp0.length; } else if (ss > pp0.length) ss = pp0.length;
          let i = Math.floor(ss / pp0.ds);
          if (i >= n0) i = pp0.closed ? i - n0 : n0 - 1;
          const ke = KE[i]!;
          if ((ke > 0 ? ke : -ke) > thr) { dCorner = q; cornerDir = ke > 0 ? 1 : -1; const kk = pp0.KAP[i]!; cornerR = 1 / Math.max(1e-6, kk > 0 ? kk : -kk); break; }
        }
        // leave the sample state where the per-metre scan left it (the ledge check below reads it)
        if (dCorner < 1e9) { this.qs = s + dCorner; this.at(path); }
      } else {
        for (let q = 0; q <= A.trigLook; q++) {
          this.qs = s + q; this.at(path);
          const ke = this.rp.KEFF[this.ri]!;
          if ((ke > 0 ? ke : -ke) > thr) { dCorner = q; cornerDir = ke > 0 ? 1 : -1; const kk = this.rp.KAP[this.ri]!; cornerR = 1 / Math.max(1e-6, kk > 0 ? kk : -kk); break; }
        }
      }
    }
    const planDrift = this.cPlan !== DriftPlan.GRIP;

    // ---- lateral target at the pursuit point
    // open ledges (no wall, a drop beside the road): short lookahead so the chord never cuts off the edge
    const ledgeHere = ppS.LEDGE[this.ri] !== 0;
    const narrowLedge = ledgeHere && hw < 5;
    const Lk = ledgeHere ? 4 + 0.22 * v : A.Lk0 + A.Lk1 * v;
    this.qs = s + Lk; this.at(path);
    const ppT = this.rp;
    const cxT = (ppT.X[this.ri]! + (ppT.X[this.rj]! - ppT.X[this.ri]!) * this.rf), cyT = (ppT.Y[this.ri]! + (ppT.Y[this.rj]! - ppT.Y[this.ri]!) * this.rf), txT = (ppT.TX[this.ri]! + (ppT.TX[this.rj]! - ppT.TX[this.ri]!) * this.rf), tyT = (ppT.TY[this.ri]! + (ppT.TY[this.rj]! - ppT.TY[this.ri]!) * this.rf);
    const hwT = (ppT.HW[this.ri]! + (ppT.HW[this.rj]! - ppT.HW[this.ri]!) * this.rf);
    // on halfpipes the baked line is the guide line (the bake's best wall ride): always follow it
    let lineAbs = (ppT.LINE[this.ri]! + (ppT.LINE[this.rj]! - ppT.LINE[this.ri]!) * this.rf) * (ppT.PIPE[this.ri] ? 1 : (ppT.LINEW[this.ri]! + (ppT.LINEW[this.rj]! - ppT.LINEW[this.ri]!) * this.rf)) * ex.lineTrack;
    { const lc = AI_TUNING.lineClampFrac * Math.max(0, hwT - 1.5); if (lineAbs > lc) lineAbs = lc; else if (lineAbs < -lc) lineAbs = -lc; }
    // personality line bias: + = outside of the next corner, on straights and before corners (not inside them)
    let bias = 0;
    if (corner && !inCorner) bias = prof.lineBiasFrac * Math.max(0, hwT - 1.5) * corner.dir * (cornerDist < 120 ? 1 : 0.5);
    let off = lineAbs + (this.hazardLane ? 0 : bias + this.noise) + this.laneOff;
    if (dCorner < 1e8 && planDrift && !drifting && !this.hazardLane) {
      // approach bias to the outside of a drift corner within the lead distance (validated gap-2 approach);
      // the outside of a left corner (+1) is the right side (+u)
      const ob = cornerDir * A.outBias * (hwT - 1.5) + bias;
      if (ob > 0 ? off < ob : off > ob) off = ob;
    }
    const ledge = ppT.LEDGE[this.ri]! | ppT.LEDGE[this.rj]!;
    let limL = (ppT.LIM_L[this.ri]! + (ppT.LIM_L[this.rj]! - ppT.LIM_L[this.ri]!) * this.rf), limR = (ppT.LIM_R[this.ri]! + (ppT.LIM_R[this.rj]! - ppT.LIM_R[this.ri]!) * this.rf);
    if (!this.hazardLane && this.cMistake === Mistake.WIDE && inCorner && corner && (ledge & (corner.dir > 0 ? 2 : 1)) === 0) {
      // running wide (onto the shoulder or into the wall) never toward an open ledge
      off += corner.dir * this.wideT;
      if (corner.dir > 0) limR += 2; else limL += 2;
    }
    // jump approach: line up on the ramp centre (no lane games, no line bias) over the last 50 m
    if (jumpNear) { const f = dLip < 10 ? 0 : (dLip - 10) / 40; off *= f < 1 ? f : 1; }
    // branch splits: set up on the branch side when taking it, stay clear of the gore when not
    if (this.forkNear !== 0) {
      const usable = Math.max(0.5, hwT - 1.5), sd = this.forkNear;
      if (this.forkTakeNear) { if (off * sd < 0.6 * usable) off = sd * 0.6 * usable; }
      else if (off * sd > -0.25 * usable) off = -sd * 0.25 * usable;
    }
    if (this.warpNear) {
      // aim for the middle of the warp window from 50 m out
      const mid = 0.5 * (this.warpU0 + this.warpU1), half = Math.max(0.2, 0.5 * (this.warpU1 - this.warpU0) - 0.9);
      if (this.warpDist < 50) { off = mid + Math.max(-half, Math.min(half, off - mid) * 0.3); }
    }
    if (ledgeHere || (ledge !== 0)) {
      // hold the line: damp lateral drift and respect the edge limits where the kart is, not only at the target
      off -= vU * 0.3;
      this.qs = s; this.at(path);
      const LLa = this.rp.LIM_L, LRa = this.rp.LIM_R;
      const lL = LLa[this.ri]! + (LLa[this.rj]! - LLa[this.ri]!) * this.rf, lR = LRa[this.ri]! + (LRa[this.rj]! - LRa[this.ri]!) * this.rf;
      if (lL < limL) limL = lL;
      if (lR < limR) limR = lR;
    }
    if (off > limR) off = limR; else if (off < -limL) off = -limL;
    const gx = cxT + tyT * off, gy = cyT - txT * off; // right = (ty, −tx)
    const exT = gx - kx, eyT = gy - ky;
    const ed = Math.max(1, Math.sqrt(exT * exT + eyT * eyT));
    const aH = Math.atan2(-exT * hy + eyT * hx, exT * hx + eyT * hy);
    this.qs = s; this.at(path);
    this.stats.sumAbsLineDev += Math.abs(u - (this.rp.LINE[this.ri]! + (this.rp.LINE[this.rj]! - this.rp.LINE[this.ri]!) * this.rf) * (this.rp.LINEW[this.ri]! + (this.rp.LINEW[this.rj]! - this.rp.LINEW[this.ri]!) * this.rf) * ex.lineTrack);
    this.stats.sumBias += bias; this.stats.samples++;

    let steer: number, thr = 1, brk = 0, drift = false, boost = false;
    let driftEh = 0; // heading error in the drift (+ = the nose lags the track): gates brake turns
    let tapEdge = 0; // TAP_L / TAP_R edge of a tap boost (in the driver's own, un-mirrored frame)
    this.dragging = false;
    const airborne = !b.grounded && b.coyote <= 0;
    let keepThrottle = d.startTicks > 0; // releasing the throttle would cancel a start boost

    if (airborne) {
      // in the air: throttle held, wheel straight (14-ai §4.2)
      steer = 0;
    } else if (!drifting) {
      this.predDrifting = false;
      if (Math.abs(aH) > Math.PI / 2) steer = aH > 0 ? 1 : -1;
      else {
        // pure pursuit yaw rate → grip steer (gripGain inlined: helper calls returning doubles box in hot code)
        const qg = v / P.gripV1, gg = (P.yGrip * v) / (v + P.gripV0) / (1 + qg * qg);
        const st = gg > 1e-3 ? ((2 * Math.sin(aH) / ed) * v) / gg : 0;
        steer = st > 1 ? 1 : st < -1 ? -1 : st;
      }
      if (this.tapLeft > 0) {
        // entry tap whose drift the model did not see start (speed or lock): finish the tap anyway
        drift = true; steer = this.tapDir; this.tapLeft--;
      } else if (planDrift && !jumpNear && !narrowLedge && !this.forkNoDrift && !this.warpNear) {
        // drift trigger (14-ai §3.4) with the plan's timing
        let lead = v * A.tLead * Math.max(0.3, Math.min(1, A.rLead / cornerR));
        if (this.cPlan === DriftPlan.SLOPPY) lead = Math.max(0, lead - this.cLate);
        // (never into a corner the velocity already turns inside of: the kart is ahead of the road there)
        if (Math.abs(t40) > A.trigDeg * DEG && v > 15 && dCorner <= lead && pr.lock <= 0 && cornerDir !== this.mergeSide && -vU * cornerDir < AI_TUNING.trigVPsi * Math.abs(vS)) {
          drift = true; steer = cornerDir; this.tapDir = cornerDir; this.tapLeft = A.tapFrames - 1; this.rek = 0;
          this.onDriftStart(prof);
        }
      }
    } else {
      // heading pursuit while drifting (14-ai §3.5)
      const dd = pr.dir;
      // a drift we did not start ourselves (takeover mid-drift): roll its instant boost now
      if (!this.predDrifting) { this.predDrifting = true; if (!this.instArmed) this.onDriftStart(prof); this.instArmed = false; }
      this.qs = s + Math.max(4, v * A.tHead); this.at(path);
      const tpx = (this.rp.TX[this.ri]! + (this.rp.TX[this.rj]! - this.rp.TX[this.ri]!) * this.rf), tpy = (this.rp.TY[this.ri]! + (this.rp.TY[this.rj]! - this.rp.TY[this.ri]!) * this.rf);
      const eh = Math.atan2(hx * tpy - hy * tpx, hx * tpx + hy * tpy) * dd;
      const dDot = -vU;                        // lateral velocity w.r.t. track, left +
      const dLeft = -u;
      let outside = -dd * (dLeft + dDot * A.tPred) / Math.max(1, hw);
      // running wide (mistake): the controller tolerates the outside until the corner is done
      if (this.cMistake === Mistake.WIDE && corner && (inCorner || cornerDist < 15)) outside -= this.wideT / Math.max(1, hw);
      const wl = -vx * hy + vy * hx;
      const sb = -dd * wl / Math.max(v, 1);
      const e = eh + A.kLatPos * outside;
      let e_forceExit = false;
      let sIn = A.kHead * e;
      if (sIn > A.sInMax) sIn = A.sInMax;
      if (sb > A.sbHi || (outside > A.outBite && eh > 0)) { if (sIn > 0.3) sIn = 0.3; }
      const style = prof.personality.driftStyle;
      const eExit = style === 'long' ? AI_TUNING.eExit + AI_TUNING.longEExit : style === 'chain' ? AI_TUNING.eExit + AI_TUNING.chainEExit : AI_TUNING.eExit;
      // long corner: hold one drag drift through it (soft counter-steer, no cut) instead of chaining short drifts
      const holding = !this.cChain && corner !== null && inCorner && corner.dir === dd && this.remainingTurn(corner, ppS.length) > AI_TUNING.holdTurn;
      if (dLip < 30 || (this.warpNear && this.warpDist < 30)) { this.holdExtra = 0; if (e > -eExit - 0.01) e_forceExit = true; }
      // S-bends: the next bend turns the other way within 15 m — cut now instead of sliding across it
      this.qs = s + 15; this.at(path);
      { const kn = this.rp.KAP[this.ri]!; if (kn * dd < -1 / 150) { e_forceExit = true; this.holdExtra = 0; } }
      // beside an open drop nobody over-holds a drift (sloppy plans and over-hold mistakes are dropped there)
      if (ledgeHere) this.holdExtra = 0;
      if (e < -eExit || e_forceExit) {
        if (this.holdExtra > 0) { this.holdExtra--; if (sIn < 0.25) sIn = 0.25; }
        else if (holding && !e_forceExit) { const m = v > AI_TUNING.fastHoldV * P.vGrip ? -TRIM_SIN : AI_TUNING.holdMinSIn; if (sIn < m) sIn = m; }
        else if (e_forceExit || this.cutOk(corner, inCorner, dd, hx, hy, tXs, tYs, u, hw, ppS.length)) sIn = -1;
        else sIn = -TRIM_SIN;
      }
      driftEh = eh;
      sIn = sIn > 1 ? 1 : sIn < -1 ? -1 : sIn;
      const ehShift = style === 'long' ? AI_TUNING.longShift : style === 'chain' ? AI_TUNING.chainShift : AI_TUNING.ehShift;
      if (e_forceExit) { drift = false; this.tapLeft = 0; }
      else if (this.tapLeft > 0) { drift = true; this.tapLeft--; if (sIn < 0.6) sIn = 0.6; }
      else if (holding && AI_TUNING.holdMode === 1) {
        // drag drift (끌기): keep the key while not over-rotated; the yaw is trimmed with the wheel
        drift = eh > AI_TUNING.holdKeyEh && sb < AI_TUNING.holdSbMax;
      } else if (eh > ehShift && sb < A.sbShiftMax) {
        const reKick = style === 'chain' ? 1.0 : AI_TUNING.ehRekick;
        const longOk = style !== 'long' || (corner !== null && corner.turn > AI_TUNING.longRekickTurn) || eh > 1.0;
        if (pr.dTicks > A.rekTicks && eh > reKick && this.rek === 0 && longOk) { this.rek = 1; drift = false; }
        else drift = true;
        if (sIn < 0.6) sIn = 0.6;
      }
      // ---- drag (끌기, 14-ai §3.11): on a planned drag corner, once the boosted drift has built β into the entry
      // window, hold DRIFT with the wheel neutral while the nose follows the track; the drag law then carries the kart
      // past vBoost (290 km/h). Taps on the corner key every 6–12 ticks (톡톡이) add yaw and lift the cap to 305.
      // a kart alongside (the side-contact reflex below would push the wheel): no drag beside it — a drag holds its
      // line at boost speed and rubs a kart there for a second or more
      let sideRep = 0;
      if (this.tapLeft === 0 && AI_TUNING.sideDrift > 0 && !jumpNear && !ledgeHere && prof.aggression < 0.8) {
        // (the station lookup is restored: later checks read the last looked-up point)
        const rp = this.rp, ri = this.ri, rj = this.rj, rf = this.rf, rs = this.rs;
        this.qs = s; this.at(path);
        if (ppS.PIPE[this.ri] === 0) sideRep = this.sideRepel(w, k, s, u, vU, path) * dd * AI_TUNING.sideDrift;
        this.rp = rp; this.ri = ri; this.rj = rj; this.rf = rf; this.rs = rs;
      }
      const dragCorner = AI_TUNING.drag && this.cDrag && !e_forceExit && sideRep === 0 && corner !== null && corner.dir === dd && (inCorner || cornerDist < 15)
        && pr.boost > AI_TUNING.dragBoostMin && outside < AI_TUNING.dragOut && outside > -AI_TUNING.dragIn
        && (!inCorner || this.remainingTurn(corner, ppS.length) > AI_TUNING.dragEndTurn);
      // yaw the corner asks for at the apply tick: path curvature × speed, plus a heading correction (rad/s, + = into
      // the drift); and the drift's own yaw target with the wheel centred (the y0 term fades with drift time)
      let wantYaw = 0;
      if (dragCorner) {
        this.qs = s + AI_TUNING.dragKapLead * v; this.at(path);
        const kapS = (this.rp.KAP[this.ri]! + (this.rp.KAP[this.rj]! - this.rp.KAP[this.ri]!) * this.rf) * dd;
        wantYaw = (kapS > 0 ? kapS : 0) * v + AI_TUNING.dragKh * e;
      }
      const yawNow = pr.yaw * dd;
      if (dragCorner && pr.dragT === 0 && pr.sb < P.dragEnterLo) {
        // build-up: the AI's plain drift slides at 8–17° and the drag needs β ≥ 20°: a hard entry (full in-steer,
        // DRIFT held from the entry tap) while the nose lags the track and the yaw is not already past what the corner
        // asks for; a released DRIFT is re-pressed (double drift: +0.8 rad/s) only when the nose lags a lot
        if (pr.dTicks <= AI_TUNING.dragBuildMaxTicks && eh > AI_TUNING.dragBuildEhLo && yawNow < wantYaw + AI_TUNING.dragBuildYaw) {
          if (sIn < AI_TUNING.dragBuildSIn) sIn = AI_TUNING.dragBuildSIn;
          drift = this.lastHeld || this.tapLeft > 0 || eh > AI_TUNING.dragRekickEh; thr = 1; keepThrottle = true;
          this.dragging = true;
        }
      } else if (dragCorner && eh > AI_TUNING.dragEhLo && eh < AI_TUNING.dragEhHi && (pr.dragT > 0 || pr.sb >= P.dragEnterLo)) {
        // a boosted entry often slides into the window during the entry tap: the drag takes over from it
        this.tapLeft = 0;
        // Invert the same blended yaw law as the player. Taps raise a smooth curvature target, never mean impulse.
        this.dragging = true;
        const tapping = this.cTap && pr.dragT > 1;
        const gain = gripGain(v, P) * (1 - pr.engagement) + (P.driftYaw + P.tightenYaw * pr.tightness) * v / (v + 3) * pr.engagement;
        sIn = Math.max(0, Math.min(1, wantYaw / Math.max(0.1, gain) - AI_TUNING.dragKd * (yawNow - wantYaw)));
        drift = true;
        thr = 1; keepThrottle = true;
        if (tapping && eh > AI_TUNING.tapEhMin && yawNow < wantYaw + AI_TUNING.tapYawMargin && (pr.gap >= 255 || pr.gap + 1 >= this.tapNext)) {
          tapEdge = dd > 0 ? Edge.TAP_L : Edge.TAP_R;
          this.stats.tapsPressed++;
          const j = ex.tapJitterTicks, g = AI_TUNING.tapGap + (j > 0 ? this.rng.int(-j, j) : 0);
          this.tapNext = g < P.tapMinGap ? P.tapMinGap : g > P.tapMaxGap ? P.tapMaxGap : g;
        }
      } else if (this.cBrakeTurn && !this.bturnDone && corner !== null && corner.dir === dd && inCorner && eh > AI_TUNING.bturnEh && pr.dTicks >= 2) {
        // A planned hairpin brake tap lowers entry speed and starts recovery; yaw remains continuous.
        this.bturnDone = true; this.bturnLeft = AI_TUNING.bturnFrames;
      }
      // side contact in a drift: the slide carries the kart to the outside of its line, into a kart running alongside
      // there. A rival on the outside tightens the drift (more in-steer); one on the inside only eases it, never into
      // the cut zone (sIn ≤ −0.7). Not on an entry tap; no drag is held beside a rival (see dragCorner).
      { const rep = sideRep;
        if (rep > 0) sIn = sIn + rep > 1 ? 1 : sIn + rep;
        else if (rep < 0 && sIn > AI_TUNING.sideDriftMin) sIn = sIn + rep < AI_TUNING.sideDriftMin ? AI_TUNING.sideDriftMin : sIn + rep;
      }
      const prepareInstant = sIn < -0.3;
      // (the band test has a wire-step margin: 0.3 is sent as 38/127 = 0.299, inside the band)
      if (!this.dragging && AI_TUNING.dragAvoid && pr.boost > 0 && pr.sb >= P.dragExitLo && sIn > -P.dragNeutral - 0.012 && sIn < P.dragNeutral + 0.012) {
        // no unplanned drag: a boosted drift sliding in the drag window with the wheel near centre would enter the drag
        // state by itself (15-driving-techniques §4.5). A corner without a drag plan (not eligible, or not rolled for
        // this tier) keeps the wheel just outside the neutral band instead — the technique is a choice, not an accident
        sIn = sIn >= 0 ? P.dragNeutral + 0.012 : -P.dragNeutral - 0.012; // 40/127 on the wire
      }
      if (sIn > 0.05 && !e_forceExit && pr.recovering !== 2) drift = true;
      steer = sIn * dd;
      // throttle off during the counter-steer sets up the instant-boost edge (only when this drift plans one)
      if (prepareInstant && this.instOk) thr = 0;
      if (!this.instOk) keepThrottle = true;
    }

    // ---- instant boost (14-ai §3.6): press inside the window, or keep the throttle steady to skip it
    if (pr.win > 0 && !drifting && !airborne) {
      if (!this.instHandled) {
        this.instHandled = true;
        // at least one released frame before the press, then the tier's timing jitter
        this.instPressAt = this.instOk ? applyTick + 1 + (prof.instJitterTicks > 0 ? this.rng.int(0, 2 * prof.instJitterTicks) : 0) : -1;
      }
      if (this.instPressAt >= 0) {
        if (applyTick < this.instPressAt) thr = 0;
        else { thr = 1; this.instPressAt = -1; this.instOk = false; }
        keepThrottle = thr === 1;
      } else keepThrottle = true;
    }

    // ---- speed control (14-ai §3.3) with the tier's brake points and the corner plan
    this.qs = s; this.at(path);
    let vLim = (this.rp.VLIM[this.ri]! + (this.rp.VLIM[this.rj]! - this.rp.VLIM[this.ri]!) * this.rf) * ex.cornerSpeedMul * prof.riskSpeedMul;
    if (this.cPlan === DriftPlan.GRIP && corner && corner.needsDrift && (cornerDist < 90 || inCorner)) {
      const gt = this.grip![this.rp.index]!;
      const g = (gt[this.ri]! + (gt[this.rj]! - gt[this.ri]!) * this.rf) * ex.gripSpeedMul;
      if (g < vLim) vLim = g;
    }
    // A split forbids drift through its first metres. A selected branch whose entry corner overlaps
    // that window must be approached on its grip budget, even when its corner plan prefers a drift.
    // Preview the branch from the host with the same braking envelope as gripTable; do not wait until
    // the current path switches to the branch, when braking for its first corner is already too late.
    if (!drifting) {
      const current = this.rp, currentS = this.rs;
      for (const fork of this.plan.forks) {
        if (fork.kind === 'rail') continue;
        const child = this.plan.paths[fork.to]!;
        const entryX = Math.max(0, Math.min(child.n - 1, fork.toS / child.ds));
        const entryI = Math.floor(entryX), entryJ = Math.min(child.n - 1, entryI + 1);
        const entryCorner = child.corners[child.CORNER[entryI]!];
        if (!entryCorner || !entryCorner.needsDrift || entryCorner.s0 > fork.toS + FORK_GRACE || entryCorner.s1 < fork.toS) continue;
        const gt = this.grip![fork.to]!;
        let cap = 99;
        if (current.index === fork.path && this.forkTake[fork.id] === 1) {
          let ahead = fork.at - currentS;
          if (current.closed && ahead < 0) ahead += current.length;
          if (ahead >= 0 && ahead < 90) {
            const entryGrip = (gt[entryI]! + (gt[entryJ]! - gt[entryI]!) * (entryX - entryI)) * ex.gripSpeedMul;
            cap = Math.sqrt(entryGrip * entryGrip + 2 * 0.8 * P.aBrake * ahead);
          }
        } else if (current.index === fork.to && currentS >= fork.toS && currentS <= entryCorner.s1) {
          // The split guard may clear before the entry arc ends. Keep the available steering budget
          // until that arc is complete, or until the controller actually starts a drift.
          cap = (gt[this.ri]! + (gt[this.rj]! - gt[this.ri]!) * this.rf) * ex.gripSpeedMul;
        }
        if (cap < vLim) vLim = cap;
      }
    }
    if (dLip < 150) {
      // arrive at the lip inside [vMin + 2, vMax − 2]; bold personalities aim nearer the top (14-ai §8 risk)
      const lipMax = jvMax - 2 - 2 * (1 - prof.personality.risk);
      const vj = Math.sqrt(Math.max(0, lipMax * lipMax + 2 * 0.8 * P.aBrake * Math.max(0, dLip)));
      if (vj < vLim) vLim = vj;
      if (vLim < jvMin + 2) vLim = jvMin + 2; // never brake below the clearing speed before a gap
    }
    if (narrowLedge) { const cap = 26 + 6 * prof.personality.risk; if (cap < vLim) vLim = cap; }
    if (this.hazardCap < vLim) vLim = this.hazardCap;
    if (this.forkNearRailVMin > 0 && vLim < this.forkNearRailVMin + 3) vLim = this.forkNearRailVMin + 3; // rail capture speed
    if (ledgeHere) {
      // beside an open drop a failed drift must still stay on the road: corners at grip speed (+ a risk margin)
      const gt = this.grip![this.rp.index]!;
      const g = (gt[this.ri]! + (gt[this.rj]! - gt[this.ri]!) * this.rf) * (1.06 + 0.06 * prof.personality.risk);
      if (g < vLim) vLim = g;
    }
    if (cruising) vLim = Math.min(vLim, 0.8 * P.vGrip);
    let wantBrake = v > vLim + 0.5, wantCoast = !wantBrake && v > vLim;
    if (wantBrake && this.cMistake === Mistake.LATE_BRAKE && this.lateBrakeLeft > 0) { this.lateBrakeLeft--; wantBrake = false; wantCoast = false; }
    if (this.cMistake === Mistake.PANIC_BRAKE && this.panicLeft > 0 && corner && cornerDist < 12 && v > 12) { this.panicLeft--; wantBrake = true; }
    // in a drift every brake press is a brake turn (heading ×2): brake only while the nose lags the track, else lift;
    // a drag needs ↑ and no brake (the corner speed is the drag's own), a planned brake turn brakes for its frames
    if (wantBrake && drifting && driftEh < AI_TUNING.brakeEh) { wantBrake = false; wantCoast = true; }
    if (this.dragging) { wantBrake = false; wantCoast = false; }
    // loops and zero-g tubes (14-ai §4.5): throttle held — a loop needs its speed, and the flat-ground limits (ledge
    // grip caps, 2D curvature) do not describe a vertical span
    if (ppS.RMF[this.ri] === 1 && !cruising) { wantBrake = false; wantCoast = false; }
    if (this.bturnLeft > 0) { this.bturnLeft--; if (drifting) { wantBrake = true; wantCoast = false; } }
    // traffic: never ram a kart ahead (lift, then brake when contact is imminent and no lane is free)
    // traffic: never ram a kart ahead — lift when contact is near and no lane is free, brake when it is imminent
    // (also mid-drift: a drift brakes at 14 m/s² and keeps its slide)
    // The lane scorer uses a synthetic closing floor for stopped traffic: it must not suppress the throttle
    // needed to steer out of a queue. Moving karts start braking earlier for the more frequent booster arrivals.
    // Once committed to the ramp, traffic braking must respect the same launch floor as
    // corner braking. A failed jumper ahead otherwise makes each following kart fail too.
    // The predictor already includes pending brake frames; the 2 m/s margin covers the ramp.
    const jumpNeedsSpeed = !cruising && b.grounded === 1 && k.status.cc === 0
      && dLip > -2 && dLip < 60 && jvMin > 0 && vFwd < jvMin + 2;
    if (!jumpNeedsSpeed && vS > 6 && this.laneTtc < 0.6 && this.laneClosing > 1.5) {
      if (this.laneTtc < 0.45 && this.laneClosing > 3) wantBrake = true;
      else if (!drifting) wantCoast = true;
    }
    if (wantBrake) { brk = 1; if (!keepThrottle) thr = 0; }
    else if (wantCoast && !keepThrottle) thr = 0;

    // ---- boosters (speed mode; 14-ai §3.7) by booster discipline
    if (!cruising && d.boosters + d.teamBoosters > 0 && !airborne && !narrowLedge) boost = this.wantBoost(k, applyTick, t40, straightAhead, drifting, ex.boostSkill, prof, corner, cornerDist, inCorner, v, ppS);
    else if (d.boosters + d.teamBoosters === 0) this.boostReadyAt = -1;
    if (boost) this.stats.boostsFired++;
    this.prevBoost = boost;

    // ---- lane choice (avoidance / slipstream / overtakes) at the tier's re-plan rate, slewed ≤ 3 m/s
    if ((w.tick + this.slot) % ex.laneEvalTicks === 0) this.replanLane(w, k, path, s, u, vS, vU, tXs, tYs, hwT, lineAbs, straightAhead, t40, corner, cornerDist, inCorner, prof);
    const dl = this.laneTarget - this.laneOff, stepL = (this.laneUrgent ? 5 : 3) * DT;
    this.laneOff += dl > stepL ? stepL : dl < -stepL ? -stepL : dl;

    // ---- side contact (grip only): a kart alongside closing in laterally pushes the wheel away. The lane planner
    // only moves the target at 3 m/s; at corner speeds two karts side by side close faster than that and rub for
    // several ticks (each one a hard bump). Bump-happy personalities (aggression ≥ 0.8) keep leaning on rivals.
    // (not in loops / zero-g / jump approaches, on halfpipe walls or beside open ledges: the line is held there)
    if (!airborne && !drifting && !jumpNear && !ledgeHere && ppS.PIPE[this.ri] === 0 && AI_TUNING.sideRepel > 0 && prof.aggression < 0.8) {
      steer += this.sideRepel(w, k, s, u, vU, path);
      steer = steer > 1 ? 1 : steer < -1 ? -1 : steer;
    }

    // ---- recovery (stuck / wrong way)
    const ri = this.recIn;
    // slow / pinned detection on the real speed too: the self-prediction has no walls, so a kart pinned against an
    // obstacle (hard hit, stun, throttle, hard hit …) still predicts itself moving off
    const vNow = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz), fNow = b.vx * b.fx + b.vy * b.fy + b.vz * b.fz;
    ri.sinceGo = w.tick - w.goTick; ri.v = vNow < v ? vNow : v; ri.vFwd = fNow < vFwd ? fNow : vFwd; ri.aTarget = aH;
    ri.aTrack = Math.atan2(hx * tYs - hy * tXs, hx * tXs + hy * tYs);
    // A vertical loop has almost no horizontal forward component. The planar predictor then
    // points at the far side of its XZ chord and can command full lock into the side rail.
    // Use the real surface tangent plane throughout RMF spans, including recovery headings.
    if (ppS.RMF[this.ri] === 1 && !airborne) {
      const f = this.surfaceFrame;
      const lx = b.ny * b.fz - b.nz * b.fy, ly = b.nz * b.fx - b.nx * b.fz, lz = b.nx * b.fy - b.ny * b.fx;
      this.track.frameAt(loc.path, loc.s, f);
      ri.aTrack = Math.atan2(f.tx * lx + f.ty * ly + f.tz * lz, f.tx * b.fx + f.ty * b.fy + f.tz * b.fz);
      const ahead = A.Lk0 + (A.Lk1 + this.LA * DT) * vNow;
      this.track.frameAt(loc.path, loc.s + ahead, f);
      const dx = f.px - b.px, dy = f.py - b.py, dz = f.pz - b.pz;
      const forward = dx * b.fx + dy * b.fy + dz * b.fz, lateral = dx * lx + dy * ly + dz * lz;
      const distance = Math.max(1, Math.hypot(forward, lateral));
      ri.aTarget = Math.atan2(lateral, forward); ri.v = vNow; ri.vFwd = fNow;
      const gain = gripGain(vNow, P);
      steer = Math.max(-1, Math.min(1, 2 * Math.sin(ri.aTarget) * vNow / (distance * Math.max(1e-3, gain))));
      drift = false; tapEdge = 0; thr = 1; brk = 0;
    }
    ri.lowSpeedTicks = d.lowSpeedTicks; ri.wrongWayTicks = k.race.wrongWayTicks;
    ri.canAct = !airborne && k.status.cc === 0 && w.phase >= Phase.RACING;
    ri.sinceRespawn = w.tick - this.lastRespawnTick; ri.raceDist = k.race.raceDist;
    if (k.status.cc !== 0) this.lastCcTick = w.tick;
    ri.sinceCc = w.tick - this.lastCcTick;
    if (b.wallContact !== 0) this.lastWallTick = w.tick;
    ri.sinceWall = w.tick - this.lastWallTick;
    const wasRec = this.rec.mode !== 0;
    if (this.rec.update(ri, this.recOut)) {
      if (!wasRec) this.stats.recoveries++;
      steer = this.recOut.steer; thr = this.recOut.thr; brk = this.recOut.brk; drift = false; boost = false; tapEdge = 0;
      if (this.recOut.reset) { out.edges |= Edge.RESPAWN; this.stats.resets++; }
    }

    // ---- mash-out while trapped (hard CC): alternating taps at mashHz with ±1 tick jitter
    if (!this.brain && k.status.cc !== 0 && applyTick >= this.nextTap) {
      out.edges |= this.mashDir > 0 ? Edge.TAP_R : Edge.TAP_L;
      this.mashDir = -this.mashDir;
      this.nextTap = applyTick + Math.max(3, Math.round(60 / Math.max(1, prof.mashHz))) + this.rng.int(-1, 1);
    }

    out.steer = Math.round(-steer * 127);
    out.throttle = thr > 0 ? 15 : 0;
    out.brake = brk > 0 ? 15 : 0;
    out.held = drift ? Held.DRIFT : 0;
    if (boost) out.edges |= Edge.USE_ITEM;
    out.edges |= tapEdge;

    // ---- item hook (L2): after the driving controls, never while recovering or cruising
    if (this.item && !cruising) {
      const vw = this.view;
      vw.w = w; vw.applyTick = applyTick; vw.highRate = highRate; vw.s = s; vw.u = u; vw.turnAhead40 = t40; vw.straightAhead = straightAhead;
      vw.busy = this.rec.mode !== 0;
      this.item.decideItem(vw, out);
    }
  }

  /** Drops this lap's decision to take a fork from `host` onto `to` (true if one was dropped). */
  private abandonFork(host: number, to: number): boolean {
    const forks = this.plan.paths[host]?.forks;
    if (!forks) return false;
    let any = false;
    for (let q = 0; q < forks.length; q++) { const f = forks[q]!; if (f.to === to && this.forkTake[f.id] === 1) { this.forkTake[f.id] = 0; any = true; } }
    return any;
  }

  /**
   * Branch choice (14-ai §4.1): for each fork up to 250 m ahead on the current path, once per lap:
   * take it if shortcutRisk_eff · (0.8 + 0.4·rng) ≥ the branch's aiMinSkill.
   */
  private decideForks(k: KartState, prof: EffectiveProfile): void {
    const pp = this.plan.paths[k.race.loc.path];
    this.onRiskBranch = false;
    if (!pp) return;
    const lapKey = k.race.lap;
    const s = k.race.loc.s;
    for (let q = 0; q < pp.forks.length; q++) {
      const f = pp.forks[q]!;
      let ahead = f.at - s;
      if (pp.closed && ahead < 0) ahead += pp.length;
      if (ahead < 0 || ahead > 250 || this.forkLap[f.id] === lapKey) continue;
      this.forkLap[f.id] = lapKey;
      const roll = prof.ghost ? 1 : 0.8 + 0.4 * this.rng.next();
      // rails: intent Pro/Legend 1, Racer 0.6, Rookie 0.3, × (0.5 + risk) (14-ai §4.3); branches: skill vs aiMinSkill
      const take = f.kind === 'rail'
        ? prof.ghost || this.rng.next() < Math.min(1, RAIL_INTENT[prof.tier]! * (0.5 + prof.personality.risk))
        : prof.shortcutRiskEff * roll >= f.aiMinSkill;
      this.forkTake[f.id] = take ? 1 : 0;
      this.stats.forksSeen++;
      if (take) this.stats.forksTaken++;
    }
    // Allow about three seconds to settle on the branch side at speed. A fixed 70 m setup began too late after
    // a corner now that drift exit retains the driver's yaw; keep the final alignment/abandonment margin intact.
    const b = k.body;
    const approach = Math.max(70, 3 * Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz));
    // the nearest split in that approach horizon (or just passed)
    this.forkNear = 0; this.forkNoDrift = false; this.forkNearRailVMin = 0; this.forkSoon = false;
    for (let q = 0; q < pp.forks.length; q++) {
      let d = pp.forks[q]!.at - s;
      if (pp.closed) { if (d < -pp.length / 2) d += pp.length; else if (d > pp.length / 2) d -= pp.length; }
      if (d >= -8 && d <= AI_TUNING.forkTrimM) { this.forkSoon = true; break; }
    }
    for (let q = 0; q < pp.forks.length; q++) {
      const f = pp.forks[q]!;
      let d = f.at - s;
      if (pp.closed) { if (d < -pp.length / 2) d += pp.length; else if (d > pp.length / 2) d -= pp.length; }
      if (d < -8 || d > approach) continue;
      this.forkNear = f.side; this.forkTakeNear = this.forkTake[f.id] === 1;
      this.forkNearRailVMin = f.kind === 'rail' && this.forkTakeNear ? f.vMin : 0;
      // Validate alignment while returning to the host is still physically possible.
      // Rechecking within a few metres of the split flips the target after pending
      // inputs already commit to the branch, swinging the kart into its solid gore.
      const commitDistance = Math.max(10, 0.5 * Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz));
      if (this.forkTakeNear && d > commitDistance && d < 30) {
        const usable = Math.max(0.5, pp.HW[Math.min(pp.n - 1, Math.max(0, Math.round(s / pp.ds)))]! - 1.5);
        const onSide = k.race.loc.u * f.side > 0.3 * usable;
        const b = k.body, tIdx = Math.min(pp.n - 1, Math.max(0, Math.round(s / pp.ds)));
        let hx = b.fx, hy = -b.fz; const hl = Math.sqrt(hx * hx + hy * hy) || 1; hx /= hl; hy /= hl;
        const cosPsi = hx * pp.TX[tIdx]! + hy * pp.TY[tIdx]!;
        if (!onSide || cosPsi < 0.9) { this.forkTake[f.id] = 0; this.forkTakeNear = false; this.stats.forksTaken--; }
      }
      if (d < 40) this.forkNoDrift = true;
      break;
    }
    // host side of a merge: keep clear of the arriving branch and don't swing toward it
    this.mergeSide = 0;
    if (this.forkNear === 0) for (let q = 0; q < pp.merges.length; q++) {
      const m = pp.merges[q]!;
      let d = m.at - s;
      if (pp.closed) { if (d < -pp.length / 2) d += pp.length; else if (d > pp.length / 2) d -= pp.length; }
      if (d < -5 || d > 60) continue;
      this.forkNear = m.side; this.forkTakeNear = false;
      if (d > 0 && d < 45) this.mergeSide = m.side;
      break;
    }
    // warp gates within 60 m: roll once per lap, then line up inside the window with no drift (14-ai §4.6)
    this.warpNear = false;
    for (let q = 0; q < pp.warps.length; q++) {
      const wp = pp.warps[q]!;
      let d = wp.at - s;
      if (pp.closed && d < -pp.length / 2) d += pp.length;
      if (d < -2 || d > 60) continue;
      if (this.warpLap[wp.id] !== lapKey) {
        this.warpLap[wp.id] = lapKey;
        this.warpTake[wp.id] = wp.mandatory || prof.ghost || this.rng.next() < Math.min(1, RAIL_INTENT[prof.tier]! + 0.3) ? 1 : 0;
      }
      if (this.warpTake[wp.id] === 1) { this.warpNear = true; this.warpU0 = wp.u0; this.warpU1 = wp.u1; this.warpDist = d; }
      break;
    }
    // on a kill-risk branch bots keep their items (14-ai §4.1)
    for (let q = 0; q < this.plan.forks.length; q++) {
      const f = this.plan.forks[q]!;
      if (f.to === pp.index && f.kind === 'risk') { this.onRiskBranch = true; break; }
    }
  }

  private onDriftStart(prof: EffectiveProfile): void {
    this.instArmed = true;
    this.stats.instRolls++;
    this.instOk = this.rng.next() < prof.instBoostRate;
    if (this.instOk) this.stats.instPlanned++;
    this.instHandled = false; this.instPressAt = -1;
    this.holdExtra = 0;
    // a corner is often several chained drifts: the sloppy / over-hold penalty belongs to its first one
    if (this.cornerDrifts++ === 0) {
      if (this.cPlan === DriftPlan.SLOPPY) this.holdExtra += this.cHold;
      if (this.cMistake === Mistake.OVERHOLD) this.holdExtra += prof.exec.mistakeHoldTicks;
    }
  }

  private rollCorner(ci: number, pp: PathPlan, corner: Corner | null, prof: EffectiveProfile): void {
    this.cCorner = ci; this.cPath = pp.index; this.cornerDrifts = 0;
    this.cPlan = DriftPlan.OPTIMAL; this.cMistake = Mistake.NONE; this.cLate = 0; this.cHold = 0; this.lateBrakeLeft = 0; this.panicLeft = 0;
    this.cChain = true;
    this.cDrag = false; this.cTap = false; this.cBrakeTurn = false; this.bturnDone = false; this.bturnLeft = 0;
    if (!corner) return;
    const r = this.rng.next();
    const ex = prof.exec;
    // techniques (M5, 14-ai §3.11), rolled per corner and tier; the ghost takes every eligible plan
    if (corner.needsDrift) {
      const T = AI_TUNING;
      const dp = this.rollDrag(pp, ci, prof, this.cornerKey(pp, corner));
      this.cDrag = (dp & 1) !== 0; this.cTap = (dp & 2) !== 0;
      if (corner.turn >= T.hairpinTurn && corner.minR <= T.hairpinR) {
        this.cBrakeTurn = prof.ghost || this.rng.next() < ex.brakeTurnRate;
        if (this.cBrakeTurn) this.stats.brakeTurnPlans++;
      }
    }
    if (prof.ghost || r < prof.driftSkill) this.cPlan = DriftPlan.OPTIMAL;
    // (a long corner — turn ≥ hairpinTurn — is never gripped on purpose either: the grip table's width allowance is
    // optimistic over 120°+ of turning and a gripping kart runs wide onto the shoulder there)
    else if (r < prof.driftSkill + 0.6 * (1 - prof.driftSkill) || corner.gripRatio < ex.gripViable || corner.turn >= AI_TUNING.hairpinTurn) {
      this.cPlan = DriftPlan.SLOPPY;
      this.cLate = this.rng.range(ex.sloppyLateM[0], ex.sloppyLateM[1]);
      this.cHold = this.rng.int(ex.sloppyHoldTicks[0], ex.sloppyHoldTicks[1]);
    } else this.cPlan = DriftPlan.GRIP;
    // chained short drifts are a style ('chain'), not a skill: holding one drift is faster on long corners
    this.cChain = !prof.ghost && corner.turn >= AI_TUNING.chainMinTurn && corner.turn <= AI_TUNING.chainMaxTurn && (prof.personality.driftStyle === 'chain' || this.rng.next() < ex.chainRate);
    if (corner.needsDrift) this.stats.plans[this.cPlan as 0 | 1 | 2]++;
    // mistakes: expected mistakeRate per lap spread over the drift-worthy corners; a lap with very few such
    // corners (an oval) is treated as a typical 6-corner lap so two corners don't absorb a whole lap's mistakes
    const zones = Math.max(AI_TUNING.minZones, this.plan.zonesPerLap);
    if (corner.needsDrift && !prof.ghost && this.rng.next() < prof.mistakeRate / zones) {
      const m = this.rng.next();
      const braking = corner.vDrift < 0.95 * this.P!.vGrip * prof.vMul;
      this.cMistake = m < 0.4 ? (braking ? Mistake.LATE_BRAKE : Mistake.PANIC_BRAKE) : m < 0.7 ? Mistake.OVERHOLD : Mistake.WIDE;
      if (this.cMistake === Mistake.LATE_BRAKE) this.lateBrakeLeft = ex.mistakeLateTicks;
      if (this.cMistake === Mistake.PANIC_BRAKE) this.panicLeft = this.rng.int(ex.panicBrakeTicks[0], ex.panicBrakeTicks[1]);
      this.wideT = this.rng.range(1.5, 3.0);
      this.stats.mistakes++;
    }
  }

  /**
   * The deliberate drift exit (M5): a cut snaps the velocity onto the nose, so it is the exit only when the corner
   * is done, the nose points down the road (at most cutPsi past the local tangent) with room on the inside, and no
   * branch split is close (the cut changes the line the split approach was set up for).
   */
  private cutOk(corner: Corner | null, inCorner: boolean, dd: number, hx: number, hy: number, tx: number, ty: number, u: number, hw: number, pathLength: number): boolean {
    if (!AI_TUNING.cut || this.forkSoon) return false;
    if (corner && inCorner && corner.dir === dd && this.remainingTurn(corner, pathLength) > AI_TUNING.cutTurn) return false;
    // nose past the local tangent toward the inside (rad), and the room left on the inside (u is + right)
    const over = -Math.atan2(hx * ty - hy * tx, hx * tx + hy * ty) * dd;
    return over < AI_TUNING.cutPsi && hw + u * dd > AI_TUNING.cutRoom;
  }

  /** Pass key of a corner: the lap in which the kart reaches its entry (stable while the corner approaches). */
  private cornerKey(pp: PathPlan, c: Corner): number {
    let d0 = c.s0 - this.rsCur;
    if (pp.closed) { const L = pp.length; if (d0 < -L / 2) d0 += L; else if (d0 > L / 2) d0 -= L; }
    return Math.round((this.raceDistNow + d0 - c.s0) / Math.max(1, this.track.lapLength));
  }

  /**
   * The drag plan of corner `ci` on `pp` for one pass (bit 1 drag, bit 2 tap), rolled once per pass: eligible corners
   * (Corner.dragSafe, minR ≥ dragMinR, turn ≤ dragMaxTurn) take a drag at the tier's dragRate and taps at its tapRate;
   * the ghost takes every eligible plan.
   */
  private rollDrag(pp: PathPlan, ci: number, prof: EffectiveProfile, key: number): number {
    const keys = this.dragKey[pp.index], plans = this.dragPlan[pp.index], c = pp.corners[ci];
    if (!keys || !plans || !c) return 0;
    if (keys[ci] === key) return plans[ci]!;
    keys[ci] = key;
    const ex = prof.exec, T = AI_TUNING;
    let v = 0;
    if (T.drag && c.needsDrift && c.dragSafe && c.minR >= ex.dragMinR && c.turn <= T.dragMaxTurn && (prof.ghost || this.rng.next() < ex.dragRate)) {
      v = 1; this.stats.dragPlans++;
      if (prof.ghost || this.rng.next() < ex.tapRate) { v |= 2; this.stats.tapPlans++; }
    }
    plans[ci] = v;
    return v;
  }

  /** Distance to the entry of the next planned drag corner within AI_TUNING.dragHoldM ahead on `pp` (1e9 = none). */
  private nextDragDist(pp: PathPlan, ci: number, prof: EffectiveProfile): number {
    const cs = pp.corners, L = pp.length;
    if (ci < 0 || cs.length === 0) return 1e9;
    for (let q = 0; q < cs.length; q++) {
      const i = (ci + q) % cs.length;
      if (!pp.closed && i < ci) break;
      const c = cs[i]!;
      let d = c.s0 - this.rsCur;
      if (pp.closed && d < -L / 2) d += L;
      if (d > AI_TUNING.dragHoldM) break;
      if (d < 0) continue;
      if ((this.rollDrag(pp, i, prof, this.cornerKey(pp, c)) & 1) !== 0) return d;
    }
    return 1e9;
  }

  /** Heading change left in the corner from the predicted position (rad). */
  private remainingTurn(c: Corner, pathLength: number): number {
    const len = c.s1 - c.s0;
    if (len <= 1) return 0;
    let left = c.s1 - this.rsCur;
    if (left < 0 && left < -len) left += pathLength;
    return left <= 0 ? 0 : c.turn * Math.min(1, left / len);
  }

  private wantBoost(k: KartState, applyTick: number, t40: number, straight: number, drifting: boolean, skill: number, prof: EffectiveProfile,
    corner: Corner | null, cornerDist: number, inCorner: boolean, v: number, pp: PathPlan): boolean {
    const d = k.drive, ex = prof.exec;
    if (this.boostReadyAt < 0) {
      const dl = ex.boostDelayTicks;
      this.boostReadyAt = applyTick + (prof.ghost ? 0 : this.rng.int(dl[0], dl[1]));
    }
    if (applyTick < this.boostReadyAt || drifting || this.prevBoost || d.boostTicks >= 12 || d.startTicks > 0) return false;
    const at = Math.abs(t40);
    // final stretch: burn everything
    if (skill >= 2 && this.remainingDist(k) < 260 && at < 20 * DEG) return true;
    // a planned drag needs a boosted drift: fire into the corner, and keep the last booster for it on the approach
    // (a booster fired now still covers a drag corner closer than dragCoverS of boost)
    if (skill >= 1 && ex.dragLeadS > 0) {
      const dd = this.cDrag && corner && !inCorner ? cornerDist : this.nextDragDist(pp, this.cCorner === -2 ? -1 : this.cCorner, prof);
      if (dd < 1e9) {
        if (dd > 5 && dd < v * ex.dragLeadS) { this.stats.dragBoosts++; return true; }
        if (d.boosters + d.teamBoosters < 2 && dd > v * AI_TUNING.dragCoverS) return false;
      }
    }
    let fire: boolean;
    switch (skill) {
      case 0: fire = at < 25 * DEG; break;
      case 1: fire = at < 12 * DEG; break;
      default:
        // a booster fired just before a drift corner is half wasted; Pro+ wait for a little road when they can
        fire = at < 12 * DEG && (straight >= 40 || d.boosters + d.teamBoosters >= 2);
    }
    if (!fire) { this.expiryDeadline = -1; return false; }
    // Pro/Legend: a boost that runs out on a straight bleeds to vGrip in 0.5 s, one that runs out in a drift keeps its
    // speed (the drift cancels the bleed): wait up to expiryWaitS for the expiry to land in a drift corner
    if (skill >= 2 && AI_TUNING.expiryWaitS > 0 && d.boosters + d.teamBoosters < 2) {
      if (this.expiryDeadline < 0) this.expiryDeadline = applyTick + Math.round(AI_TUNING.expiryWaitS * 60);
      if (applyTick < this.expiryDeadline && !this.expiresInDrift(k, pp, v)) { this.stats.expiryWaits++; return false; }
    }
    this.expiryDeadline = -1;
    return true;
  }

  /** True if a booster fired now would run out inside a drift corner on this path (rough distance estimate). */
  private expiresInDrift(k: KartState, pp: PathPlan, v: number): boolean {
    const P = this.P!, d = k.drive;
    const ticks = d.boostTicks + (d.teamBoosters > 0 ? P.teamBoostTicks : P.tBoostTicks);
    const vb = AI_TUNING.expirySpeed * P.vBoost;
    const sExp = this.rsCur + ((v < vb ? 0.5 * (v + vb) : vb) * 0.4 + vb * 0.6) * ticks * DT;
    const cs = pp.corners, L = pp.length;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i]!;
      if (!c.needsDrift) continue;
      let a = sExp - c.s0, len = c.s1 - c.s0;
      if (pp.closed) { a -= L * Math.floor(a / L); if (len < 0) len += L; }
      if (a >= -5 && a <= len) return true;
    }
    return false;
  }

  private remainingDist(k: KartState): number {
    const laps = this.track.topology === 'circuit' ? this.track.laps : 1;
    return laps * this.track.lapLength - k.race.raceDist;
  }

  private replanLane(w: Readonly<WorldState>, k: KartState, path: number, s: number, u: number, vS: number, vU: number, tX: number, tY: number, hwT: number, lineAbs: number, straight: number, t40: number, corner: Corner | null, cornerDist: number, inCorner: boolean, prof: EffectiveProfile): void {
    const q = this.lq, loc = k.race.loc;
    q.slot = this.slot; q.sMain = loc.sMain + vS * this.LA * DT; q.path = path; q.u = u; q.vS = vS; q.vU = vU;
    // world x/z of the track tangent and right vector (2D Y = −z)
    q.tx = tX; q.tz = -tY; q.rx = tY; q.rz = tX;
    q.hw = hwT; q.lineAbs = lineAbs; q.laneOff = this.laneOff; q.la = this.LA * DT;
    q.straight = straight >= 100 && Math.abs(t40) < 10 * DEG;
    q.nextCornerDir = corner && !inCorner ? corner.dir : 0; q.nextCornerDist = cornerDist;
    // just after the start keep the grid lanes and fan in gently (no pile-up into turn 1)
    const sinceGo = w.tick - w.goTick;
    q.lineWeight = sinceGo < 240 ? 0.25 + 0.75 * (sinceGo / 240) : 1;
    if (!this.startLaneSet) { this.startLaneSet = true; if (sinceGo < 60) { this.laneOff = u - lineAbs; this.laneTarget = this.laneOff; } }
    q.draftActive = k.drive.draftTicks > 0;
    q.wish = NaN;
    if (this.item?.laneWish) { this.view.w = w; const wish = this.item.laneWish(this.view); if (wish === wish) q.wish = wish; }
    else if (this.wantBoxes) q.wish = this.boxWish(k, path, s);
    if (q.wish !== q.wish) q.wish = this.padWish(path, s);
    q.horizon = prof.exec.ttcHorizon;
    // track hazards ahead, sampled at our arrival (analytic hazardPose)
    const ppH = this.plan.paths[path]!;
    if (AI_TUNING.hazards) scanHazards(this.track, ppH, s, Math.max(vS, 1), w.tick + 1 + this.LA, this.blocks); else this.blocks.n = 0;
    this.hazardLane = false;
    for (let i = 0; i < this.blocks.n; i++) if (this.blocks.ds[i]! <= 80) this.hazardLane = true;
    q.blocks = this.blocks.n > 0 ? this.blocks : null;
    planLane(w, this.track, q, prof, this.lr);
    // no free lane through an active hazard: arrive after it clears (presses, crossing trains, geysers)
    this.hazardCap = 99;
    const B = this.blocks, chosen = lineAbs + this.lr.laneOff;
    for (let b = 0; b < B.n; b++) {
      // (a hazard that never clears within the 5 s scan — a pendulum swinging all the time — is not waited for:
      // crawling at 6 m/s behind it only loses the time the lane choice is there to save)
      if (chosen <= B.u0[b]! || chosen >= B.u1[b]! || B.ds[b]! > 70 || B.clearTicks[b]! <= 0 || B.clearTicks[b]! >= AI_TUNING.hazardMaxWait) continue;
      const vReq = Math.max(6, (B.ds[b]! - 2) / (B.clearTicks[b]! / 60));
      if (vReq < this.hazardCap) this.hazardCap = vReq;
    }
    const r = this.lr;
    if (Math.abs(r.laneOff - this.laneTarget) > 0.6) this.stats.laneChanges++;
    if (r.overtaking) this.stats.overtakeLanes++;
    if (r.drafting && !this.laneDrafting) this.stats.draftFollows++;
    this.laneDrafting = r.drafting;
    this.laneTarget = r.laneOff;
    this.laneTtc = r.ttc; this.laneClosing = r.closing; this.laneActualClosing = r.actualClosing; this.laneUrgent = r.urgent;
  }

  /** Steer correction (+ = left) away from karts alongside that close in laterally (see the side-contact note). */
  private sideRepel(w: Readonly<WorldState>, k: KartState, s: number, u: number, vU: number, path: number): number {
    const T = AI_TUNING, L = this.track.lapLength, circuit = this.track.topology === 'circuit', la = this.LA * DT;
    const tx = this.rp.TX[this.ri]!, ty = this.rp.TY[this.ri]!;
    let push = 0;
    for (let j = 0; j < w.karts.length; j++) {
      if (j === this.slot) continue;
      const o = w.karts[j]!;
      if (!o.active || o.race.finishTick >= 0 || o.race.retired || o.race.respawnPhase !== 0 || o.body.ghostTicks > 0 || o.race.loc.path !== path) continue;
      const ob = o.body;
      const ovS = ob.vx * tx - ob.vz * ty, ovU = ob.vx * ty + ob.vz * tx; // world → (along, right) in the 2D frame (Y = −z)
      let ds = o.race.loc.sMain - k.race.loc.sMain;
      if (circuit) { if (ds > L / 2) ds -= L; else if (ds < -L / 2) ds += L; }
      ds += ovS * la - (s - k.race.loc.s); // both predicted to the apply tick
      if (ds > T.sideDs || ds < -T.sideDs) continue;
      const du = o.race.loc.u + ovU * la - u;            // + = the rival is to our right
      const adu = du < 0 ? -du : du;
      if (adu > T.sideGap) continue;
      const closing = (vU - ovU) * (du > 0 ? 1 : -1);     // lateral closing speed toward it (m/s)
      if (closing < T.sideClose && adu > T.sideGap - 0.6) continue;
      push += (du > 0 ? 1 : -1) * T.sideRepel * (1 - adu / T.sideGap) * (closing > 0 ? 1 + closing / 4 : 1);
    }
    return push > T.sideMax ? T.sideMax : push < -T.sideMax ? -T.sideMax : push;
  }

  /** Lateral offset of a boost pad 5–45 m ahead on this path (NaN = none). */
  private padWish(path: number, s: number): number {
    const pads = this.track.pads;
    const pp = this.plan.paths[path]!;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i]!;
      if (p.path !== path || p.kind !== 'boost') continue;
      let ds = p.s0 - s;
      if (pp.closed && ds < -pp.length / 2) ds += pp.length;
      if (ds > 5 && ds < 45) return 0.5 * (p.u0 + p.u1);
    }
    return NaN;
  }

  /** Nearest item-box row 10–50 m ahead while an item slot is free: the box closest to our lane (NaN = none). */
  private boxWish(k: KartState, path: number, s: number): number {
    if (k.items.slot0 !== 0 && k.items.slot1 !== 0) return NaN;
    const boxes = this.track.boxes, pp = this.plan.paths[path]!;
    let rowD = 1e9;
    for (let i = 0; i < boxes.length; i++) {
      const bx = boxes[i]!;
      if (bx.path !== path) continue;
      let ds = bx.s - s;
      if (pp.closed && ds < -pp.length / 2) ds += pp.length;
      if (ds > 10 && ds < 50 && ds < rowD) rowD = ds;
    }
    if (rowD > 1e8) return NaN;
    let best = NaN, bestDu = 1e9;
    const myU = k.race.loc.u;
    for (let i = 0; i < boxes.length; i++) {
      const bx = boxes[i]!;
      if (bx.path !== path) continue;
      let ds = bx.s - s;
      if (pp.closed && ds < -pp.length / 2) ds += pp.length;
      if (Math.abs(ds - rowD) > 3) continue;
      const du = Math.abs(bx.u - myU);
      if (du < bestDu) { bestDu = du; best = bx.u; }
    }
    return best;
  }
}
