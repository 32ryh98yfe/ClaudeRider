// SFX registry (import.meta.glob, one SfxDef per file in ./defs). Unknown ids are ignored with a dev warning.
import type { SfxDef } from '../api.ts';

const mods = import.meta.glob<{ default: SfxDef }>('./defs/*.ts', { eager: true });
const byId = new Map<string, SfxDef>();
for (const m of Object.values(mods)) byId.set(m.default.id, m.default);

export function sfxDef(id: string): SfxDef | undefined { return byId.get(id); }
export function sfxIds(): string[] { return [...byId.keys()].sort(); }
export function allSfx(): SfxDef[] { return [...byId.values()]; }
