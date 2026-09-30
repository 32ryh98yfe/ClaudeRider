// Custom Room (13-modes-rules §7): create / join by code, 8 slot cards (portrait, ready, ping, team, host, AI),
// host controls, settings, code chip (copy / hide), chat, ready/start with auto-start countdown, Track Roulette vote.
// Bound to the lobby store (net/lobby.ts); works with the offline stub (landing + offline notice) and L9's backend.
import { useEffect, useState } from 'preact/hooks';
import type { AiTier, ModeId, TeamFormat, TrackId } from '@cr/content';
import type { RoomSettings, RoomSlotView, RoomView } from '@cr/net';
import { navigate } from '../../store/route.ts';
import { t } from '../../../i18n/index.ts';
import { Audio } from '../../../audio/engine.ts';
import { Stage } from '../../../game/Stage.ts';
import { lobby, lobbyActions, connect } from '../../../net/lobby.ts';
import { save } from '../../../meta/save.ts';
import { useBack, useNow } from '../../hooks.ts';
import { toast } from '../../store/uiToast.ts';
import { loadTrackIndex, playableTracks, trackInfo, bakedIndex } from '../../store/tracks.ts';
import { mockLobby } from '../../dev/demo.ts';
import { ScreenHead } from '../../components/common.tsx';
import { Seg, Toggle, Stars } from '../../components/controls.tsx';
import { Portrait } from '../../components/Portrait.tsx';
import { TrackArt } from '../../components/TrackArt.tsx';
import { Icon } from '../../icons/Icon.tsx';
import { loadoutOf } from '../queue/QueueScreen.tsx';
import { errorKey, isValidCode, CODE_ALPHABET } from './errors.ts';
import './room.css';

const TEAM_KEYS = ['red', 'blue', 'green', 'yellow'] as const;
const TEAM_COLORS = ['var(--team-red)', 'var(--team-blue)', 'var(--team-green)', 'var(--team-yellow)'];

function defaultSettings(): RoomSettings {
  return { mode: 'item', teams: 'solo', track: 'roulette', laps: 'default', fillBots: true, botTier: 'racer', isPrivate: false, maxHumans: 8 };
}

function pingClass(ms: number | undefined): string { return ms === undefined ? '' : ms < 60 ? 'good' : ms < 130 ? 'ok' : 'bad'; }

function secondsLeft(endsAt: number | undefined, now: number): number { return endsAt ? Math.max(0, Math.ceil((endsAt - (now + lobby.clockOffsetMs.value)) / 1000)) : 0; }

export function RoomScreen() {
  const room = lobby.room.value, conn = lobby.conn.value, err = lobby.error.value;
  const leave = (): void => {
    if (lobby.room.value && !mockLobby.value) lobbyActions.leave();
    // the server sends no "room: null"; clear the local view so re-entering shows the landing
    lobby.room.value = null; lobby.roulette.value = null; lobby.chat.value = [];
    navigate('lobby');
  };
  useBack(leave);
  const ensureConn = (): Promise<void> => {
    if (mockLobby.value || lobby.conn.value === 'online') return Promise.resolve();
    lobby.conn.value = 'connecting'; lobby.error.value = null;
    return connect(save.get().profile.name, loadoutOf()).catch(() => { lobby.conn.value = 'offline'; });
  };
  useEffect(() => { void loadTrackIndex(); if (Stage.showcase) Stage.showcase.offsetX = 0.9; void ensureConn(); }, []);
  useEffect(() => {
    if (!err || err === 'offline') return;
    toast(t(errorKey(err)), 'bad');
    if (err === 'kicked') { lobby.room.value = null; lobby.chat.value = []; }
    lobby.error.value = null;
  }, [err]);
  return (
    <div class="screen room fade-in">
      <div class="room-scrim" />
      {room ? <RoomView room={room} onLeave={leave} /> : <Landing conn={conn} onLeave={leave} retry={() => void ensureConn()} />}
    </div>
  );
}

function Landing({ conn, onLeave, retry }: { conn: string; onLeave: () => void; retry: () => void }) {
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<ModeId>('item');
  const valid = isValidCode(code);
  const offline = conn === 'offline';
  const clean = (v: string): string => [...v.toUpperCase()].filter((c) => CODE_ALPHABET.includes(c)).join('').slice(0, 6);
  return (
    <>
      <ScreenHead title={t('room.title')} sub={t('room.landingSub')} onBack={onLeave} />
      <div class="room-landing" data-testid="room-landing">
        {offline ? (
          <div class="room-offline card" role="status">
            <Icon name="signal" size={22} />
            <div><b>{t('lobby.queue.offlineTitle')}</b><p>{t('lobby.queue.offlineBody')}</p></div>
            <button class="btn small" type="button" onClick={retry}><Icon name="refresh" size={16} />{t('common.retry')}</button>
            <button class="btn small primary" type="button" onClick={() => navigate('modeSelect')}><Icon name="bot" size={16} />{t('lobby.queue.raceAi')}</button>
          </div>
        ) : conn === 'connecting' ? <div class="room-offline card" role="status"><div class="q-spinner small" /><b>{t('lobby.queue.connecting')}</b></div> : null}
        <div class="room-cards">
          <section class="card room-choice">
            <div class="rc-ico"><Icon name="plus" size={28} /></div>
            <h2>{t('room.create')}</h2>
            <p>{t('room.createDesc')}</p>
            <Seg label={t('room.mode')} value={mode} onChange={setMode} options={[{ value: 'speed' as ModeId, label: t('common.mode.speed') }, { value: 'item' as ModeId, label: t('common.mode.item') }]} />
            <button class="btn primary big" type="button" data-autofocus disabled={offline} onClick={() => { Audio.sfx('uiOk'); lobbyActions.create({ ...defaultSettings(), mode }); }}><Icon name="plus" size={18} />{t('room.create')}</button>
          </section>
          <section class="card room-choice">
            <div class="rc-ico"><Icon name="hash" size={28} /></div>
            <h2>{t('room.join')}</h2>
            <p>{t('room.joinDesc')}</p>
            <input class="field code-field num" aria-label={t('room.codeInput')} placeholder="ABC234" value={code} maxLength={6} spellcheck={false} autocomplete="off"
              onInput={(e) => setCode(clean((e.target as HTMLInputElement).value))} onKeyDown={(e) => { if (e.key === 'Enter' && valid && !offline) lobbyActions.join(code); }} />
            <small class={`code-hint ${code && !valid ? 'bad' : ''}`}>{t('room.codeInvalid')}</small>
            <button class="btn dark big" type="button" disabled={!valid || offline} onClick={() => { Audio.sfx('uiOk'); lobbyActions.join(code); }}><Icon name="next" size={18} />{t('room.joinBtn')}</button>
          </section>
        </div>
      </div>
    </>
  );
}

function RoomView({ room, onLeave }: { room: RoomView; onLeave: () => void }) {
  const now = useNow(250);
  void bakedIndex.value;
  const [showCode, setShowCode] = useState(!room.settings.isPrivate);
  const [menu, setMenu] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  const [more, setMore] = useState(false);
  const me = room.slots.find((x) => x.you);
  const isHost = !!me?.host || (lobby.session.value !== null && room.hostSession === lobby.session.value);
  const st = room.settings;
  const humans = room.slots.filter((x) => x.state === 'human');
  const occupied = room.slots.filter((x) => x.state === 'human' || x.state === 'bot').length;
  const others = humans.filter((x) => !x.host);
  const allReady = others.every((x) => x.ready);
  const setS = (p: Partial<RoomSettings>): void => { Audio.sfx('uiMove'); if (mockLobby.value) lobby.room.value = { ...room, settings: { ...room.settings, ...p } }; else lobbyActions.settings(p); };
  const copy = (): void => { void navigator.clipboard?.writeText(room.code).then(() => toast(t('room.copied'), 'good')).catch(() => toast(room.code)); };
  const send = (): void => { const v = msg.trim(); if (!v) return; if (!mockLobby.value) lobbyActions.chat(v); else lobby.chat.value = [...lobby.chat.value, { from: me?.name ?? '', text: v, at: Date.now() }]; setMsg(''); };
  // once the server has picked the track (after a roulette or a random pick) show that, not the setting
  const busy = room.phase === 'loading' || room.phase === 'racing' || room.phase === 'results';
  const trackLabel = busy && room.trackId ? t(`tracks.${room.trackId}.name`) : st.track === 'roulette' ? t('room.settings.roulette') : t(`tracks.${st.track}.name`);
  // server defaults (13-modes-rules §7.2) for the optional rules
  const retireSec = st.retireSec ?? 10, itemSet = st.itemSet ?? 'standard', ff = st.friendlyFire ?? 'area';
  const teamsN = st.teams === 'duo' ? 4 : st.teams === 'squad' ? 2 : 0;
  const autoLeft = room.phase === 'countdown' ? secondsLeft(room.endsAt, now) : 0;
  return (
    <>
      <ScreenHead title={t('room.title')} sub={<>{t(`common.mode.${st.mode}`)} · {t(`common.format.${st.teams}`)} · {trackLabel} · {t('room.racers', { n: occupied })}</>} onBack={onLeave}
        right={
          <div class="code-chip" aria-label={t('room.code')}>
            <span class="eyebrow">{t('room.code')}</span>
            <b class="num">{showCode ? room.code : '••••••'}</b>
            <button class="btn ghost icon small-ico" type="button" aria-label={showCode ? t('room.hideCode') : t('room.showCode')} onClick={() => setShowCode(!showCode)}><Icon name={showCode ? 'eyeOff' : 'eye'} size={16} /></button>
            <button class="btn ghost icon small-ico" type="button" aria-label={t('room.copyCode')} onClick={copy}><Icon name="copy" size={16} /></button>
          </div>
        } />
      <div class="room-body">
        <section class="slot-grid" aria-label={t('room.racers', { n: occupied })}>
          {room.slots.map((sl) => (
            <SlotCard key={sl.slot} sl={sl} teams={teamsN} host={isHost} open={menu === sl.slot} onMenu={() => setMenu(menu === sl.slot ? null : sl.slot)} onClose={() => setMenu(null)} />
          ))}
        </section>
        <aside class="room-side">
          <section class="card room-settings">
            <header><h3>{t('room.settingsTitle')}</h3>{!isHost ? <span class="badge lock"><Icon name="lock" size={11} />{t('room.hostOnly')}</span> : null}</header>
            <fieldset disabled={!isHost}>
              <div class="rs-row"><span>{t('room.mode')}</span><Seg label={t('room.mode')} value={st.mode} onChange={(v) => setS({ mode: v })} options={(['speed', 'item'] as ModeId[]).map((m) => ({ value: m, label: t(`common.mode.${m}`) }))} /></div>
              <div class="rs-row"><span>{t('room.format')}</span><Seg label={t('room.format')} value={st.teams} onChange={(v) => setS({ teams: v })} options={(['solo', 'duo', 'squad'] as TeamFormat[]).map((f) => ({ value: f, label: t(`common.format.${f}`) }))} /></div>
              <div class="rs-row"><span>{t('room.settings.track')}</span>
                <select class="field rs-select" value={st.track} aria-label={t('room.settings.track')} onChange={(e) => setS({ track: (e.target as HTMLSelectElement).value as TrackId | 'roulette' })}>
                  <option value="roulette">{t('room.settings.roulette')}</option>
                  {playableTracks(st.mode).map((x) => <option key={x.id} value={x.id}>{t(`tracks.${x.id}.name`)}</option>)}
                </select></div>
              <div class="rs-row"><span>{t('room.settings.laps')}</span><Seg label={t('room.settings.laps')} value={st.laps === 'default' ? 0 : st.laps} onChange={(v) => setS({ laps: v === 0 ? 'default' : v })}
                options={[{ value: 0, label: t('room.settings.lapsAuto') }, ...[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))]} /></div>
              <div class="rs-row"><span>{t('room.botTier')}</span><Seg label={t('room.botTier')} value={st.botTier} onChange={(v) => setS({ botTier: v })} options={(['rookie', 'racer', 'pro', 'legend'] as AiTier[]).map((x) => ({ value: x, label: t(`common.tier.${x}`) }))} /></div>
              <div class="rs-row"><span>{t('room.fillBots')}</span><Toggle label={t('room.fillBots')} on={st.fillBots} onChange={(v) => setS({ fillBots: v })} /></div>
              <div class="rs-row"><span>{t('room.private')}</span><Toggle label={t('room.private')} on={st.isPrivate} onChange={(v) => setS({ isPrivate: v })} /></div>
              <button class="btn ghost small rs-more" type="button" aria-expanded={more} onClick={() => setMore(!more)}><Icon name={more ? 'minus' : 'plus'} size={14} />{t('room.settings.more')}</button>
              {more ? (
                <div class="rs-more-body">
                  <div class="rs-row"><span>{t('room.settings.retire')}</span><Seg label={t('room.settings.retire')} value={retireSec} onChange={(v) => setS({ retireSec: v })}
                    options={([5, 10, 15, 20] as const).map((n) => ({ value: n, label: t('room.settings.secN', { n }) }))} /></div>
                  {st.mode === 'item' ? <div class="rs-row"><span>{t('room.settings.itemSet')}</span><Seg label={t('room.settings.itemSet')} value={itemSet} onChange={(v) => setS({ itemSet: v })}
                    options={(['standard', 'light', 'chaos'] as const).map((x) => ({ value: x, label: t(`room.settings.itemSet.${x}`) }))} /></div> : null}
                  {st.mode === 'item' && st.teams !== 'solo' ? <div class="rs-row"><span>{t('room.settings.friendlyFire')}</span><Seg label={t('room.settings.friendlyFire')} value={ff} onChange={(v) => setS({ friendlyFire: v })}
                    options={(['off', 'area', 'all'] as const).map((x) => ({ value: x, label: t(`room.settings.ff.${x}`) }))} /></div> : null}
                  <div class="rs-row"><span>{t('room.settings.rubberBand')}</span><Toggle label={t('room.settings.rubberBand')} on={st.rubberBand ?? true} onChange={(v) => setS({ rubberBand: v })} /></div>
                  {st.mode === 'item' ? <div class="rs-row"><span>{t('room.settings.instantBoost')}</span><Toggle label={t('room.settings.instantBoost')} on={st.instantBoostInItem ?? true} onChange={(v) => setS({ instantBoostInItem: v })} /></div> : null}
                </div>
              ) : null}
            </fieldset>
          </section>
          <section class="card room-chat" aria-label={t('room.chat')}>
            <ul class="chat-log" aria-live="polite">
              {lobby.chat.value.length ? lobby.chat.value.slice(-30).map((m, i) => <li key={i}><b>{m.from}</b><span>{m.text}</span></li>) : <li class="empty">{t('room.noChat')}</li>}
            </ul>
            <div class="chat-input">
              <input class="field" value={msg} maxLength={120} placeholder={t('room.chatPlaceholder')} aria-label={t('room.chat')} onInput={(e) => setMsg((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); }} />
              <button class="btn primary icon" type="button" aria-label={t('room.send')} onClick={send}><Icon name="send" size={18} /></button>
            </div>
          </section>
        </aside>
      </div>
      <footer class="room-foot">
        <button class="btn quiet leave-btn" type="button" onClick={onLeave}><Icon name="door" size={18} />{t('room.leave')}</button>
        <div class="grow" />
        {busy ? <span class="room-wait" aria-live="polite">{t('room.inProgress')}</span>
          : room.phase === 'countdown' ? <span class="auto-start num" aria-live="polite">{t('room.autoStart', { s: autoLeft })}</span> : !allReady ? <span class="room-wait">{t('room.needReady')}</span> : <span class="room-wait ok">{t('room.allReady')}</span>}
        {isHost ? (
          <button class="btn primary big" type="button" data-autofocus disabled={!allReady || busy} onClick={() => { Audio.sfx('uiOk'); lobbyActions.start(); }}><Icon name="flag" size={20} /><span class="display">{t('room.start')}</span></button>
        ) : (
          <button class={`btn big ${me?.ready ? 'dark' : 'primary'}`} type="button" data-autofocus disabled={busy} onClick={() => { Audio.sfx('uiOk'); lobbyActions.ready(!me?.ready); }}><Icon name={me?.ready ? 'x' : 'check'} size={20} /><span class="display">{me?.ready ? t('room.notReady') : t('room.ready')}</span></button>
        )}
      </footer>
      {room.phase === 'roulette' ? <Roulette room={room} now={now} /> : null}
    </>
  );
}

function SlotCard({ sl, teams, host, open, onMenu, onClose }: { sl: RoomSlotView; teams: number; host: boolean; open: boolean; onMenu: () => void; onClose: () => void }) {
  const col = teams ? TEAM_COLORS[sl.team % 4] : undefined;
  const act = (a: 'open' | 'close' | 'bot' | 'kick'): void => { Audio.sfx('uiMove'); lobbyActions.slot(sl.slot, a); onClose(); };
  const canManage = host && !sl.you;
  const body = sl.state === 'human' || sl.state === 'bot' ? (
    <>
      <Portrait id={sl.loadout?.characterId ?? 'clay'} size={76} />
      <div class="sc-main">
        <div class="sc-name">{sl.host ? <Icon name="crown" size={15} class="crown" label={t('room.host')} /> : null}<span>{sl.name}</span>{sl.you ? <span class="badge coral">{t('room.you')}</span> : null}</div>
        <div class="sc-meta">
          {sl.state === 'bot' ? <span class="badge ai">AI · {t(`common.tier.${sl.tier ?? 'racer'}`)}</span> : <span class={`ping ${pingClass(sl.pingMs)}`}><i /><i /><i />{sl.pingMs !== undefined ? t('room.ping', { ms: sl.pingMs }) : ''}</span>}
          {sl.loadout ? <span class="sc-kart">{t(`karts.${sl.loadout.kartBodyId}.name`)}</span> : null}
        </div>
      </div>
      {sl.state === 'human' ? <span class={`sc-ready ${sl.host ? 'host' : sl.ready ? 'on' : ''}`}>{sl.host ? t('room.host') : sl.ready ? <><Icon name="check" size={14} />{t('room.ready')}</> : t('room.waiting')}</span> : null}
    </>
  ) : (
    <div class="sc-empty">{sl.state === 'closed' ? <><Icon name="lock" size={18} />{t('room.closed')}</> : <><Icon name="plus" size={18} />{t('room.open')}</>}</div>
  );
  return (
    <div class={`slot-card st-${sl.state} ${sl.you ? 'me' : ''}`} style={col ? { '--team': col } as Record<string, string> : undefined}>
      {col ? <i class="sc-team" aria-label={t(`room.team.${TEAM_KEYS[sl.team % 4]}`)} /> : null}
      <button type="button" class="sc-hit" disabled={!canManage} aria-label={t('room.slotMenu')} aria-expanded={open} onClick={onMenu}>{body}</button>
      {open && canManage ? (
        <div class="sc-menu card" role="menu" data-focus-scope>
          {sl.state === 'human' ? <button role="menuitem" type="button" onClick={() => act('kick')}><Icon name="door" size={16} />{t('room.kick')}</button> : null}
          {sl.state === 'bot' ? <button role="menuitem" type="button" onClick={() => act('open')}><Icon name="x" size={16} />{t('room.openSlot')}</button> : null}
          {sl.state === 'open' ? <><button role="menuitem" type="button" onClick={() => act('bot')}><Icon name="bot" size={16} />{t('room.addBot')}</button><button role="menuitem" type="button" onClick={() => act('close')}><Icon name="lock" size={16} />{t('room.closeSlot')}</button></> : null}
          {sl.state === 'closed' ? <button role="menuitem" type="button" onClick={() => act('open')}><Icon name="plus" size={16} />{t('room.openSlot')}</button> : null}
          {teams && (sl.state === 'human' || sl.state === 'bot') ? Array.from({ length: teams }, (_, k) => (
            <button key={k} role="menuitem" type="button" onClick={() => { lobbyActions.team(sl.slot, k); onClose(); }}><i class="team-dot" style={{ background: TEAM_COLORS[k] }} />{t(`room.team.${TEAM_KEYS[k]}`)}</button>
          )) : null}
          <button role="menuitem" type="button" class="quiet" onClick={onClose}>{t('common.close')}</button>
        </div>
      ) : null}
    </div>
  );
}

function Roulette({ room, now }: { room: RoomView; now: number }) {
  const rl = lobby.roulette.value;
  const left = secondsLeft(rl?.endsAt ?? room.endsAt, now);
  const [voted, setVoted] = useState<string | null>(null);
  const list = playableTracks(room.settings.mode);
  return (
    <div class="modal-scrim roulette" data-focus-scope>
      <div class="modal card roulette-card" role="dialog" aria-modal="true" aria-label={t('room.rouletteTitle')}>
        <header><h2 class="display">{t('room.rouletteTitle')}</h2><span class="num rl-left">{left}</span></header>
        <p>{t('room.rouletteVote', { s: left })}</p>
        <div class="rl-grid">
          {list.map((x) => {
            const v = rl?.votes[x.id] ?? 0;
            const info = trackInfo(x.id);
            return (
              <button key={x.id} type="button" class={`track-tile ${voted === x.id ? 'on' : ''}`} onClick={() => { Audio.sfx('uiOk'); setVoted(x.id); if (!mockLobby.value) lobbyActions.vote(x.id); }}>
                <TrackArt id={x.id} class="tt-art" />
                <span class="tt-name">{t(`tracks.${x.id}.name`)}</span>
                <span class="tt-meta">{info ? <Stars n={info.difficulty} /> : null}<b class="rl-votes">{t('room.votes', { n: v })}</b>{voted === x.id ? <span class="badge coral">{t('room.voted')}</span> : null}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
