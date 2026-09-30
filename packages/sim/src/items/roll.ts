// Authority-side item roll (ADR-007, 12-items-spec §5.2): HalfSipHash-2-4 keyed by the per-room secret, so no peer can
// predict a roll; rank-bucket drop tables (ADR-010) with the custom-room item-set variants (§8.3).
import { deriveDropTable, type ContentTables, type DropTable, type ItemId, type RankBucket } from '@cr/content';
import type { RaceConfig } from '../core/state.ts';
import type { Tick } from '../core/units.ts';
import { halfSipHash24Words } from './siphash.ts';

/**
 * Validity rerolls travel in the high 16 bits of `boxId` through the frozen AuthorityHooks.rollItem signature
 * (box ids are u16 on the wire): `boxId | reroll << 16`, reroll = 0…3.
 */
export const REROLL_SHIFT = 16;

const TABLES = new WeakMap<ContentTables, Map<string, DropTable>>();

/** The drop table for the race format and item set (variants derived once per content table). */
export function dropTableFor(content: ContentTables, cfg: Readonly<RaceConfig>): DropTable {
  const format = cfg.teams === 'solo' ? 'solo' : 'team';
  const set = cfg.rules.itemSet ?? 'standard';
  let m = TABLES.get(content);
  if (!m) { m = new Map(); TABLES.set(content, m); }
  const key = format + '/' + set;
  let t = m.get(key);
  if (!t) {
    const base = format === 'solo' ? content.drop.solo : content.drop.team;
    t = deriveDropTable(base, set, (id: ItemId) => content.items.byId.get(id)?.category ?? 'speed');
    m.set(key, t);
  }
  return t;
}

/** 32-bit FNV-1a of a string (race id half from the track hash). */
function fnv(s: string): number {
  let h = 0x811c9dc5 | 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i) & 0xff; h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

const MSG = new Uint32Array(6);

/** Raw keyed hash of the roll message `[raceIdLo, raceIdHi, slot, boxId, P, reroll]` (20-netcode-spec §3.7). */
export function rollHash(cfg: Readonly<RaceConfig>, secret: Readonly<Uint32Array>, slot: number, boxId: number, tick: Tick, reroll: number): number {
  // the 128-bit room secret folds into HalfSipHash's 64-bit key
  const k0 = ((secret[0] ?? 0) ^ (secret[2] ?? 0)) | 0, k1 = ((secret[1] ?? 0) ^ (secret[3] ?? 0)) | 0;
  MSG[0] = cfg.seed >>> 0; MSG[1] = fnv(cfg.trackHash + '|' + cfg.trackId); MSG[2] = slot; MSG[3] = boxId; MSG[4] = tick; MSG[5] = reroll;
  return halfSipHash24Words(k0, k1, MSG, 6);
}

/** Walks a bucket: x = h mod 100; the first row whose running weight sum exceeds x wins. */
export function pickFromBucket(content: ContentTables, table: DropTable, bucket: RankBucket, h: number): number {
  const rows = table.buckets[bucket];
  const x = (h >>> 0) % 100;
  let sum = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    sum += r[1];
    if (sum > x) return content.items.byId.get(r[0])?.code ?? 0;
  }
  const last = rows[rows.length - 1];
  return last ? content.items.byId.get(last[0])?.code ?? 0 : 0;
}

/**
 * Returns an item code (index into ITEM_IDS + 1) for `slot` opening `boxId` at `tick` in `bucket`.
 * Authority only: the secret key never leaves the room; predictors read `grant` decisions instead.
 */
export function rollItem(content: ContentTables, cfg: Readonly<RaceConfig>, secret: Readonly<Uint32Array>, slot: number, boxId: number, tick: Tick, bucket: RankBucket): number {
  const reroll = boxId >>> REROLL_SHIFT, box = boxId & 0xffff;
  return pickFromBucket(content, dropTableFor(content, cfg), bucket, rollHash(cfg, secret, slot, box, tick, reroll));
}
