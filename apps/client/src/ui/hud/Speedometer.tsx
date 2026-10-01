// 270° segmented speedometer open at the bottom (31-ui-spec §4.1): white segments with a #CD2F00 high end,
// number at 6 % H, unit, DRAFT label that charges and lights during slipstream; glows while boosting.
// Driving techniques (15-driving-techniques): gear badge (D / N / R, R amber with the 후진 label; reverse speed
// reads unsigned), a DRAG chip with 3 tap-streak pips above the dial, technique pops (tap boost, cut, brake turn)
// and a dial spin on a spin-out. The scale tops out at 320 km/h so drag (290) and tap boost (305) stay on the arc.
import { useEffect, useState } from 'preact/hooks';
import { hud } from '../store/hud.ts';
import { hudX } from '../store/hudExtra.ts';
import { t } from '../../i18n/index.ts';

const SEG = 32;
const A0 = 135, SPAN = 270;
const MAX_KMH = 320;
/** The red high end starts at the booster plateau (272 / 320): only drag and tap boost light it. */
const HOT_FROM = 0.85;
const TECH_MS = 900, SPIN_MS = 600;

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
const PIPS = [1, 2, 3] as const;

/** True for `ms` after the timestamp `at` changes; re-renders once when it lapses. */
function useRecent(at: number | null | undefined, ms: number): boolean {
  const [, force] = useState(0);
  const live = at != null && performance.now() - at < ms;
  useEffect(() => {
    if (at == null) return;
    const left = at + ms - performance.now();
    if (left <= 0) return;
    const h = setTimeout(() => force((x) => x + 1), left + 16);
    return () => clearTimeout(h);
  }, [at]);
  return live;
}

/** Drag chip (끌기 + streak pips) and the technique pop above the dial. */
function AboveDial() {
  const drag = hudX.drag.value;
  const tech = hudX.technique.value;
  const showTech = useRecent(tech?.at, TECH_MS) && tech;
  return (
    <div class="sp-above" aria-live="polite">
      {drag.on ? (
        <div class={`sp-drag s${drag.streak}`}>
          <span class="sp-drag-txt">{t('hud.drag')}</span>
          <span class="sp-pips" aria-label={`${drag.streak}/3`}>
            {PIPS.map((n) => <i key={`${n}${n <= drag.streak ? 'on' : ''}`} class={n <= drag.streak ? 'on' : ''} />)}
          </span>
        </div>
      ) : null}
      {showTech ? (
        <div class={`sp-tech ${showTech.kind}`} key={showTech.at}>
          {showTech.kind === 'tap' ? <>{t('hud.tap')} <b class="num">×{showTech.streak}</b></> : t(`hud.${showTech.kind}`)}
        </div>
      ) : null}
    </div>
  );
}

export function Speedometer() {
  const kmh = hud.kmh.value;
  const unitMph = hudX.speedUnit.value === 'mph';
  const frac = Math.min(1, kmh / (unitMph ? MAX_KMH * 0.621371 : MAX_KMH));
  const lit = Math.round(frac * SEG);
  const d = hud.draft.value;
  const boost = hud.boosting.value;
  const gear = hudX.gear.value;
  const drag = hudX.drag.value.on;
  const spin = useRecent(hudX.spinAt.value, SPIN_MS);
  const rev = gear === 'R';
  const cls = `hud-speed ${boost ? 'boost' : ''} ${drag ? 'drag' : ''} ${rev ? 'rev' : ''} ${spin ? 'spin' : ''}`;
  return (
    <div class={cls}>
      <svg viewBox="0 0 200 200" aria-hidden="true" key={spin ? hudX.spinAt.value ?? 0 : 0}>
        <path d={INNER} class="sp-inner" />
        <path d={TICKS} class="sp-ticks" />
        {SEGS.map((p, i) => <path key={i} d={p} class={`seg ${i < lit ? 'on' : ''} ${i / SEG >= HOT_FROM ? 'hot' : ''}`} />)}
      </svg>
      <span class={`sp-gear g-${gear.toLowerCase()}`} title={rev ? t('hud.reverse') : undefined}>
        <b class="num">{t(`hud.gear.${gear.toLowerCase()}`)}</b>
        {rev ? <small>{t('hud.reverse')}</small> : null}
      </span>
      <div class="sp-readout">
        <span class="num sp-v">{kmh}</span>
        <span class="sp-unit">{unitMph ? t('hud.mph') : t('hud.kmh')}</span>
      </div>
      <div class={`sp-draft ${d >= 1 ? 'on' : d > 0.05 ? 'charging' : ''}`}>
        <span class="sp-draft-fill" style={{ transform: `scaleX(${d >= 1 ? 1 : d})` }} />
        <span class="sp-draft-txt">{t('hud.draft')}</span>
      </div>
      <AboveDial />
    </div>
  );
}
