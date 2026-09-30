// Kart body registry (import.meta.glob). Missing ids fall back to Pebble.
import type { KartBodyDef } from './types.ts';

const mods = import.meta.glob<{ default: KartBodyDef }>('./defs/*.ts', { eager: true });
const byId = new Map<string, KartBodyDef>();
for (const m of Object.values(mods)) byId.set(m.default.id, m.default);

export function getKartBody(id: string): KartBodyDef {
  const d = byId.get(id);
  if (d) return d;
  if (import.meta.env.DEV) console.warn(`[karts] missing ${id}, using pebble`);
  return byId.get('pebble')!;
}
