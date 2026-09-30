// Lobby error codes (packages/net/src/protocol/lobby.ts) → `errors.*` i18n keys (31-ui-spec §12.8).
import type { LobbyErrorCode } from '@cr/net';

// Complete on purpose: a new LobbyErrorCode fails the typecheck until it has a string. Unknown runtime codes → errors.unknown.
const MAP: Record<LobbyErrorCode, string> = {
  offline: 'errors.offline', version: 'errors.version_mismatch', full: 'errors.room_full', notFound: 'errors.room_not_found', notHost: 'errors.not_host',
  badCode: 'errors.bad_code', inRace: 'errors.in_race', rateLimited: 'errors.rate_limited', kicked: 'errors.kicked', timeout: 'errors.timeout', internal: 'errors.internal',
  notReady: 'errors.not_ready', nameInvalid: 'errors.name_invalid', chatFiltered: 'errors.chat_filtered', resumeExpired: 'errors.resume_expired',
  slowConsumer: 'errors.slow_consumer', trackHashMismatch: 'errors.track_hash_mismatch', badMessage: 'errors.bad_message', serverFull: 'errors.server_full',
};
export function errorKey(code: LobbyErrorCode | string): string { return MAP[code as LobbyErrorCode] ?? 'errors.unknown'; }

/** Room code alphabet (ADR-008): no 0/O/1/I. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function isValidCode(s: string): boolean { return s.length === 6 && [...s.toUpperCase()].every((c) => CODE_ALPHABET.includes(c)); }
