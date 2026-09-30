// Quick Match (13-modes-rules §6): 20 s search with humans {n}/8, then a 15 s matching stage (track reveal, loadout,
// quick chat, team colours). Bound to the lobby store (net/lobby.ts); the M2 stub reports offline → offline state.
import { useEffect, useState } from 'preact/hooks';
import { loadContent, type CharacterId, type KartBodyId, type ModeId, type TeamFormat } from '@cr/content';
import { navigate, route } from '../../store/route.ts';
import { t } from '../../../i18n/index.ts';
import { Audio } from '../../../audio/engine.ts';
import { Stage } from '../../../game/Stage.ts';
import { lobby, lobbyActions, connect } from '../../../net/lobby.ts';
import { save } from '../../../meta/save.ts';
import { ownedById } from '../../../meta/unlocks.ts';
import { useBack, useNow } from '../../hooks.ts';
import { saveState, raceSetup } from '../../store/profile.ts';
import { trackInfo, loadTrackIndex } from '../../store/tracks.ts';
import { mockLobby } from '../../dev/demo.ts';
import { ScreenHead } from '../../components/common.tsx';
import { Seg, Stars } from '../../components/controls.tsx';
import { TrackArt } from '../../components/TrackArt.tsx';
import { Portrait } from '../../components/Portrait.tsx';
import { Icon } from '../../icons/Icon.tsx';
import { errorKey } from '../room/errors.ts';
import './queue.css';

export function loadoutOf(): { characterId: CharacterId; kartBodyId: KartBodyId; livery: { primary: string; secondary: string; pattern: number; number: number } } {
  const p = save.get().profile;
  return { characterId: p.characterId, kartBodyId: p.kartBodyId, livery: { primary: p.livery.primary, secondary: p.livery.secondary, pattern: p.livery.pattern, number: p.livery.number } };
}

function Countdown({ endsAt, total, children }: { endsAt: number; total: number; children?: preact.ComponentChildren }) {
  const now = useNow(200);
  const left = Math.max(0, endsAt - (now + lobby.clockOffsetMs.value));
  const frac = Math.max(0, Math.min(1, left / (total * 1000)));
  const r = 54, c = 2 * Math.PI * r;
  return (
    <div class="q-ring">
      <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r={r} class="q-ring-bg" /><circle cx="60" cy="60" r={r} class="q-ring-fg" style={{ strokeDasharray: `${c}`, strokeDashoffset: `${c * (1 - frac)}` }} /></svg>
      <div class="q-ring-inner"><b class="num">{Math.ceil(left / 1000)}</b>{children}</div>
    </div>
  );
}

export function QueueScreen() {
  const s = saveState.value;
  const params = route.value.params ?? {};
  const [mode, setMode] = useState<ModeId>((params['mode'] as ModeId) || raceSetup().mode);
  const [teams, setTeams] = useState<TeamFormat>((params['teams'] as TeamFormat) || 'solo');
  const conn = lobby.conn.value, q = lobby.queue.value, err = lobby.error.value;
  const leave = (): void => { if (lobby.queue.value && !mockLobby.value) lobbyActions.cancelQuick(); navigate('lobby'); };
  useBack(leave);
  const start = (): void => {
    if (mockLobby.value) return;
    lobby.error.value = null;
    const go = (): void => { if (lobby.conn.value === 'online') lobbyActions.quick(mode, teams); };
    if (lobby.conn.value === 'online') go();
    else { lobby.conn.value = 'connecting'; void connect(save.get().profile.name, loadoutOf()).then(go).catch(() => { lobby.conn.value = 'offline'; }); }
  };
  useEffect(() => {
    void loadTrackIndex();
    if (Stage.showcase) Stage.showcase.offsetX = 0;
    start();
    return () => { if (lobby.queue.value && !mockLobby.value) lobbyActions.cancelQuick(); };
  }, []);

  let body: preact.JSX.Element;
  if (conn === 'offline' || (err && err !== 'offline' && !q) || (err === 'offline' && !mockLobby.value)) {
    body = (
      <section class="q-card card q-offline" aria-live="polite" data-testid="queue-offline">
        <div class="q-offline-ico"><Icon name="signal" size={34} /><i /></div>
        <h2>{t('lobby.queue.offlineTitle')}</h2>
        <p>{err && err !== 'offline' ? t(errorKey(err)) : t('lobby.queue.offlineBody')}</p>
        <div class="q-actions">
          <button class="btn primary" type="button" data-autofocus onClick={() => { Audio.sfx('uiOk'); navigate('modeSelect'); }}><Icon name="bot" size={18} />{t('lobby.queue.raceAi')}</button>
          <button class="btn" type="button" onClick={() => { Audio.sfx('uiMove'); start(); }}><Icon name="refresh" size={18} />{t('common.retry')}</button>
          <button class="btn quiet" type="button" onClick={leave}>{t('lobby.queue.toLobby')}</button>
        </div>
      </section>
    );
  } else if (conn === 'connecting' || conn === 'idle' || conn === 'reconnecting' || !q) {
    body = (
      <section class="q-card card q-connecting" aria-live="polite">
        <div class="q-spinner" aria-hidden="true" />
        <h2>{conn === 'online' ? t('lobby.searching', { n: 1 }) : t('lobby.queue.connecting')}</h2>
        <button class="btn quiet" type="button" data-autofocus onClick={leave}>{t('common.cancel')}</button>
      </section>
    );
  } else if (q.phase === 'search') {
    body = (
      <section class="q-card card q-search" aria-live="polite">
        <div class="q-mode"><span class="badge coral">{t(`common.mode.${mode}`)}</span><span class="badge">{t(`common.format.${teams}`)}</span></div>
        <Countdown endsAt={q.endsAt} total={20}><small>{t('lobby.queue.sec')}</small></Countdown>
        <h2>{t('lobby.searching', { n: q.humans })}</h2>
        <div class="q-slots" aria-label={t('lobby.queue.humans', { n: q.humans })}>
          {Array.from({ length: 8 }, (_, i) => <i key={i} class={i < q.humans ? 'on' : ''}>{i < q.humans ? <Icon name="user" size={16} /> : null}</i>)}
        </div>
        <p class="q-note"><Icon name="bot" size={16} />{t('lobby.aiFill')}</p>
        <button class="btn" type="button" data-autofocus onClick={leave}><Icon name="x" size={16} />{t('lobby.cancelSearch')}</button>
      </section>
    );
  } else {
    const tr = q.trackId ? trackInfo(q.trackId) : undefined;
    const c = loadContent();
    const chars = c.characters.all.filter((x) => ownedById(`character.${x.id}`, s));
    const karts = c.karts.all.filter((x) => ownedById(`kart.${x.id}`, s));
    const cycle = <T extends { id: string }>(list: readonly T[], cur: string, d: number): T => list[(list.findIndex((x) => x.id === cur) + d + list.length) % list.length]!;
    const setLoadout = (ch: CharacterId, k: KartBodyId): void => {
      save.update((d) => { d.profile.characterId = ch; d.profile.kartBodyId = k; });
      Stage.showShowcase(ch, k);
      if (!mockLobby.value) lobbyActions.loadout(loadoutOf());
    };
    body = (
      <section class="q-card card q-stage" aria-live="polite">
        <header class="q-stage-head">
          <div><span class="eyebrow">{t('lobby.matchingStage')}</span><h2>{t('lobby.queue.trackReveal')}</h2></div>
          <Countdown endsAt={q.endsAt} total={15} />
        </header>
        <div class="q-track">
          <TrackArt id={q.trackId ?? 'random'} random={!q.trackId} class="q-track-art" />
          <div><div class="q-track-name display">{q.trackId ? t(`tracks.${q.trackId}.name`) : t('lobby.randomTrack')}</div>
            <div class="q-track-meta">{tr ? <><Stars n={tr.difficulty} /><span class="badge">{t('common.laps', { n: tr.laps })}</span></> : null}<span class="badge coral">{t(`common.mode.${mode}`)}</span></div></div>
        </div>
        <div class="q-loadout">
          <span class="eyebrow">{t('lobby.queue.loadout')}</span>
          <div class="q-pick">
            <button class="btn quiet icon" type="button" aria-label="prev" onClick={() => setLoadout(cycle(chars, s.profile.characterId, -1).id, s.profile.kartBodyId)}><Icon name="back" /></button>
            <Portrait id={s.profile.characterId} size={48} />
            <span class="q-pick-name">{t(`chars.${s.profile.characterId}.name`)}</span>
            <button class="btn quiet icon" type="button" aria-label="next" onClick={() => setLoadout(cycle(chars, s.profile.characterId, 1).id, s.profile.kartBodyId)}><Icon name="next" /></button>
          </div>
          <div class="q-pick">
            <button class="btn quiet icon" type="button" aria-label="prev" onClick={() => setLoadout(s.profile.characterId, cycle(karts, s.profile.kartBodyId, -1).id)}><Icon name="back" /></button>
            <Icon name="kart" size={28} />
            <span class="q-pick-name">{t(`karts.${s.profile.kartBodyId}.name`)}</span>
            <button class="btn quiet icon" type="button" aria-label="next" onClick={() => setLoadout(s.profile.characterId, cycle(karts, s.profile.kartBodyId, 1).id)}><Icon name="next" /></button>
          </div>
        </div>
        <div class="q-chat">
          <span class="eyebrow">{t('lobby.queue.quickChat')}</span>
          <div class="q-qc">{[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <button key={n} type="button" class="chip" onClick={() => { Audio.sfx('uiMove'); if (!mockLobby.value) lobbyActions.chat(t(`lobby.queue.qc.${n}`)); }}>{t(`lobby.queue.qc.${n}`)}</button>)}</div>
          <ul class="q-log">{lobby.chat.value.slice(-4).map((m, i) => <li key={i}><b>{m.from}</b>{m.text}</li>)}</ul>
        </div>
      </section>
    );
  }
  return (
    <div class="screen queue fade-in">
      <div class="q-scrim" />
      <ScreenHead title={t('lobby.queue.title')} onBack={leave}
        right={!q ? <div class="q-setup">
          <Seg label={t('lobby.modeSelect.mode')} value={mode} onChange={setMode} options={[{ value: 'speed' as ModeId, label: t('common.mode.speed') }, { value: 'item' as ModeId, label: t('common.mode.item') }]} />
          <Seg label={t('lobby.modeSelect.format')} value={teams} onChange={setTeams} options={(['solo', 'duo', 'squad'] as const).map((f) => ({ value: f, label: t(`common.format.${f}`) }))} />
        </div> : null} />
      <div class="q-body">{body}</div>
    </div>
  );
}
