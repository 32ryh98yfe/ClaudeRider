// Character portrait. Order: a Codex art override (`/art/overrides/portrait.<id>`), else L8's 3D head render
// (`getPortrait`, transparent, cached per size and palette; docs/design/contract-requests/L8-portraits.md). The original
// SVG Clawd silhouette (portraitSvg.ts) shows instantly while the render resolves, and stays if rendering fails.
import { useEffect, useRef, useState } from 'preact/hooks';
import { useArtOverride } from './ArtOverride.tsx';
import { getPortrait } from '../../render/portrait/portrait.ts';
import { stageInfo } from '../../game/Stage.ts';
import { portraitSvg, PALETTE_SKIN } from './portraitSvg.ts';

export { portraitSvg, CHAR_PALETTE, PALETTE_SKIN } from './portraitSvg.ts';

/** Low tier keeps the SVG: a grid of first-time head renders stalls weak GPUs (and SwiftShader) for seconds. `?portraits=3d` forces renders. */
function renders3d(): boolean {
  const q = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('portraits');
  return q === '3d' || (q !== 'svg' && stageInfo.value.tier !== 'low');
}

/** Render size for a CSS size: ~2× for sharpness, bucketed so rows of the same size share one cache entry. */
function renderPx(size: number): number { return Math.max(64, Math.min(256, Math.ceil((size * 2) / 32) * 32)); }

export function Portrait({ id, size = 64, ring, palette, class: cls }: { id: string; size?: number; ring?: string; palette?: string; class?: string }) {
  const [bmp, setBmp] = useState<ImageBitmap | HTMLCanvasElement | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const px = renderPx(size);
  const skin = palette && palette !== 'classic' ? PALETTE_SKIN[palette]?.body : undefined;
  const { url, pending, onError } = useArtOverride(skin ? null : `portrait.${id}`);
  useEffect(() => {
    let alive = true;
    setBmp(null);
    if (!pending && !url && renders3d())
      void getPortrait(id, px, skin ? { bodyColor: skin } : undefined).then((b) => { if (alive) setBmp(b); }).catch(() => undefined);
    return () => { alive = false; };
  }, [id, px, skin, pending, url]);
  useEffect(() => {
    const c = canvas.current;
    if (!c || !bmp) return;
    const g = c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(bmp, 0, 0, c.width, c.height);
  }, [bmp]);
  const style = { width: `${size}px`, height: `${size}px`, ...(ring ? { boxShadow: `0 0 0 2px ${ring}` } : {}) };
  if (url) return <img class={`portrait ${cls ?? ''}`} src={url} style={{ ...style, objectFit: 'cover' }} data-art-slot={`portrait.${id}`} alt="" draggable={false} onError={onError} />;
  if (bmp) return <canvas ref={canvas} class={`portrait ${cls ?? ''}`} width={px} height={px} style={style} aria-hidden="true" />;
  return <svg class={`portrait ${cls ?? ''}`} style={style} viewBox="6 4 88 88" aria-hidden="true" dangerouslySetInnerHTML={{ __html: portraitSvg(id, palette) }} />;
}
