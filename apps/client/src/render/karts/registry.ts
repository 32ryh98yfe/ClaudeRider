// Kart body registry (import.meta.glob, one file per kart). Missing ids fall back to Pebble + a dev warning.
import type { KartBodyDef } from './types.ts';
import { KART_BODY_IDS } from '@cr/content';

const mods = import.meta.glob<{ default: KartBodyDef }>('./defs/*.ts', { eager: true });
const byId = new Map<string, KartBodyDef>();
for (const m of Object.values(mods)) if (m.default?.id) byId.set(m.default.id, m.default);
const warned = new Set<string>();

export function getKartBody(id: string): KartBodyDef {
  const d = byId.get(id);
  if (d) return d;
  if (import.meta.env.DEV && !warned.has(id)) { warned.add(id); console.warn(`[karts] missing ${id}, using pebble`); }
  return byId.get('pebble') ?? [...byId.values()][0]!;
}
export function hasKartBody(id: string): boolean { return byId.has(id); }
/** All kart bodies in canonical id order (packages/content ids.ts). */
export function allKartBodies(): KartBodyDef[] {
  const order = KART_BODY_IDS as readonly string[];
  return [...byId.values()].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}
