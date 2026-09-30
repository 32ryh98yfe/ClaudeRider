// Centre-screen HUD events: countdown + GO ring, start-boost result, skewed banners, retire count, wrong-way roundel,
// item feed, incoming warning (edge arrow + ETA ring), alert vignette, mash prompt, redaction / mirror overlays,
// respawn tag, finish letterbox (31-ui-spec §4.1, §5).
import { useEffect, useState } from 'preact/hooks';
import { hud } from '../store/hud.ts';
import { hudX } from '../store/hudExtra.ts';
import { banner } from '../store/banner.ts';
import { t } from '../../i18n/index.ts';
import { ItemIcon } from '../components/common.tsx';

function Countdown() {
  const c = hud.countdown.value;
  if (c === null) return null;
  const go = c === 0;
  return (
    <div class={`hud-countdown ${go ? 'go' : ''} ${go && hudX.perfect.value ? 'perfect' : ''}`} key={c} aria-live="assertive">
      <span class="num cd-digit">{go ? t('hud.go') : c}</span>
      {go ? <i class="cd-ring" /> : null}
    </div>
  );
}

function StartResult() {
  const r = hudX.startResult.value;
  const [, force] = useState(0);
  useEffect(() => { if (!r) return; const h = setTimeout(() => force((x) => x + 1), 1250); return () => clearTimeout(h); }, [r?.at]);
  if (!r || performance.now() - r.at > 1200 || r.tier === 'perfect') return null;
  return <div class={`hud-start ${r.tier}`} key={r.at}>{t(`hud.start.${r.tier}`)}</div>;
}

function Banner() {
  const b = banner.state.value;
  if (!b) return null;
  const ms = Math.max(600, b.until - performance.now());
  return (
    <div class={`hud-banner ${b.kind}`} key={b.id} style={{ '--hold': `${ms}ms` } as Record<string, string>}>
      <span class="bn-panel"><span class={`bn-text ${b.kind === 'finish' ? 'num' : 'display'}`}>{b.text}</span></span>
    </div>
  );
}

function Retire() {
  const r = hud.retireLeft.value;
  if (r === null || hud.finished.value) return null;
  return <div class={`hud-retire ${r <= 3 ? 'urgent' : ''}`}><small>{t('hud.retireIn')}</small><span class="num" key={r}>{r}</span></div>;
}

function WrongWay() {
  if (!hud.wrongWay.value) return null;
  return (
    <div class="hud-wrongway" role="alert">
      <div class="ww-roundel" aria-hidden="true"><i /></div>
      <div class="ww-text display">{t('hud.wrongWay')}</div>
    </div>
  );
}

function Feed() {
  const lines = hudX.feed.value;
  if (!lines.length) return null;
  return (
    <ul class="hud-feed" aria-live="polite">
      {lines.map((l) => (
        <li key={l.id} class={`${l.mine ? 'mine' : ''} r-${l.result}`}>
          <b class="fd-a">{l.attacker}</b>
          <ItemIcon id={l.itemId} />
          <span class="fd-arrow" aria-hidden="true">→</span>
          <b class="fd-v">{l.victim}</b>
          <span class="fd-res">{t(`hud.${l.result === 'blocked' ? 'blocked' : l.result === 'immune' ? 'immune' : l.result === 'miss' ? 'miss' : 'hit'}`)}</span>
          <span class="sr-only">{t('hud.feed', { attacker: l.attacker, item: t(`items.${l.itemId}.name`), victim: l.victim })}</span>
        </li>
      ))}
    </ul>
  );
}

function Incoming() {
  const inc = hud.incoming.value;
  if (!inc) return null;
  const frac = Math.max(0, Math.min(1, inc.etaTicks / 120));
  const deg = (inc.dir * 180) / Math.PI;
  const c = 2 * Math.PI * 44;
  return (
    <>
      <div class="hud-incoming" role="alert" aria-label={t('hud.incoming')}>
        <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" class="inc-bg" /><circle cx="50" cy="50" r="44" class="inc-eta" style={{ strokeDasharray: `${c}`, strokeDashoffset: `${c * (1 - frac)}` }} /></svg>
        <span class="inc-bang">!</span>
        <span class="inc-label">{t('hud.incoming')}</span>
      </div>
      <div class="hud-edge-arrow" style={{ transform: `translate(-50%, -50%) rotate(${deg}deg)` }} aria-hidden="true"><i /></div>
    </>
  );
}

function Alert() {
  const a = hudX.alert.value;
  const hit = hudX.hitAt.value;
  const [, force] = useState(0);
  useEffect(() => { if (!hit) return; const h = setTimeout(() => force((x) => x + 1), 520); return () => clearTimeout(h); }, [hit]);
  const flash = hit !== null && performance.now() - hit < 500;
  if (a === null && !flash) return null;
  const side = a === null ? 'all' : Math.abs(a) > 2.2 ? 'back' : a > 0.5 ? 'right' : a < -0.5 ? 'left' : 'front';
  return <div class={`hud-alert ${side} ${flash ? 'flash' : ''}`} key={flash ? hit : 'a'} aria-hidden="true" />;
}

function Mash() {
  const m = hud.mash.value;
  if (m === null) return null;
  return (
    <div class="hud-mash" role="alert">
      <span class="mash-l" aria-hidden="true">◀</span>
      <span class="mash-t display">{m <= 0 ? t('hud.fastEscape') : t('hud.mash')}</span>
      <span class="mash-r" aria-hidden="true">▶</span>
      {m > 0 ? <span class="mash-n">{t('hud.mashLeft', { n: m })}</span> : null}
    </div>
  );
}

function Redaction() {
  const r = hudX.redaction.value;
  if (r === null) return null;
  // opaque 120 ticks (2 s), then fade 60 (1 s) — CSS animation from the start timestamp
  const elapsed = Math.max(0, performance.now() - r);
  return (
    <div class="hud-redaction" style={{ animationDelay: `-${Math.min(3000, elapsed)}ms` }} aria-label={t('hud.redacted')}>
      <i style={{ top: '18%', width: '62%', left: '8%' }} /><i style={{ top: '34%', width: '48%', left: '40%' }} /><i style={{ top: '50%', width: '70%', left: '14%' }} /><i style={{ top: '66%', width: '42%', left: '6%' }} />
      <span class="red-tag display">{t('hud.redacted')}</span>
    </div>
  );
}

function Mirror() {
  if (!hudX.mirror.value) return null;
  return <div class="hud-mirror" aria-label={t('hud.mirror')}><span class="mir-l">⇄</span><span class="mir-t display">{t('hud.mirror')}</span><span class="mir-r">⇄</span></div>;
}

function Respawn() {
  if (!hudX.respawn.value) return null;
  return <div class="hud-respawn">{t('hud.respawn')}</div>;
}

function Finish() {
  const f = hudX.finishAt.value;
  if (f === null) return null;
  return <div class="hud-letterbox" key={f} aria-hidden="true"><i /><i /></div>;
}

function Shield() {
  if (!hudX.shield.value) return null;
  return <div class="hud-shield" aria-label={t('hud.shieldUp')} />;
}

/** Full-viewport layers (outside the 16:9 box). */
export function ScreenOverlays() {
  return (
    <>
      <Alert />
      <Redaction />
      <Shield />
      <Finish />
    </>
  );
}

/** Centre events positioned in the 16:9 box. */
export function Overlays() {
  return (
    <>
      <Mirror />
      <Countdown />
      <StartResult />
      <Banner />
      <Retire />
      <WrongWay />
      <Feed />
      <Incoming />
      <Mash />
      <Respawn />
    </>
  );
}
