// B11 art loader (60-codex-pipeline §4): `/art/overrides/<slotId>.(webp|png|jpg)` wins over the procedural fallback.
// The override index lives at /art/overrides/index.json (Vite dev plugin + Node server, L9). A 404 would log a console
// error on every boot, so the index is only requested once the server advertises it (ART_INDEX_READY) or with ?art=1.
import { artSlot, artSlots, type ArtSlotDef } from './slots.ts';

export type { ArtSlotDef } from './slots.ts';
export { artSlots, registerRenderFallback } from './slots.ts';

interface IndexEntry { file: string; w?: number; h?: number; mtime?: number }
type OverrideIndex = Record<string, IndexEntry>;

/** Flip to true once `/art/overrides/index.json` is always served (contract request L10-art-index.md). */
const ART_INDEX_READY = false;
const BASE = `${import.meta.env.BASE_URL ?? '/'}art/overrides/`;

let indexPromise: Promise<OverrideIndex> | null = null;
const bitmapCache = new Map<string, Promise<HTMLCanvasElement | ImageBitmap>>();
const urlCache = new Map<string, Promise<string | null>>();

function indexEnabled(): boolean {
  const q = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('art');
  if (q === '0') return false;
  return ART_INDEX_READY || q === '1';
}

export function overrideIndex(): Promise<OverrideIndex> {
  if (!indexPromise) {
    indexPromise = !indexEnabled() ? Promise.resolve({}) : fetch(`${BASE}index.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() as Promise<OverrideIndex> : {}))
      .catch(() => ({}));
  }
  return indexPromise;
}

/** Drops all caches (the dev plugin's `art-overrides:update` HMR event calls this). */
export function invalidateArt(): void { indexPromise = null; bitmapCache.clear(); urlCache.clear(); }
if (import.meta.hot) import.meta.hot.on('art-overrides:update', invalidateArt);

async function loadOverride(slot: ArtSlotDef, e: IndexEntry): Promise<ImageBitmap | HTMLCanvasElement | null> {
  try {
    const r = await fetch(`${BASE}${e.file}`);
    if (!r.ok) return null;
    const bmp = await createImageBitmap(await r.blob());
    const want = slot.w / slot.h, got = bmp.width / bmp.height;
    if (Math.abs(got / want - 1) <= 0.02) return bmp;
    if (import.meta.env.DEV) console.warn(`[art] ${slot.id}: aspect ${got.toFixed(3)} ≠ ${want.toFixed(3)}, centre-cropping`);
    // centre-crop, never stretch
    const c = document.createElement('canvas'); c.width = slot.w; c.height = slot.h;
    const s = Math.max(slot.w / bmp.width, slot.h / bmp.height);
    const dw = bmp.width * s, dh = bmp.height * s;
    c.getContext('2d')!.drawImage(bmp, (slot.w - dw) / 2, (slot.h - dh) / 2, dw, dh);
    return c;
  } catch { return null; }
}

/** Resolves an art slot to a drawable (override, then fallback). Unknown ids return a 1×1 placeholder and warn in dev. */
export function getArt(id: string): Promise<HTMLCanvasElement | ImageBitmap> {
  const hit = bitmapCache.get(id);
  if (hit) return hit;
  const p = (async (): Promise<HTMLCanvasElement | ImageBitmap> => {
    const slot = artSlot(id);
    if (!slot) {
      if (import.meta.env.DEV) console.warn(`[art] unknown slot ${id}`);
      const c = document.createElement('canvas'); c.width = 1; c.height = 1; return c;
    }
    const idx = await overrideIndex();
    const e = idx[id];
    if (e) { const o = await loadOverride(slot, e); if (o) return o; }
    return slot.fallback();
  })();
  bitmapCache.set(id, p);
  return p;
}

/** URL of the override image for `<img>` use, or null when there is none (the component then draws its own fallback). */
export function artUrl(id: string): Promise<string | null> {
  const hit = urlCache.get(id);
  if (hit) return hit;
  const p = overrideIndex().then((idx) => (idx[id] ? `${BASE}${idx[id]!.file}` : null));
  urlCache.set(id, p);
  return p;
}

/** Number of slots (for tests / the art debug sheet). */
export function artSlotCount(): number { return artSlots().length; }
