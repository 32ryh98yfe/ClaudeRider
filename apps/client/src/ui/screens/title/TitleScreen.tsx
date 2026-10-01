// Title: first gesture (audio unlock), wordmark over the 3D showcase, "press any key", disclaimer (ADR-011).
import { useEffect } from 'preact/hooks';
import { navigate } from '../../store/route.ts';
import { t } from '../../../i18n/index.ts';
import { onAnyKey, inputDevice } from '../../../input/keyboard.ts';
import { Stage } from '../../../game/Stage.ts';
import { save } from '../../../meta/save.ts';
import { Audio } from '../../../audio/engine.ts';
import { Logo } from '../../components/Logo.tsx';
import { ArtOverride } from '../../components/ArtOverride.tsx';
import './title.css';

const VERSION = '0.2.0';

export function TitleScreen() {
  useEffect(() => {
    const p = save.get().profile;
    Stage.showShowcase(p.characterId, p.kartBodyId);
    // centred, and a little low so the mascot's sparkle clears the tagline under the wordmark
    if (Stage.showcase) { Stage.showcase.offsetX = 0; Stage.showcase.offsetY = -0.05; }
    let gone = false;
    const go = (): void => {
      if (gone) return;
      gone = true;
      void Audio.unlock().then(() => { Audio.sfx('uiOk'); Audio.playLoop(96, 57, 'lobby'); });
      navigate('lobby');
    };
    const offKey = onAnyKey(go);
    const click = (): void => go();
    window.addEventListener('pointerdown', click, { once: true });
    return () => { offKey(); window.removeEventListener('pointerdown', click); if (Stage.showcase) Stage.showcase.offsetY = 0; };
  }, []);
  const pad = inputDevice.value === 'pad';
  return (
    <div class="screen title fade-in">
      <ArtOverride id="keyart.title" class="title-keyart" />
      <div class="title-vignette" />
      <div class="title-top">
        <Logo size={1} stacked />
        <div class="title-tag">{t('common.tagline')}</div>
      </div>
      <div class="title-press" role="button" tabIndex={-1}>
        <span class={`kbd ${pad ? 'pad' : ''}`}>{pad ? 'A' : 'Enter'}</span>
        <span>{pad ? t('common.pressAnyKeyPad') : t('common.pressAnyKey')}</span>
      </div>
      <footer class="title-foot">
        <div class="disclaimer">{t('common.disclaimer')}</div>
        <div class="title-ver num">v{VERSION}</div>
      </footer>
    </div>
  );
}
