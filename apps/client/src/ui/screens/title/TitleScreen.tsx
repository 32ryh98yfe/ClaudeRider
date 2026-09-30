import { useEffect } from 'preact/hooks';
import { navigate } from '../../store/route.ts';
import { t } from '../../../i18n/index.ts';
import { onAnyKey } from '../../../input/keyboard.ts';
import { Stage } from '../../../game/Stage.ts';
import { save } from '../../../meta/save.ts';
import { Audio } from '../../../audio/engine.ts';
import { Logo } from '../../components/Logo.tsx';

export function TitleScreen() {
  useEffect(() => {
    const p = save.get().profile;
    Stage.showShowcase(p.characterId, p.kartBodyId);
    if (Stage.showcase) Stage.showcase.offsetX = 0;
    const go = (): void => { void Audio.unlock().then(() => { Audio.sfx('uiOk'); Audio.playLoop(96, 57, 'lobby'); }); navigate('lobby'); };
    const offKey = onAnyKey(go);
    const click = (): void => go();
    window.addEventListener('pointerdown', click, { once: true });
    return () => { offKey(); window.removeEventListener('pointerdown', click); };
  }, []);
  return (
    <div class="screen title fade-in">
      <div class="title-top"><Logo size={1} /></div>
      <div class="title-press">{t('common.pressAnyKey')}</div>
      <div class="disclaimer">{t('common.disclaimer')}</div>
    </div>
  );
}
