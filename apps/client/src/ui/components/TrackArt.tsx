// Track thumbnail: art override `thumb.<trackId>` when present; otherwise the procedural fallback from 60-codex §4.1 —
// a route line on the theme gradient (the route is a deterministic stylised loop until L4's preview SVGs land).
import { loadContent } from '@cr/content';
import { useArtOverride } from './ArtOverride.tsx';
import { hash32 } from '../../meta/challenges.ts';

const routeCache = new Map<string, string>();
function route(id: string): string {
  const hit = routeCache.get(id);
  if (hit) return hit;
  const h = hash32(id);
  const n = 7 + (h % 3);
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 0.62 + (((h >>> (i * 3)) & 7) / 7) * 0.38;
    pts.push([50 + Math.cos(a) * 34 * r * 1.35, 28 + Math.sin(a) * 18 * r]);
  }
  // closed Catmull-Rom → cubic Béziers
  let d = `M${pts[0]![0].toFixed(1)} ${pts[0]![1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]!, p1 = pts[i]!, p2 = pts[(i + 1) % n]!, p3 = pts[(i + 2) % n]!;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]!.toFixed(1)} ${c1[1]!.toFixed(1)} ${c2[0]!.toFixed(1)} ${c2[1]!.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  d += 'Z';
  routeCache.set(id, d);
  return d;
}

export function themeColors(trackId: string): string[] {
  const c = loadContent();
  const th = c.themes.byId.get(c.tracks.byId.get(trackId as never)?.themeId ?? 'clayhill_village');
  return th ? [...th.palette] : ['#D97757', '#F4EFE6', '#8FB573', '#9FD3F5', '#5A6B7B'];
}

export function TrackArt({ id, class: cls, random }: { id: string; class?: string; random?: boolean }) {
  const { url, onError } = useArtOverride(random ? null : `thumb.${id}`);
  if (url) return <div class={`track-art ${cls ?? ''}`}><img src={url} data-art-slot={`thumb.${id}`} alt="" draggable={false} onError={onError} /></div>;
  if (random) {
    return (
      <div class={`track-art random ${cls ?? ''}`} style={{ background: 'linear-gradient(135deg, #30302e, #5e5d59 55%, #c96442)' }}>
        <svg viewBox="0 0 100 56" aria-hidden="true"><text x="50" y="38" text-anchor="middle" font-size="30" font-weight="900" fill="#faf9f5" opacity=".9" font-family="Barlow Condensed, sans-serif" font-style="italic">?</text></svg>
      </div>
    );
  }
  const pal = themeColors(id);
  const bg = `linear-gradient(140deg, ${pal[3] ?? '#9FD3F5'} 0%, ${pal[2] ?? '#8FB573'} 48%, ${pal[0] ?? '#D97757'} 100%)`;
  const d = route(id);
  return (
    <div class={`track-art ${cls ?? ''}`} style={{ background: bg }}>
      <svg viewBox="0 0 100 56" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs><linearGradient id={`ta-sh-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22" /><stop offset="1" stop-color="#000" stop-opacity=".28" /></linearGradient></defs>
        <rect width="100" height="56" fill={`url(#ta-sh-${id})`} />
        <path d={d} fill="none" stroke="rgba(20,20,19,.45)" stroke-width="5.5" stroke-linejoin="round" />
        <path d={d} fill="none" stroke={pal[1] ?? '#FAF9F5'} stroke-width="3" stroke-linejoin="round" />
        <path d={d} fill="none" stroke="#fff" stroke-width="0.8" stroke-dasharray="2 2.5" opacity=".8" />
      </svg>
    </div>
  );
}
