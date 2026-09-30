// FROZEN (contracts.lock). APPEND ONLY — never reorder or remove. Wire code = index + 1 (0 = none).

export const THEME_IDS = [
  'clayhill_village', 'sunstone_desert', 'frostbyte_glacier', 'canopy_forest', 'ember_mine',
  'lantern_hollow', 'coral_cove', 'neon_harbor', 'spark_circuit', 'orbital_nexus',
] as const;

export const TRACK_IDS = [
  'meadow_loop', 'belltower_piazza', 'sunstone_bazaar', 'sandglass_canyon', 'snowglobe_halfpipe',
  'aurora_summit', 'fernwood_hollow', 'cascade_slalom', 'geode_rail_quarry', 'magma_switchback',
  'pumpkin_lane', 'manor_catacombs', 'coral_cove_docks', 'kraken_lighthouse', 'rainline_blvd',
  'skyway_interchange', 'spark_grand_circuit', 'sunset_arena_rally', 'token_foundry', 'orbital_express',
  'proving_ring',
] as const;

export const CHARACTER_IDS = ['clay', 'pixel', 'turbo', 'anchor', 'rune', 'nova', 'kage', 'bisque', 'frost', 'glitch', 'bolt', 'duke'] as const;

export const KART_BODY_IDS = ['pebble', 'clay_comet', 'arrowhead', 'tugboat', 'glacier_sled', 'neon_blade', 'jet_kettle', 'crown_cruiser'] as const;

export const ITEM_IDS = [
  'turbo_token', 'attention_tether', 'overclock_aura', 'prompt_missile', 'top1_missile', 'token_bomb',
  'bug_report', 'broadcast_bolt', 'throttle_drone', 'firewall', 'glitch_puddle', 'redaction_cloud', 'mirror_mode',
  'context_shield', 'interrupt_pulse', 'alignment_halo', 'interpretability_lens', 'mutex_lock',
] as const;

export const EFFECT_IDS = [
  'airborne', 'trap_bomb', 'trap_bug', 'spin', 'stun', 'post_stun_slow', 'throttle', 'tether_pull',
  'slingshot', 'overclock', 'turbo', 'escape_boost', 'redaction', 'mirror', 'slot_lock', 'shield', 'halo',
  'pulse_guard', 'lens_reveal', 'firewall_hit',
] as const;

export const SURFACE_IDS = [
  'asphalt', 'stone', 'cobble', 'dirt', 'sand', 'gravel', 'ice', 'snow', 'grass', 'wet', 'wood', 'metal',
  'boost_pad', 'jump_pad', 'conveyor_fwd', 'conveyor_back', 'lava', 'basalt', 'obsidian', 'glass', 'rail',
] as const;

export type ThemeId = (typeof THEME_IDS)[number];
export type TrackId = (typeof TRACK_IDS)[number];
export type CharacterId = (typeof CHARACTER_IDS)[number];
export type KartBodyId = (typeof KART_BODY_IDS)[number];
export type ItemId = (typeof ITEM_IDS)[number];
export type EffectId = (typeof EFFECT_IDS)[number];
export type SurfaceId = (typeof SURFACE_IDS)[number];

export type RankBucket = 'top' | 'high' | 'mid' | 'low';
export type ModeId = 'speed' | 'item' | 'infinite' | 'timeAttack';
export type TeamFormat = 'solo' | 'duo' | 'squad';
export type AiTier = 'rookie' | 'racer' | 'pro' | 'legend';

/** Wire code of an id within its list (1-based; 0 = none). */
export function codeOf<T extends string>(list: readonly T[], id: T): number {
  const i = list.indexOf(id);
  if (i < 0) throw new Error(`unknown id ${id}`);
  return i + 1;
}
/** Inverse of codeOf. Returns undefined for 0 / out of range. */
export function idOf<T extends string>(list: readonly T[], code: number): T | undefined {
  return code > 0 ? list[code - 1] : undefined;
}
