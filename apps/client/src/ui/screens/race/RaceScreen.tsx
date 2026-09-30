// Loading → race → results. Loading shows the track poster, rotating tips, player cards and progress; the race shows
// the HUD and the pause overlay (Esc: resume / restart / settings / leave). At the end the local race summary goes
// through progression (XP, Sparks, challenges, records) before the results screen.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { AiTier, ModeId, TeamFormat, TrackId } from '@cr/content';
import type { SlotConfig } from '@cr/sim';
import { route, navigate } from '../../store/route.ts';
import { t } from '../../../i18n/index.ts';
import { Stage } from '../../../game/Stage.ts';
import { Session, type SessionOptions } from '../../../game/Session.ts';
import { takePendingRace } from '../../../net/online.ts';
import { createSession } from './sessionFactory.ts';
import { lobby, lobbyActions } from '../../../net/lobby.ts';
import { save } from '../../../meta/save.ts';
import { applyRace } from '../../../meta/rewards.ts';
import { currentRace, setCurrentRace } from '../../../meta/raceStats.ts';
import { onUiAction, setGameKeysActive } from '../../../input/keyboard.ts';
import { Hud } from '../../hud/Hud.tsx';
import { hudX } from '../../store/hudExtra.ts';
import { setLastResult } from '../results/lastResult.ts';
import { trackInfo, loadTrackIndex } from '../../store/tracks.ts';
import { useBack } from '../../hooks.ts';
import { Confirm } from '../../components/common.tsx';
import { Stars, Bar, lapsText } from '../../components/controls.tsx';
import { TrackArt } from '../../components/TrackArt.tsx';
import { Portrait } from '../../components/Portrait.tsx';
import { Icon } from '../../icons/Icon.tsx';
import { SettingsScreen } from '../settings/SettingsScreen.tsx';
import './race.css';

/** Optional Session capabilities requested from the game lane (contract request L10-session-hooks.md). */
interface SessionHooks { setPaused?: (p: boolean) => void }
type ExtOptions = SessionOptions & { solo?: boolean; teams?: TeamFormat };

const TIP_COUNT = 10;

function Loading({ params, progress, slots, me }: { params: Record<string, string>; progress: { p: number; label: string }; slots: SlotConfig[] | null; me: number }) {
  const track = (params['track'] ?? 'meadow_loop') as TrackId;
  const info = trackInfo(track);
  const mode = params['mode'] ?? 'speed';
  const [tip, setTip] = useState(() => 1 + Math.floor(Math.random() * TIP_COUNT));
  useEffect(() => { const h = setInterval(() => setTip((x) => (x % TIP_COUNT) + 1), 4000); return () => clearInterval(h); }, []);
  const prof = save.get().profile;
  const cards = slots ?? Array.from({ length: mode === 'timeAttack' ? 1 : 8 }, (_, i) => (i === 0 ? { kind: 'human', name: prof.name, characterId: prof.characterId, kartBodyId: prof.kartBodyId } : { kind: 'bot', name: '', characterId: '', kartBodyId: '' }) as unknown as SlotConfig);
  return (
    <div class="screen loading fade-in" aria-busy="true">
      <TrackArt id={track} class="load-bg" />
      <div class="load-shade" />
      <aside class="load-tip card" key={tip}><span class="eyebrow">{t('lobby.tipLabel')}</span><p>{t(`common.tip.${tip}`)}</p></aside>
      <div class="load-main">
        <div class="load-eyebrow"><span class="badge coral">{t(`common.mode.${mode}`)}</span>{params['tier'] && mode !== 'timeAttack' ? <span class="badge ai">AI · {t(`common.tier.${params['tier']}`)}</span> : null}</div>
        <h1 class="display load-title">{t(`tracks.${track}.name`)}</h1>
        <div class="load-meta">
          {info ? <><span>{t(`themes.${info.themeId}.name`)}</span><Stars n={info.difficulty} /><span>{lapsText(params['laps'] ?? info.laps)}</span></> : null}
        </div>
      </div>
      <div class="load-players">
        {cards.map((c, i) => (c.kind === 'empty' ? null : (
          <div key={i} class={`lp-card ${i === me ? 'me' : ''} ${c.characterId ? '' : 'pending'}`}>
            {c.characterId ? <Portrait id={c.characterId} size={44} /> : <span class="lp-q"><Icon name="bot" size={22} /></span>}
            <span class="lp-name">{c.name || t('common.ai')}</span>
            {c.kind === 'bot' ? <span class="badge ai">AI</span> : i === me ? <span class="badge coral">{t('common.you')}</span> : null}
          </div>
        )))}
      </div>
      <div class="load-bar"><Bar frac={progress.p} /><span class="load-label">{progress.label || t('common.loading')}</span></div>
    </div>
  );
}

function Pause({ offline, restartable, onResume, onRestart, onSettings, onLeave }: { offline: boolean; restartable: boolean; onResume: () => void; onRestart: () => void; onSettings: () => void; onLeave: () => void }) {
  useBack(onResume);
  return (
    <div class="pause-scrim" data-focus-scope role="dialog" aria-modal="true" aria-label={t('hud.pause.title')}>
      <div class="pause card">
        <h2 class="display">{t('hud.pause.title')}</h2>
        {!offline ? <p class="pause-note">{t('hud.pause.onlineNote')}</p> : null}
        <button class="btn primary big" type="button" data-autofocus onClick={onResume}><Icon name="play" size={20} />{t('hud.pause.resume')}</button>
        {restartable ? <button class="btn big" type="button" onClick={onRestart}><Icon name="refresh" size={20} />{t('hud.pause.restart')}</button> : null}
        <button class="btn big" type="button" onClick={onSettings}><Icon name="gear" size={20} />{t('hud.pause.settings')}</button>
        <button class="btn quiet big" type="button" onClick={onLeave}><Icon name="door" size={20} />{t('hud.pause.leave')}</button>
      </div>
    </div>
  );
}

export function RaceScreen() {
  const [progress, setProgress] = useState({ p: 0, label: '' });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minimap, setMinimap] = useState<Float32Array | null>(null);
  const [slots, setSlots] = useState<SlotConfig[] | null>(null);
  const [meSlot, setMeSlot] = useState(0);
  const [paused, setPaused] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [settings, setSettings] = useState(false);
  const sessionRef = useRef<Session | null>(null);
  const endedRef = useRef(false);
  const params = route.value.params ?? {};
  const mode = (params['mode'] ?? 'speed') as ModeId;
  const ta = mode === 'timeAttack';

  const pause = (on: boolean): void => {
    const s = sessionRef.current as (Session & SessionHooks) | null;
    if (!s || endedRef.current) return;
    setPaused(on);
    setGameKeysActive(!on);
    s.setPaused?.(on);
  };
  const stopSession = (): void => {
    const s = sessionRef.current;
    if (s && !endedRef.current) { endedRef.current = true; s.stop(); Stage.leaveRace(); }
    setGameKeysActive(false);
    setCurrentRace(null);
  };
  const restart = (): void => { stopSession(); navigate('loading', { ...params, nonce: String(Date.now()) }); };
  const leave = (): void => {
    const online = sessionRef.current?.isOnline;
    stopSession();
    if (online && lobby.room.value) lobbyActions.leave();
    navigate(ta ? 'timeAttack' : 'lobby');
  };

  useEffect(() => {
    void loadTrackIndex();
    const q = new URLSearchParams(location.search);
    const prof = save.get().profile;
    const autopilot = q.get('autopilot') === '1';
    Stage.enterRace();
    const opts: ExtOptions = {
      trackId: (params['track'] ?? 'meadow_loop') as TrackId, mode, tier: (params['tier'] ?? 'racer') as AiTier,
      characterId: prof.characterId, kartBodyId: prof.kartBodyId, autopilot, simRate: Number(q.get('simRate') ?? 1),
      ...(params['laps'] ? { laps: Number(params['laps']) } : q.get('laps') ? { laps: Number(q.get('laps')) } : {}),
      ...(q.get('seed') ? { seed: Number(q.get('seed')) } : {}),
      ...(ta ? { solo: true } : {}),
      ...(!ta && (params['teams'] === 'duo' || params['teams'] === 'squad') ? { teams: params['teams'] } : {}),
    };
    // Online (routed here by raceStart with online=1): build the Session from the server's race explicitly, and show its
    // real line-up on the loading card at once. Without a pending race (a reload) this falls back to an offline race.
    const race = params['online'] === '1' ? takePendingRace() : null;
    if (race) { setSlots(race.config.slots); setMeSlot(race.yourSlot); }
    const s = race ? Session.online(Stage.renderer!, Stage.tier, race, { autopilot }) : createSession(Stage.renderer!, Stage.tier, opts, params);
    sessionRef.current = s;
    endedRef.current = false;
    Stage.onResize = (w, h) => s.renderer?.resize(w, h);
    let cancelled = false;
    let netPump: ReturnType<typeof setInterval> | null = null;
    const minShow = autopilot ? 0 : 1400;
    const t0 = performance.now();
    s.load((p, label) => setProgress({ p, label })).then(async () => {
      if (cancelled) return;
      setSlots(s.config.slots);
      const wait = minShow - (performance.now() - t0);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (cancelled) return;
      setMinimap(s.renderer ? s.renderer.minimap() : null);
      setReady(true);
      navigate('race', params);
      window.__cr = { ...window.__cr, race: 'running', session: s };
      s.onEnd((r) => {
        if (endedRef.current) return;
        const col = currentRace;
        const info = trackInfo(opts.trackId);
        let summary, report;
        try {
          summary = col ? col.summary(r, s.world(), info?.themeId ?? '', opts.trackId, ta && save.get().settings.ghost !== false) : undefined;
          report = summary ? applyRace(summary) : undefined;
        } catch (e) { console.error('[race] progression failed', e); }
        setLastResult(r, s.slotNames, {
          slots: s.config.slots.map((x) => ({ characterId: x.characterId, kartBodyId: x.kartBodyId })),
          ...(summary ? { summary } : {}), ...(report ? { report } : {}),
          again: { track: opts.trackId, mode, tier: opts.tier, ...(params['laps'] ? { laps: params['laps'] } : {}) }, teams: s.config.teams, online: s.isOnline, me: race?.yourSlot ?? 0,
        });
        window.__cr = { ...window.__cr, race: 'done', result: r };
        endedRef.current = true;
        s.stop(); Stage.leaveRace(); setGameKeysActive(false); setCurrentRace(null);
        navigate('results');
      });
      s.start();
      setGameKeysActive(true);
      // online: the connection's round trip feeds the HUD signal pill (2 Hz is plenty for a number that jitters)
      if (s.isOnline) netPump = setInterval(() => { const st = s.net?.stats; if (st) hudX.net.value = { pingMs: Math.round(st.rttMs), late: hudX.net.value?.late ?? 0 }; }, 500);
    }).catch((e: unknown) => { console.error(e); setError(String((e as Error)?.message ?? e)); });
    const offs = [
      onUiAction('pause', () => pause(true)),
      onUiAction('restart', () => { if (!s.isOnline) restart(); }),
      onUiAction('blur', () => { if (!s.isOnline && !endedRef.current && sessionRef.current) pause(true); }),
    ];
    return () => { cancelled = true; if (netPump) clearInterval(netPump); hudX.net.value = null; for (const o of offs) o(); if (!endedRef.current && route.value.screen !== 'race' && route.value.screen !== 'loading') stopSession(); };
  }, []);

  if (error) {
    return (
      <div class="screen loading-error fade-in">
        <div class="card err-card"><Icon name="info" size={36} /><h2>{t('errors.load_failed')}</h2><p class="num">{error}</p>
          <button class="btn primary" type="button" data-autofocus onClick={() => { stopSession(); navigate('lobby'); }}>{t('common.back')}</button></div>
      </div>
    );
  }
  if (!ready) return <Loading params={params} progress={progress} slots={slots} me={meSlot} />;
  const offline = !sessionRef.current?.isOnline;
  return (
    <>
      <Hud minimap={minimap} />
      {paused && !settings && !leaving ? <Pause offline={offline} restartable={offline} onResume={() => pause(false)} onRestart={restart} onSettings={() => setSettings(true)} onLeave={() => setLeaving(true)} /> : null}
      {paused && settings ? <div class="race-settings"><SettingsScreen onClose={() => setSettings(false)} /></div> : null}
      {leaving ? <Confirm title={t('hud.pause.leaveTitle')} body={<p>{t('hud.pause.leaveBody')}</p>} okLabel={t('hud.pause.leave')} danger onOk={leave} onCancel={() => setLeaving(false)} /> : null}
    </>
  );
}
