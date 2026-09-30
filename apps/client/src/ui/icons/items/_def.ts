// Item icon definition: an original vector glyph on a category plate (64 × 64 viewBox). One file per item id
// (`ui/icons/items/<id>.ts`, 12-items-spec §10 iconKey `items/<id>`); also the procedural fallback of art slot `icon.item.<id>`.
import type { ItemDef, ItemId } from '@cr/content';

export type ItemCategory = ItemDef['category'];
export interface ItemIconDef { id: ItemId; category: ItemCategory; /** SVG markup drawn over the plate, 64 × 64 space */ glyph: string }

export const defineItemIcon = (d: ItemIconDef): ItemIconDef => d;

/** Plate gradients per category (readable on dark HUD panels and light menus). */
export const PLATES: Record<ItemCategory, [string, string]> = {
  speed: ['#ffb347', '#e8623a'],
  attack: ['#ff6b5a', '#b8283b'],
  trap: ['#b58cff', '#6340c9'],
  defense: ['#58c8ff', '#2a6fe0'],
  utility: ['#8fd694', '#3f8a55'],
};

export const INK = '#141413';
/** Standard outline stroke for glyph shapes. */
export const S = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
