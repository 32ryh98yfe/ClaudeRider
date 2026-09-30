// App shell: routes screens over the shared 3D stage.
import { useEffect, useState } from 'preact/hooks';
import { route } from './ui/store/route.ts';
import { TitleScreen } from './ui/screens/title/TitleScreen.tsx';
import { LobbyScreen } from './ui/screens/lobby/LobbyScreen.tsx';
import { RaceScreen } from './ui/screens/race/RaceScreen.tsx';
import { ResultsScreen } from './ui/screens/results/ResultsScreen.tsx';
import { stageInfo } from './game/Stage.ts';
import { locale } from './i18n/index.ts';

export function App() {
  void locale.value; // re-render on language change
  const r = route.value;
  const [debug] = useState(() => new URLSearchParams(location.search).has('debug'));
  useEffect(() => { document.body.dataset.screen = r.screen; }, [r.screen]);
  return (
    <>
      {r.screen === 'title' && <TitleScreen />}
      {r.screen === 'lobby' && <LobbyScreen />}
      {(r.screen === 'loading' || r.screen === 'race') && <RaceScreen />}
      {r.screen === 'results' && <ResultsScreen />}
      {debug && <div class="debug-chip">{stageInfo.value.backend} · {stageInfo.value.tier} · {stageInfo.value.fps} fps</div>}
    </>
  );
}
