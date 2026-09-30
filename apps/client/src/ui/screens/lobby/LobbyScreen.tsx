import { useEffect, useState } from 'preact/hooks';
import type { AiTier, ModeId, TrackId } from '@cr/content';
import { navigate } from '../../store/route.ts';
import { t, locale, setLocale } from '../../../i18n/index.ts';
import { Stage, stageInfo } from '../../../game/Stage.ts';
import { save } from '../../../meta/save.ts';
import { Audio } from '../../../audio/engine.ts';
import { Logo } from '../../components/Logo.tsx';

interface TrackIndex { [id: string]: { lapLength: number; laps: number; theme: string } }
const TIPS = ['drift', 'instant', 'start', 'boost', 'draft'];

export function LobbyScreen() {
  const [tracks, setTracks] = useState<TrackIndex>({});
  const [track, setTrack] = useState<TrackId>((localStorage.getItem('cr.lastTrack') as TrackId) || 'meadow_loop');
  const [mode, setMode] = useState<ModeId>('speed');
  const [tier, setTier] = useState<AiTier>('racer');
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]!);
  const p = save.get().profile;
  useEffect(() => {
    Stage.showShowcase(p.characterId, p.kartBodyId);
    if (Stage.showcase) Stage.showcase.offsetX = -0.9;
    fetch('tracks/index.json').then((r) => r.json()).then((j: TrackIndex) => { setTracks(j); if (!j[track]) setTrack(Object.keys(j)[0] as TrackId); }).catch(() => setTracks({}));
  }, []);
  const ids = Object.keys(tracks).sort((a, b) => (a === 'proving_ring' ? 1 : b === 'proving_ring' ? -1 : a.localeCompare(b))) as TrackId[];
  const start = (): void => {
    void Audio.unlock();
    Audio.sfx('uiOk');
    localStorage.setItem('cr.lastTrack', track);
    navigate('loading', { track, mode, tier });
  };
  const click = (fn: () => void) => () => { Audio.sfx('uiMove'); fn(); };
  return (
    <div class="screen lobby fade-in">
      <header class="lobby-top">
        <Logo size={0.55} />
        <div class="profile"><span class="lv num">Lv.{save.get().progress.level}</span><span class="nm">{p.name}</span></div>
        <div class="grow" />
        <button class="btn ghost small" onClick={click(() => setLocale(locale.value === 'ko' ? 'en' : 'ko'))}>{locale.value === 'ko' ? 'EN' : '한국어'}</button>
      </header>
      <aside class="lobby-panel">
        <h2>{t('lobby.selectMode')}</h2>
        <div class="seg">
          {(['speed', 'item'] as ModeId[]).map((m) => <button key={m} class={`chip ${mode === m ? 'on' : ''}`} onClick={click(() => setMode(m))}>{t(`common.modes.${m}`)}</button>)}
        </div>
        <h2>{t('lobby.selectTrack')}</h2>
        <div class="tracklist">
          {ids.map((id) => (
            <button key={id} class={`trackcard ${track === id ? 'on' : ''}`} onClick={click(() => setTrack(id))}>
              <span class="tn">{t(`tracks.${id}.name`)}</span>
              <span class="tm">{t(`themes.${tracks[id]!.theme}.name`)} · {Math.round(tracks[id]!.lapLength)} m · {tracks[id]!.laps} {t('common.lapUnit')}</span>
            </button>
          ))}
        </div>
        <h2>{t('lobby.difficulty')}</h2>
        <div class="seg">
          {(['rookie', 'racer', 'pro', 'legend'] as AiTier[]).map((x) => <button key={x} class={`chip ${tier === x ? 'on' : ''}`} onClick={click(() => setTier(x))}>{t(`common.tiers.${x}`)}</button>)}
        </div>
        <button class="btn primary go" onClick={start} data-testid="quick-race">{t('lobby.quickRace')}<small>{t('lobby.quickRaceDesc')}</small></button>
      </aside>
      <footer class="lobby-foot">
        <div class="tip"><b>{t('lobby.tip')}</b> {t(`lobby.tips.${tip}`)}</div>
        <div class="disclaimer">{t('common.disclaimer')} · {stageInfo.value.backend.toUpperCase()}</div>
      </footer>
    </div>
  );
}
