// Time Attack track select (31-ui-spec §2.1, 13-modes-rules §4): track grid with PB lap / race and medals,
// ghost toggle, Pro-ghost toggle (P1), start.
import { useEffect, useState } from 'preact/hooks';
import type { TrackId } from '@cr/content';
import { navigate } from '../../store/route.ts';
import { t, locale } from '../../../i18n/index.ts';
import { Audio } from '../../../audio/engine.ts';
import { Stage } from '../../../game/Stage.ts';
import { save } from '../../../meta/save.ts';
import { medalFor, medalTimes, fmtTicks, type Medal } from '../../../meta/medals.ts';
import { useBack } from '../../hooks.ts';
import { saveState } from '../../store/profile.ts';
import { bakedIndex, loadTrackIndex, refLapTicks, trackInfos, type TrackInfo } from '../../store/tracks.ts';
import { ScreenHead, keyText, NavHints } from '../../components/common.tsx';
import { Toggle, Stars, lapsText } from '../../components/controls.tsx';
import { TrackArt } from '../../components/TrackArt.tsx';
import { Icon } from '../../icons/Icon.tsx';
import './timeAttack.css';

export function MedalBadge({ m, size = 22 }: { m: Medal | null; size?: number }) {
  if (!m) return null;
  return <span class={`medal medal-${m}`} style={{ width: `${size}px`, height: `${size}px` }} title={t(`lobby.ta.${m}`)} aria-label={t(`lobby.ta.${m}`)} />;
}

export function TimeAttackScreen() {
  const s = saveState.value;
  void bakedIndex.value; void locale.value;
  useBack(() => navigate('lobby'));
  useEffect(() => { void loadTrackIndex(); if (Stage.showcase) Stage.showcase.offsetX = 0.9; }, []);
  const list = trackInfos().filter((x) => x.onRoster || x.baked).sort((a, b) => Number(b.baked) - Number(a.baked));
  const [sel, setSel] = useState<TrackId>((s.profile.lastRace?.track !== 'random' ? s.profile.lastRace?.track : undefined) ?? 'meadow_loop');
  const cur: TrackInfo | undefined = list.find((x) => x.id === sel && x.baked) ?? list.find((x) => x.baked);
  const rec = cur ? s.records[cur.id] : undefined;
  const refRace = cur ? refLapTicks(cur) * cur.laps : 0;
  const mt = medalTimes(refRace);
  const pbRace = rec?.bestRaceTicks?.timeAttack;
  const start = (): void => {
    if (!cur) return;
    void Audio.unlock(); Audio.sfx('uiOk');
    navigate('loading', { track: cur.id, mode: 'timeAttack', tier: 'pro', ta: '1' });
  };
  return (
    <div class="screen time-attack fade-in">
      <div class="ta-scrim" />
      <ScreenHead title={t('lobby.ta.title')} sub={t('lobby.ta.sub')} onBack={() => navigate('lobby')} />
      <div class="ta-body">
        <section class="ta-list card" aria-label={t('lobby.ta.trackList')}>
          {list.map((x) => {
            const r = s.records[x.id];
            const pb = r?.bestRaceTicks?.timeAttack;
            const medal = medalFor(pb, refLapTicks(x) * x.laps);
            return (
              <button key={x.id} type="button" disabled={!x.baked} class={`ta-row ${cur?.id === x.id ? 'sel' : ''} ${x.baked ? '' : 'soon'}`} onClick={() => { Audio.sfx('uiMove'); setSel(x.id); }}>
                <TrackArt id={x.id} class="ta-thumb" />
                <span class="ta-row-main">
                  <span class="ta-row-name">{t(`tracks.${x.id}.name`)}</span>
                  <span class="ta-row-meta">{x.baked ? <><Stars n={x.difficulty} /><span>{lapsText(x.laps)}</span></> : <span class="badge lock"><Icon name="lock" size={11} />{t('lobby.ta.unavailable')}</span>}</span>
                </span>
                <span class="ta-row-pb num">{x.baked ? fmtTicks(pb) : ''}</span>
                <MedalBadge m={medal} />
              </button>
            );
          })}
        </section>
        {cur ? (
          <section class="ta-detail card" aria-label={t(`tracks.${cur.id}.name`)}>
            <TrackArt id={cur.id} class="ta-hero" />
            <div class="ta-detail-head">
              <h2 class="display">{t(`tracks.${cur.id}.name`)}</h2>
              <div class="ta-tags"><span class="badge">{t(`themes.${cur.themeId}.name`)}</span><Stars n={cur.difficulty} /><span class="badge">{lapsText(cur.laps)}</span></div>
            </div>
            <div class="ta-records">
              <div><span class="eyebrow">{t('lobby.ta.pbRace')}</span><b class="num">{fmtTicks(pbRace)}</b><MedalBadge m={medalFor(pbRace, refRace)} size={20} /></div>
              <div><span class="eyebrow">{t('lobby.ta.pbLap')}</span><b class="num">{fmtTicks(rec?.bestLapTicks)}</b></div>
              <div><span class="eyebrow">{t('lobby.ta.runsLabel')}</span><b class="num">{rec?.runs ?? 0}</b></div>
            </div>
            <div class="ta-medals">
              <span class="eyebrow">{t('lobby.ta.medals')}</span>
              {(['gold', 'silver', 'bronze'] as const).map((m) => (
                <div key={m} class={`ta-medal-row ${pbRace && pbRace <= mt[m] ? 'got' : ''}`}><MedalBadge m={m} size={18} /><span>{t(`lobby.ta.${m}`)}</span><b class="num">{fmtTicks(mt[m])}</b></div>
              ))}
            </div>
            <div class="ta-toggles">
              <div class="ta-toggle"><span><b>{t('lobby.ta.ghost')}</b><small>{rec?.ghostKey ? t('lobby.ta.ghostDesc') : t('lobby.ta.noGhost')}</small></span>
                <Toggle label={t('lobby.ta.ghost')} on={s.settings.ghost !== false} onChange={(v) => save.update((d) => { d.settings.ghost = v; })} /></div>
              <div class="ta-toggle disabled"><span><b>{t('lobby.ta.proGhost')}</b><small>{t('lobby.ta.proGhostDesc')}</small></span>
                <button type="button" class="switch" role="switch" aria-checked="false" aria-label={t('lobby.ta.proGhost')} disabled /></div>
            </div>
            <div class="grow" />
            <p class="ta-hint"><Icon name="refresh" size={14} />{t('lobby.ta.restartHint', { key: keyText('restart') })}</p>
            <button class="btn primary big ta-start" type="button" data-testid="ta-start" data-autofocus onClick={start}><Icon name="timer" size={20} /><span class="display">{t('lobby.ta.start')}</span></button>
          </section>
        ) : null}
      </div>
      <footer class="ta-foot"><NavHints items={[{ key: 'Esc', pad: 'B', label: t('common.back') }, { key: 'Enter', pad: 'A', label: t('common.select') }]} /></footer>
    </div>
  );
}
