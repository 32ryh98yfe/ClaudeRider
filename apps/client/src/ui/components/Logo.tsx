// Wordmark: original parametric sparkle + "ClaudeRider / 클로드라이더" (no Anthropic logo).
export function Logo({ size = 1 }: { size?: number }) {
  const rays = 10;
  let d = '';
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + ((i * 37) % 11 - 5) * 0.012;
    const r = 0.85 + ((i * 53) % 7) / 30;
    const a0 = a - (Math.PI / rays) * 0.55, a1 = a + (Math.PI / rays) * 0.55;
    const P = (ang: number, rr: number): string => `${(50 + Math.cos(ang) * rr * 46).toFixed(2)} ${(50 + Math.sin(ang) * rr * 46).toFixed(2)}`;
    d += `${i ? 'L' : 'M'}${P(a0, 0.3)} L${P(a, r)} L${P(a1, 0.3)} `;
  }
  return (
    <div class="logo" style={{ fontSize: `${size}em` }}>
      <svg viewBox="0 0 100 100" class="spark"><path d={d + 'Z'} /></svg>
      <div class="words"><div class="en">Claude<b>Rider</b></div><div class="ko">클로드라이더</div></div>
    </div>
  );
}
