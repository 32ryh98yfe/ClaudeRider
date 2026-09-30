// 270° segmented speedometer open at the bottom (31-ui-spec §4.1): white segments with a #CD2F00 high end,
// number at 6 % H, unit, DRAFT label that charges and lights during slipstream; glows while boosting.
import { hud } from '../store/hud.ts';
import { hudX } from '../store/hudExtra.ts';
import { t } from '../../i18n/index.ts';

const SEG = 32;
const A0 = 135, SPAN = 270;
const MAX_KMH = 260;
const HOT_FROM = 0.74;

function segPath(i: number): string {
  const gap = 1.6;
  const a0 = ((A0 + (i / SEG) * SPAN + gap / 2) * Math.PI) / 180, a1 = ((A0 + ((i + 1) / SEG) * SPAN - gap / 2) * Math.PI) / 180;
  const ro = 97, ri = i / SEG >= HOT_FROM ? 80 : 84;
  const p = (a: number, r: number): string => `${(100 + Math.cos(a) * r).toFixed(2)} ${(100 + Math.sin(a) * r).toFixed(2)}`;
  return `M${p(a0, ri)} L${p(a0, ro)} A${ro} ${ro} 0 0 1 ${p(a1, ro)} L${p(a1, ri)} A${ri} ${ri} 0 0 0 ${p(a0, ri)}Z`;
}
const SEGS = Array.from({ length: SEG }, (_, i) => segPath(i));
function arc(r: number, a0: number, a1: number): string {
  const p = (a: number): string => `${(100 + Math.cos((a * Math.PI) / 180) * r).toFixed(2)} ${(100 + Math.sin((a * Math.PI) / 180) * r).toFixed(2)}`;
  return `M${p(a0)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p(a1)}`;
}
const INNER = arc(74, A0, A0 + SPAN);
const TICKS = Array.from({ length: 14 }, (_, i) => {
  const a = ((A0 + (i / 13) * SPAN) * Math.PI) / 180;
  return `M${(100 + Math.cos(a) * 70).toFixed(2)} ${(100 + Math.sin(a) * 70).toFixed(2)} L${(100 + Math.cos(a) * (i % 2 ? 67 : 64)).toFixed(2)} ${(100 + Math.sin(a) * (i % 2 ? 67 : 64)).toFixed(2)}`;
}).join(' ');

export function Speedometer() {
  const kmh = hud.kmh.value;
  const unitMph = hudX.speedUnit.value === 'mph';
  const frac = Math.min(1, kmh / (unitMph ? MAX_KMH * 0.621371 : MAX_KMH));
  const lit = Math.round(frac * SEG);
  const d = hud.draft.value;
  const boost = hud.boosting.value;
  return (
    <div class={`hud-speed ${boost ? 'boost' : ''}`}>
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <path d={INNER} class="sp-inner" />
        <path d={TICKS} class="sp-ticks" />
        {SEGS.map((p, i) => <path key={i} d={p} class={`seg ${i < lit ? 'on' : ''} ${i / SEG >= HOT_FROM ? 'hot' : ''}`} />)}
      </svg>
      <div class="sp-readout">
        <span class="num sp-v">{kmh}</span>
        <span class="sp-unit">{unitMph ? t('hud.mph') : t('hud.kmh')}</span>
      </div>
      <div class={`sp-draft ${d >= 1 ? 'on' : d > 0.05 ? 'charging' : ''}`}>
        <span class="sp-draft-fill" style={{ transform: `scaleX(${d >= 1 ? 1 : d})` }} />
        <span class="sp-draft-txt">{t('hud.draft')}</span>
      </div>
    </div>
  );
}
