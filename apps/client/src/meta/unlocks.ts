// Unlocks (13-modes-rules §12): characters and karts unlock free at their content `unlockLevel`; cosmetics unlock at a
// level and are then bought with Sparks, except the free rewards at levels 1, 2 and 50. Cosmetic only — no stats for sale.
import { loadContent } from '@cr/content';
import type { SaveV1 } from './save.ts';

export type UnlockKind = 'character' | 'kart' | 'livery' | 'palette' | 'flame' | 'emote' | 'title';
export interface UnlockDef {
  id: string;            // e.g. 'character.turbo', 'livery.checker', 'palette.midnight'
  kind: UnlockKind;
  ref: string;           // characterId / kartBodyId / pattern index / palette id / flame id
  level: number;
  price: number;         // 0 = free on unlock
  nameKey: string;       // i18n key
  color?: string;        // swatch colour for palettes / flames
}

/** Livery patterns in `Livery.pattern` order (0 is the starter "Stripes"). L8's livery canvas reads the same indices. */
export const LIVERY_PATTERNS = [
  { id: 'stripes', level: 1, price: 0 }, { id: 'sparkle', level: 2, price: 0 }, { id: 'checker', level: 7, price: 500 },
  { id: 'flames', level: 17, price: 700 }, { id: 'circuit', level: 22, price: 900 }, { id: 'wave', level: 27, price: 900 },
  { id: 'filigree', level: 32, price: 1200 }, { id: 'aurora', level: 38, price: 1200 }, { id: 'chrome', level: 45, price: 1500 },
  { id: 'legend', level: 50, price: 0 },
] as const;
export const PALETTES = [
  { id: 'classic', color: '#D87656', level: 1, price: 0 }, { id: 'midnight', color: '#30302E', level: 5, price: 300 },
  { id: 'parchment', color: '#F5F4ED', level: 10, price: 300 }, { id: 'sage', color: '#788C5D', level: 14, price: 300 },
  { id: 'sky', color: '#6A9BCC', level: 19, price: 300 },
] as const;
export const FLAMES = [
  { id: 'coral', color: '#FF7A45', level: 1, price: 0 }, { id: 'violet', color: '#9B6BFF', level: 13, price: 800 },
  { id: 'teal', color: '#2EC4B6', level: 23, price: 800 }, { id: 'gold', color: '#F2C14E', level: 33, price: 1000 },
  { id: 'white', color: '#FFF6E8', level: 43, price: 1200 },
] as const;

let cache: UnlockDef[] | null = null;
/** Every unlockable, sorted by level. */
export function allUnlocks(): readonly UnlockDef[] {
  if (cache) return cache;
  const c = loadContent();
  const out: UnlockDef[] = [];
  for (const ch of c.characters.all) out.push({ id: `character.${ch.id}`, kind: 'character', ref: ch.id, level: ch.unlockLevel, price: 0, nameKey: ch.nameKey });
  for (const k of c.karts.all) out.push({ id: `kart.${k.id}`, kind: 'kart', ref: k.id, level: k.unlockLevel, price: 0, nameKey: k.nameKey });
  LIVERY_PATTERNS.forEach((p, i) => out.push({ id: `livery.${p.id}`, kind: 'livery', ref: String(i), level: p.level, price: p.price, nameKey: `garage.patternName.${p.id}` }));
  for (const p of PALETTES) out.push({ id: `palette.${p.id}`, kind: 'palette', ref: p.id, level: p.level, price: p.price, nameKey: `garage.paletteName.${p.id}`, color: p.color });
  for (const f of FLAMES) out.push({ id: `flame.${f.id}`, kind: 'flame', ref: f.id, level: f.level, price: f.price, nameKey: `garage.flameName.${f.id}`, color: f.color });
  out.push({ id: 'emote.pack2', kind: 'emote', ref: 'pack2', level: 40, price: 1000, nameKey: 'garage.emotePack2' });
  out.push({ id: 'title.legend', kind: 'title', ref: 'legend', level: 50, price: 0, nameKey: 'garage.titleLegend' });
  out.sort((a, b) => a.level - b.level || a.id.localeCompare(b.id));
  cache = out;
  return out;
}
export function unlockDef(id: string): UnlockDef | undefined { return allUnlocks().find((u) => u.id === id); }

export function isUnlocked(u: UnlockDef, s: Readonly<SaveV1>): boolean { return s.progress.level >= u.level; }
/** Usable now: unlocked and (free or bought). */
export function isOwned(u: UnlockDef, s: Readonly<SaveV1>): boolean { return isUnlocked(u, s) && (u.price === 0 || s.progress.unlocks.includes(u.id)); }
export function ownedById(id: string, s: Readonly<SaveV1>): boolean { const u = unlockDef(id); return u ? isOwned(u, s) : true; }

export type BuyResult = 'ok' | 'locked' | 'owned' | 'notEnough';
export function canBuy(u: UnlockDef, s: Readonly<SaveV1>): BuyResult {
  if (!isUnlocked(u, s)) return 'locked';
  if (isOwned(u, s)) return 'owned';
  return s.progress.sparks >= u.price ? 'ok' : 'notEnough';
}
/** Spends Sparks on `u` (mutates the draft save). */
export function buy(u: UnlockDef, s: SaveV1): BuyResult {
  const r = canBuy(u, s);
  if (r !== 'ok') return r;
  s.progress.sparks -= u.price;
  s.progress.unlocks.push(u.id);
  return 'ok';
}

/** Unlockables whose level lies in (from, to]. */
export function unlockedBetween(from: number, to: number): UnlockDef[] { return allUnlocks().filter((u) => u.level > from && u.level <= to); }
/** The next unlock above `level` (for the pass widget). */
export function nextUnlock(level: number): UnlockDef | undefined { return allUnlocks().find((u) => u.level > level); }
