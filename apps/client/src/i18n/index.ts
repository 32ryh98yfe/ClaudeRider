// FROZEN (contracts.lock). i18n: Korean default, English secondary. Namespaced files i18n/<locale>/<ns>.ts.
import { signal, type Signal } from '@preact/signals';

export type Locale = 'ko' | 'en';
type Dict = { [k: string]: string | Dict };

const koMods = import.meta.glob<{ default: Dict }>('./ko/*.ts', { eager: true });
const enMods = import.meta.glob<{ default: Dict }>('./en/*.ts', { eager: true });

function load(mods: Record<string, { default: Dict }>): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (prefix: string, d: Dict): void => {
    for (const [k, v] of Object.entries(d)) { const key = prefix ? `${prefix}.${k}` : k; if (typeof v === 'string') out.set(key, v); else walk(key, v); }
  };
  for (const [path, m] of Object.entries(mods)) walk(path.replace(/^.*\/(.+)\.ts$/, '$1'), m.default);
  return out;
}
const TABLES: Record<Locale, Map<string, string>> = { ko: load(koMods), en: load(enMods) };

const saved = ((): Locale => { try { const l = localStorage.getItem('cr.locale'); return l === 'en' ? 'en' : 'ko'; } catch { return 'ko'; } })();
export const locale: Signal<Locale> = signal<Locale>(saved);
export function setLocale(l: Locale): void {
  locale.value = l;
  try { localStorage.setItem('cr.locale', l); } catch { /* private mode */ }
  document.documentElement.lang = l;
}

const warned = new Set<string>();
/** Translate a key. Reading `locale.value` subscribes Preact components to locale changes. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const l = locale.value;
  let s = TABLES[l].get(key) ?? TABLES.ko.get(key);
  if (s === undefined) {
    if (import.meta.env.DEV && !warned.has(key)) { warned.add(key); console.warn(`[i18n] missing key ${key}`); }
    s = key;
  }
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, v: string) => String(vars[v] ?? `{${v}}`));
  return s;
}
export function hasKey(key: string): boolean { return TABLES.ko.has(key); }
export function allKeys(l: Locale): string[] { return [...TABLES[l].keys()]; }

/** Korean particle selection by final consonant (받침). */
export function josa(word: string, pair: '이/가' | '을/를' | '은/는' | '와/과' | '으로/로'): string {
  const c = word.charCodeAt(word.length - 1);
  const [withB, noB] = pair.split('/') as [string, string];
  if (c < 0xac00 || c > 0xd7a3) return word + noB;
  const jong = (c - 0xac00) % 28;
  if (pair === '으로/로') return word + (jong === 0 || jong === 8 ? noB : withB);
  return word + (jong ? withB : noB);
}
