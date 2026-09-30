// Big slanted banners (FINAL LAP, FINISH, PERFECT START) — one at a time.
import { signal } from '@preact/signals';

export interface Banner { id: number; text: string; kind: 'good' | 'final' | 'finish' | 'bad' | 'info'; until: number }
const cur = signal<Banner | null>(null);
let id = 1;

export const banner = {
  state: cur,
  show(text: string, kind: Banner['kind'] = 'info', ms = 1600): void {
    const b = { id: id++, text, kind, until: performance.now() + ms };
    cur.value = b;
    setTimeout(() => { if (cur.value?.id === b.id) cur.value = null; }, ms);
  },
};
