// Applies accessibility/HUD settings to the document (CSS variables and classes) and wires global hotkeys:
// F7 music, F8 SFX, F11 fullscreen, mute-when-unfocused (31-ui-spec §7.1, §8, §9).
import { save, type SaveV1 } from '../meta/save.ts';
import { Audio } from '../audio/engine.ts';
import { onUiAction } from '../input/keyboard.ts';
import { toggleFullscreen } from '../input/fullscreen.ts';
import { t } from '../i18n/index.ts';
import { toast } from './store/uiToast.ts';

export function applySettings(s: Readonly<SaveV1>): void {
  const st = s.settings, root = document.documentElement;
  root.style.setProperty('--text-scale', String(st.textScale ?? 1));
  root.style.setProperty('--hud-scale', String(st.hudScale ?? 1));
  const rm = st.reducedMotion || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  root.classList.toggle('rm', !!rm);
  root.classList.toggle('hc', !!st.highContrast);
  root.classList.toggle('cb', !!st.colorBlind);
}

let lastMusic = 0.55, lastSfx = 0.8;
let wired = false;
export function wireGlobalHotkeys(): void {
  if (wired) return;
  wired = true;
  onUiAction('music', () => {
    const v = save.get().settings.volume.music;
    if (v > 0) lastMusic = v;
    save.update((s) => { s.settings.volume.music = v > 0 ? 0 : lastMusic || 0.55; });
    toast(`${t('settings.volume.music')} · ${save.get().settings.volume.music > 0 ? t('common.on') : t('common.off')}`);
  });
  onUiAction('sfx', () => {
    const v = save.get().settings.volume.sfx;
    if (v > 0) lastSfx = v;
    save.update((s) => { s.settings.volume.sfx = v > 0 ? 0 : lastSfx || 0.8; });
    toast(`${t('settings.volume.sfx')} · ${save.get().settings.volume.sfx > 0 ? t('common.on') : t('common.off')}`);
  });
  onUiAction('fullscreen', () => toggleFullscreen());
  const setMuted = (m: boolean): void => {
    const ctx = Audio.ctx;
    if (!ctx) return;
    if (m && ctx.state === 'running') void ctx.suspend().catch(() => undefined);
    if (!m && ctx.state === 'suspended' && Audio.unlocked) void ctx.resume().catch(() => undefined);
  };
  window.addEventListener('blur', () => { if (save.get().settings.muteUnfocused) setMuted(true); });
  window.addEventListener('focus', () => setMuted(false));
  document.addEventListener('visibilitychange', () => { if (document.hidden && save.get().settings.muteUnfocused) setMuted(true); else if (!document.hidden) setMuted(false); });
}
