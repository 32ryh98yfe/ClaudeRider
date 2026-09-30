// Typed identity helpers used by "one file per entry" registries (ADR-014).
import type { CharacterMeta, ChallengeDef, EffectDef, ItemDef, KartSpec, ThemeDataDef, TrackManifestEntry } from './schema/index.ts';
import { CHARACTER_IDS, EFFECT_IDS, ITEM_IDS, KART_BODY_IDS, THEME_IDS, TRACK_IDS, codeOf } from './ids.ts';

type NoCode<T> = Omit<T, 'code'>;
export const defineKart = (k: NoCode<KartSpec>): KartSpec => ({ ...k, code: codeOf(KART_BODY_IDS, k.id) });
export const defineItem = (d: NoCode<ItemDef>): ItemDef => ({ ...d, code: codeOf(ITEM_IDS, d.id) });
export const defineEffect = (d: NoCode<EffectDef>): EffectDef => ({ ...d, code: codeOf(EFFECT_IDS, d.id) });
export const defineCharacter = (d: NoCode<CharacterMeta>): CharacterMeta => ({ ...d, code: codeOf(CHARACTER_IDS, d.id) });
export const defineTheme = (d: NoCode<ThemeDataDef>): ThemeDataDef => ({ ...d, code: codeOf(THEME_IDS, d.id) });
export const defineTrack = (d: NoCode<TrackManifestEntry>): TrackManifestEntry => ({ ...d, code: codeOf(TRACK_IDS, d.id) });
export const defineChallenge = (d: ChallengeDef): ChallengeDef => d;
