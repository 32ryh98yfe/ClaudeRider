// Client-only registry of item icons (import.meta.glob over ui/icons/items/<id>.ts) plus the speed-mode booster glyphs.
// Missing ids render a placeholder plate and log one dev warning (CLAUDE.md rule 7).
import { ITEM_IDS, idOf, type ItemId } from '@cr/content';
import { PLATES, INK, type ItemIconDef } from './items/_def.ts';
import { t, hasKey } from '../../i18n/index.ts';

const mods = import.meta.glob<{ default: ItemIconDef }>(['./items/*.ts', '!./items/_*.ts'], { eager: true });
const byId = new Map<string, ItemIconDef>();
for (const m of Object.values(mods)) byId.set(m.default.id, m.default);

const warned = new Set<string>();
const cache = new Map<string, string>();

function plate(id: string, a: string, b: string, inner: string): string {
  const gid = `ip-${id}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>`
    + `<rect x="2.5" y="2.5" width="59" height="59" rx="15" fill="url(#${gid})" stroke="${INK}" stroke-width="2.5"/>`
    + `<path d="M8 16c0-5 3-8 8-8h32c5 0 8 3 8 8v4C40 14 24 14 8 20z" fill="#fff" opacity=".22"/>`
    + `<g>${inner}</g></svg>`;
}

/** Full SVG markup for an item icon by id (placeholder plate when unknown). */
export function itemIconSvg(id: string): string {
  const hit = cache.get(id);
  if (hit) return hit;
  const def = byId.get(id);
  let svg: string;
  if (def) { const [a, b] = PLATES[def.category]; svg = plate(id, a, b, def.glyph); }
  else {
    if (import.meta.env.DEV && !warned.has(id)) { warned.add(id); console.warn(`[icons] missing item icon ${id}`); }
    svg = plate('missing', '#b0aea5', '#5e5d59', `<text x="32" y="42" text-anchor="middle" font-size="28" font-weight="800" fill="#fff" font-family="sans-serif">?</text>`);
  }
  cache.set(id, svg);
  return svg;
}

/** Item id for a slot code (0 = empty). */
export function itemIdOfCode(code: number): ItemId | undefined { return idOf(ITEM_IDS, code); }
export function hasItemIcon(id: string): boolean { return byId.has(id); }

/** Speed-mode booster (coral flame capsule) and team booster (always blue, 13-modes §12.3). */
export function boosterSvg(team: boolean): string {
  const key = team ? '__team' : '__boost';
  const hit = cache.get(key);
  if (hit) return hit;
  const [a, b] = team ? ['#5fd8ff', '#6a4cff'] : ['#ffb347', '#ff5a36'];
  const glyph = `<path d="M13 32c0-7 5-11 12-11h14c7 0 12 4 12 11s-5 11-12 11H25c-7 0-12-4-12-11z" fill="#faf9f5" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`
    + `<path d="M33 25l-6 8h5l-2 6 7-9h-5z" fill="${team ? '#2acaff' : '#ff5a36'}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`
    + `<path d="M12 27c-4 1-6 3-7 5 1 2 3 4 7 5M9 23c-3 2-5 5-6 9 1 4 3 7 6 9" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".9"/>`;
  const svg = plate(key, a, b, glyph);
  cache.set(key, svg);
  return svg;
}

/** Renders an icon SVG into a canvas (art fallback for `icon.item.<id>` slots). */
export async function svgToCanvas(svg: string, px: number): Promise<HTMLCanvasElement> {
  const c = document.createElement('canvas');
  c.width = px; c.height = px;
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode().catch(() => undefined);
  c.getContext('2d')?.drawImage(img, 0, 0, px, px);
  return c;
}

/** Localised item name; until lane L2's `items` namespace lands, a readable fallback from the id (no dev warnings). */
export function itemName(id: string): string {
  const key = `items.${id}.name`;
  if (hasKey(key)) return t(key);
  return id.split('_').map((w) => (w === 'top1' ? 'Top-1' : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}
