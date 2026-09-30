// In-race HUD (31-ui-spec §4). The information architecture follows the KRD teardown (rank at 11.6 % H, standings,
// LAP/TIME/BEST, 270° speedometer, 2 slots + gauges, minimap / progress rail) in ClaudeRider's own look.
// Every element is positioned in a centred 16:9 safe box and scaled about its anchor by the HUD-scale setting.
import { useEffect, useRef, useState } from 'preact/hooks';
import { ITEM_IDS, idOf, loadContent } from '@cr/content';
import { hud } from '../store/hud.ts';
import { hudX } from '../store/hudExtra.ts';
import { t } from '../../i18n/index.ts';
import { fmt, nameTags, slotInfo } from '../../game/HudPresenter.ts';
import { heldUi, inputDevice } from '../../input/keyboard.ts';
import { lastSplit } from '../../meta/raceStats.ts';
import { fmtDelta } from '../../meta/medals.ts';
import { saveState } from '../store/profile.ts';
import { ItemIcon, keyText } from '../components/common.tsx';
import { Portrait } from '../components/Portrait.tsx';
import { Speedometer } from './Speedometer.tsx';
import { Overlays, ScreenOverlays } from './HudOverlays.tsx';
import './hud.css';

function Rank() {
  const f = hudX.rankFlash.value;
  const [flash, setFlash] = useState<{ dir: number; key: number } | null>(null);
  const last = useRef(0);
  useEffect(() => {
    if (!f || f.at === last.current) return;
    last.current = f.at;
    setFlash({ dir: f.dir, key: f.at });
    const h = setTimeout(() => setFlash(null), 420);
    return () => clearTimeout(h);
  }, [f?.at]);
  return (
    <div class={`hud-rank ${flash ? (flash.dir > 0 ? 'up' : 'down') : ''}`} key={flash?.key ?? 0} aria-label={`${hud.rank.value}/${hud.total.value}`}>
      <span class="num rk-big">{hud.rank}</span><span class="num rk-of">/{hud.total}</span>
    </div>
  );
}

function Standings() {
  const rows = hud.standings.value;
  const full = heldUi.value.standings;
  const item = hud.itemMode.value;
  return (
    <ol class={`hud-standings ${full ? 'full' : ''}`} aria-label={t('hud.standings')}>
      {rows.map((r, i) => {
        const info = slotInfo[r.slot];
        // position by list order, not by rank value: shared or stale ranks must never leave a gap or stack two rows
        return (
          <li key={r.slot} class={`${r.me ? 'me' : ''} ${r.retired ? 'retired' : ''} ${r.finished ? 'fin' : ''}`} style={{ transform: `translateY(calc(${i} * (100% + 2px)))` }}>
            <span class="num st-pos">{r.rank}</span>
            {info ? <Portrait id={info.characterId} size={22} class="st-ico" /> : null}
            {hud.teamMode.value ? <i class={`st-team t${r.team % 4}`} /> : null}
            <span class="st-name">{r.name}</span>
            {r.bot ? <span class="st-ai">AI</span> : null}
            {r.finished ? <span class="st-flag" aria-hidden="true" /> : r.boosters > 0 ? (
              <span class="st-boost">{Array.from({ length: Math.min(2, r.boosters) }, (_, i) => <i key={i} class={item ? 'itm' : ''} />)}</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function LapBlock() {
  const final = hud.finalLap.value;
  const sp = lastSplit.value;
  const showSplit = hudX.timeAttack.value && sp && performance.now() - sp.at < 3000;
  const pop = hudX.lapPopup.value;
  const showPop = pop && performance.now() - pop.at < 3000;
  const [, force] = useState(0);
  useEffect(() => { if (!showSplit && !showPop) return; const h = setTimeout(() => force((x) => x + 1), 3050); return () => clearTimeout(h); }, [sp?.at, pop?.at]);
  return (
    <div class="hud-lap">
      <div class="lap-line">
        {final ? <span class="lap-final">{t('hud.final')}</span> : null}
        <span class="num lap-big">{hud.lap}</span><span class="num lap-of">/{hud.laps} <small>{t('hud.lap')}</small></span>
      </div>
      <dl class="lap-timers num">
        <dt>{t('hud.lap')}</dt><dd>{fmt(hud.lapMs.value)}</dd>
        <dt>{t('hud.time')}</dt><dd>{fmt(hud.raceMs.value)}</dd>
        <dt>{t('hud.best')}</dt><dd class={hud.bestMs.value > 0 ? '' : 'none'}>{fmt(hud.bestMs.value, '--:--.---')}</dd>
      </dl>
      {showSplit ? <div class={`lap-split num ${sp!.deltaTicks <= 0 ? 'good' : 'bad'}`} key={sp!.at}>{t('hud.split', { delta: fmtDelta(sp!.deltaTicks) })}</div> : null}
      {showPop ? (
        <div class="lap-pop num" key={pop!.at}>
          <span>{fmt(pop!.lapTicks * (1000 / 60))}</span>
          {pop!.best ? <b class="good">{t('hud.newBest')}</b> : pop!.deltaTicks !== null ? <b class={pop!.deltaTicks <= 0 ? 'good' : 'bad'}>{fmtDelta(pop!.deltaTicks)}</b> : null}
        </div>
      ) : null}
    </div>
  );
}

function ProgressRail() {
  const dots = hudX.rail.value;
  return (
    <div class="hud-rail" aria-hidden="true">
      <i class="rail-line" /><i class="rail-flag" />
      {dots.map((d, i) => d.me ? null : <i key={i} class={`rail-dot ${hud.teamMode.value ? `t${d.team % 4}` : ''}`} style={{ top: `${(1 - d.p) * 100}%` }} />)}
      {dots.filter((d) => d.me).map((d, i) => <i key={`me${i}`} class="rail-me" style={{ top: `${(1 - d.p) * 100}%` }} />)}
    </div>
  );
}

function SlotIcon({ code, booster }: { code: number; booster?: 'booster' | 'teamBooster' }) {
  if (booster) return <ItemIcon id={booster} />;
  // honour the item's presentation iconKey (`items/<id>`, 12-items-spec §10); fall back to the id list
  const def = loadContent().items.byCode[code];
  const id = def ? def.presentation.iconKey.replace(/^items\//, '') : idOf(ITEM_IDS, code);
  return id ? <ItemIcon id={id} /> : null;
}

function Roulette() {
  // 8–12 icon steps over 30 ticks, decelerating, then a 120 ms bounce (31-ui-spec §5)
  return (
    <span class="roulette" aria-hidden="true">
      <span class="rl-strip">{['turbo_token', 'token_bomb', 'context_shield', 'prompt_missile', 'glitch_puddle', 'broadcast_bolt', 'bug_report', 'firewall', 'turbo_token'].map((id, i) => <ItemIcon key={i} id={id} />)}</span>
    </span>
  );
}

function Slots() {
  const item = hud.itemMode.value;
  const [a, b] = hud.slots.value;
  const boosters = hud.boosters.value, team = hud.teamBoosters.value;
  const rl = hudX.roulette.value;
  const pops = hudX.gaugeFullAt.value;
  const speedSlots: ('booster' | 'teamBooster' | null)[] = [];
  for (let i = 0; i < team && speedSlots.length < 2; i++) speedSlots.push('teamBooster');
  for (let i = 0; i < boosters && speedSlots.length < 2; i++) speedSlots.push('booster');
  const s0 = item ? a : 0, s1 = item ? b : 0;
  const b0 = item ? null : speedSlots[0] ?? null, b1 = item ? null : speedSlots[1] ?? null;
  const full0 = item ? s0 > 0 : !!b0, full1 = item ? s1 > 0 : !!b1;
  const lock = hudX.slotLock.value;
  const pad = inputDevice.value === 'pad';
  const cb = saveState.value.settings.colorBlind;
  return (
    <div class="hud-slots">
      {hudX.instantWindow.value ? <span class="instant-hint">{t('hud.instantBoost')}</span> : null}
      <div class="slot-row">
        <div class={`slot big ${full0 ? 'full' : ''} ${lock ? 'locked' : ''}`} key={`s0-${full0 ? (item ? s0 : `${b0}${pops ?? 0}`) : 'e'}`}>
          {rl && rl.slot === 0 ? <Roulette /> : full0 ? <SlotIcon code={s0} {...(b0 ? { booster: b0 } : {})} /> : <span class={`kbd ${pad ? 'pad' : ''}`}>{keyText('item')}</span>}
          {hud.auto.value ? <span class="slot-auto">{t('hud.auto')}</span> : null}
          {lock ? <span class="slot-lock" aria-label={t('hud.locked')} /> : null}
        </div>
        <div class={`slot small ${full1 ? 'full' : ''} ${lock ? 'locked' : ''}`}>
          {rl && rl.slot === 1 ? <Roulette /> : full1 ? <SlotIcon code={s1} {...(b1 ? { booster: b1 } : {})} /> : null}
        </div>
      </div>
      {!item ? <div class={`gauge drift ${cb ? 'cb' : ''} ${hud.gauge.value >= 0.999 ? 'max' : ''}`}><i class="g-fill" style={{ transform: `scaleX(${Math.min(1, hud.gauge.value)})` }} /><i class="g-noise" /></div> : null}
      {hud.teamMode.value && !item ? <div class="gauge team"><i class="g-fill" style={{ transform: `scaleX(${Math.min(1, hud.teamGauge.value)})` }} /></div> : null}
      <div class="swap-chip"><span class={`kbd ${pad ? 'pad' : ''}`}>{keyText('swap')}</span><span aria-hidden="true">⟳</span><span class="sr-only">{t('hud.swapKey')}</span></div>
    </div>
  );
}

function Minimap({ points }: { points: Float32Array | null }) {
  const pts = points;
  const [geo, setGeo] = useState<{ d: string; x0: number; z0: number; w: number; h: number } | null>(null);
  useEffect(() => {
    if (!pts || pts.length < 4) { setGeo(null); return; }
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]!); x1 = Math.max(x1, pts[i]!); z0 = Math.min(z0, pts[i + 1]!); z1 = Math.max(z1, pts[i + 1]!); }
    const pad = 24;
    let d = '';
    for (let i = 0; i < pts.length; i += 2) d += `${i ? 'L' : 'M'}${(pts[i]! - x0 + pad).toFixed(1)} ${(pts[i + 1]! - z0 + pad).toFixed(1)} `;
    setGeo({ d: d + 'Z', x0: x0 - pad, z0: z0 - pad, w: x1 - x0 + pad * 2, h: z1 - z0 + pad * 2 });
  }, [pts]);
  if (!geo) return null;
  const r = Math.max(geo.w, geo.h);
  return (
    <svg class="hud-minimap" viewBox={`0 0 ${geo.w} ${geo.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path d={geo.d} class="mm-o" style={{ strokeWidth: r / 28 }} /><path d={geo.d} class="mm-track" style={{ strokeWidth: r / 60 }} />
      {hud.minimap.value.slice().sort((a, b) => (a.me ? 1 : 0) - (b.me ? 1 : 0) || b.rank - a.rank).map((m, i) => (
        <circle key={i} cx={m.x - geo.x0} cy={m.z - geo.z0} r={m.me ? r / 34 : r / 52} class={m.me ? 'mm-dot me' : m.rank === 1 ? 'mm-dot lead' : 'mm-dot'} />
      ))}
    </svg>
  );
}

function NameTags() {
  const root = useRef<HTMLDivElement>(null);
  const show = saveState.value.settings.nameTags !== false;
  useEffect(() => {
    let raf = 0;
    const loop = (): void => {
      raf = requestAnimationFrame(loop);
      const el = root.current;
      if (!el) return;
      const kids = el.children;
      for (let i = 0; i < nameTags.length && i < kids.length; i++) {
        const n = nameTags[i]!, c = kids[i] as HTMLElement;
        const hide = !n.visible || n.dist > 75 || (n.me && n.dist < 2.5);
        c.style.opacity = hide ? '0' : '1';
        if (hide) continue;
        c.style.transform = `translate(${(n.x * 100).toFixed(2)}vw, ${(n.y * 100).toFixed(2)}vh) translate(-50%, -100%) scale(${Math.max(0.55, 1 - n.dist / 95).toFixed(3)})`;
        const r = c.firstChild as HTMLElement | null;
        if (r && r.textContent !== String(n.rank)) r.textContent = String(n.rank);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  if (!show) return null;
  const team = hud.teamMode.value;
  return (
    <div class="hud-tags" ref={root} aria-hidden="true">
      {nameTags.map((n) => (
        <div key={n.slot} class={`tag ${n.me ? 'me' : ''} ${team ? `team t${n.team % 4}` : ''}`}><span class="num tg-r">{n.rank}</span>{n.me ? null : <span class="tg-n">{n.name}</span>}</div>
      ))}
    </div>
  );
}

function Toasts() {
  return <div class="hud-toasts" aria-live="polite">{hud.toasts.value.slice(-2).map((x) => <div key={x.id} class={`toast ${x.kind}`}>{x.text}</div>)}</div>;
}

function NetIndicator() {
  const n = hudX.net.value;
  if (!n) return null;
  const q = n.pingMs < 60 ? 'good' : n.pingMs < 130 ? 'ok' : 'bad';
  return <div class={`hud-net ${q}`}><span class="net-bars"><i /><i /><i /></span><span class="num">{n.pingMs}</span>{n.late > 0 ? <span class="net-late">{t('hud.lateSignal', { ms: n.late })}</span> : null}</div>;
}

function RearView() {
  if (!heldUi.value.look) return null;
  return (
    <div class="hud-rear">
      <span class="rear-tag">{t('hud.rear')}</span>
      {/* render hook: the camera lane may draw a mirror texture into this slot (data-slot="rear-view") */}
      <div class="rear-panel" data-slot="rear-view" />
    </div>
  );
}

export function Hud({ minimap }: { minimap: Float32Array | null }) {
  if (!hud.visible.value) return null;
  const s = saveState.value.settings;
  const showMap = hud.itemMode.value || !!s.minimapInSpeed;
  return (
    <div class={`hud ${s.highContrast ? 'hc' : ''}`}>
      <NameTags />
      <ScreenOverlays />
      <div class="hud-box">
        <Rank />
        <Standings />
        <LapBlock />
        {!hud.itemMode.value && !hudX.timeAttack.value ? <ProgressRail /> : null}
        <Speedometer />
        <Slots />
        {showMap ? <Minimap points={minimap} /> : null}
        <Toasts />
        <NetIndicator />
        <RearView />
        <Overlays />
      </div>
    </div>
  );
}
