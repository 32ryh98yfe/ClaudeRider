// In-race HUD (docs/design/31-ui-spec.md). Layout follows the KRD teardown; all sizes scale with viewport height.
import { useEffect, useRef, useState } from 'preact/hooks';
import { useComputed } from '@preact/signals';
import { hud } from '../store/hud.ts';
import { banner } from '../store/banner.ts';
import { t } from '../../i18n/index.ts';
import { fmt, nameTags } from '../../game/HudPresenter.ts';
import './hud.css';

function Rank() {
  const [pop, setPop] = useState(0);
  const prev = useRef(hud.rank.value);
  useEffect(() => hud.rank.subscribe((r) => { if (r !== prev.current) { setPop(r < prev.current ? 1 : -1); prev.current = r; setTimeout(() => setPop(0), 260); } }), []);
  return (
    <div class={`hud-rank ${pop > 0 ? 'up' : pop < 0 ? 'down' : ''}`}>
      <span class="num big">{hud.rank}</span><span class="num of">/{hud.total}</span>
    </div>
  );
}

function Standings() {
  const rows = hud.standings.value;
  return (
    <ol class="hud-standings">
      {rows.map((r) => (
        <li key={r.slot} class={`${r.me ? 'me' : ''} ${r.retired ? 'retired' : ''}`} style={{ transform: `translateY(${(r.rank - 1) * 100}%)` }}>
          <span class="num pos">{r.rank}</span>
          {r.bot ? <span class="ai">AI</span> : <span class="ai hum">●</span>}
          <span class="name">{r.name}</span>
          {r.finished ? <span class="flag">🏁</span> : <span class="boosters">{'▮'.repeat(Math.min(2, r.boosters))}</span>}
        </li>
      ))}
    </ol>
  );
}

function LapBlock() {
  const final = hud.finalLap.value;
  return (
    <div class="hud-lap">
      <div class="lapline">
        {final ? <span class="final">{t('hud.final')}</span> : null}
        <span class="num big">{hud.lap}</span><span class="num of">/{hud.laps} {t('hud.lap')}</span>
      </div>
      <dl class="timers num">
        <dt>{t('hud.lap')}</dt><dd>{fmt(hud.lapMs.value)}</dd>
        <dt>{t('hud.time')}</dt><dd>{fmt(hud.raceMs.value)}</dd>
        <dt>{t('hud.best')}</dt><dd>{fmt(hud.bestMs.value)}</dd>
      </dl>
    </div>
  );
}

const SEG = 30;
function Speedometer() {
  const kmh = hud.kmh.value;
  const frac = Math.min(1, kmh / 300);
  const segs = [];
  for (let i = 0; i < SEG; i++) {
    const a0 = -225 + (i / SEG) * 270, a1 = a0 + 270 / SEG - 1.6;
    const on = i / SEG < frac;
    const hot = i / SEG > 0.78;
    segs.push(<path key={i} d={arc(60, 60, 50, a0, a1)} class={`seg ${on ? 'on' : ''} ${hot ? 'hot' : ''}`} />);
  }
  return (
    <div class={`hud-speed ${hud.boosting.value ? 'boost' : ''}`}>
      <svg viewBox="0 0 120 120">{segs}<path d={arc(60, 60, 41, -225, 45)} class="inner" /></svg>
      <div class="readout"><span class="num v">{kmh}</span><span class="unit">{t('common.km_h')}</span></div>
      <div class={`draft ${hud.draft.value >= 1 ? 'on' : hud.draft.value > 0 ? 'charging' : ''}`}>{t('hud.draft')}</div>
    </div>
  );
}
function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p = (a: number): string => `${cx + r * Math.cos((a * Math.PI) / 180)} ${cy + r * Math.sin((a * Math.PI) / 180)}`;
  return `M ${p(a0)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p(a1)}`;
}

function Slots() {
  const item = hud.itemMode.value;
  const [a, b] = hud.slots.value;
  const boosters = hud.boosters.value, team = hud.teamBoosters.value;
  const s0 = item ? a : team > 0 ? 'team' : boosters > 0 ? 'boost' : 0;
  const s1 = item ? b : team > 0 ? (boosters > 0 ? 'boost' : 0) : boosters > 1 ? 'boost' : 0;
  const icon = (v: number | string) => (v === 'boost' ? <span class="ico boost">N</span> : v === 'team' ? <span class="ico team">T</span> : typeof v === 'number' && v > 0 ? <span class="ico item">{v}</span> : null);
  return (
    <div class="hud-slots">
      <div class="row">
        <div class={`slot big ${s0 ? 'full' : ''}`}>{icon(s0) ?? <span class="kbd">{t('hud.boostKey')}</span>}</div>
        <div class={`slot small ${s1 ? 'full' : ''}`}>{icon(s1)}</div>
      </div>
      {!item ? <div class="gauge"><div class="fill" style={{ transform: `scaleX(${Math.min(1, hud.gauge.value)})` }} /><div class="shine" /></div> : null}
      {hud.teamMode.value && !item ? <div class="gauge team"><div class="fill" style={{ transform: `scaleX(${Math.min(1, hud.teamGauge.value)})` }} /></div> : null}
      <div class="keys"><span class="kbd">{t('hud.swapKey')}</span> ⟳</div>
    </div>
  );
}

function Minimap({ points }: { points: Float32Array | null }) {
  const pts = points;
  const box = useComputed(() => null);
  void box;
  if (!pts || pts.length < 4) return null;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]!); x1 = Math.max(x1, pts[i]!); z0 = Math.min(z0, pts[i + 1]!); z1 = Math.max(z1, pts[i + 1]!); }
  const pad = 20, w = x1 - x0 + pad * 2, h = z1 - z0 + pad * 2;
  let d = '';
  for (let i = 0; i < pts.length; i += 2) d += `${i ? 'L' : 'M'}${(pts[i]! - x0 + pad).toFixed(1)} ${(pts[i + 1]! - z0 + pad).toFixed(1)} `;
  return (
    <svg class="hud-minimap" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      <path d={d + 'Z'} class="track-o" /><path d={d + 'Z'} class="track" />
      {hud.minimap.value.slice().sort((a, b) => (a.me ? 1 : 0) - (b.me ? 1 : 0)).map((m, i) => (
        <circle key={i} cx={m.x - x0 + pad} cy={m.z - z0 + pad} r={m.me ? w / 38 : w / 55} class={m.me ? 'dot me' : 'dot'} />
      ))}
    </svg>
  );
}

function Countdown() {
  const c = hud.countdown.value;
  if (c === null) return null;
  return <div class={`hud-countdown ${c === 0 ? 'go' : ''}`} key={c}><span>{c === 0 ? t('hud.go') : c}</span>{c === 0 ? <i class="ring" /> : null}</div>;
}

function Banner() {
  const b = banner.state.value;
  if (!b) return null;
  return <div class={`hud-banner ${b.kind}`} key={b.id}><span>{b.text}</span></div>;
}

function Toasts() {
  return <div class="hud-toasts">{hud.toasts.value.map((x) => <div key={x.id} class={`toast ${x.kind}`}>{x.text}</div>)}</div>;
}

function WrongWay() {
  if (!hud.wrongWay.value) return null;
  return <div class="hud-wrongway"><div class="roundel"><i /></div><div class="txt">{t('hud.wrongWay')}</div><div class="hint">{t('hud.wrongWayHint')}</div></div>;
}

function Retire() {
  const r = hud.retireLeft.value;
  if (r === null) return null;
  return <div class="hud-retire"><span class="num">{r}</span><small>{t('hud.retireIn', { n: '' }).trim()}</small></div>;
}

function NameTags() {
  const [, force] = useState(0);
  useEffect(() => { let raf = 0; const loop = (): void => { force((x) => (x + 1) % 1e6); raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf); }, []);
  return (
    <div class="hud-tags">
      {nameTags.map((n) => (!n.visible || n.dist > 70 || (n.me && n.dist < 3) ? null : (
        <div key={n.slot} class={`tag ${n.me ? 'me' : ''}`} style={{ transform: `translate(${(n.x * 100).toFixed(2)}vw, ${(n.y * 100).toFixed(2)}vh) translate(-50%, -100%) scale(${Math.max(0.55, 1 - n.dist / 90).toFixed(2)})` }}>
          <span class="r num">{n.rank}</span>{n.me ? null : <span class="n">{n.name}</span>}
        </div>
      )))}
    </div>
  );
}

export function Hud({ minimap }: { minimap: Float32Array | null }) {
  if (!hud.visible.value) return null;
  return (
    <div class="hud">
      <NameTags />
      <Rank />
      <Standings />
      <LapBlock />
      <Speedometer />
      <Slots />
      <Minimap points={minimap} />
      <Countdown />
      <Banner />
      <Toasts />
      <WrongWay />
      <Retire />
    </div>
  );
}
