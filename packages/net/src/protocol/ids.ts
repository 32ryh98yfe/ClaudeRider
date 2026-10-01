// Wire message ids (02-contracts B9, 20-netcode-spec §3). Every frame is `u8 type | payload`, little-endian.
export const C2S = { INPUT: 0x01, PING: 0x02, RESUME: 0x03, LOBBY_JSON: 0x10 } as const;
export const S2C = { SNAPSHOT: 0x81, EVENTS: 0x82, INPUT_RELAY: 0x83, PONG: 0x84, LOBBY_JSON: 0x90 } as const;

/** EVENTS entry types (§3.6). Bit 7 set on the wire marks the lossless "extended" payload form (see events.ts). */
export const EV = {
  ITEM_GRANTED: 0x01, ITEM_USED: 0x02, ITEM_USE_REJECTED: 0x03, PROJ_SPAWN: 0x04, PROJ_COMMIT: 0x05, EFFECT_SCHEDULE: 0x06,
  EFFECT_RESULT: 0x07, HAZARD_SPAWN: 0x08, HAZARD_REMOVE: 0x09, BOX_STATE: 0x0a, MASH_RESULT: 0x0b, TIME_ADJUST: 0x0c,
  PLAYER_RTT: 0x0d, RESYNC_FULL: 0x0e,
} as const;

/** Snapshot header `netFlags` bits (§3.4). */
export const NetFlag = { KEYFRAME: 1, LATE: 2, RESYNC: 4 } as const;

/** Reject reasons carried by ITEM_USE_REJECTED (§3.6). */
export const RejectReason = { NO_ITEM: 1, IN_CC: 2, SLOT_LOCKED: 3, COOLDOWN: 4, INVALID_TARGET: 5, LATE_DURING_CC: 6, BEFORE_GO: 7, IN_RESPAWN: 8 } as const;

/** Timing constants shared by server, Worker and clients (ADR-007). */
export const NET = {
  TICK_MS: 1000 / 60,
  SNAPSHOT_EVERY: 2,
  KEYFRAME_EVERY: 30,             // snapshots between keyframes (1 s)
  BOT_LOOKAHEAD: 8,
  SCE_LEAD: 21,
  INPUT_RING: 128,
  MAX_AHEAD: 45,                  // frames stamped more than this ahead of the server are dropped
  MAX_BEHIND: 30,                 // frames older than this only contribute their edges
  SPOOF_CLAMP: 12,                // anti-spoof re-stamp window (200 ms)
  MISSING_HOLD: 6,                // ticks a missing input holds steering before it decays
  MISSING_DECAY: 0.85,
  // ticks a missing input holds the brake before releasing it: a held brake turns a ≤ 8-tick brake turn into an
  // 11-tick spin-out during a stall (8 + 2 = 10 < spinTicks 11). Must stay ≤ MISSING_HOLD (RunningInput.seek).
  MISSING_BRAKE_HOLD: 2,
  TAKEOVER_TICKS: 180,            // AI takes a silent human's kart after 3 s
  RECONNECT_MS: 60_000,
  EVENT_LOG_TICKS: 600,           // 10 s resume log
  BP_HIGH: 32 * 1024,             // skip SNAPSHOT/RELAY above this buffered amount…
  BP_LOW: 16 * 1024,              // …until it drains below this
  BP_KILL: 256 * 1024,            // close with slow_consumer when above this for BP_KILL_MS
  BP_KILL_MS: 5000,
  PING_MS: 2000,
  PING_LOADING_MS: 250,
  SLACK_TARGET: 2,
  RESYNC_TICKS: 15,
} as const;
