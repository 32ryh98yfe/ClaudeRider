// Phase 6 item handling per kart (12-items-spec §1, §4.1): roulette landing, swap, aim lock, use edge, box pickups.
// Refused uses (CC, slot lock, cooldown, respawn/warp) consume nothing; the authority reports them as `reject`
// decisions (refund 1) for the feed ("늦은 신호" when a late shield lands during CC).
import type { ItemDef } from '@cr/content';
import { Edge, Held, type InputFrame } from '../core/input.ts';
import type { KartState, WorldState } from '../core/state.ts';
import { detSinCos } from '../core/math.ts';
import type { StepContext } from '../api.ts';
import { evKey } from '../kart/evkey.ts';
import { ITEM_BEHAVIORS } from '../generated/item-behaviors.gen.ts';
import { useOut, type ItemBehavior } from './behavior.ts';
import { EF, NO_TARGET, Reject, itemDef, warnOnce } from './codes.ts';
import { authorityOf } from './decisions.ts';
import { activeEffect } from './effects.ts';
import { landRoulette, pickupBoxes } from './boxes.ts';
import { friendlyAllowed, inRace, inWarp, sameTeam } from './team.ts';

/** Minimum ticks between two uses (§1). */
export const USE_COOLDOWN = 6;
/** ADR-007 aim validation margins: +5° cone, +10 m range. */
export const AIM_CONE_MARGIN_DEG = 5, AIM_RANGE_MARGIN = 10;

const BEHAVIORS = ITEM_BEHAVIORS as Readonly<Record<string, ItemBehavior | undefined>>;
export function itemBehavior(def: Readonly<ItemDef>): ItemBehavior | undefined {
  const key = def.behavior ?? 'apply';
  const b = BEHAVIORS[key];
  if (!b) warnOnce('ib:' + key, `missing item behaviour '${key}' (${def.id})`);
  return b;
}

const COS_CACHE = new Map<number, number>();
const SC = { s: 0, c: 0 };
/** cos(deg) from the deterministic arithmetic sin/cos (literal-free, identical on every peer). */
export function cosDeg(deg: number): number {
  let c = COS_CACHE.get(deg);
  if (c === undefined) { detSinCos((deg * 3.141592653589793) / 180, SC); c = SC.c; COS_CACHE.set(deg, c); }
  return c;
}

/** Dwell needed for a lock: ⌈0.8 · lockTicks⌉ (≥ 80%, gap-4), in integer arithmetic. */
export const lockNeed = (lockTicks: number): number => Math.floor((lockTicks * 4 + 4) / 5);

/** Is `cand` a valid lock for `k` holding `def` (range + cone with ADR-007 margins, racing, team rule)? */
export function aimCandidateValid(w: Readonly<WorldState>, ctx: StepContext, k: Readonly<KartState>, def: Readonly<ItemDef>, cand: number, lookBack: boolean): boolean {
  const aim = def.aim;
  if (!aim || cand < 0 || cand >= w.karts.length || cand === k.slot) return false;
  const t = w.karts[cand]!;
  if (!inRace(t) || inWarp(t)) return false;
  if (sameTeam(ctx, k, t) && !aim.allowTeam && !friendlyAllowed(ctx, def)) return false;
  const dx = t.body.px - k.body.px, dy = t.body.py - k.body.py, dz = t.body.pz - k.body.pz;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d < aim.rangeMin || d > aim.rangeMax + AIM_RANGE_MARGIN) return false;
  const sgn = lookBack && aim.allowRear ? -1 : 1;
  const c = (sgn * (dx * k.body.fx + dy * k.body.fy + dz * k.body.fz)) / d;
  return c >= cosDeg(aim.coneDeg + AIM_CONE_MARGIN_DEG);
}

/** Locked target of `k` for its slot0 aim item, or −1. */
export function lockedTarget(k: Readonly<KartState>, def: Readonly<ItemDef>): number {
  const it = k.items;
  return def.aim && it.aimTarget !== NO_TARGET && it.aimLockTicks >= lockNeed(def.aim.lockTicks) ? it.aimTarget : -1;
}

function updateAim(w: WorldState, ctx: StepContext, k: KartState, inp: Readonly<InputFrame> | undefined): void {
  const it = k.items;
  const def = it.rouletteSlot === 0 ? undefined : itemDef(ctx.content, it.slot0);
  if (!def?.aim || !inp) { it.aimLockTicks = 0; it.aimTarget = NO_TARGET; return; }
  const cand = inp.aim;
  const valid = aimCandidateValid(w, ctx, k, def, cand, (inp.held & Held.LOOK_BACK) !== 0);
  if (valid && cand === it.aimTarget) it.aimLockTicks++;
  else { it.aimLockTicks = valid ? 1 : 0; it.aimTarget = valid ? cand : NO_TARGET; }
}

function refuse(w: WorldState, ctx: StepContext, k: KartState, item: number, reason: number): void {
  const auth = authorityOf(w, ctx);
  if (auth) auth.emit({ k: 'reject', tick: w.tick, slot: k.slot, item, reason, refund: 1 });
}

function useItem(w: WorldState, ctx: StepContext, k: KartState): void {
  const it = k.items, st = k.status, tick = w.tick;
  const code = it.rouletteSlot === 0 ? 0 : it.slot0;
  if (code === 0) return;                            // nothing held (or still spinning): nothing to refund
  if (st.cc !== 0 && tick < st.ccEnd) { refuse(w, ctx, k, code, Reject.IN_CC); return; }
  if (activeEffect(w, k.slot, EF.slot_lock, tick)) { refuse(w, ctx, k, code, Reject.SLOT_LOCKED); return; }
  if (tick - it.lastUseTick < USE_COOLDOWN) { refuse(w, ctx, k, code, Reject.COOLDOWN); return; }
  if (k.race.respawnPhase !== 0 || inWarp(k) || !inRace(k)) { refuse(w, ctx, k, code, Reject.RESPAWN); return; }
  const def = itemDef(ctx.content, code);
  let res: 'ok' | 'fizzle' | 'reject' = 'fizzle';
  useOut.obj = 0; useOut.target = NO_TARGET;
  if (def) {
    const beh = itemBehavior(def);
    if (beh?.onUse) res = beh.onUse(w, k.slot, def, ctx);
  } else warnOnce('it:' + code, `missing item definition code ${code}`);
  if (res === 'reject') { refuse(w, ctx, k, code, Reject.INVALID_TARGET); return; }
  // consume: the second slot moves to the front
  it.slot0 = it.slot1; it.slot1 = 0;
  if (it.rouletteSlot === 1) it.rouletteSlot = 0;
  it.lastUseTick = tick; it.aimLockTicks = 0; it.aimTarget = NO_TARGET;
  k.stats.itemsUsed++;
  const obj = useOut.obj, target = useOut.target;
  ctx.events.push({ t: res === 'ok' ? 'itemUse' : 'itemFizzle', kart: k.slot, item: code, obj, tick, key: evKey(tick, res === 'ok' ? 85 : 86, k.slot, code) });
  const auth = authorityOf(w, ctx);
  if (auth) auth.emit({ k: 'use', tick, slot: k.slot, item: code, obj, target: res === 'ok' ? target : NO_TARGET });
}

/** Phase 6 for every kart in slot order (item mode only). */
export function itemPhase(w: WorldState, inputs: ReadonlyArray<InputFrame> | null, ctx: StepContext): void {
  for (const k of w.karts) {
    if (!k.active) continue;
    const inp = inputs?.[k.slot];
    landRoulette(w, ctx, k);
    const it = k.items;
    if (inp && (inp.edges & Edge.SWAP) !== 0 && it.rouletteSlot !== 0 && (it.slot0 !== 0 || it.slot1 !== 0)) {
      const a = it.slot0; it.slot0 = it.slot1; it.slot1 = a;
      if (it.rouletteSlot === 1) it.rouletteSlot = 0;
      it.aimLockTicks = 0; it.aimTarget = NO_TARGET;
    }
    updateAim(w, ctx, k, inp);
    if (inp && (inp.edges & Edge.USE_ITEM) !== 0) useItem(w, ctx, k);
    pickupBoxes(w, ctx, k);
  }
}
