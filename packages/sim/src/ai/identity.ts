// Bot identities (14-ai §9): names, characters and karts for the slots the room host fills with bots.
// Names are "{prefix}-{NN} {colour}"; the wire carries the English form ("Spark-07 Coral") and every viewer
// renders it in their own locale ("스파크-07 코랄", Korean first). Pure functions of the room seed.
import type { AiTier, CharacterId, ContentTables, KartBodyId } from '@cr/content';
import { CHARACTER_IDS } from '@cr/content';
import type { SlotConfig } from '../core/state.ts';
import { AI_TIERS } from './api.ts';
import { mixSeed } from './rng.ts';

export type BotLocale = 'ko' | 'en';

export const BOT_NAME_PREFIXES: ReadonlyArray<Readonly<Record<BotLocale, string>>> = [
  { en: 'Spark', ko: '스파크' }, { en: 'Byte', ko: '바이트' }, { en: 'Token', ko: '토큰' }, { en: 'Prompt', ko: '프롬프트' },
  { en: 'Echo', ko: '에코' }, { en: 'Delta', ko: '델타' }, { en: 'Vector', ko: '벡터' }, { en: 'Tensor', ko: '텐서' },
  { en: 'Kernel', ko: '커널' }, { en: 'Cache', ko: '캐시' }, { en: 'Logit', ko: '로짓' }, { en: 'Relay', ko: '릴레이' },
  { en: 'Quanta', ko: '퀀타' }, { en: 'Syntax', ko: '신택스' }, { en: 'Parser', ko: '파서' }, { en: 'Module', ko: '모듈' },
];

export const BOT_NAME_COLOURS: ReadonlyArray<Readonly<Record<BotLocale, string>>> = [
  { en: 'Coral', ko: '코랄' }, { en: 'Ivory', ko: '아이보리' }, { en: 'Sage', ko: '세이지' }, { en: 'Sky', ko: '스카이' },
  { en: 'Clay', ko: '클레이' }, { en: 'Amber', ko: '앰버' }, { en: 'Slate', ko: '슬레이트' }, { en: 'Teal', ko: '틸' },
  { en: 'Rose', ko: '로즈' }, { en: 'Lime', ko: '라임' }, { en: 'Plum', ko: '플럼' }, { en: 'Sand', ko: '샌드' },
];

export interface BotName { prefix: number; nn: number; colour: number }

/** Name parts from hash32(roomSeed, slot, attempt) (14-ai §9). */
export function botNameParts(roomSeed: number, slot: number, attempt = 0): BotName {
  const h = mixSeed(roomSeed, slot, attempt, 0x4e414d45);
  return { prefix: h % BOT_NAME_PREFIXES.length, nn: 1 + ((h >>> 8) % 99), colour: (h >>> 16) % BOT_NAME_COLOURS.length };
}

export function formatBotName(n: Readonly<BotName>, locale: BotLocale = 'en'): string {
  const p = BOT_NAME_PREFIXES[n.prefix] ?? BOT_NAME_PREFIXES[0]!, c = BOT_NAME_COLOURS[n.colour] ?? BOT_NAME_COLOURS[0]!;
  return `${p[locale]}-${String(n.nn).padStart(2, '0')} ${c[locale]}`;
}

/** Parses a wire (English) bot name back into its parts; null for anything else (a human's name). */
export function parseBotName(name: string): BotName | null {
  const m = /^([A-Za-z]+)-(\d{2}) ([A-Za-z]+)$/.exec(name);
  if (!m) return null;
  const prefix = BOT_NAME_PREFIXES.findIndex((p) => p.en === m[1]);
  const colour = BOT_NAME_COLOURS.findIndex((c) => c.en === m[3]);
  const nn = Number(m[2]);
  if (prefix < 0 || colour < 0 || nn < 1 || nn > 99) return null;
  return { prefix, nn, colour };
}

/** Renders a slot name for the viewer's locale: bot names are translated, human names pass through. */
export function localizeBotName(name: string, locale: BotLocale): string {
  const p = parseBotName(name);
  return p ? formatBotName(p, locale) : name;
}

export interface BotFillOptions {
  roomSeed: number;
  /** Tier for every bot, or one per slot index. */
  tier: AiTier | ReadonlyArray<AiTier>;
  /** Names already taken in the room (humans, earlier bots). */
  takenNames?: readonly string[];
}

/**
 * Fills every `kind: 'bot'` slot (and nothing else) with a unique name, a character not used by another
 * bot and — while possible — not by a human, the character's preferred kart archetype, tier and vMul.
 * Human and empty slots are returned unchanged. Deterministic in `roomSeed`.
 */
export function fillBotSlots(content: ContentTables, slots: readonly SlotConfig[], o: BotFillOptions): SlotConfig[] {
  const taken = new Set<string>(o.takenNames ?? []);
  for (const s of slots) if (s.kind === 'human') taken.add(s.name);
  const humanChars = new Set<CharacterId>(slots.filter((s) => s.kind === 'human').map((s) => s.characterId));
  // seeded order over the roster: characters humans did not pick first
  const order = [...CHARACTER_IDS].sort((a, b) => mixSeed(o.roomSeed, charCode(a)) - mixSeed(o.roomSeed, charCode(b)));
  const pool = [...order.filter((c) => !humanChars.has(c)), ...order.filter((c) => humanChars.has(c))];
  const usedChars = new Set<CharacterId>();
  const karts = content.karts.all;
  return slots.map((s, slot) => {
    if (s.kind !== 'bot') return s;
    let attempt = 0, name = formatBotName(botNameParts(o.roomSeed, slot, attempt));
    while (taken.has(name) && attempt < 64) name = formatBotName(botNameParts(o.roomSeed, slot, ++attempt));
    taken.add(name);
    const characterId = pool.find((c) => !usedChars.has(c)) ?? pool[slot % pool.length]!;
    usedChars.add(characterId);
    const tier = typeof o.tier === 'string' ? o.tier : (o.tier[slot] ?? 'racer');
    const style = content.characters.byId.get(characterId)?.personality.driftStyle ?? 'chain';
    // long drift style → drift or balance body; chain → balance or speed (bots ignore unlocks)
    const wanted = style === 'long' ? ['drift', 'balance'] : ['balance', 'speed'];
    const fits = karts.filter((kb) => wanted.includes(kb.archetype));
    const pick = fits.length ? fits[mixSeed(o.roomSeed, slot, 0x4b415254) % fits.length]! : karts[slot % karts.length]!;
    return { ...s, name, characterId, kartBodyId: pick.id as KartBodyId, ai: tier, vMul: AI_TIERS[tier].vMul };
  });
}

function charCode(c: CharacterId): number { let h = 0; for (let i = 0; i < c.length; i++) h = (h * 31 + c.charCodeAt(i)) | 0; return h; }
