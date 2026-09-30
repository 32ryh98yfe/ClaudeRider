// Item drop tables by KRD rank bucket (1 / 2–3 / 4–6 / 7–8). Each bucket sums to 100. Owned by lane L2 (ITEMS).
// Row order matters: the roll walks the rows in order (12-items-spec §5.2), so variants keep the standard order.
import type { DropTable, ItemDef } from './schema/index.ts';
import { ITEM_IDS, type ItemId, type RankBucket } from './ids.ts';

export const DROP_SOLO: DropTable = {
  format: 'solo',
  buckets: {
    top: [['context_shield', 48], ['glitch_puddle', 22], ['interrupt_pulse', 13], ['redaction_cloud', 12], ['turbo_token', 5]],
    high: [['prompt_missile', 20], ['context_shield', 18], ['bug_report', 15], ['token_bomb', 10], ['turbo_token', 10], ['glitch_puddle', 8],
      ['throttle_drone', 5], ['attention_tether', 5], ['firewall', 4], ['interrupt_pulse', 3], ['mirror_mode', 2]],
    mid: [['turbo_token', 26], ['prompt_missile', 18], ['token_bomb', 14], ['attention_tether', 14], ['bug_report', 10], ['throttle_drone', 5],
      ['firewall', 5], ['top1_missile', 3], ['mirror_mode', 3], ['overclock_aura', 2]],
    low: [['turbo_token', 45], ['attention_tether', 22], ['overclock_aura', 8], ['broadcast_bolt', 6], ['throttle_drone', 6], ['top1_missile', 5],
      ['token_bomb', 4], ['firewall', 4]],
  },
};

export const DROP_TEAM: DropTable = {
  format: 'team',
  buckets: {
    top: [['context_shield', 40], ['glitch_puddle', 20], ['interrupt_pulse', 13], ['interpretability_lens', 12], ['redaction_cloud', 10], ['turbo_token', 5]],
    high: [['prompt_missile', 20], ['context_shield', 15], ['bug_report', 15], ['turbo_token', 12], ['token_bomb', 8], ['glitch_puddle', 8],
      ['alignment_halo', 5], ['throttle_drone', 5], ['attention_tether', 5], ['interrupt_pulse', 3], ['mutex_lock', 2], ['mirror_mode', 2]],
    mid: [['turbo_token', 26], ['prompt_missile', 15], ['attention_tether', 12], ['bug_report', 12], ['token_bomb', 10], ['throttle_drone', 5],
      ['alignment_halo', 5], ['interrupt_pulse', 5], ['firewall', 4], ['top1_missile', 2], ['mutex_lock', 2], ['mirror_mode', 2]],
    low: [['turbo_token', 42], ['attention_tether', 20], ['throttle_drone', 8], ['overclock_aura', 7], ['broadcast_bolt', 5], ['alignment_halo', 5],
      ['interrupt_pulse', 5], ['top1_missile', 4], ['firewall', 4]],
  },
};

export type ItemSet = 'standard' | 'light' | 'chaos';
export type ItemCategory = ItemDef['category'];
export const RANK_BUCKETS: readonly RankBucket[] = ['top', 'high', 'mid', 'low'];

/**
 * Category multipliers of the custom-room item sets (12-items-spec §8.3), in halves so the renormalization is exact
 * integer arithmetic: light = attack/trap ×0.5, chaos = attack/trap ×1.5 and defense ×0.5.
 */
const HALVES: Record<ItemSet, Record<ItemCategory, number>> = {
  standard: { speed: 2, attack: 2, trap: 2, defense: 2, utility: 2 },
  light: { speed: 2, attack: 1, trap: 1, defense: 2, utility: 2 },
  chaos: { speed: 2, attack: 3, trap: 3, defense: 1, utility: 2 },
};

/**
 * Derives the light/chaos variant of a standard table: weights × category multiplier, renormalized to 100 with
 * largest-remainder rounding (ties by ITEM_IDS order). Rows that round to 0 are dropped; row order is kept.
 */
export function deriveDropTable(base: DropTable, set: ItemSet, categoryOf: (id: ItemId) => ItemCategory): DropTable {
  if (set === 'standard') return base;
  const buckets = {} as Record<RankBucket, ReadonlyArray<readonly [ItemId, number]>>;
  for (const b of RANK_BUCKETS) {
    const rows = base.buckets[b];
    const raw = rows.map(([id, wt]) => wt * HALVES[set][categoryOf(id)]);
    const total = raw.reduce((a, x) => a + x, 0);
    const out = raw.map((r) => Math.floor((r * 100) / total));
    const rem = raw.map((r) => (r * 100) % total);
    let left = 100 - out.reduce((a, x) => a + x, 0);
    const order = rows.map((_, i) => i).sort((i, j) => rem[j]! - rem[i]! || ITEM_IDS.indexOf(rows[i]![0]) - ITEM_IDS.indexOf(rows[j]![0]));
    for (let k = 0; left > 0 && k < order.length; k++, left--) out[order[k]!]!++;
    buckets[b] = rows.map(([id], i) => [id, out[i]!] as const).filter((r) => r[1] > 0);
  }
  return { format: base.format, buckets };
}
