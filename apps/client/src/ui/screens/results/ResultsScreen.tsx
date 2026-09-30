// Results (13-modes-rules §8): banner, 8-row table (rank, mascot, name, kart, time/RETIRE, best lap, team points),
// rewards panel (XP bar with level-up flash, Sparks, challenge progress, mission, unlocks, PB), buttons, 12 s timer.
import { useEffect, useState } from 'preact/hooks';
import { navigate } from '../../store/route.ts';
import { t, locale } from '../../../i18n/index.ts';
import { getLastResult } from './lastResult.ts';
import { fmt } from '../../../game/HudPresenter.ts';
import { Stage } from '../../../game/Stage.ts';
import { save } from '../../../meta/save.ts';
import { Audio } from '../../../audio/engine.ts';
import { levelProgress, cumulativeXp, xpToNext } from '../../../meta/progression.ts';
import { challengeDef } from '../../../meta/challenges.ts';
import { fmtTicks, fmtDelta, medalFor } from '../../../meta/medals.ts';
import { lobby } from '../../../net/lobby.ts';
import { useBack, useNow } from '../../hooks.ts';
import { trackInfo, refLapTicks } from '../../store/tracks.ts';
import { Portrait } from '../../components/Portrait.tsx';
import { Icon, SparkGlyph } from '../../icons/Icon.tsx';
import { MedalBadge } from '../timeAttack/TimeAttackScreen.tsx';
import './results.css';

const RESULTS_SEC = 12;
const ordinalEn = (n: number): string => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!); };

function XpBar({ before, after }: { before: number; after: number }) {
  const lb = levelProgress(before), la = levelProgress(after);
  const [stage, setStage] = useState<{ level: number; frac: number; flash: boolean }>({ level: lb.level, frac: lb.frac, flash: false });
  useEffect(() => {
    const hs: ReturnType<typeof setTimeout>[] = [];
    if (la.level > lb.level) {
      hs.push(setTimeout(() => setStage({ level: lb.level, frac: 1, flash: false }), 350));
      hs.push(setTimeout(() => { setStage({ level: la.level, frac: 0, flash: true }); Audio.sfx('finish'); }, 1300));
      hs.push(setTimeout(() => setStage({ level: la.level, frac: la.frac, flash: false }), 1750));
    } else hs.push(setTimeout(() => setStage({ level: la.level, frac: la.frac, flash: false }), 350));
    return () => hs.forEach(clearTimeout);
  }, [before, after]);
  const need = xpToNext(stage.level);
  const into = Math.max(0, Math.min(need, after - cumulativeXp(stage.level)));
  return (
    <div class={`xp-bar ${stage.flash ? 'flash' : ''}`}>
      <span class="xp-lv num">{t('common.level', { n: stage.level })}</span>
      <div class="bar"><i style={{ transform: `scaleX(${stage.frac})`, transitionDuration: stage.frac === 0 ? '0ms' : '900ms' }} /></div>
      <span class="xp-num num">{Number.isFinite(need) ? `${Math.floor(into)}/${need}` : 'MAX'}</span>
    </div>
  );
}

export function ResultsScreen() {
  const last = getLastResult();
  void locale.value;
  const now = useNow(250);
  const [t0] = useState(() => Date.now());
  const online = !!last?.online || lobby.room.value !== null;
  const toLobby = (): void => { Audio.sfx('uiMove'); navigate(last?.r.mode === 'timeAttack' ? 'timeAttack' : 'lobby'); };
  useBack(toLobby);
  useEffect(() => {
    const p = save.get().profile;
    Stage.showShowcase(p.characterId, p.kartBodyId);
    if (Stage.showcase) Stage.showcase.offsetX = -1.05;
    const me = last?.r.rows.find((r) => r.kind === 'human');
    // per-result emote (30-art-bible §8): win / podium / lose / retire
    if (me) Stage.showcase?.emote(!me.finished ? 'retire' : me.rank === 1 ? 'win' : me.rank <= 3 ? 'podium' : 'lose');
    Audio.playLoop(100, 60, 'lobby');
  }, []);
  const left = Math.max(0, RESULTS_SEC - Math.floor((now - t0) / 1000));
  useEffect(() => { if (online && left === 0) navigate(lobby.room.value ? 'room' : 'queue'); }, [left === 0]);
  if (!last) {
    return <div class="screen results fade-in" data-testid="results"><div class="res-empty card"><p>{t('results.noResult')}</p><button class="btn primary" type="button" onClick={toLobby}>{t('results.toLobby')}</button></div></div>;
  }
  const { r, report, summary } = last;
  const me = r.rows.find((x) => x.kind === 'human');
  const ta = r.mode === 'timeAttack';
  const team = last.teams && last.teams !== 'solo';
  const rankText = !me ? '' : !me.finished ? t('results.bannerRetire') : locale.value === 'en' ? `${ordinalEn(me.rank)}!` : t('results.bannerRank', { rank: me.rank });
  const info = trackInfo(r.trackId);
  const medal = ta && info && me?.finished ? medalFor(Math.round(me.raceTicks), refLapTicks(info) * info.laps) : null;
  const again = (): void => { Audio.sfx('uiOk'); navigate('loading', { ...(last.again ?? { track: r.trackId, mode: r.mode, tier: 'racer' }), nonce: String(Date.now()) }); };
  return (
    <div class="screen results fade-in" data-testid="results">
      <div class="res-scrim" />
      <section class="res-left">
        <div class="res-banner">
          <span class="eyebrow">{t(`tracks.${r.trackId}.name`)} · {t(`common.mode.${r.mode}`)}</span>
          {team && me ? <h1 class={`display res-rank ${r.winnerTeam === me.team ? 'win' : 'lose'}`}>{r.winnerTeam === me.team ? t('results.win') : t('results.lose')}</h1>
            : ta && me?.finished ? <h1 class="num res-time">{fmtTicks(Math.round(me.raceTicks))}</h1>
              : <h1 class={`display res-rank ${me && me.finished && me.rank <= 3 ? `p${me.rank}` : ''}`}>{rankText}</h1>}
          <div class="res-badges">
            {report?.pb.race || (ta && report && report.pb.prevRace === null && me?.finished) ? <span class="badge new"><Icon name="star" size={12} />{report?.pb.race ? t('results.personalBest') : t('results.firstRecord')}</span> : null}
            {report?.pb.race && report.pb.prevRace && me ? <span class="badge">{t('results.deltaPb', { d: fmtDelta(Math.round(me.raceTicks) - report.pb.prevRace) })}</span> : null}
            {medal ? <span class="badge"><MedalBadge m={medal} size={14} />{t('results.medal', { medal: t(`lobby.ta.${medal}`) })}</span> : null}
            {report?.ghostBeaten ? <span class="badge coral"><Icon name="ghost" size={12} />{t('results.ghostBeaten')}</span> : null}
          </div>
        </div>
        {report ? (
          <div class="res-rewards card">
            <header><h2>{t('results.rewards')}</h2>{report.levelAfter > report.levelBefore ? <span class="badge new lvup">{t('results.levelUp', { n: report.levelAfter })}</span> : null}</header>
            <XpBar before={report.xpBefore} after={report.xpAfter} />
            <div class="rw-lines">
              <div class="rw-line"><span>{t('results.breakdown.race')}</span><b class="num">+{report.xpBase} XP</b><b class="num sp"><SparkGlyph size={13} />+{report.sparksBase}</b></div>
              {report.xpChallenges ? <div class="rw-line"><span>{t('results.breakdown.challenges')}</span><b class="num">+{report.xpChallenges} XP</b><b class="num sp"><SparkGlyph size={13} />+{report.sparksChallenges}</b></div> : null}
              {report.mid ? <div class={`rw-line ${report.mid.done ? '' : 'muted'}`}><span>{t('results.breakdown.mission')} · {report.mid.done ? t('results.missionDone') : t('results.missionFail')}</span><b class="num">+{report.xpMid} XP</b><b class="num sp"><SparkGlyph size={13} />+{report.sparksMid}</b></div> : null}
              {report.sparksLevelUp ? <div class="rw-line"><span>{t('results.breakdown.levelUp')}</span><b class="num" /><b class="num sp"><SparkGlyph size={13} />+{report.sparksLevelUp}</b></div> : null}
            </div>
            {report.challenges.length ? (
              <div class="rw-ch">
                <span class="eyebrow">{t('results.challenge')}</span>
                {report.challenges.slice(0, 3).map((c) => {
                  const def = challengeDef(c.id);
                  return (
                    <div key={c.id} class={`rw-ch-row ${c.justDone ? 'done' : ''}`}>
                      <span class="rw-ch-tick">{c.justDone ? <Icon name="check" size={12} /> : null}</span>
                      <span class="rw-ch-name">{def ? t(def.nameKey) : c.id}</span>
                      <span class="num">{c.justDone ? t('results.complete') : t('results.progress', { a: Math.floor(c.after), b: c.target })}</span>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {report.unlocked.length ? <div class="rw-unlocks">{report.unlocked.slice(0, 3).map((u) => <span key={u.id} class="badge coral"><Icon name="lock" size={11} />{t('results.unlocked', { name: t(u.nameKey) })}</span>)}</div> : null}
          </div>
        ) : null}
      </section>
      <section class="res-right">
        <div class="res-table card">
          <table>
            <thead><tr><th class="c-rk">{t('results.pos')}</th><th>{t('results.racer')}</th><th class="c-kart">{t('results.kart')}</th><th class="c-t">{t('results.time')}</th><th class="c-t">{t('results.bestLap')}</th>{team ? <th class="c-pt">{t('results.points')}</th> : null}</tr></thead>
            <tbody>
              {r.rows.map((row, i) => {
                const look = last.slots?.[row.slot];
                return (
                  <tr key={row.slot} class={`${row.kind === 'human' ? 'me' : ''} ${!row.finished ? 'ret' : ''}`} style={{ animationDelay: `${i * 60}ms` }}>
                    <td class="c-rk num">{row.rank}</td>
                    <td class="c-name"><span class="cn">{look ? <Portrait id={look.characterId} size={30} /> : null}<span class="cn-text">{row.name}</span>{row.kind === 'bot' ? <span class="badge ai">AI</span> : <span class="badge coral">{t('results.you')}</span>}</span></td>
                    <td class="c-kart">{look ? t(`karts.${look.kartBodyId}.name`) : ''}</td>
                    <td class="c-t num">{row.finished ? fmt(row.raceTicks * (1000 / 60)) : <span class="ret-tag">{t('results.retired')}</span>}</td>
                    <td class="c-t num">{row.bestLapTicks ? fmt(row.bestLapTicks * (1000 / 60)) : '—'}</td>
                    {team ? <td class="c-pt num">{row.points}</td> : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {summary?.mode === 'item' && me ? <p class="res-attacks">{t('results.attacks', { landed: summary.stats.attacksLanded, blocked: summary.stats.attacksBlocked })}</p> : null}
        </div>
        <div class="res-actions">
          {online ? <span class="res-timer num">{t('results.autoReturn', { s: left })}</span> : null}
          {online ? (
            <>
              <button class="btn quiet" type="button" onClick={() => navigate('lobby')}>{t('results.leave')}</button>
              <button class="btn primary big" type="button" data-testid="again" data-autofocus onClick={() => navigate(lobby.room.value ? 'room' : 'queue')}>{lobby.room.value ? t('results.toRoom') : t('lobby.queue.searchAgain')}</button>
            </>
          ) : (
            <>
              <button class="btn big" type="button" onClick={toLobby}><Icon name="home" size={18} />{ta ? t('lobby.ta.title') : t('results.toLobby')}</button>
              <button class="btn primary big" type="button" data-testid="again" data-autofocus onClick={again}><Icon name="refresh" size={18} />{t('results.again')}</button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
