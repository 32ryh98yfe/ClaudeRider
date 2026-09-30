// App shell: routes screens over the shared 3D stage, applies settings, wires menu navigation and hotkeys.
import { useEffect, useState } from 'preact/hooks';
import { route, navigate, type Screen } from './ui/store/route.ts';
import { TitleScreen } from './ui/screens/title/TitleScreen.tsx';
import { LobbyScreen } from './ui/screens/lobby/LobbyScreen.tsx';
import { ModeSelectScreen } from './ui/screens/modeSelect/ModeSelectScreen.tsx';
import { GarageScreen } from './ui/screens/garage/GarageScreen.tsx';
import { SettingsScreen } from './ui/screens/settings/SettingsScreen.tsx';
import { TimeAttackScreen } from './ui/screens/timeAttack/TimeAttackScreen.tsx';
import { QueueScreen } from './ui/screens/queue/QueueScreen.tsx';
import { RoomScreen } from './ui/screens/room/RoomScreen.tsx';
import { RaceScreen } from './ui/screens/race/RaceScreen.tsx';
import { ResultsScreen } from './ui/screens/results/ResultsScreen.tsx';
import { UiToasts } from './ui/components/common.tsx';
import { Stage, stageInfo } from './game/Stage.ts';
import { save } from './meta/save.ts';
import { locale, setLocale } from './i18n/index.ts';
import { saveState, refreshRotation } from './ui/store/profile.ts';
import { applySettings, wireGlobalHotkeys } from './ui/applySettings.ts';
import { installMenuNav } from './input/menuNav.ts';
import { installFullscreen } from './input/fullscreen.ts';
import { inputDevice } from './input/keyboard.ts';
import { applyDemo } from './ui/dev/demo.ts';
import { HudDemo } from './ui/dev/HudDemo.tsx';

const MENU_SCREENS: readonly Screen[] = ['lobby', 'modeSelect', 'queue', 'room', 'garage', 'settings', 'timeAttack', 'results'];

let booted = false;
function bootOnce(): void {
  if (booted) return;
  booted = true;
  installMenuNav();
  installFullscreen();
  wireGlobalHotkeys();
  refreshRotation();
  const q = new URLSearchParams(location.search);
  const lang = q.get('lang');
  if (lang === 'ko' || lang === 'en') setLocale(lang);
  // deep links (31-ui-spec §2.2): ?screen=garage, ?demo=results|hud, ?mock=room|queue|stage
  applyDemo(q);
  const sc = q.get('screen') as Screen | null;
  if (sc && MENU_SCREENS.includes(sc) && route.value.screen === 'title') {
    const p = save.get().profile;
    Stage.showShowcase(p.characterId, p.kartBodyId);
    navigate(sc, Object.fromEntries(q.entries()));
  }
}

export function App() {
  bootOnce();
  void locale.value; // re-render on language change
  const r = route.value;
  const [debug] = useState(() => new URLSearchParams(location.search).has('debug'));
  const [hudDemo] = useState(() => new URLSearchParams(location.search).get('demo') === 'hud');
  const s = saveState.value;
  useEffect(() => { document.body.dataset.screen = r.screen; }, [r.screen]);
  useEffect(() => { applySettings(s); }, [s.settings]);
  useEffect(() => { document.documentElement.classList.toggle('pad-nav', inputDevice.value === 'pad'); }, [inputDevice.value]);
  // Low tier: no backdrop blur (it re-blurs the 3D frame behind every glass panel, costly on weak GPUs and SwiftShader)
  useEffect(() => { document.documentElement.classList.toggle('q-low', stageInfo.value.tier === 'low'); }, [stageInfo.value.tier]);
  if (hudDemo) return <><HudDemo />{debug && <div class="debug-chip">{stageInfo.value.backend}</div>}</>;
  return (
    <>
      {r.screen === 'title' && <TitleScreen />}
      {r.screen === 'lobby' && <LobbyScreen />}
      {r.screen === 'modeSelect' && <ModeSelectScreen />}
      {r.screen === 'garage' && <GarageScreen />}
      {r.screen === 'settings' && <SettingsScreen />}
      {r.screen === 'timeAttack' && <TimeAttackScreen />}
      {r.screen === 'queue' && <QueueScreen />}
      {r.screen === 'room' && <RoomScreen />}
      {(r.screen === 'loading' || r.screen === 'race') && <RaceScreen key={r.params?.['nonce'] ?? 'race'} />}
      {r.screen === 'results' && <ResultsScreen />}
      <UiToasts />
      {debug && <div class="debug-chip">{stageInfo.value.backend} · {stageInfo.value.tier} · {stageInfo.value.fps} fps</div>}
    </>
  );
}
