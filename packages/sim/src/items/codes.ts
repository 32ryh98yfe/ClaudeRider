// Wire codes for items and effects (ids.ts order, 1-based) plus runtime flag constants shared by the item modules.
import { EFFECT_IDS, ITEM_IDS, type EffectDef, type EffectId, type ItemDef, type ItemId, type ContentTables } from '@cr/content';

function codes<T extends string>(list: readonly T[]): Record<T, number> {
  const out = {} as Record<T, number>;
  for (let i = 0; i < list.length; i++) out[list[i]!] = i + 1;
  return out;
}

/** Item wire codes by id (turbo_token = 1 … mutex_lock = 18). */
export const IT: Readonly<Record<ItemId, number>> = codes(ITEM_IDS);
/** Effect wire codes by id (airborne = 1 … firewall_hit = 20). */
export const EF: Readonly<Record<EffectId, number>> = codes(EFFECT_IDS);

/** EffectInstance.flags (u8 on the wire). */
export const EFlag = {
  RESOLVED: 1,     // start-tick resolution done; resolved instances in the list are always hits
  BLOCKABLE: 2,    // shield / halo / grace apply (attack items with a non-empty blockedBy)
  HAZARD: 4,       // from a track hazard (source 255): never shielded
  PROXIMITY: 8,    // tether ended by proximity → its onEnd slingshot runs
  ENDED: 16,       // ended early (pulse, target lost, wall block); removed in phase 8
  DRIVER: 32,      // the hard-CC instance currently driving KartStatus.cc (kept until ccEnd)
  DEAD: 64,        // removed at the next compaction (never visible after a phase ends)
} as const;

/** EffectInstance.result */
export const Res = { HIT: 0, SHIELDED: 1, IMMUNE: 2, GRACE: 3 } as const;
export const RESULT_NAME = ['hit', 'shielded', 'immune', 'immune_grace'] as const;

/** ProjectileState.phase */
export const PPhase = { CRUISE: 0, TERMINAL: 1 } as const;

/** KartMods.kinematic */
export const Kin = { NONE: 0, AIRBORNE: 1, TRAP: 2, SPIN: 3, TETHER: 4 } as const;

/** Reject reasons (20-netcode-spec §3.6). */
export const Reject = { NO_ITEM: 1, IN_CC: 2, SLOT_LOCKED: 3, COOLDOWN: 4, INVALID_TARGET: 5, LATE_CC: 6, BEFORE_GO: 7, RESPAWN: 8 } as const;

/** Source slot used by track hazards (never shielded). */
export const SOURCE_TRACK = 255;
export const NO_TARGET = 255;

export const itemDef = (c: ContentTables, code: number): ItemDef | undefined => (code > 0 ? c.items.byCode[code] : undefined);
export const effectDef = (c: ContentTables, code: number): EffectDef | undefined => (code > 0 ? c.effects.byCode[code] : undefined);

const warned = new Set<string>();
/** One dev warning per missing registry entry; the sim never crashes on missing content (CLAUDE.md rule 7). */
export function warnOnce(key: string, msg: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  const c = (globalThis as { console?: { warn(m: string): void } }).console;
  c?.warn(`[items] ${msg}`);
}
