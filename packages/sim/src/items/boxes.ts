// Personal item boxes, rank buckets and the roulette (ADR-007, ADR-010, 12-items-spec §5, §8.2, §8.4).
// A box breaks per racer: boxRespawn[box·8 + slot] = P + 150 + (hash(boxId) mod 31). The roll happens at pickup P on the
// authority only; predictors read the `grant` decision (or keep the roulette spinning up to P + 60 until it arrives).
import type { RankBucket } from '@cr/content';
import type { KartState, WorldState } from '../core/state.ts';
import { MAX_KARTS } from '../core/units.ts';
import type { AuthorityHooks, StepContext } from '../api.ts';
import { evKey } from '../kart/evkey.ts';
import { KART_CY } from '../kart/motion.ts';
import { IT, itemDef } from './codes.ts';
import { authorityOf, knownGrant } from './decisions.ts';
import { mix4 } from './ids.ts';
import { REROLL_SHIFT } from './roll.ts';
import { firewallTarget, inRace, inWarp, leaderTarget, teamMode } from './team.ts';

export const ROULETTE_TICKS = 30;
/** A predictor without the grant keeps spinning up to P + 60 (ADR-007); the UI may spin longer. */
export const ROULETTE_WAIT = 60;
export const BOX_RESPAWN_MIN = 150, BOX_RESPAWN_SPREAD = 31, PICKUP_R = 1.8;
const MAX_REROLLS = 3;

/** Personal respawn delay of a box, derived from its id only (150–180 ticks). */
export const boxRespawnDelay = (boxId: number): number => BOX_RESPAWN_MIN + (mix4(0xb0c5, boxId, 0, 0) % BOX_RESPAWN_SPREAD);

/**
 * Rank bucket at pickup (§8.2): rank 1 → top; p = (rank − 1)/(N − 1): ≤ 0.30 high, ≤ 0.72 mid, else low. Distance
 * overrides in order: > 1 lap behind the racer directly ahead → 'turbo' (no roll); > 600 m behind the leader → low;
 * > 350 m → one bucket toward low, at most to mid. Integer arithmetic keeps the thresholds exact.
 */
export function bucketFor(w: Readonly<WorldState>, ctx: StepContext, k: Readonly<KartState>): RankBucket | 'turbo' {
  let n = 0, leaderD = k.race.raceDist, aheadD = -1e18;
  const rank = k.race.rank;
  for (const o of w.karts) {
    if (!o.active) continue;
    n++;
    if (o.race.rank === 1) leaderD = o.race.raceDist;
    if (o.race.rank === rank - 1) aheadD = o.race.raceDist;
  }
  if (rank > 1 && aheadD - k.race.raceDist > ctx.track.lapLength) return 'turbo';
  let b: RankBucket;
  if (rank <= 1 || n <= 1) b = 'top';
  else if ((rank - 1) * 100 <= 30 * (n - 1)) b = 'high';
  else if ((rank - 1) * 100 <= 72 * (n - 1)) b = 'mid';
  else b = 'low';
  const gap = leaderD - k.race.raceDist;
  if (gap > 600) return 'low';
  if (gap > 350) return b === 'top' ? 'high' : b === 'high' ? 'mid' : b;
  return b;
}

/** Validity rules for a rolled item (§8.4). */
export function rollValid(w: Readonly<WorldState>, ctx: StepContext, k: Readonly<KartState>, code: number): boolean {
  const def = itemDef(ctx.content, code);
  if (!def) return false;
  if (def.teamOnly && !teamMode(ctx)) return false;
  if (def.validity === 'notIfLeaderSelfOrTeam' && leaderTarget(w, ctx, k) < 0) return false;
  if (def.target === 'aheadOfLeader' && firewallTarget(w, ctx, k) < 0) return false;
  return true;
}

/** Authority roll with up to 3 validity rerolls, then Turbo Token. */
function grantRoll(a: AuthorityHooks, w: Readonly<WorldState>, ctx: StepContext, k: Readonly<KartState>, boxId: number, bucket: RankBucket): number {
  for (let r = 0; r <= MAX_REROLLS; r++) {
    const code = a.rollItem(k.slot, (boxId & 0xffff) | (r << REROLL_SHIFT), w.tick, bucket);
    if (rollValid(w, ctx, k, code)) return code;
  }
  return IT.turbo_token;
}

const slotOf = (k: Readonly<KartState>, i: number): number => (i === 0 ? k.items.slot0 : k.items.slot1);
function setSlot(k: KartState, i: number, code: number): void { if (i === 0) k.items.slot0 = code; else k.items.slot1 = code; }

/** Lands the roulette when its time has come and the content is known (phase 6, before item use). */
export function landRoulette(w: WorldState, ctx: StepContext, k: KartState): void {
  const it = k.items;
  if (it.rouletteSlot < 0 || w.tick < it.rouletteEnd) return;
  let code = slotOf(k, it.rouletteSlot);
  if (code === 0 && ctx.role === 'predictor') {
    const g = knownGrant(w, it.rouletteEnd - ROULETTE_TICKS, k.slot);
    if (g) { code = g.item; setSlot(k, it.rouletteSlot, code); }
    else if (w.tick < it.rouletteEnd - ROULETTE_TICKS + ROULETTE_WAIT) return; // keep spinning until the grant arrives
  }
  it.rouletteSlot = -1; it.rouletteEnd = 0; it.rouletteBox = -1;
  if (code !== 0) ctx.events.push({ t: 'itemGranted', kart: k.slot, item: code, tick: w.tick, key: evKey(w.tick, 84, k.slot, code) });
}

/** Box pickups for one kart (phase 6, after item use so a slot freed this tick can be refilled). */
export function pickupBoxes(w: WorldState, ctx: StepContext, k: KartState): void {
  const it = k.items, b = k.body, boxes = ctx.track.boxes, tick = w.tick;
  if (!inRace(k) || k.race.respawnPhase !== 0 || inWarp(k) || it.rouletteSlot >= 0) return;
  const cx = b.px + b.nx * KART_CY, cy = b.py + b.ny * KART_CY, cz = b.pz + b.nz * KART_CY;
  for (let i = 0; i < boxes.length; i++) {
    const bx = boxes[i]!;
    const ri = bx.id * MAX_KARTS + k.slot;
    if (ri >= w.boxRespawn.length || w.boxRespawn[ri]! > tick) continue;
    const dx = cx - bx.x, dy = cy - bx.y, dz = cz - bx.z;
    if (dx * dx + dy * dy + dz * dz > PICKUP_R * PICKUP_R) continue;
    w.boxRespawn[ri] = tick + boxRespawnDelay(bx.id);
    ctx.events.push({ t: 'box', kart: k.slot, boxId: bx.id, tick, key: evKey(tick, 83, k.slot, bx.id) });
    const free = it.slot0 === 0 ? 0 : it.slot1 === 0 ? 1 : -1;
    if (free < 0) return;                          // both slots full: the box still breaks, no item (§1)
    it.rouletteSlot = free as 0 | 1; it.rouletteEnd = tick + ROULETTE_TICKS; it.rouletteBox = bx.id;
    const bucket = bucketFor(w, ctx, k);
    const auth = authorityOf(w, ctx);
    let code = 0;
    if (bucket === 'turbo') code = IT.turbo_token;  // public rule: every peer knows it without the key
    else if (auth) code = grantRoll(auth, w, ctx, k, bx.id, bucket);
    else code = knownGrant(w, tick, k.slot)?.item ?? 0;
    setSlot(k, free, code);
    if (auth) auth.emit({ k: 'grant', tick, slot: k.slot, item: code, boxId: bx.id });
    return;                                        // one box per tick; others touched while spinning are ignored
  }
}
