// FROZEN (contracts.lock). World state — everything needed for exact replay. All timers are integer ticks.
import type { AiTier, CharacterId, KartBodyId, ModeId, TeamFormat, TrackId } from '@cr/content';
import type { Tick } from './units.ts';

export type RacePhase = 0 | 1 | 2 | 3 | 4; // PRE(intro+grid), COUNTDOWN, RACING, RETIRE_TIMER, DONE
export const Phase = { PRE: 0, COUNTDOWN: 1, RACING: 2, RETIRE_TIMER: 3, DONE: 4 } as const;
export type BoostKind = 0 | 1 | 2 | 3 | 4 | 5 | 6; // none, normal(gauge), team, start, item(turbo), instant, pad
export const Boost = { NONE: 0, NORMAL: 1, TEAM: 2, START: 3, ITEM: 4, INSTANT: 5, PAD: 6 } as const;
export const Attach = { NONE: 0, RAIL: 1, WARP: 2 } as const; // KartBody.attachKind
/** KartDrive.gear (10-sim-spec §7.7): stopped (held at 0), drive, neutral (coasting), reverse. */
export type GearState = 0 | 1 | 2 | 3;
export const Gear = { STOP: 0, D: 1, N: 2, R: 3 } as const;

export interface TrackLoc {
  path: number;    // path index (0 = main)
  i: number;       // sample index on path (segment start)
  s: number;       // arc length on path (m)
  u: number;       // lateral offset along the track right vector (m, + = right)
  h: number;       // height above the sample along track up (m)
  sMain: number;   // progress mapped onto the main line (m)
  valid: 0 | 1;
}

export interface KartBody {
  px: number; py: number; pz: number;      // contact point (bottom centre)
  vx: number; vy: number; vz: number;
  fx: number; fy: number; fz: number;      // forward unit vector (tangent to ground when grounded)
  nx: number; ny: number; nz: number;      // up / contact normal
  yawRate: number;                         // rad/s, + = left (CCW seen from above)
  grounded: 0 | 1;
  coyote: number;                          // ticks of grace after losing ground
  airTicks: number;
  surf: number;                            // surface code under the kart
  wallContact: 0 | 1;
  ghostTicks: number;                      // >0: no kart-kart collision (respawn/start)
  attachKind: number;                      // Attach.* — kinematic attachment (rail grind, warp transit)
  attachId: number;                        // rail / warp index in the baked track
  attachS: number;                         // progress along the attachment (m)
  attachT: number;                         // ticks since attaching
}

export interface KartDrive {
  drift: 0 | 1;
  driftDir: -1 | 1;                        // +1 = left drift
  driftTicks: number;
  driftPeak: number;                       // peak sin(slip) during this drift
  reDriftLock: number;
  gauge: number;                           // 0..1
  fatigueTicks: number;
  boosters: number;                        // stored gauge boosters (≤ 2)
  teamBoosters: number;                    // stored team boosters (≤ 1)
  boostTicks: number;
  boostKind: BoostKind;
  startTicks: number;                      // start boost remaining
  wheelspinTicks: number;                  // false-start penalty remaining
  instWindow: number;                      // instant-boost window remaining
  instTicks: number;                       // instant boost remaining
  stunTicks: number;
  draftCharge: number;                     // ticks accumulated in slipstream
  draftTicks: number;                      // draft burst remaining
  prevHeld: number;
  prevThrottle: number;
  lowSpeedTicks: number;                   // consecutive ticks below 3 m/s (manual reset eligibility)
  startPressTick: Tick;                    // first throttle press during countdown (-1 = none)
  // driving techniques (M5, 10-sim-spec §6.7–§7.7); all integer ticks or counters
  gear: GearState;                         // Gear.STOP / D / N / R
  postTicks: number;                       // post-boost bleed remaining (set on natural boost expiry)
  dragTicks: number;                       // ticks in the drag state (0 = not dragging, saturates at 255)
  tapStreak: number;                       // valid tap-boost streak 0..3
  tapGap: number;                          // ticks since the last in-direction tap while dragging (255 = none)
  counterTicks: number;                    // consecutive counter-steer ticks past the cut threshold
  brakeTicks: number;                      // consecutive brake ticks (brake turn, spin-out, reverse engage)
}

export interface KartItems {
  slot0: number;                           // item code (0 = empty); slot0 is used first
  slot1: number;
  rouletteSlot: -1 | 0 | 1;
  rouletteEnd: Tick;
  rouletteBox: number;
  lastUseTick: Tick;
  aimLockTicks: number;
  aimTarget: number;                       // 255 = none
}

export interface KartStatus {
  cc: number;                              // active hard-CC effect code (0 = none)
  ccStart: Tick;
  ccEnd: Tick;
  immuneUntil: Tick;                       // hard-CC immunity
  shieldUntil: Tick;
  shieldGraceUntil: Tick;
  haloUntil: Tick;
  mashCredits: number;
  lastTapDir: -1 | 0 | 1;
  lastTapTick: Tick;
  modMask: number;                         // bitmask of active soft effects (by effect code bit)
}

export interface KartRace {
  loc: TrackLoc;
  lastValid: TrackLoc;
  lap: number;                             // completed laps
  keyMask: number;                         // key gates passed this lap (bit k)
  raceDist: number;                        // lap·L + sMain
  lapStartTick: Tick;
  bestLapTicks: number;                    // 0 = none
  lastLapTicks: number;
  finishTick: Tick;                        // -1 = not finished
  finishFrac: number;                      // sub-tick crossing fraction 0..1
  rank: number;                            // 1..N
  wrongWayTicks: number;
  offGraphTicks: number;
  noGroundTicks: number;
  respawnPhase: 0 | 1 | 2;                 // 0 none, 1 fading out, 2 placed (control lock)
  respawnUntil: Tick;
  manualCooldownUntil: Tick;
  slowTicks: number;                       // post-manual-reset speed cap remaining
  retired: 0 | 1;
}

export interface KartStats {
  drifts: number; instantBoosts: number; boostsUsed: number; startTier: number; wallHits: number; hardHits: number;
  attacksLanded: number; attacksBlocked: number; hitsTaken: number; itemsUsed: number; respawns: number; driftMeters: number; draftBursts: number;
}

export interface KartState {
  slot: number;
  team: number;
  spec: number;                            // kart body code
  active: 0 | 1;                           // 0 = empty slot
  body: KartBody;
  drive: KartDrive;
  items: KartItems;
  status: KartStatus;
  race: KartRace;
  stats: KartStats;
}

export interface TeamState { gauge: number; granted: number }

export interface EffectInstance { id: number; code: number; victim: number; source: number; start: Tick; end: Tick; param: number; flags: number; result: 0 | 1 | 2 | 3 }
export interface ProjectileState {
  id: number; code: number; owner: number; target: number; phase: number;
  path: number; s: number; u: number; h: number; px: number; py: number; pz: number;
  spawn: Tick; commit: Tick; impact: Tick;
}
export interface HazardState { id: number; code: number; owner: number; team: number; px: number; py: number; pz: number; radius: number; arm: Tick; expire: Tick; flags: number }

export type EffectResult = 'hit' | 'shielded' | 'immune' | 'immune_grace' | 'miss' | 'hit_late_input';
export type Decision =
  | { k: 'grant'; tick: Tick; slot: number; item: number; boxId: number }
  | { k: 'use'; tick: Tick; slot: number; item: number; obj: number; target: number }
  | { k: 'reject'; tick: Tick; slot: number; item: number; reason: number; refund: 0 | 1 }
  | { k: 'commit'; tick: Tick; obj: number; victim: number; eff: number; impact: Tick }
  | { k: 'effect'; tick: Tick; eff: number; code: number; victim: number; source: number; start: Tick; dur: number; flags: number }
  | { k: 'result'; tick: Tick; eff: number; victim: number; result: EffectResult }
  | { k: 'hazard'; tick: Tick; obj: number; code: number; owner: number; arm: Tick; life: number; x: number; y: number; z: number }
  | { k: 'hazardRemove'; tick: Tick; obj: number };

export interface DecisionLog { items: Decision[] }

export interface WorldState {
  tick: Tick;
  phase: RacePhase;
  goTick: Tick;                            // tick at which GO shows (racing starts)
  firstFinishTick: Tick;                   // -1 until the first finisher
  endTick: Tick;                           // -1 until the race is decided
  karts: KartState[];                      // always MAX_KARTS entries (inactive slots have active=0)
  teams: TeamState[];
  effects: EffectInstance[];
  projectiles: ProjectileState[];
  hazards: HazardState[];
  boxRespawn: Int32Array;                  // [box*MAX_KARTS+slot] = tick when the personal box is available again
  seq: number;                             // PRNG state (public, non-item randomness)
  nextObjId: number;
  decisions: DecisionLog;
}

export interface SlotConfig {
  kind: 'human' | 'bot' | 'empty';
  team: number;                            // 0 = solo / red, 1 = blue, 2, 3 for duo
  name: string;
  characterId: CharacterId;
  kartBodyId: KartBodyId;
  ai?: AiTier;
  vMul: number;                            // ≤ 1.0 (bots only)
}

export interface RaceRules {
  retireTicks: number;
  friendlyFire: 'off' | 'area' | 'all';
  itemSet: 'standard' | 'light' | 'chaos';
  rubberBand: boolean;
  instantBoostInItem: boolean;
}

export interface RaceConfig {
  simVersion: number;
  mode: ModeId;
  teams: TeamFormat;
  trackId: TrackId;
  trackHash: string;
  laps: number;
  slots: SlotConfig[];                     // length MAX_KARTS
  seed: number;                            // public; never used for item rolls
  rules: RaceRules;
  introTicks: number;
  countdownTicks: number;                  // 3 beats × 60
}

export const SIM_VERSION = 5; // 5: finite cut recovery and repeat-drift cooldown (doc 16); wire layout unchanged
