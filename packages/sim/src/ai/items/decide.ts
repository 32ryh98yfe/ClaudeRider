// Bot item usage (14-ai-spec §6). Pure given (brain state, world): the brain holds only reaction timers and a seeded
// PRNG, so a bot's item inputs replay identically. It runs on the authority after the driver's decide() and only adds
// item bits to the frame (USE_ITEM / SWAP / TAP_L / TAP_R edges, `aim`, Held.LOOK_BACK).
import type { ItemDef } from '@cr/content';
import { Edge, Held, type InputFrame } from '../../core/input.ts';
import { Phase, type KartState, type WorldState } from '../../core/state.ts';
import type { AiProfile } from '../api.ts';
import { EF, NO_TARGET, itemDef } from '../../items/codes.ts';
import { activeEffect } from '../../items/effects.ts';
import { aimCandidateValid, lockNeed } from '../../items/use.ts';
import { firewallTarget, inRace, leaderSlot, leaderTarget, nextAheadOpponent, sameTeam, teamMode } from '../../items/team.ts';
import { PERCEIVE_ETA, blockableThreatEta, droneOrTetherThreat, teamThreat, type ItemEnv } from './perception.ts';

export type { ItemEnv } from './perception.ts';

export interface ItemBrain {
  readonly slot: number;
  readonly profile: AiProfile;
  readonly hoarding: number;     // personality itemHoarding 0..1 (keeps defensive items)
  readonly aggression: number;   // personality aggression 0..1 (faster attacks)
  rng: number;                   // mulberry32 state
  heldCode: number;              // item in slot0 when last seen
  heldSince: number;
  triggerAt: number;             // tick the pending use fires (−1 = no pending trigger)
  randomAt: number;              // itemSkill 1: random use time after pickup
  lockoutUntil: number;          // no new USE/SWAP presses before this tick (inputs may apply up to 8 ticks late)
  mashNext: number;
  mashDir: -1 | 1;
  aimCand: number;
  aimRear: boolean;              // the candidate is behind (Held.LOOK_BACK)
}

export function createItemBrain(slot: number, profile: AiProfile, personality: { itemHoarding?: number; aggression?: number } = {}, seed = 1): ItemBrain {
  return {
    slot, profile, hoarding: personality.itemHoarding ?? 0.4, aggression: personality.aggression ?? profile.aggression,
    rng: (seed ^ Math.imul(slot + 1, 0x9e3779b1)) >>> 0, heldCode: 0, heldSince: 0, triggerAt: -1, randomAt: -1, lockoutUntil: 0,
    mashNext: 0, mashDir: 1, aimCand: NO_TARGET, aimRear: false,
  };
}

function rand(b: ItemBrain): number {
  let a = (b.rng + 0x6d2b79f5) | 0;
  b.rng = a >>> 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  a = (t ^ (t >>> 14)) >>> 0;
  return a / 4294967296;
}

const DEFENSIVE = new Set(['context_shield', 'alignment_halo', 'interrupt_pulse']);
/** Longest wait for a tactical moment before a held attack/speed item is used whenever valid (ticks, + 120·hoarding). */
const WAIT_BASE = 360;
const deg = Math.PI / 180;

/** Σ|Δψ| over the next ~60 m is small: two 40 m turn-ahead samples below 12°. */
function straightAhead(env: ItemEnv, k: Readonly<KartState>): boolean {
  const loc = k.race.loc;
  env.track.aiAt(loc.path, loc.s, AI);
  if (Math.abs(AI.turnAhead40) >= 12 * deg) return false;
  env.track.aiAt(loc.path, loc.s + 20, AI);
  return Math.abs(AI.turnAhead40) < 12 * deg;
}
const AI = { lineU: 0, vLim: 99, kappa: 0, turnAhead40: 0, driftZone: 0, width: 12 };

function cornerAhead(env: ItemEnv, k: Readonly<KartState>, within: number): boolean {
  const loc = k.race.loc;
  for (let d = 0; d <= within; d += 10) { env.track.aiAt(loc.path, loc.s + d, AI); if (Math.abs(AI.turnAhead40) > 25 * deg) return true; }
  return false;
}

const isOpp = (env: ItemEnv, k: Readonly<KartState>, o: Readonly<KartState>): boolean => o.slot !== k.slot && inRace(o) && !sameTeam(env, k, o);

/** Picks an aim candidate for `def` (front cone; look-back for the Prompt Missile when leading with a pursuer close). */
function chooseAim(b: ItemBrain, w: Readonly<WorldState>, env: ItemEnv, k: Readonly<KartState>, def: Readonly<ItemDef>, out: InputFrame): void {
  const skill = b.profile.itemSkill;
  // keep a still-valid candidate so the lock dwell accumulates
  if (b.aimCand !== NO_TARGET && aimCandidateValid(w, env, k, def, b.aimCand, b.aimRear)) {
    out.aim = b.aimCand;
    if (b.aimRear) out.held |= Held.LOOK_BACK;
    return;
  }
  b.aimRear = false;
  let best = NO_TARGET as number, bestScore = 1e18;
  for (const o of w.karts) {
    if (o.slot === k.slot || !inRace(o)) continue;
    if (!def.aim?.allowTeam && sameTeam(env, k, o)) continue;
    if (!aimCandidateValid(w, env, k, def, o.slot, false)) continue;
    const dx = o.body.px - k.body.px, dz = o.body.pz - k.body.pz;
    const score = skill >= 3 ? o.race.rank * 1000 + Math.hypot(dx, dz) : Math.hypot(dx, dz);
    if (score < bestScore) { bestScore = score; best = o.slot; }
  }
  if (best === NO_TARGET && def.aim?.allowRear && k.race.rank <= 2) {
    for (const o of w.karts) {
      if (!isOpp(env, k, o) || k.race.raceDist - o.race.raceDist > 60 || o.race.raceDist > k.race.raceDist) continue;
      if (aimCandidateValid(w, env, k, def, o.slot, true)) { best = o.slot; b.aimRear = true; out.held |= Held.LOOK_BACK; break; }
    }
  }
  b.aimCand = best;
  out.aim = best;
}

/** Tactical use rule (itemSkill ≥ 2) for the item in slot0. */
function wants(b: ItemBrain, w: Readonly<WorldState>, env: ItemEnv, k: Readonly<KartState>, def: Readonly<ItemDef>, out: InputFrame): boolean {
  const D = k.race.raceDist, rank = k.race.rank, L = env.track.lapLength;
  const finalStretch = D >= L * env.cfg.laps - 300;
  const leader = w.karts[leaderSlot(w)]!;
  switch (def.id) {
    case 'turbo_token':
      return (k.drive.boostTicks < 15 && straightAhead(env, k)) || finalStretch;
    case 'overclock_aura': {
      if (cornerAhead(env, k, 40) && !finalStretch) return false;
      for (const o of w.karts) if (isOpp(env, k, o) && o.race.raceDist - D <= 15 && o.race.raceDist - D >= -3) return true;
      return finalStretch;
    }
    case 'attention_tether':
      return rank >= 2 && locked(k, def, out);
    case 'prompt_missile':
      return locked(k, def, out);
    case 'top1_missile': {
      if (leaderTarget(w, env, k) < 0) return false;
      return rank >= 3 || (rank === 2 && leader.race.raceDist - D > 60);
    }
    case 'token_bomb': {
      for (const o of w.karts) if (o.slot !== k.slot && inRace(o) && sameTeam(env, k, o) && Math.abs(o.race.raceDist - (D + 32)) < 8) return false;
      let pack = 0;
      for (const o of w.karts) {
        if (!isOpp(env, k, o)) continue;
        const d = o.race.raceDist - D;
        if (d >= 20 && d <= 45 && Math.abs(o.race.loc.u) <= 6) return true;
        if (d >= 28 && d <= 40) pack++;
      }
      return pack >= 2;
    }
    case 'bug_report':
      return nextAheadOpponent(w, env, k, def) >= 0;
    case 'broadcast_bolt': {
      let n = 0;
      for (const o of w.karts) if (isOpp(env, k, o) && o.race.raceDist > D) n++;
      return rank >= 3 && n >= 2;
    }
    case 'throttle_drone': {
      const t = leaderTarget(w, env, k);
      return t >= 0 && w.karts[t]!.race.raceDist - D >= 40;
    }
    case 'firewall': {
      const t = firewallTarget(w, env, k);
      return t >= 0 && w.karts[t]!.race.raceDist - D >= 60;
    }
    case 'glitch_puddle': {
      for (const o of w.karts) { const d = D - o.race.raceDist; if (isOpp(env, k, o) && d > 0 && d <= 15) return true; }
      if (b.profile.itemSkill >= 3 && cornerAhead(env, k, 20)) for (const o of w.karts) { const d = D - o.race.raceDist; if (isOpp(env, k, o) && d > 0 && d <= 40) return true; }
      return false;
    }
    case 'redaction_cloud':
      for (const o of w.karts) { const d = D - o.race.raceDist; if (isOpp(env, k, o) && d > 0 && d <= 25) return true; }
      return false;
    case 'mirror_mode': {
      if (rank < 3) return false;
      for (const o of w.karts) if (isOpp(env, k, o) && o.race.raceDist > D && o.race.raceDist - D < 250 && cornerAhead(env, o, 120)) return true;
      return false;
    }
    case 'context_shield':
      return blockableThreatEta(w, env, k) <= PERCEIVE_ETA;
    case 'interrupt_pulse':
      return droneOrTetherThreat(w, env, k);
    case 'alignment_halo':
      return teamThreat(w, env, k);
    case 'interpretability_lens':
      return teamMode(env);
    case 'mutex_lock':
      for (const o of w.karts) if (isOpp(env, k, o) && (o.items.slot0 !== 0 || o.items.slot1 !== 0) && o.items.rouletteSlot < 0) return true;
      return false;
  }
  return false;
}

/** Is the slot0 aim item locked on the brain's candidate? */
function locked(k: Readonly<KartState>, def: Readonly<ItemDef>, out: InputFrame): boolean {
  return !!def.aim && out.aim !== NO_TARGET && k.items.aimTarget === out.aim && k.items.aimLockTicks >= lockNeed(def.aim.lockTicks);
}

/** itemSkill 1: "valid" means the item would not fizzle right now. */
function validNow(w: Readonly<WorldState>, env: ItemEnv, k: Readonly<KartState>, def: Readonly<ItemDef>, out: InputFrame): boolean {
  if (def.aim) return locked(k, def, out);
  if (def.validity === 'notIfLeaderSelfOrTeam') return leaderTarget(w, env, k) >= 0;
  if (def.target === 'aheadOfLeader') return firewallTarget(w, env, k) >= 0;
  if (def.target === 'nextAheadOpponent') return nextAheadOpponent(w, env, k, def) >= 0;
  if (def.target === 'allAheadOpponents') { for (const o of w.karts) if (isOpp(env, k, o) && o.race.raceDist > k.race.raceDist) return true; return false; }
  return true;
}

function reaction(b: ItemBrain, w: Readonly<WorldState>, k: Readonly<KartState>, def: Readonly<ItemDef>): number {
  const r = b.profile.reactionTicks;
  let t = r + Math.floor(rand(b) * (r + 1));
  if (def.category === 'attack' || def.category === 'trap') t = Math.round(t * (1.2 - 0.4 * b.aggression));
  if (activeEffect(w, k.slot, EF.redaction, w.tick)) t += 30; // perception noise while blacked out (§6)
  return t;
}

/**
 * Adds this bot's item intent for the current tick to `out` (call after the driver filled it). Mash-out while trapped;
 * aim + use per the tier's itemSkill; swaps a hoarded defensive item behind a usable one.
 */
export function decideItem(b: ItemBrain, w: Readonly<WorldState>, env: ItemEnv, out: InputFrame): void {
  const k = w.karts[b.slot];
  if (!k || !k.active || w.phase < Phase.RACING || !inRace(k) || b.profile.itemSkill === 0) return;
  const tick = w.tick, st = k.status;
  // ---- Mirror Mode: the reversal is telegraphed 30 ticks ahead (public), so a tactical bot counter-steers from the
  // start (itemSkill 3) or after half its reaction time (2); a random-timing bot needs its full reaction time (1)
  const mirror = activeEffect(w, k.slot, EF.mirror, tick);
  if (mirror) {
    const s = b.profile.itemSkill, adapt = s >= 3 ? 0 : s === 2 ? b.profile.reactionTicks >> 1 : b.profile.reactionTicks;
    if (tick - mirror.start >= adapt) out.steer = -out.steer;
  }
  // ---- mash-out: alternating taps at the tier's rate with ±1 tick jitter
  if (st.cc !== 0 && tick < st.ccEnd) {
    if (env.content.effects.byCode[st.cc]?.mash && tick >= b.mashNext) {
      out.edges |= b.mashDir < 0 ? Edge.TAP_L : Edge.TAP_R;
      b.mashDir = b.mashDir < 0 ? 1 : -1;
      const period = Math.max(3, Math.round(60 / b.profile.mashHz));
      b.mashNext = tick + period + Math.floor(rand(b) * 3) - 1;
    }
    b.triggerAt = -1;
    return;
  }
  const it = k.items;
  const code = it.rouletteSlot === 0 ? 0 : it.slot0;
  if (code !== b.heldCode) {
    b.heldCode = code; b.heldSince = tick; b.triggerAt = -1; b.aimCand = NO_TARGET;
    b.randomAt = tick + 60 + Math.floor(rand(b) * 181);
  }
  if (code === 0) return;
  const def = itemDef(env.content, code);
  if (!def) return;
  if (def.aim) chooseAim(b, w, env, k, def, out);
  if (tick < b.lockoutUntil) return;
  const skill = b.profile.itemSkill;
  let want: boolean;
  if (skill === 1) want = tick >= b.randomAt && validNow(w, env, k, def, out);
  else want = wants(b, w, env, k, def, out);
  // hoarding: a defensive item nobody threatens is parked behind a usable second item (or finally used)
  if (!want && skill >= 2 && DEFENSIVE.has(def.id)) {
    const second = itemDef(env.content, it.rouletteSlot === 1 ? 0 : it.slot1);
    if (second && !DEFENSIVE.has(second.id)) { out.edges |= Edge.SWAP; b.lockoutUntil = tick + 12; return; }
    if (tick - b.heldSince > 900 + 1200 * b.hoarding) want = true;
  }
  // an attack/speed item waits at most WAIT_BASE + 120·h ticks for its tactical moment (§6), then goes out when valid,
  // so a held item never blocks the slots (and the boxes) for the rest of the race
  if (!want && skill >= 2 && !DEFENSIVE.has(def.id) && tick - b.heldSince > WAIT_BASE + 120 * b.hoarding) want = validNow(w, env, k, def, out);
  if (!want) { b.triggerAt = -1; return; }
  if (b.triggerAt < 0) b.triggerAt = tick + (def.aim ? 0 : reaction(b, w, k, def)); // aim items already waited for the lock dwell
  if (tick >= b.triggerAt) {
    out.edges |= Edge.USE_ITEM;
    b.triggerAt = -1;
    b.lockoutUntil = tick + 12;
  }
}
