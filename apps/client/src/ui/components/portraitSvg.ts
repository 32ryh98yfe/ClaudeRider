// Original SVG Clawd silhouette (12×8 block, 2 eye slots, no mouth, arm stubs, 4 legs, parametric sparkle) with the
// costume cue of each character (30-art-bible §8). Used by <Portrait> and as the art-slot fallback for portraits.
interface Pal { body: string; shade: string; eye: string }
export const CHAR_PALETTE: Record<string, Pal & { accent: string }> = {
  clay: { body: '#D87656', shade: '#BE684D', eye: '#141413', accent: '#FAF9F5' },
  pixel: { body: '#D87656', shade: '#BE684D', eye: '#141413', accent: '#8B8B8B' },
  turbo: { body: '#D97757', shade: '#BE684D', eye: '#2A2A28', accent: '#6A9BCC' },
  anchor: { body: '#C96442', shade: '#A8533A', eye: '#141413', accent: '#B53333' },
  rune: { body: '#E08A6D', shade: '#C4745A', eye: '#141413', accent: '#3B3F8F' },
  nova: { body: '#D97757', shade: '#BE684D', eye: '#141413', accent: '#6A9BCC' },
  kage: { body: '#D97757', shade: '#BE684D', eye: '#141413', accent: '#1F1E1D' },
  bisque: { body: '#D97757', shade: '#BE684D', eye: '#141413', accent: '#788C5D' },
  frost: { body: '#9FD3F2', shade: '#7BB8DE', eye: '#0E2A47', accent: '#FFFFFF' },
  glitch: { body: '#1C1B22', shade: '#121117', eye: '#2EF2FF', accent: '#FF7A50' },
  bolt: { body: '#B87333', shade: '#8C5626', eye: '#FFB347', accent: '#5A5A5A' },
  duke: { body: '#C96442', shade: '#A8533A', eye: '#141413', accent: '#F2C14E' },
};

function sparkle(cx: number, cy: number, r: number, fill: string): string {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2 + (((i * 37) % 11) - 5) * 0.012;
    const rr = r * (0.85 + ((i * 53) % 7) / 30);
    const a0 = a - (Math.PI / 10) * 0.55, a1 = a + (Math.PI / 10) * 0.55;
    const p = (ang: number, k: number): string => `${(cx + Math.cos(ang) * k).toFixed(2)} ${(cy + Math.sin(ang) * k).toFixed(2)}`;
    d += `${i ? 'L' : 'M'}${p(a0, r * 0.3)} L${p(a, rr)} L${p(a1, r * 0.3)} `;
  }
  return `<path d="${d}Z" fill="${fill}" stroke="#fff4ec" stroke-width="0.8" stroke-linejoin="round"/>`;
}

/** Inner SVG markup for a character (100 × 100 space). */
export function portraitSvg(id: string, palette?: string): string {
  const base = CHAR_PALETTE[id] ?? CHAR_PALETTE['clay']!;
  const p = palette && palette !== 'classic' && PALETTE_SKIN[palette] ? { ...base, ...PALETTE_SKIN[palette] } : base;
  const ink = '#141413';
  const x = 20, y = 40, w = 60, h = 41;
  const eyeRect = (ex: number): string => `<rect x="${ex}" y="${y + 12}" width="6.5" height="14" rx="2" fill="${p.eye}"/>`;
  let back = '', front = '', eyes = eyeRect(36) + eyeRect(57.5), spark = sparkle(50, 22, 8, '#F2A65A');
  switch (id) {
    case 'clay':
      front = `<path d="M${x - 2} ${y + 30} Q50 ${y + 37} ${x + w + 2} ${y + 30} L${x + w + 2} ${y + 36} Q50 ${y + 43} ${x - 2} ${y + 36}Z" fill="#FAF9F5" stroke="${ink}" stroke-width="1.6"/>`
        + `<path d="M${x + w - 4} ${y + 33} q14 2 18 -8 q-2 10 -14 14z" fill="#FAF9F5" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"/>`;
      break;
    case 'pixel':
      front = Array.from({ length: 5 }, (_, i) => `<path d="M${x + 12 * (i + 1)} ${y}v${h}" stroke="${p.shade}" stroke-width="1.1" opacity=".75"/>`).join('')
        + Array.from({ length: 3 }, (_, i) => `<path d="M${x} ${y + 10.25 * (i + 1)}h${w}" stroke="${p.shade}" stroke-width="1.1" opacity=".75"/>`).join('');
      break;
    case 'turbo':
      front = `<path d="M${x - 3} ${y + 20} C${x - 3} ${y - 14} ${x + w + 3} ${y - 14} ${x + w + 3} ${y + 20}Z" fill="#FAF9F5" stroke="${ink}" stroke-width="1.8"/>`
        + `<path d="M46 ${y - 6} h8 v26 h-8z" fill="#6A9BCC"/>`
        + `<rect x="${x + 6}" y="${y + 9}" width="${w - 12}" height="13" rx="6" fill="#2A2A28" stroke="${ink}" stroke-width="1.4"/>`
        + `<path d="M${x + 12} ${y + 12} h14" stroke="#9fd3f5" stroke-width="2" stroke-linecap="round" opacity=".7"/>`;
      eyes = ''; spark = sparkle(50, 16, 6, '#F2A65A');
      break;
    case 'anchor':
      front = `<path d="M${x - 8} ${y + 2} Q50 ${y - 26} ${x + w + 8} ${y + 2} Q50 ${y - 6} ${x - 8} ${y + 2}Z" fill="#30302E" stroke="${ink}" stroke-width="1.6"/>`
        + `<path d="M${x - 6} ${y + 1.5} Q50 ${y - 5} ${x + w + 6} ${y + 1.5}" fill="none" stroke="#E0B04B" stroke-width="2.2"/>`
        + `<rect x="54" y="${y + 11}" width="12" height="15" rx="4" fill="${ink}"/><path d="M${x} ${y + 9} L66 ${y + 16}" stroke="${ink}" stroke-width="1.6"/>`;
      eyes = eyeRect(36); spark = sparkle(80, 16, 6, '#F2A65A');
      break;
    case 'rune':
      back = `<path d="M${x + 2} ${y + 3} L52 ${y - 34} Q66 ${y - 36} 72 ${y - 26} Q62 ${y - 28} 58 ${y - 20} L${x + w - 2} ${y + 3}Z" fill="#3B3F8F" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"/>`
        + `<path d="M${x - 4} ${y + 4} h${w + 8}" stroke="#3B3F8F" stroke-width="5" stroke-linecap="round"/>`
        + `<circle cx="44" cy="${y - 12}" r="1.8" fill="#F0EEE6"/><circle cx="54" cy="${y - 4}" r="1.4" fill="#F0EEE6"/><circle cx="50" cy="${y - 22}" r="1.2" fill="#F0EEE6"/>`;
      spark = sparkle(80, 10, 6, '#F2A65A');
      break;
    case 'nova':
      front = `<circle cx="50" cy="${y + 16}" r="36" fill="#bfe9ff" fill-opacity=".22" stroke="#e8f6ff" stroke-width="2.2"/>`
        + `<path d="M30 ${y - 4} q6 -10 16 -12" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>`;
      back = `<path d="M70 ${y - 16} l8 -10" stroke="${ink}" stroke-width="1.6"/><circle cx="79" cy="${y - 27}" r="3" fill="#6A9BCC" stroke="${ink}" stroke-width="1.2"/>`;
      spark = sparkle(50, 8, 5, '#F2A65A');
      break;
    case 'kage':
      front = `<path d="M${x - 1} ${y + 24} V${y + 6} Q50 ${y - 10} ${x + w + 1} ${y + 6} V${y + 24}Z" fill="#1F1E1D" stroke="${ink}" stroke-width="1.4"/>`
        + `<rect x="${x + 6}" y="${y + 11}" width="${w - 12}" height="11" rx="5" fill="${p.body}"/>`
        + `<path d="M${x + w} ${y + 16} q12 4 16 16 M${x + w} ${y + 19} q8 6 9 18" fill="none" stroke="#1F1E1D" stroke-width="3.2" stroke-linecap="round"/>`;
      eyes = `<rect x="36" y="${y + 13.5}" width="6.5" height="6.5" rx="1.6" fill="${p.eye}"/><rect x="57.5" y="${y + 13.5}" width="6.5" height="6.5" rx="1.6" fill="${p.eye}"/>`;
      break;
    case 'bisque':
      back = `<path d="M${x + 12} ${y + 2} V${y - 12} C${x + 2} ${y - 16} ${x + 6} ${y - 34} 38 ${y - 28} C42 ${y - 40} 60 ${y - 40} 62 ${y - 28} C${x + w - 6} ${y - 34} ${x + w - 2} ${y - 16} ${x + w - 12} ${y - 12} V${y + 2}Z" fill="#FFFFFF" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"/>`;
      front = `<path d="M${x + 4} ${y + 31} L50 ${y + 44} L${x + w - 4} ${y + 31}Z" fill="#788C5D" stroke="${ink}" stroke-width="1.4" stroke-linejoin="round"/>`;
      spark = sparkle(82, 14, 6, '#F2A65A');
      break;
    case 'frost':
      back = `<path d="M${x + 6} ${y + 2} l4 -14 4 12 5 -18 5 18 5 -22 5 22 5 -18 5 18 4 -12 4 14z" fill="#FFFFFF" stroke="#7BB8DE" stroke-width="1.4" stroke-linejoin="round"/>`;
      front = `<circle cx="${x - 1}" cy="${y + 14}" r="7" fill="#E8F6FF" stroke="${ink}" stroke-width="1.4"/><circle cx="${x + w + 1}" cy="${y + 14}" r="7" fill="#E8F6FF" stroke="${ink}" stroke-width="1.4"/>`
        + `<path d="M${x + 8} ${y + 6} l10 10 M${x + 44} ${y + 28} l6 6" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".8"/>`;
      spark = sparkle(50, 12, 6, '#9FD3F2');
      break;
    case 'glitch':
      front = `<path d="M${x + 2} ${y + 2} h${w - 4} M${x + 2} ${y + h - 2} h${w - 4}" stroke="#FF7A50" stroke-width="1.6" opacity=".9"/>`
        + `<path d="M${x + 1.5} ${y + 4} v${h - 8} M${x + w - 1.5} ${y + 4} v${h - 8}" stroke="#2EF2FF" stroke-width="1.6" opacity=".9"/>`
        + `<rect x="${x + 6}" y="${y + 12}" width="${w - 12}" height="11" rx="5.5" fill="#0c2a33" stroke="#2EF2FF" stroke-width="1.6"/>`
        + `<path d="M${x + 10} ${y + 17.5} h${w - 20}" stroke="#2EF2FF" stroke-width="3" stroke-linecap="round" stroke-dasharray="6 3"/>`
        + `<path d="M${x - 3} ${y + 18} V${y + 4} Q50 ${y - 18} ${x + w + 3} ${y + 4} V${y + 18}" fill="none" stroke="#30302E" stroke-width="3.4"/>`
        + `<rect x="${x - 7}" y="${y + 10}" width="8" height="15" rx="3" fill="#30302E" stroke="#FF7A50" stroke-width="1.2"/><rect x="${x + w - 1}" y="${y + 10}" width="8" height="15" rx="3" fill="#30302E" stroke="#FF7A50" stroke-width="1.2"/>`;
      eyes = ''; spark = sparkle(50, 16, 6, '#FF7A50');
      break;
    case 'bolt':
      back = `<path d="M50 ${y} V${y - 12}" stroke="#5A5A5A" stroke-width="2.4"/><circle cx="50" cy="${y - 15}" r="4.5" fill="#FFB347" stroke="${ink}" stroke-width="1.4"/>`;
      front = [0, 1, 2, 3].map((i) => `<circle cx="${x + 5 + (i % 2) * (w - 10)}" cy="${y + 5 + Math.floor(i / 2) * (h - 10)}" r="1.8" fill="#5A5A5A"/>`).join('')
        + `<rect x="${x + 8}" y="${y + 9}" width="${w - 16}" height="19" rx="4" fill="#2a1c10" opacity=".55"/>`;
      eyes = `<rect x="35" y="${y + 13}" width="9" height="9" rx="2" fill="${p.eye}"/><rect x="56" y="${y + 13}" width="9" height="9" rx="2" fill="${p.eye}"/>`;
      spark = sparkle(72, 14, 5, '#FFB347');
      break;
    case 'duke':
      back = `<path d="M${x + 8} ${y + 34} Q50 ${y + 46} ${x + w - 8} ${y + 34} L${x + w + 8} ${y + h + 3} H${x - 8}Z" fill="#FAF9F5" stroke="${ink}" stroke-width="1.4"/>`;
      front = `<path d="M${x + 10} ${y + 1} L${x + 10} ${y - 13} L${x + 20} ${y - 5} L50 ${y - 17} L${x + w - 20} ${y - 5} L${x + w - 10} ${y - 13} L${x + w - 10} ${y + 1}Z" fill="#F2C14E" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"/>`
        + `<circle cx="50" cy="${y - 5}" r="3" fill="#B53333" stroke="${ink}" stroke-width="1"/>`
        + `<circle cx="${x - 3}" cy="${y + h - 4}" r="1.3" fill="${ink}"/><circle cx="${x + w + 3}" cy="${y + h - 4}" r="1.3" fill="${ink}"/>`;
      spark = sparkle(50, 12, 5, '#F2A65A');
      break;
    default: break;
  }
  const body = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${p.body}" stroke="${ink}" stroke-width="2"/>`
    + `<path d="M${x + 1} ${y + h - 12} H${x + w - 1} V${y + h - 10} a9 9 0 0 1 -9 9 H${x + 10} a9 9 0 0 1 -9 -9Z" fill="${p.shade}"/>`
    + `<path d="M${x + 6} ${y + 5} q10 -3 20 -1" stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none" opacity=".35"/>`;
  const limbs = `<rect x="${x - 8}" y="${y + 16}" width="9" height="10" rx="3" fill="${p.shade}" stroke="${ink}" stroke-width="1.6"/>`
    + `<rect x="${x + w - 1}" y="${y + 16}" width="9" height="10" rx="3" fill="${p.shade}" stroke="${ink}" stroke-width="1.6"/>`
    + [0, 1, 2, 3].map((i) => `<rect x="${x + 6 + i * 13.3}" y="${y + h - 2}" width="7" height="8" rx="2" fill="${p.shade}" stroke="${ink}" stroke-width="1.4"/>`).join('');
  return `<ellipse cx="50" cy="${y + h + 7}" rx="30" ry="4" fill="#000" opacity=".18"/>${back}${limbs}${body}${eyes}${front}${spark}`;
}
export const PALETTE_SKIN: Record<string, Pal> = {
  midnight: { body: '#30302E', shade: '#262624', eye: '#FAF9F5' },
  parchment: { body: '#F5F4ED', shade: '#DAD8CE', eye: '#141413' },
  sage: { body: '#788C5D', shade: '#657851', eye: '#141413' },
  sky: { body: '#6A9BCC', shade: '#5A86B3', eye: '#141413' },
};
