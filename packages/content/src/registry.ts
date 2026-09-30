// FROZEN (contracts.lock). Registry construction + ContentTables loader.
import { ITEM_DEFS } from './generated/items.gen.ts';
import { EFFECT_DEFS } from './generated/effects.gen.ts';
import { KART_SPECS } from './generated/karts.gen.ts';
import { CHARACTER_METAS } from './generated/characters.gen.ts';
import { THEME_DATAS } from './generated/themes.gen.ts';
import { CHALLENGE_DEFS } from './generated/challenges.gen.ts';
import { TRACK_ENTRIES } from './generated/tracks.gen.ts';
import { DROP_SOLO, DROP_TEAM } from './droptables.ts';
import { MODE_RULES } from './modes.ts';
import { SURFACES, SURFACE_BY_CODE } from './surfaces.ts';
import type { CharacterMeta, ChallengeDef, DropTable, EffectDef, ItemDef, KartSpec, ModeRules, SurfaceDef, ThemeDataDef, TrackManifestEntry } from './schema/index.ts';

export interface Registry<T extends { id: string; code: number }> {
  readonly byId: ReadonlyMap<string, T>;
  readonly byCode: ReadonlyArray<T | undefined>;
  readonly all: readonly T[];
  get(id: string): T;
}

export function makeRegistry<T extends { id: string; code: number }>(name: string, entries: readonly T[]): Registry<T> {
  const byId = new Map<string, T>();
  const byCode: (T | undefined)[] = [];
  for (const e of entries) {
    if (byId.has(e.id)) throw new Error(`${name}: duplicate id ${e.id}`);
    if (byCode[e.code]) throw new Error(`${name}: duplicate code ${e.code} (${e.id})`);
    byId.set(e.id, e);
    byCode[e.code] = e;
  }
  const all = [...entries].sort((a, b) => a.code - b.code);
  return {
    byId, byCode, all,
    get(id: string): T {
      const v = byId.get(id);
      if (!v) throw new Error(`${name}: unknown id ${id}`);
      return v;
    },
  };
}

export interface ContentTables {
  items: Registry<ItemDef>;
  effects: Registry<EffectDef>;
  karts: Registry<KartSpec>;
  drop: { solo: DropTable; team: DropTable };
  tracks: Registry<TrackManifestEntry>;
  themes: Registry<ThemeDataDef>;
  characters: Registry<CharacterMeta>;
  challenges: readonly ChallengeDef[];
  modes: ModeRules;
  surfaces: readonly SurfaceDef[];
  surfaceByCode: readonly (SurfaceDef | undefined)[];
}

let cached: ContentTables | null = null;

/** Builds (once) and validates all content registries. */
export function loadContent(): ContentTables {
  if (cached) return cached;
  const t: ContentTables = {
    items: makeRegistry('items', ITEM_DEFS),
    effects: makeRegistry('effects', EFFECT_DEFS),
    karts: makeRegistry('karts', KART_SPECS),
    drop: { solo: DROP_SOLO, team: DROP_TEAM },
    tracks: makeRegistry('tracks', TRACK_ENTRIES),
    themes: makeRegistry('themes', THEME_DATAS),
    characters: makeRegistry('characters', CHARACTER_METAS),
    challenges: CHALLENGE_DEFS,
    modes: MODE_RULES,
    surfaces: SURFACES,
    surfaceByCode: SURFACE_BY_CODE,
  };
  for (const table of [t.drop.solo, t.drop.team]) {
    for (const [bucket, rows] of Object.entries(table.buckets)) {
      const sum = rows.reduce((a, r) => a + r[1], 0);
      if (sum !== 100) throw new Error(`drop table ${table.format}.${bucket} sums to ${sum}, expected 100`);
    }
  }
  cached = t;
  return t;
}
