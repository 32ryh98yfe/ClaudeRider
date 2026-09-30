// Lobby input validation (20-netcode-spec §11, 13-modes-rules §7.4): names, chat, loadouts, settings, room codes.
// Everything a client sends is untrusted; invalid fields fall back to safe defaults instead of throwing.
import { AI_TIERS } from '@cr/sim';
import { CHARACTER_IDS, KART_BODY_IDS, type AiTier, type ModeId, type TeamFormat, type TrackId } from '@cr/content';
import { defaultRoomSettings, type Loadout, type RoomSettings } from '@cr/net';

// A deliberately small list (Korean + English); matching ignores spacing and case.
const BLOCKED = ['fuck', 'shit', 'bitch', 'cunt', 'nigger', 'faggot', '씨발', '시발', '병신', '개새', '좆', '존나', '썅'];
const squash = (s: string): string => s.toLowerCase().replace(/[\s._\-*]/g, '');

export function hasProfanity(s: string): boolean { const q = squash(s); return BLOCKED.some((w) => q.includes(w)); }

/** Masks blocked words with asterisks. */
export function filterChat(s: string): string {
  let out = s;
  for (const w of BLOCKED) out = out.replace(new RegExp(w.split('').map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s._\\-*]*'), 'gi'), (m) => '*'.repeat(m.length));
  return out;
}

// control, zero-width and bidi-override characters (written as escapes so the source stays plain ASCII)
const CONTROL = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u2064\\ufeff]', 'g');

/** 1–16 visible characters, no control/bidi characters, not profane. Returns null when invalid. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(CONTROL, '').trim().replace(/\s+/g, ' ');
  const n = [...s].length;
  if (n < 1 || n > 16 || hasProfanity(s)) return null;
  return s;
}

/** Chat text: ≤ 200 characters, control characters removed, profanity masked. Empty → null. */
export function cleanChat(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = [...raw.replace(CONTROL, '').trim()].slice(0, 200).join('');
  return s ? filterChat(s) : null;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
export function cleanLoadout(raw: unknown): Loadout {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const lv = (o['livery'] && typeof o['livery'] === 'object' ? o['livery'] : {}) as Record<string, unknown>;
  const characterId = (CHARACTER_IDS as readonly string[]).includes(o['characterId'] as string) ? (o['characterId'] as Loadout['characterId']) : 'clay';
  const kartBodyId = (KART_BODY_IDS as readonly string[]).includes(o['kartBodyId'] as string) ? (o['kartBodyId'] as Loadout['kartBodyId']) : 'pebble';
  const int = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : d);
  return {
    characterId, kartBodyId,
    livery: {
      primary: typeof lv['primary'] === 'string' && HEX.test(lv['primary']) ? lv['primary'] : '#d97757',
      secondary: typeof lv['secondary'] === 'string' && HEX.test(lv['secondary']) ? lv['secondary'] : '#faf9f5',
      pattern: int(lv['pattern'], 0, 31, 0),
      number: int(lv['number'], 0, 99, 0),
    },
  };
}

const MODES: readonly ModeId[] = ['speed', 'item', 'infinite'];
const TEAMS: readonly TeamFormat[] = ['solo', 'duo', 'squad'];
const TIERS = Object.keys(AI_TIERS) as AiTier[];

/** Merges an untrusted partial into `base`, keeping only valid values. */
export function mergeSettings(base: RoomSettings, raw: unknown, tracks: readonly TrackId[]): RoomSettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const s: RoomSettings = { ...base };
  if (MODES.includes(o['mode'] as ModeId)) s.mode = o['mode'] as ModeId;
  if (TEAMS.includes(o['teams'] as TeamFormat)) s.teams = o['teams'] as TeamFormat;
  if (o['track'] === 'roulette' || tracks.includes(o['track'] as TrackId)) s.track = o['track'] as RoomSettings['track'];
  if (o['laps'] === 'default' || (typeof o['laps'] === 'number' && Number.isInteger(o['laps']) && o['laps'] >= 1 && o['laps'] <= 5)) s.laps = o['laps'] as RoomSettings['laps'];
  if (typeof o['fillBots'] === 'boolean') s.fillBots = o['fillBots'];
  if (TIERS.includes(o['botTier'] as AiTier)) s.botTier = o['botTier'] as AiTier;
  if (typeof o['isPrivate'] === 'boolean') s.isPrivate = o['isPrivate'];
  if (typeof o['maxHumans'] === 'number' && Number.isInteger(o['maxHumans']) && o['maxHumans'] >= 2 && o['maxHumans'] <= 8) s.maxHumans = o['maxHumans'];
  if ([5, 10, 15, 20].includes(o['retireSec'] as number)) s.retireSec = o['retireSec'] as RoomSettings['retireSec'];
  if (['standard', 'light', 'chaos'].includes(o['itemSet'] as string)) s.itemSet = o['itemSet'] as RoomSettings['itemSet'];
  if (['off', 'area', 'all'].includes(o['friendlyFire'] as string)) s.friendlyFire = o['friendlyFire'] as RoomSettings['friendlyFire'];
  if (typeof o['rubberBand'] === 'boolean') s.rubberBand = o['rubberBand'];
  if (typeof o['instantBoostInItem'] === 'boolean') s.instantBoostInItem = o['instantBoostInItem'];
  return s;
}

export const cleanSettings = (raw: unknown, tracks: readonly TrackId[]): RoomSettings => mergeSettings(defaultRoomSettings(), raw, tracks);

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Normalizes user input to a code; O/I/0/1 are never valid, so typos fail fast. */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toUpperCase();
  if (s.length !== 6) return null;
  for (const c of s) if (!CODE_ALPHABET.includes(c)) return null;
  return s;
}

/** A fresh 6-character code from crypto randomness (32 symbols → 30 bits). */
export function randomCode(rand: (n: number) => Uint8Array): string {
  const b = rand(6);
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[b[i]! & 31];
  return s;
}
