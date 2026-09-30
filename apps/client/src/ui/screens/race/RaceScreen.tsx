import { useEffect, useRef, useState } from 'preact/hooks';
import type { AiTier, ModeId, TrackId } from '@cr/content';
import { route, navigate } from '../../store/route.ts';
import { t } from '../../../i18n/index.ts';
import { Stage } from '../../../game/Stage.ts';
import { Session } from '../../../game/Session.ts';
import { save } from '../../../meta/save.ts';
import { Hud } from '../../hud/Hud.tsx';
import { setLastResult } from '../results/lastResult.ts';

export function RaceScreen() {
  const [progress, setProgress] = useState({ p: 0, label: '' });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minimap, setMinimap] = useState<Float32Array | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const params = route.value.params ?? {};
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const prof = save.get().profile;
    Stage.enterRace();
    const s = new Session(Stage.renderer!, Stage.tier, {
      trackId: (params.track ?? 'meadow_loop') as TrackId, mode: (params.mode ?? 'speed') as ModeId, tier: (params.tier ?? 'racer') as AiTier,
      characterId: prof.characterId, kartBodyId: prof.kartBodyId, autopilot: q.get('autopilot') === '1', simRate: Number(q.get('simRate') ?? 1),
      ...(q.get('laps') ? { laps: Number(q.get('laps')) } : {}), ...(q.get('seed') ? { seed: Number(q.get('seed')) } : {}),
    });
    sessionRef.current = s;
    Stage.onResize = (w, h) => s.renderer?.resize(w, h);
    let cancelled = false;
    s.load((p, label) => setProgress({ p, label })).then(() => {
      if (cancelled) return;
      setMinimap(s.renderer ? s.renderer.minimap() : null);
      setReady(true);
      navigate('race', params);
      window.__cr = { ...window.__cr, race: 'running', session: s };
      s.onEnd((r) => { setLastResult(r, s.slotNames); window.__cr = { ...window.__cr, race: 'done', result: r }; s.stop(); Stage.leaveRace(); navigate('results'); });
      s.start();
    }).catch((e: unknown) => { console.error(e); setError(String((e as Error)?.message ?? e)); });
    return () => { cancelled = true; if (sessionRef.current && route.value.screen !== 'race') { /* ended normally */ } };
  }, []);
  if (error) return <div class="screen loading"><div class="load-card"><h1>⚠</h1><p>{error}</p><button class="btn" onClick={() => navigate('lobby')}>{t('common.back')}</button></div></div>;
  if (!ready) {
    const track = params.track ?? 'meadow_loop';
    return (
      <div class="screen loading fade-in">
        <div class="load-card">
          <div class="load-theme">{t(`common.modes.${params.mode ?? 'speed'}`)}</div>
          <h1>{t(`tracks.${track}.name`)}</h1>
          <div class="bar"><i style={{ transform: `scaleX(${progress.p})` }} /></div>
          <div class="load-label">{progress.label}</div>
        </div>
      </div>
    );
  }
  return <Hud minimap={minimap} />;
}
