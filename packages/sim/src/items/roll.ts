// Authority-side item roll (lane L2 owns the body). ADR-007: HalfSipHash-2-4 keyed by a per-room secret,
// so no peer can predict a roll; ADR-010: rank-bucket drop tables (1 / 2–3 / 4–6 / 7–8) plus distance overrides.
import type { ContentTables, RankBucket } from '@cr/content';
import type { RaceConfig } from '../core/state.ts';
import type { Tick } from '../core/units.ts';

/**
 * Returns an item code (index into ITEM_IDS + 1) for `slot` opening `boxId` at `tick`.
 * M1 placeholder: a deterministic pick from the bucket's first entry. L2 replaces it with the keyed hash + weights.
 */
export function rollItem(content: ContentTables, cfg: Readonly<RaceConfig>, secret: Readonly<Uint32Array>, slot: number, boxId: number, tick: Tick, bucket: RankBucket): number {
  void secret; void slot; void boxId; void tick;
  const table = cfg.teams === 'solo' ? content.drop.solo : content.drop.team;
  const first = table.buckets[bucket][0]?.[0];
  const def = first ? content.items.byId.get(first) : undefined;
  return def ? def.code : 0;
}
