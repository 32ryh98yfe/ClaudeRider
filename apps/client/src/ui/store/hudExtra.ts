// HUD signals beyond the frozen HudSignals (ui/store/hud.ts): written only by game/HudPresenter (and L9 for net state).
import { signal } from '@preact/signals';

export interface FeedLine { id: number; attacker: string; victim: string; itemId: string; result: 'hit' | 'blocked' | 'immune' | 'miss' | 'late'; mine: boolean; until: number }
export interface RailDot { p: number; me: boolean; rank: number; team: number }

export const hudX = {
  /** item feed lines with structure (the frozen feed carries only text) */
  feed: signal<FeedLine[]>([]),
  /** 1-D progress rail (speed mode): 0..1 race progress per kart */
  rail: signal<RailDot[]>([]),
  /** roulette spinning into a slot: slot index and the ms timestamp it lands */
  roulette: signal<{ slot: 0 | 1; endsAt: number } | null>(null),
  /** slot_lock (Mutex Lock) active on me */
  slotLock: signal(false),
  /** instant-boost window open */
  instantWindow: signal(false),
  /** start-boost result shown at y 62% for 1.2 s */
  startResult: signal<{ tier: 'perfect' | 'great' | 'good' | 'false'; at: number } | null>(null),
  /** lap popup: lap time and delta vs best (ticks), 3 s */
  lapPopup: signal<{ lapTicks: number; deltaTicks: number | null; best: boolean; at: number } | null>(null),
  /** redaction overlay: ms timestamp when it started */
  redaction: signal<number | null>(null),
  /** mirror (reversed steering) active */
  mirror: signal(false),
  /** shield / halo active on me */
  shield: signal(false),
  /** respawning ("returning to course") */
  respawn: signal(false),
  /** danger alert vignette: direction (radians, 0 = ahead, + = right) or null */
  alert: signal<number | null>(null),
  /** perfect start: GO glows blue */
  perfect: signal(false),
  /** finish slow-motion letterbox (ms timestamp) */
  finishAt: signal<number | null>(null),
  /** Time Attack mode (split deltas, ghost row) */
  timeAttack: signal(false),
  /** network: ping in ms and late-signal flag (L9 writes; null offline) */
  net: signal<{ pingMs: number; late: number } | null>(null),
  /** mm:ss.mmm of the best lap for the popup/labels */
  speedUnit: signal<'kmh' | 'mph'>('kmh'),
  /** full-screen danger flash when hit (ms timestamp) */
  hitAt: signal<number | null>(null),
  /** gauge just filled (booster pop), ms timestamp */
  gaugeFullAt: signal<number | null>(null),
  /** a position change for the rank flash: +1 up, −1 down, with timestamp */
  rankFlash: signal<{ dir: 1 | -1; at: number } | null>(null),
  /** banner queue key for lap banners "랩 2/3" */
  lapBanner: signal<{ lap: number; laps: number; at: number } | null>(null),
  /** ghost row for Time Attack standings: delta vs PB race (ticks) */
  ghostDelta: signal<number | null>(null),
};

/** Clears per-race HUD state (called when a race starts). */
export function resetHudX(): void {
  const x = hudX;
  x.feed.value = []; x.rail.value = []; x.roulette.value = null; x.slotLock.value = false; x.instantWindow.value = false; x.startResult.value = null;
  x.lapPopup.value = null; x.redaction.value = null; x.mirror.value = false; x.shield.value = false; x.respawn.value = false; x.alert.value = null;
  x.perfect.value = false; x.finishAt.value = null; x.hitAt.value = null; x.gaugeFullAt.value = null; x.rankFlash.value = null; x.lapBanner.value = null; x.ghostDelta.value = null;
}
