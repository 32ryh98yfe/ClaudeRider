// Lobby hub (31-ui-spec §2.1): 3D showcase, hero mode card, Quick Race / Quick Match / Custom Room entry points,
// Racer Level (pass) and challenge widgets, tip line, disclaimer.
import { useEffect, useState } from 'preact/hooks';
import type { ModeId } from '@cr/content';
import { navigate } from '../../store/route.ts';
import { t, locale, setLocale } from '../../../i18n/index.ts';
import { Stage, stageInfo } from '../../../game/Stage.ts';
import { Audio } from '../../../audio/engine.ts';
import { lobby } from '../../../net/lobby.ts';
import { levelProgress, MAX_LEVEL } from '../../../meta/progression.ts';
import { nextUnlock } from '../../../meta/unlocks.ts';
import { toggleFullscreen, fullscreen } from '../../../input/fullscreen.ts';
import { saveState, raceSetup, setRaceSetup, refreshRotation } from '../../store/profile.ts';
import { loadTrackIndex, resolveTrack, trackInfo, bakedIndex } from '../../store/tracks.ts';
import { Logo } from '../../components/Logo.tsx';
import { Icon } from '../../icons/Icon.tsx';
import { ProfileChip, SparksChip, ItemIcon } from '../../components/common.tsx';
import { Seg, Stars, Bar, lapsText } from '../../components/controls.tsx';
import { TrackArt } from '../../components/TrackArt.tsx';
import { ChallengePanel } from '../../components/ChallengePanel.tsx';
import { Portrait } from '../../components/Portrait.tsx';
import './lobby.css';

const TIP_COUNT = 10;

export function LobbyScreen() {
  const s = saveState.value;
  const setup = raceSetup();
  const [tip, setTip] = useState(() => 1 + Math.floor(Math.random() * TIP_COUNT));
  void bakedIndex.value;
  useEffect(() => {
    const p = s.profile;
    Stage.showShowcase(p.characterId, p.kartBodyId);
    if (Stage.showcase) Stage.showcase.offsetX = -0.32;
    void loadTrackIndex();
    refreshRotation();
    const h = setInterval(() => setTip((x) => (x % TIP_COUNT) + 1), 9000);
    return () => clearInterval(h);
  }, []);
  const go = (fn: () => void) => () => { Audio.sfx('uiMove'); fn(); };
  const setMode = (m: ModeId): void => setRaceSetup({ mode: m });
  const trackId = setup.track === 'random' ? null : setup.track;
  const ti = trackId ? trackInfo(trackId) : undefined;
  const laps = setup.laps === 'auto' ? (ti?.laps ?? 3) : setup.laps;
  const quickRace = (): void => {
    void Audio.unlock();
    Audio.sfx('uiOk');
    const track = resolveTrack(setup.track, setup.mode);
    navigate('loading', { track, mode: setup.mode, tier: setup.tier, ...(setup.laps !== 'auto' ? { laps: String(setup.laps) } : {}) });
  };
  const lp = levelProgress(s.progress.xp);
  const next = nextUnlock(lp.level);
  const online = lobby.conn.value === 'online';
  return (
    <div class="screen lobby fade-in" data-testid="lobby">
      <div class="scrim-top" /><div class="scrim-bottom" /><div class="scrim-right" />
      <header class="lobby-top">
        <Logo size={0.42} />
        <ProfileChip onClick={go(() => navigate('garage'))} />
        <SparksChip />
        <div class="grow" />
        <span class={`conn-pill ${online ? 'on' : ''}`}><i />{online ? t('lobby.online') : t('lobby.offline')}</span>
        <button class="btn ghost icon" type="button" aria-label={t('lobby.fullscreen')} aria-pressed={fullscreen.value} onClick={go(toggleFullscreen)}><Icon name="fullscreen" /></button>
        <button class="btn ghost small lang-btn" type="button" data-testid="lang-toggle" aria-label={t('lobby.language')} onClick={go(() => setLocale(locale.value === 'ko' ? 'en' : 'ko'))}><Icon name="globe" size={16} />{locale.value === 'ko' ? 'EN' : '한국어'}</button>
        <button class="btn ghost icon" type="button" data-testid="open-settings" aria-label={t('lobby.settings')} onClick={go(() => navigate('settings', { from: 'lobby' }))}><Icon name="gear" /></button>
      </header>

      <aside class="lobby-left stagger">
        <section class="pass card" aria-label={t('lobby.pass.title')}>
          <div class="pass-lv"><span class="eyebrow">{t('lobby.pass.title')}</span><b class="num">{lp.level}</b></div>
          <div class="pass-body">
            <div class="pass-row"><Bar frac={lp.frac} /><span class="num pass-xp">{lp.level >= MAX_LEVEL ? 'MAX' : t('lobby.pass.progress', { into: Math.floor(lp.into), need: lp.need })}</span></div>
            {next ? (
              <div class="pass-next">
                <span class="pass-next-lbl">{t('lobby.pass.next', { n: next.level })}</span>
                {next.kind === 'character' ? <Portrait id={next.ref} size={26} /> : next.color ? <i class="swatch" style={{ background: next.color }} /> : <Icon name={next.kind === 'kart' ? 'kart' : 'star'} size={16} />}
                <b>{t(next.nameKey)}</b>
              </div>
            ) : <div class="pass-next"><b>{t('lobby.pass.max')}</b></div>}
          </div>
        </section>
        <ChallengePanel compact />
      </aside>

      <main class="lobby-right stagger">
        <section class={`hero-card mode-${setup.mode}`} aria-label={t('lobby.heroEyebrow')}>
          <div class="hero-art">
            <div class="hero-streaks" aria-hidden="true"><i /><i /><i /><i /><i /></div>
            <div class="hero-deco" aria-hidden="true">
              {setup.mode === 'item'
                ? <><ItemIcon id="token_bomb" class="hd-a" /><ItemIcon id="prompt_missile" class="hd-b" /><ItemIcon id="context_shield" class="hd-c" /></>
                : <><span class="hd-chev"><i /><i /><i /></span><ItemIcon id="booster" class="hd-b" /></>}
            </div>
            <div class="hero-head">
              <span class="eyebrow">{t('lobby.heroEyebrow')}</span>
              <Seg label={t('lobby.modeSelect.mode')} class="hero-seg" value={setup.mode} onChange={setMode}
                options={[{ value: 'speed' as ModeId, label: t('common.mode.speed') }, { value: 'item' as ModeId, label: t('common.mode.item') }]} />
            </div>
            <h2 class="hero-title display">{t(`common.mode.${setup.mode}`)}</h2>
            <p class="hero-desc">{t(`common.modeDesc.${setup.mode}`)}</p>
          </div>
          <div class="hero-info">
            <TrackArt id={trackId ?? 'random'} random={!trackId} class="hero-thumb" />
            <div class="hero-meta">
              <div class="hero-track">{trackId ? t(`tracks.${trackId}.name`) : t('lobby.randomTrack')}</div>
              <div class="hero-tags">
                {ti ? <Stars n={ti.difficulty} /> : null}
                <span class="badge">{lapsText(laps)}</span>
                <span class="badge ai">AI · {t(`common.tier.${setup.tier}`)}</span>
              </div>
            </div>
            <button class="btn small hero-change" type="button" data-testid="change-setup" onClick={go(() => navigate('modeSelect'))}>{t('lobby.changeSetup')}<Icon name="next" size={16} /></button>
          </div>
        </section>

        <div class="cta-stack">
          <button class="btn primary big cta-race" type="button" data-testid="quick-race" data-autofocus onClick={quickRace}>
            <Icon name="play" size={22} />
            <span class="cta-text"><span class="display cta-title">{t('lobby.quickRace')}</span><small>{t('lobby.quickRaceDesc')}</small></span>
          </button>
          <button class="btn dark big cta-match" type="button" data-testid="quick-match" onClick={go(() => navigate('queue', { mode: setup.mode, teams: 'solo' }))}>
            <Icon name="users" size={22} />
            <span class="cta-text"><span class="display cta-title">{t('lobby.quickMatch')}</span><small>{t('lobby.quickMatchDesc')}</small></span>
          </button>
        </div>

        <nav class="lobby-tiles" aria-label={t('lobby.vsAi')}>
          <button class="tile" type="button" data-testid="open-timeattack" onClick={go(() => navigate('timeAttack'))}><Icon name="timer" size={22} /><span>{t('lobby.timeAttack')}</span></button>
          <button class="tile" type="button" data-testid="open-room" onClick={go(() => navigate('room'))}><Icon name="hash" size={22} /><span>{t('lobby.customRoom')}</span></button>
          <button class="tile" type="button" data-testid="open-garage" onClick={go(() => navigate('garage'))}><Icon name="kart" size={22} /><span>{t('lobby.garage')}</span></button>
        </nav>
      </main>

      <footer class="lobby-foot">
        <div class="tip" key={tip}><b>{t('lobby.tipLabel')}</b>{t(`common.tip.${tip}`)}</div>
        <div class="disclaimer">{t('common.disclaimer')} · {stageInfo.value.backend.toUpperCase()}</div>
      </footer>
    </div>
  );
}
