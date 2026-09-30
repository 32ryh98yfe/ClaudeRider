// Wordmark: original parametric sparkle (10 rays, radii 0.85–1.05, inner 0.3, seeded jitter; ADR-011) + the title.
// Never the Claude/Anthropic logo path.
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
  return (
    <div class={`logo ${stacked ? 'stacked' : ''}`} style={{ fontSize: `${size}em` }} role="img" aria-label="ClaudeRider 클로드라이더">
      <svg viewBox="0 0 100 100" class="spark" aria-hidden="true"><path d={SPARK} /></svg>
      <div class="words"><div class="en">Claude<b>Rider</b></div><div class="ko">클로드라이더</div></div>
    </div>
  );
}
