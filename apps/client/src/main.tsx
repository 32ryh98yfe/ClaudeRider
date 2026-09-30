// Boot: fonts → i18n → 3D stage (renderer w/ backend fallback) → UI.
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import '@fontsource/barlow-condensed/700-italic.css';
import '@fontsource/barlow-condensed/800-italic.css';
import '@fontsource/barlow-condensed/900-italic.css';
import '@fontsource/black-han-sans/400.css';
import './ui/styles/global.css';
import './ui/screens/screens.css';
import { render } from 'preact';
import { App } from './App.tsx';
import { Stage } from './game/Stage.ts';
import { installKeyboard } from './input/keyboard.ts';
import { locale } from './i18n/index.ts';

declare global { interface Window { __cr?: Record<string, unknown> } }

async function boot(): Promise<void> {
  document.documentElement.lang = locale.value;
  installKeyboard();
  window.__cr = { ...window.__cr, booting: true };
  try {
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]);
  } catch { /* fonts optional */ }
  try {
    await Stage.init(document.getElementById('stage')!);
  } catch (e) {
    console.error('[boot] renderer init failed', e);
    document.getElementById('app')!.innerHTML = `<div class="fatal">3D 렌더러를 시작할 수 없습니다 / Unable to start the 3D renderer.<br><small>${String((e as Error)?.message ?? e)}</small></div>`;
    return;
  }
  render(<App />, document.getElementById('app')!);
  window.__cr = { ...window.__cr, booting: false, ready: true };
}
void boot();
