// Menu toasts (outside the race HUD): saved, copied, errors, unlocks.
import { signal } from '@preact/signals';

export interface UiToast { id: number; text: string; kind: 'info' | 'good' | 'bad' }
export const uiToasts = signal<UiToast[]>([]);
let next = 1;

export function toast(text: string, kind: UiToast['kind'] = 'info', ms = 2600): void {
  const t = { id: next++, text, kind };
  uiToasts.value = [...uiToasts.value.slice(-2), t];
  setTimeout(() => { uiToasts.value = uiToasts.value.filter((x) => x.id !== t.id); }, ms);
}
