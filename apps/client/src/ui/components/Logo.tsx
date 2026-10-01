// Wordmark: original parametric sparkle (10 rays, radii 0.85–1.05, inner 0.3, seeded jitter; ADR-011) + the title.
// Never the Claude/Anthropic logo path.
import { t } from '../../i18n/index.ts';
import { useArtOverride } from './ArtOverride.tsx';

export function sparklePath(cx = 50, cy = 50, r = 46): string {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + (((i * 37) % 11) - 5) * 0.012;
    const rr = 0.85 + ((i * 53) % 7) / 30;
    const a0 = a - (Math.PI / 10) * 0.55, a1 = a + (Math.PI / 10) * 0.55;
    const P = (ang: number, k: number): string => `${(cx + Math.cos(ang) * k * r).toFixed(2)} ${(cy + Math.sin(ang) * k * r).toFixed(2)}`;
    d += `${i ? 'L' : 'M'}${P(a0, 0.3)} L${P(a, rr)} L${P(a1, 0.3)} `;
  }
  return d + 'Z';
}
const SPARK = sparklePath();

export function Sparkle({ size = 24, class: cls }: { size?: number; class?: string }) {
  return <svg class={`sparkle ${cls ?? ''}`} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true"><path d={SPARK} /></svg>;
}

export function Logo({ size = 1, stacked = false }: { size?: number; stacked?: boolean }) {
  const title = (import.meta.env['VITE_PUBLIC_TITLE'] as string | undefined)?.trim() || t('common.appNameLatin');
  // The shipped wordmark spells ClaudeRider; custom public titles must remain accurate without regenerated artwork.
  const { url, onError } = useArtOverride(title === 'ClaudeRider' ? 'logo.wordmark' : null);
  const localTitle = t('common.appName');
  return (
    <div class={`logo ${stacked ? 'stacked' : ''}`} style={{ fontSize: `${size}em` }} role="img" aria-label={title}>
      {url ? <img class="wordmark-art" src={url} data-art-slot="logo.wordmark" alt="" draggable={false} onError={onError} /> : <>
        <svg viewBox="0 0 100 100" class="spark" aria-hidden="true"><path d={SPARK} /></svg>
        <div class="words"><div class="en">{title === 'ClaudeRider' ? <>Claude<b>Rider</b></> : title}</div>{title === 'ClaudeRider' && localTitle !== title ? <div class="ko">{localTitle}</div> : null}</div>
      </>}
    </div>
  );
}
