// Daily / weekly challenge list with progress and the reset countdown (13-modes-rules §11).
import { useState } from 'preact/hooks';
import { t } from '../../i18n/index.ts';
import { challengeDef, msUntilReset } from '../../meta/challenges.ts';
import { saveState, refreshRotation } from '../store/profile.ts';
import { fmtDuration, useNow } from '../hooks.ts';
import { Icon, SparkGlyph } from '../icons/Icon.tsx';
import { Seg, Bar } from './controls.tsx';

const fmtNum = (n: number): string => (n >= 1000 ? n.toLocaleString() : String(Math.floor(n)));

export function ChallengePanel({ compact }: { compact?: boolean }) {
  const [scope, setScope] = useState<'daily' | 'weekly'>('daily');
  const now = useNow(1000);
  const s = saveState.value;
  const list = s.challenges[scope];
  const left = msUntilReset(scope, new Date(now));
  if (left < 1500) setTimeout(refreshRotation, 1600);
  const allDone = list.length > 0 && list.every((c) => c.done);
  return (
    <section class={`challenges card ${compact ? 'compact' : ''}`} aria-label={t('lobby.challenges')}>
      <header class="ch-head">
        <Seg label={t('lobby.challenges')} value={scope} onChange={setScope} options={[{ value: 'daily', label: t('lobby.dailyTab') }, { value: 'weekly', label: t('lobby.weeklyTab') }]} />
        <span class="ch-reset"><Icon name="clock" size={14} />{t('lobby.resetsIn', { time: fmtDuration(left) })}</span>
      </header>
      {allDone ? <p class="ch-done">{t('lobby.allDone')}</p> : null}
      <ul class="ch-list">
        {list.map((c) => {
          const def = challengeDef(c.id);
          if (!def) return null;
          const frac = c.progress / def.target;
          return (
            <li key={c.id} class={c.done ? 'done' : ''}>
              <span class="ch-check" aria-hidden="true">{c.done ? <Icon name="check" size={14} /> : null}</span>
              <div class="ch-body">
                <div class="ch-name">{t(def.nameKey)}</div>
                <div class="ch-row"><Bar frac={frac} done={c.done} /><span class="ch-count num">{fmtNum(c.progress)}/{fmtNum(def.target)}</span></div>
              </div>
              <span class="ch-reward"><b class="num">+{def.reward.xp}</b><small>XP</small><SparkGlyph size={13} /><b class="num">{def.reward.sparks}</b></span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
