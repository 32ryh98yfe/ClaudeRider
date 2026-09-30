// The 110 Codex art slots (60-codex-pipeline §3) with procedural fallbacks (ADR-013). Fallbacks are cheap 2D canvases;
// render-based fallbacks (portrait/hero/kart studio renders) come from lane L8 through `registerRenderFallback`.
import { CHARACTER_IDS, ITEM_IDS, KART_BODY_IDS, THEME_IDS, TRACK_IDS, loadContent } from '@cr/content';
import { itemIconSvg, svgToCanvas } from '../ui/icons/itemIcons.ts';
import { portraitSvg } from '../ui/components/portraitSvg.ts';

export type ArtKind = 'portrait' | 'hero' | 'kart' | 'thumb' | 'loading' | 'keyart' | 'card' | 'icon' | 'logo' | 'ui';
export interface ArtSlotDef {
  id: string; kind: ArtKind; w: number; h: number; promptId: string; alpha: boolean;
  fallback(): Promise<HTMLCanvasElement | ImageBitmap>;
}

type RenderFallback = (slot: ArtSlotDef) => Promise<HTMLCanvasElement | ImageBitmap | null>;
const renderFallbacks = new Map<ArtKind, RenderFallback>();
/** Lane L8 (showcase renders) plugs studio renders in here: `registerRenderFallback('portrait', fn)`. */
export function registerRenderFallback(kind: ArtKind, fn: RenderFallback): void { renderFallbacks.set(kind, fn); }

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}
function themeOfTrack(trackId: string): string[] {
  const c = loadContent();
  const tr = c.tracks.byId.get(trackId);
  const th = tr ? c.themes.byId.get(tr.themeId) : undefined;
  return th ? [...th.palette] : ['#D97757', '#F4EFE6', '#5A6B7B'];
}
function gradientPoster(w: number, h: number, pal: readonly string[], stripes = true): HTMLCanvasElement {
  const [c, g] = canvas(w, h);
  const lg = g.createLinearGradient(0, 0, w, h);
  lg.addColorStop(0, pal[3] ?? '#30302E'); lg.addColorStop(0.55, pal[0] ?? '#D97757'); lg.addColorStop(1, pal[1] ?? '#FAF9F5');
  g.fillStyle = lg; g.fillRect(0, 0, w, h);
  if (stripes) {
    g.globalAlpha = 0.12; g.fillStyle = '#fff';
    for (let i = -h; i < w; i += Math.max(24, w / 16)) { g.beginPath(); g.moveTo(i, h); g.lineTo(i + h * 0.6, 0); g.lineTo(i + h * 0.6 + w / 60, 0); g.lineTo(i + w / 60, h); g.fill(); }
    g.globalAlpha = 1;
  }
  const rg = g.createRadialGradient(w * 0.3, h * 0.7, 0, w * 0.3, h * 0.7, w * 0.8);
  rg.addColorStop(0, 'rgba(255,255,255,0.18)'); rg.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = rg; g.fillRect(0, 0, w, h);
  return c;
}
async function svgFallback(inner: string, w: number, h: number, viewBox = '0 0 100 100'): Promise<HTMLCanvasElement> {
  const [c, g] = canvas(w, h);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${w}" height="${h}">${inner}</svg>`)}`;
  await img.decode().catch(() => undefined);
  const s = Math.min(w, h);
  g.drawImage(img, (w - s) / 2, (h - s) / 2, s, s);
  return c;
}
async function withRender(slot: ArtSlotDef, fallback: () => Promise<HTMLCanvasElement>): Promise<HTMLCanvasElement | ImageBitmap> {
  const r = renderFallbacks.get(slot.kind);
  if (r) { try { const out = await r(slot); if (out) return out; } catch { /* fall through */ } }
  return fallback();
}

function make(id: string, kind: ArtKind, w: number, h: number, alpha: boolean, fb: (s: ArtSlotDef) => Promise<HTMLCanvasElement | ImageBitmap>): ArtSlotDef {
  const s: ArtSlotDef = { id, kind, w, h, alpha, promptId: id, fallback: () => fb(s) };
  return s;
}

let all: ArtSlotDef[] | null = null;
export function artSlots(): readonly ArtSlotDef[] {
  if (all) return all;
  const out: ArtSlotDef[] = [];
  for (const c of CHARACTER_IDS) out.push(make(`portrait.${c}`, 'portrait', 512, 512, true, (s) => withRender(s, () => svgFallback(portraitSvg(c), 512, 512))));
  for (const c of CHARACTER_IDS) out.push(make(`hero.${c}`, 'hero', 1024, 1536, true, (s) => withRender(s, () => svgFallback(portraitSvg(c), 1024, 1536))));
  for (const k of KART_BODY_IDS) out.push(make(`kart.${k}`, 'kart', 1024, 640, true, (s) => withRender(s, async () => gradientPoster(1024, 640, ['#D97757', '#FAF9F5', '#5A6B7B', '#30302E'], false))));
  for (const t of TRACK_IDS) if (t !== 'proving_ring') out.push(make(`thumb.${t}`, 'thumb', 640, 360, false, async () => gradientPoster(640, 360, themeOfTrack(t))));
  for (const t of TRACK_IDS) if (t !== 'proving_ring') out.push(make(`loading.${t}`, 'loading', 1920, 1080, false, async () => gradientPoster(1920, 1080, themeOfTrack(t))));
  for (const th of THEME_IDS) out.push(make(`keyart.${th}`, 'keyart', 1920, 1080, false, async () => gradientPoster(1920, 1080, loadContent().themes.byId.get(th)?.palette ?? ['#D97757'])));
  for (const m of ['speed', 'item', 'timeAttack', 'custom']) out.push(make(`card.${m}`, 'card', 768, 1024, true, async () => gradientPoster(768, 1024, CARD_PALETTES[m]!)));
  out.push(make('keyart.title', 'keyart', 2560, 1440, false, async () => gradientPoster(2560, 1440, ['#D97757', '#FF8C42', '#F2A65A', '#6A4C93'])));
  out.push(make('logo.wordmark', 'logo', 2048, 768, true, async () => wordmark()));
  for (const i of ITEM_IDS) out.push(make(`icon.item.${i}`, 'icon', 256, 256, true, async () => svgToCanvas(itemIconSvg(i), 256)));
  out.push(make('ui.lobby_bg', 'ui', 1920, 1080, false, async () => gradientPoster(1920, 1080, ['#D97757', '#F5F4ED', '#E8E6DC', '#3a2a22'], false)));
  out.push(make('ui.results_bg', 'ui', 1920, 1080, false, async () => gradientPoster(1920, 1080, ['#C96442', '#F2A65A', '#FAF9F5', '#30302E'])));
  out.push(make('ui.garage_backdrop', 'ui', 2048, 1024, false, async () => gradientPoster(2048, 1024, ['#5E5D59', '#E8E6DC', '#F5F4ED', '#30302E'], false)));
  out.push(make('ui.pattern_parchment', 'ui', 1024, 1024, false, async () => gradientPoster(1024, 1024, ['#F5F4ED', '#FAF9F5', '#F0EEE6', '#E8E6DC'], false)));
  all = out;
  return out;
}
export function artSlot(id: string): ArtSlotDef | undefined { return artSlots().find((s) => s.id === id); }

export const CARD_PALETTES: Record<string, string[]> = {
  speed: ['#D97757', '#FAF9F5', '#F2A65A', '#8a2f16'],
  item: ['#8A5CFF', '#FAF9F5', '#2ACAFF', '#2a1856'],
  timeAttack: ['#6A9BCC', '#FAF9F5', '#9FD3F5', '#14304f'],
  custom: ['#788C5D', '#FAF9F5', '#C9D8A8', '#253018'],
};

async function wordmark(): Promise<HTMLCanvasElement> {
  const [c, g] = canvas(2048, 768);
  try { await document.fonts.load('900 italic 300px "Barlow Condensed"'); } catch { /* optional */ }
  g.font = 'italic 900 300px "Barlow Condensed", sans-serif';
  g.textBaseline = 'middle';
  const title = (import.meta.env['VITE_PUBLIC_TITLE'] as string | undefined) ?? 'ClaudeRider';
  g.fillStyle = '#FAF9F5'; g.fillText(title, 420, 400);
  const sp = await svgFallback(`<path d="${sparklePath(50, 50, 46)}" fill="#D97757" stroke="#fff4ec" stroke-width="1.5"/>`, 320, 320);
  g.drawImage(sp, 60, 224);
  return c;
}
function sparklePath(cx: number, cy: number, r: number): string {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + (((i * 37) % 11) - 5) * 0.012, rr = r * (0.85 + ((i * 53) % 7) / 30);
    const a0 = a - (Math.PI / 10) * 0.55, a1 = a + (Math.PI / 10) * 0.55;
    const p = (ang: number, k: number): string => `${(cx + Math.cos(ang) * k).toFixed(2)} ${(cy + Math.sin(ang) * k).toFixed(2)}`;
    d += `${i ? 'L' : 'M'}${p(a0, r * 0.3)} L${p(a, rr)} L${p(a1, r * 0.3)} `;
  }
  return d + 'Z';
}
