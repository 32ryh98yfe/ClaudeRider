// Character portrait. Prefers an art override / L8 portrait (art slot `portrait.<id>`); until then draws an original
// SVG Clawd silhouette (12×8 block, 2 eye slots, no mouth, arm stubs, 4 legs, parametric sparkle) with the costume cue
// from 30-art-bible §8, so every racer is recognisable in lists, standings and room slots.
import { useEffect, useState } from 'preact/hooks';
import { artUrl } from '../../art/loader.ts';
import { portraitSvg } from './portraitSvg.ts';

export { portraitSvg, CHAR_PALETTE, PALETTE_SKIN } from './portraitSvg.ts';

export function Portrait({ id, size = 64, ring, palette, class: cls }: { id: string; size?: number; ring?: string; palette?: string; class?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let alive = true; void artUrl(`portrait.${id}`).then((u) => { if (alive) setUrl(u); }); return () => { alive = false; }; }, [id]);
  const style = { width: `${size}px`, height: `${size}px`, ...(ring ? { boxShadow: `0 0 0 2px ${ring}` } : {}) };
  if (url) return <img class={`portrait ${cls ?? ''}`} src={url} style={style} alt="" draggable={false} />;
  return <svg class={`portrait ${cls ?? ''}`} style={style} viewBox="6 4 88 88" aria-hidden="true" dangerouslySetInnerHTML={{ __html: portraitSvg(id, palette) }} />;
}
