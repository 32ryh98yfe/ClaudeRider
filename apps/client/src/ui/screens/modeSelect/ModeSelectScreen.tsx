// Mode select (31-ui-spec §2.1): mode cards with focus/unfocus states, format toggle, AI tier, laps and track pick.
import { useEffect, useState } from 'preact/hooks';
import type { AiTier, ModeId, TrackId } from '@cr/content';
import { navigate } from '../../store/route.ts';
import { t } from '../../../i18n/index.ts';
import { Audio } from '../../../audio/engine.ts';
import { Stage } from '../../../game/Stage.ts';
import { useBack } from '../../hooks.ts';
import { raceSetup, setRaceSetup, saveState } from '../../store/profile.ts';
import { bakedIndex, loadTrackIndex, playableTracks, resolveTrack, trackInfos } from '../../store/tracks.ts';
import { ScreenHead, NavHints } from '../../components/common.tsx';
import { Seg, Stars } from '../../components/controls.tsx';
import { TrackArt } from '../../components/TrackArt.tsx';
import { Icon } from '../../icons/Icon.tsx';
import './modeSelect.css';

type Card = 'speed' | 'item' | 'timeAttack' | 'custom';
const CARDS: readonly Card[] = ['speed', 'item', 'timeAttack', 'custom'];
const CARD_ICON: Record<Card, string> = { speed: 'bolt', item: 'star', timeAttack: 'timer', custom: 'hash' };
const TIERS: readonly AiTier[] = ['rookie', 'racer', 'pro', 'legend'];

export function ModeSelectScreen() {
  void saveState.value; void bakedIndex.value;
  const setup = raceSetup();
  const [hover, setHover] = useState<Card | null>(null);
  useBack(() => navigate('lobby'));
  useEffect(() => { void loadTrackIndex(); if (Stage.showcase) Stage.showcase.offsetX = 0.9; }, []);
  const pick = (c: Card): void => {
    Audio.sfx('uiMove');
    if (c === 'timeAttack') navigate('timeAttack');
    else if (c === 'custom') navigate('room');
    else setRaceSetup({ mode: c as ModeId });
  };
  const playable = new Set(playableTracks(setup.mode).map((x) => x.id));
  const roster = trackInfos().filter((x) => x.onRoster || x.baked);
  const start = (): void => {
    void Audio.unlock(); Audio.sfx('uiOk');
    const track = resolveTrack(setup.track, setup.mode);
    navigate('loading', { track, mode: setup.mode, tier: setup.tier, ...(setup.laps !== 'auto' ? { laps: String(setup.laps) } : {}) });
  };
  const focus = hover ?? (setup.mode as Card);
  return (
    <div class="screen mode-select fade-in">
      <div class="ms-scrim" />
      <ScreenHead title={t('lobby.modeSelect.title')} sub={t('lobby.modeSelect.sub')} onBack={() => navigate('lobby')} />
      <div class="ms-body">
        <div class="ms-cards" role="radiogroup" aria-label={t('lobby.modeSelect.mode')}>
          {CARDS.map((c) => {
            const sel = c === setup.mode;
            return (
              <button key={c} type="button" role="radio" aria-checked={sel ? 'true' : 'false'} class={`mode-card mc-${c} ${sel ? 'sel' : ''} ${focus === c ? 'focus' : 'unfocus'}`}
                onClick={() => pick(c)} onMouseEnter={() => setHover(c)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(c)} onBlur={() => setHover(null)}>
                <span class="mc-art" aria-hidden="true"><i /><i /><i /><Icon name={CARD_ICON[c]} size={72} class="mc-glyph" /></span>
                <span class="mc-text">
                  <span class="mc-title display">{t(`common.mode.${c}`)}</span>
                  <span class="mc-desc">{t(`common.modeDesc.${c}`)}</span>
                </span>
                {c === 'timeAttack' || c === 'custom' ? <span class="mc-go">{t(c === 'timeAttack' ? 'lobby.modeSelect.goTimeAttack' : 'lobby.modeSelect.goCustom')}<Icon name="next" size={14} /></span> : sel ? <span class="mc-check"><Icon name="check" size={16} /></span> : null}
              </button>
            );
          })}
        </div>

        <div class="ms-options">
          <section class="card ms-rules">
            <div class="opt">
              <h3 class="eyebrow">{t('lobby.modeSelect.format')}</h3>
              <Seg label={t('lobby.modeSelect.format')} value="solo" onChange={() => undefined}
                options={[{ value: 'solo', label: t('common.format.solo') }, { value: 'duo', label: t('common.format.duo'), disabled: true, title: t('lobby.modeSelect.teamOffline') }, { value: 'squad', label: t('common.format.squad'), disabled: true, title: t('lobby.modeSelect.teamOffline') }]} />
              <p class="opt-note">{t('lobby.modeSelect.teamOffline')}</p>
            </div>
            <div class="opt">
              <h3 class="eyebrow">{t('lobby.modeSelect.tier')}</h3>
              <div class="tier-grid" role="radiogroup" aria-label={t('lobby.modeSelect.tier')}>
                {TIERS.map((x, i) => (
                  <button key={x} type="button" role="radio" aria-checked={setup.tier === x ? 'true' : 'false'} class={`tier ${setup.tier === x ? 'on' : ''}`} onClick={() => { Audio.sfx('uiMove'); setRaceSetup({ tier: x }); }}>
                    <span class="tier-top"><b>{t(`common.tier.${x}`)}</b><span class="tier-pips" aria-hidden="true">{[0, 1, 2, 3].map((k) => <i key={k} class={k <= i ? 'on' : ''} />)}</span></span>
                    <small>{t(`common.tierDesc.${x}`)}</small>
                  </button>
                ))}
              </div>
            </div>
            <div class="opt">
              <h3 class="eyebrow">{t('lobby.modeSelect.laps')}</h3>
              <Seg label={t('lobby.modeSelect.laps')} value={setup.laps === 'auto' ? 0 : setup.laps} onChange={(v) => setRaceSetup({ laps: v === 0 ? 'auto' : v })}
                options={[{ value: 0, label: t('lobby.modeSelect.auto') }, ...[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))]} />
            </div>
          </section>

          <section class="card ms-tracks">
            <header class="ms-tracks-head"><h3 class="eyebrow">{t('lobby.modeSelect.track')}</h3><span class="opt-note">{t('lobby.modeSelect.trackCount', { n: playable.size })}</span></header>
            <div class="track-grid">
              <button type="button" class={`track-tile ${setup.track === 'random' ? 'on' : ''}`} onClick={() => { Audio.sfx('uiMove'); setRaceSetup({ track: 'random' }); }}>
                <TrackArt id="random" random class="tt-art" />
                <span class="tt-name"><Icon name="shuffle" size={14} />{t('lobby.randomTrack')}</span>
                <span class="tt-meta">{t('lobby.modeSelect.randomDesc')}</span>
              </button>
              {roster.map((x) => {
                const ok = playable.has(x.id);
                return (
                  <button key={x.id} type="button" disabled={!ok} class={`track-tile ${setup.track === x.id ? 'on' : ''} ${ok ? '' : 'soon'}`} onClick={() => { Audio.sfx('uiMove'); setRaceSetup({ track: x.id as TrackId }); }}>
                    <TrackArt id={x.id} class="tt-art" />
                    <span class="tt-name">{t(`tracks.${x.id}.name`)}</span>
                    <span class="tt-meta">{ok ? <><Stars n={x.difficulty} /> · {t('common.laps', { n: x.laps })}</> : <span class="badge lock"><Icon name="lock" size={11} />{t('common.soon')}</span>}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
      <footer class="ms-foot">
        <NavHints items={[{ key: 'Esc', pad: 'B', label: t('common.back') }, { key: 'Enter', pad: 'A', label: t('common.select') }]} />
        <button class="btn primary big ms-start" type="button" data-autofocus onClick={start}><Icon name="play" size={20} /><span class="display">{t('lobby.start')}</span></button>
      </footer>
    </div>
  );
}
