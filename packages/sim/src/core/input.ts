// FROZEN (contracts.lock). 6-byte input frame (ADR-007).
export const Held = { DRIFT: 1, ITEM: 2, LOOK_BACK: 4 } as const;             // ITEM held = speed-mode auto-fire
export const Edge = { USE_ITEM: 1, SWAP: 2, TAP_L: 4, TAP_R: 8, RESPAWN: 16, EMOTE: 32 } as const; // latched since last tick

export interface InputFrame {
  steer: number;     // int −127..127, + = right
  throttle: number;  // 0..15
  brake: number;     // 0..15
  held: number;      // Held bitmask
  edges: number;     // Edge bitmask (one-shot, latched between ticks)
  aim: number;       // target slot 0..7, 255 = none
  emote: number;     // 0..15
}

export const NEUTRAL_INPUT: Readonly<InputFrame> = Object.freeze({ steer: 0, throttle: 0, brake: 0, held: 0, edges: 0, aim: 255, emote: 0 });

export function makeInput(): InputFrame { return { steer: 0, throttle: 0, brake: 0, held: 0, edges: 0, aim: 255, emote: 0 }; }

export function copyInput(dst: InputFrame, src: Readonly<InputFrame>): InputFrame {
  dst.steer = src.steer; dst.throttle = src.throttle; dst.brake = src.brake; dst.held = src.held;
  dst.edges = src.edges; dst.aim = src.aim; dst.emote = src.emote;
  return dst;
}

/** Clamps/sanitizes an untrusted frame in place (server-side validation). */
export function sanitizeInput(f: InputFrame): InputFrame {
  f.steer = Math.max(-127, Math.min(127, Math.trunc(f.steer) || 0));
  f.throttle = Math.max(0, Math.min(15, Math.trunc(f.throttle) || 0));
  f.brake = Math.max(0, Math.min(15, Math.trunc(f.brake) || 0));
  f.held = (f.held | 0) & 7; f.edges = (f.edges | 0) & 63;
  f.aim = f.aim >= 0 && f.aim < 8 ? f.aim | 0 : 255;
  f.emote = (f.emote | 0) & 15;
  return f;
}

/** Packs into a 48-bit integer (exact in a double). */
export function packInput(f: Readonly<InputFrame>): number {
  return (f.steer + 128) + f.throttle * 256 + f.brake * 4096 + f.held * 65536 + f.edges * 524288 + f.aim * 33554432 + f.emote * 8589934592;
}
export function unpackInput(p: number, out: InputFrame): InputFrame {
  let x = p;
  const emote = Math.floor(x / 8589934592); x -= emote * 8589934592;
  const aim = Math.floor(x / 33554432); x -= aim * 33554432;
  const edges = Math.floor(x / 524288); x -= edges * 524288;
  const held = Math.floor(x / 65536); x -= held * 65536;
  const brake = Math.floor(x / 4096); x -= brake * 4096;
  const throttle = Math.floor(x / 256); x -= throttle * 256;
  out.steer = x - 128; out.throttle = throttle; out.brake = brake; out.held = held; out.edges = edges; out.aim = aim; out.emote = emote;
  return out;
}
