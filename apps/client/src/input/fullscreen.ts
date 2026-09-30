// Fullscreen + Keyboard Lock (31-ui-spec §7.4): in fullscreen on Chromium, navigator.keyboard.lock() lets the game
// receive Ctrl+W / Ctrl+T / Ctrl+N and Esc (hold Esc to leave fullscreen). Elsewhere it is a no-op.
import { signal } from '@preact/signals';

export const fullscreen = signal(false);
export const keyboardLocked = signal(false);

interface KeyboardLockApi { lock(keys?: string[]): Promise<void>; unlock(): void }
const kbApi = (): KeyboardLockApi | undefined => (navigator as unknown as { keyboard?: KeyboardLockApi }).keyboard;

export function keyboardLockSupported(): boolean { return typeof kbApi()?.lock === 'function'; }

export async function enterFullscreen(): Promise<void> {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch { return; }
  try { await kbApi()?.lock?.(); keyboardLocked.value = keyboardLockSupported(); } catch { keyboardLocked.value = false; }
}

export async function exitFullscreen(): Promise<void> {
  try { kbApi()?.unlock?.(); } catch { /* ignore */ }
  keyboardLocked.value = false;
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
}

export function toggleFullscreen(): void { void (document.fullscreenElement ? exitFullscreen() : enterFullscreen()); }

export function installFullscreen(): void {
  document.addEventListener('fullscreenchange', () => {
    fullscreen.value = !!document.fullscreenElement;
    if (!document.fullscreenElement) { try { kbApi()?.unlock?.(); } catch { /* ignore */ } keyboardLocked.value = false; }
  });
}
