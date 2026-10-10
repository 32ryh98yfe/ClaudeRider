// FROZEN (contracts.lock). 8-byte input frame (ADR-007).
export const Held = { DRIFT: 1, ITEM: 2, LOOK_BACK: 4 } as const;             // ITEM held = speed-mode auto-fire
export const Edge = { USE_ITEM: 1, SWAP: 2, TAP_L: 4, TAP_R: 8, RESPAWN: 16, EMOTE: 32, DRIFT: 64 } as const; // latched since last tick

export interface InputFrame {
  steerIntent: number; // −1 / 0 / +1 digital intent, + = right; 0 leaves analog magnitude in steer
  driftRequests: number; // ordered press directions, encoded by helpers below (at most four per tick)
  steer: number;     // int −127..127, + = right
  throttle: number;  // 0..15
  brake: number;     // 0..15
  held: number;      // Held bitmask
  edges: number;     // Edge bitmask (one-shot, latched between ticks)
  aim: number;       // target slot 0..7, 255 = none
  emote: number;     // 0..15
}

export const NEUTRAL_INPUT: Readonly<InputFrame> = Object.freeze({ steerIntent: 0, driftRequests: 0, steer: 0, throttle: 0, brake: 0, held: 0, edges: 0, aim: 255, emote: 0 });

export function makeInput(): InputFrame { return { steerIntent: 0, driftRequests: 0, steer: 0, throttle: 0, brake: 0, held: 0, edges: 0, aim: 255, emote: 0 }; }

export function copyInput(dst: InputFrame, src: Readonly<InputFrame>): InputFrame {
  dst.steerIntent = src.steerIntent; dst.driftRequests = src.driftRequests;
  dst.steer = src.steer; dst.throttle = src.throttle; dst.brake = src.brake; dst.held = src.held;
  dst.edges = src.edges; dst.aim = src.aim; dst.emote = src.emote;
  return dst;
}

/** Clamps/sanitizes an untrusted frame in place (server-side validation). */
export function sanitizeInput(f: InputFrame): InputFrame {
  f.steerIntent = Math.sign(f.steerIntent) || 0;
  f.driftRequests = validDriftRequests(f.driftRequests) ? f.driftRequests : 0;
  f.steer = Math.max(-127, Math.min(127, Math.trunc(f.steer) || 0));
  f.throttle = Math.max(0, Math.min(15, Math.trunc(f.throttle) || 0));
  f.brake = Math.max(0, Math.min(15, Math.trunc(f.brake) || 0));
  f.held = (f.held | 0) & 7; f.edges = (f.edges | 0) & 127;
  f.aim = f.aim >= 0 && f.aim < 8 ? f.aim | 0 : 255;
  f.emote = (f.emote | 0) & 15;
  return f;
}

/** Number of requests in the sentinel-prefixed two-bit FIFO (0 means empty). */
export function driftRequestCount(queue: number): number {
  let n = 0; for (let q = queue; q > 1; q >>>= 2) n++;
  return n;
}
export function validDriftRequests(queue: number): boolean {
  if (!Number.isInteger(queue) || queue < 0 || queue > 511 || queue === 1) return false;
  if (queue === 0) return true;
  let q = queue; while (q > 1) { if ((q & 3) === 3) return false; q >>>= 2; }
  return q === 1;
}
/** Appends −1 (left), 0 (neutral) or +1 (right). Callers retain overflow for the following tick. */
export function appendDriftRequest(queue: number, direction: number): number {
  if (driftRequestCount(queue) >= 4) throw new RangeError('four drift requests per tick');
  return ((queue || 1) << 2) | (direction < 0 ? 1 : direction > 0 ? 2 : 0);
}
export function driftRequestAt(queue: number, index: number): number {
  const count = driftRequestCount(queue);
  if (index < 0 || index >= count) return 0;
  const code = (queue >>> (2 * (count - index - 1))) & 3;
  return code === 1 ? -1 : code === 2 ? 1 : 0;
}

/** Packs into a 49-bit integer (exact in a double). */
export function packInput(f: Readonly<InputFrame>): number {
  return (f.steer + 128) + f.throttle * 256 + f.brake * 4096 + f.held * 65536 + f.edges * 524288 + f.aim * 67108864 + f.emote * 17179869184 + (f.steerIntent + 1) * 274877906944 + f.driftRequests * 1099511627776;
}
export function unpackInput(p: number, out: InputFrame): InputFrame {
  let x = p;
  out.driftRequests = Math.floor(x / 1099511627776); x -= out.driftRequests * 1099511627776;
  const intent = Math.floor(x / 274877906944); x -= intent * 274877906944; out.steerIntent = intent - 1;
  const emote = Math.floor(x / 17179869184); x -= emote * 17179869184;
  const aim = Math.floor(x / 67108864); x -= aim * 67108864;
  const edges = Math.floor(x / 524288); x -= edges * 524288;
  const held = Math.floor(x / 65536); x -= held * 65536;
  const brake = Math.floor(x / 4096); x -= brake * 4096;
  const throttle = Math.floor(x / 256); x -= throttle * 256;
  out.steer = x - 128; out.throttle = throttle; out.brake = brake; out.held = held; out.edges = edges; out.aim = aim; out.emote = emote;
  return out;
}
