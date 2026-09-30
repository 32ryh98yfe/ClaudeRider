// Character registry (import.meta.glob, one file per character). Missing ids render a visible placeholder (a grey Clawd
// with a "?" sparkle tint) and log a dev warning once — never a crash (CLAUDE.md rule 7).
import type { CharacterDef } from '../mascot/rig.ts';
import { CHARACTER_IDS } from '@cr/content';

const mods = import.meta.glob<{ default: CharacterDef }>('./defs/*.ts', { eager: true });
const byId = new Map<string, CharacterDef>();
for (const m of Object.values(mods)) if (m.default?.id) byId.set(m.default.id, m.default);
const warned = new Set<string>();

/** Placeholder: the base rig in neutral grey so a missing definition is obvious but harmless. */
export const PLACEHOLDER_CHARACTER: CharacterDef = {
  id: 'placeholder',
  palette: { body: '#9A9894', shade: '#7E7C78', accent: '#D97757', detail: '#FAF9F5', eye: '#141413' },
  eyeStyle: 'slot',
  sparkle: { color: 'accent' },
  accessories: [],
};

export function getCharacter(id: string): CharacterDef {
  const d = byId.get(id);
  if (d) return d;
  if (import.meta.env.DEV && !warned.has(id)) { warned.add(id); console.warn(`[characters] missing ${id}, using placeholder`); }
  return PLACEHOLDER_CHARACTER;
}
export function hasCharacter(id: string): boolean { return byId.has(id); }
/** All characters in canonical id order (packages/content ids.ts). */
export function allCharacters(): CharacterDef[] {
  const order = CHARACTER_IDS as readonly string[];
  return [...byId.values()].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}
