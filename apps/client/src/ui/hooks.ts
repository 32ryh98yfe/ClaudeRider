// Small UI hooks: back handling (Esc / pad B), tab cycling (LB/RB), a ticking clock, first-focus on pad/keyboard use.
import { useEffect, useRef, useState } from 'preact/hooks';
import { pushBack, pushTabs } from '../input/menuNav.ts';

/** Registers `fn` as the back action while the component is mounted (topmost mounted wins). */
export function useBack(fn: () => void): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => pushBack(() => ref.current()), []);
}

/** LB/RB (PageUp/PageDown) cycle through `ids`, calling `set`. */
export function useTabs<T extends string>(ids: readonly T[], cur: T, set: (t: T) => void): void {
  const ref = useRef({ ids, cur, set });
  ref.current = { ids, cur, set };
  useEffect(() => pushTabs((d) => {
    const { ids: list, cur: c, set: s } = ref.current;
    const i = list.indexOf(c);
    s(list[(i + d + list.length) % list.length]!);
  }), []);
}

/** Re-renders every `ms` and returns Date.now(). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const h = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(h); }, [ms]);
  return now;
}

/** Formats a duration in ms as h:mm:ss / m:ss. */
export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(ss)}` : `${m}:${p(ss)}`;
}
