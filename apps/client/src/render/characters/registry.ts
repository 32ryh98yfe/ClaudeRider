// Character registry (import.meta.glob, one file per character). Missing ids fall back to Clay + dev warning.
import type { CharacterDef } from '../mascot/rig.ts';

const mods = import.meta.glob<{ default: CharacterDef }>('./defs/*.ts', { eager: true });
const byId = new Map<string, CharacterDef>();
for (const m of Object.values(mods)) byId.set(m.default.id, m.default);

export function getCharacter(id: string): CharacterDef {
  const d = byId.get(id);
  if (d) return d;
  if (import.meta.env.DEV) console.warn(`[characters] missing ${id}, using clay`);
  return byId.get('clay')!;
}
export function allCharacters(): CharacterDef[] { return [...byId.values()]; }
