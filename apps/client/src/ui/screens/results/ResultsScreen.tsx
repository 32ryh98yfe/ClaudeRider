import { useEffect } from 'preact/hooks';
import { navigate } from '../../store/route.ts';
import { t } from '../../../i18n/index.ts';
import { getLastResult } from './lastResult.ts';
import { fmt } from '../../../game/HudPresenter.ts';
import { Stage } from '../../../game/Stage.ts';
import { save } from '../../../meta/save.ts';
import { Audio } from '../../../audio/engine.ts';

export function ResultsScreen() {
  const last = getLastResult();
  useEffect(() => {
    const p = save.get().profile;
    Stage.showShowcase(p.characterId, p.kartBodyId);
    if (Stage.showcase) Stage.showcase.offsetX = -1;
    const me = last?.r.rows.find((r) => r.kind === 'human');
    if (me && me.rank <= 3) Stage.showcase?.emote();
    Audio.playLoop(100, 60, 'lobby');
  }, []);
  if (!last) return <div class="screen results"><button class="btn" onClick={() => navigate('lobby')}>{t('results.lobby')}</button></div>;
  const { r } = last;
  return (
    <div class="screen results fade-in" data-testid="results">
      <div class="res-card">
        <h1>{t('results.title')}</h1>
        <div class="res-sub">{t(`tracks.${r.trackId}.name`)} · {t(`common.modes.${r.mode}`)}</div>
        <table>
          <thead><tr><th>{t('results.rank')}</th><th>{t('results.racer')}</th><th>{t('results.time')}</th><th>{t('results.bestLap')}</th></tr></thead>
          <tbody>
            {r.rows.map((row) => (
              <tr key={row.slot} class={row.kind === 'human' ? 'me' : ''}>
                <td class="num rk">{row.rank}</td>
                <td>{row.kind === 'bot' ? <span class="ai">AI</span> : <span class="ai you">{t('results.you')}</span>} {row.name}</td>
                <td class="num">{row.finished ? fmt(row.raceTicks * (1000 / 60)) : <span class="ret">{t('results.retire')}</span>}</td>
                <td class="num">{row.bestLapTicks ? fmt(row.bestLapTicks * (1000 / 60)) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div class="res-actions">
          <button class="btn primary" data-testid="again" onClick={() => navigate('loading', { track: r.trackId, mode: r.mode, tier: 'racer' })}>{t('results.again')}</button>
          <button class="btn ghost" onClick={() => navigate('lobby')}>{t('results.lobby')}</button>
        </div>
      </div>
    </div>
  );
}
