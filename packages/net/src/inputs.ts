// Input buffering shared by the authority (RaceRoom) and the predictor (NetClient), so both sides apply the
// identical missing-input rule (ADR-007, 20-netcode-spec §6.2).
import { copyInput, makeInput, type InputFrame, type Tick } from '@cr/sim';
import { NET } from './protocol/ids.ts';

/** Frames keyed by tick in a power-of-two ring. */
export class InputRing {
  readonly size: number;
  private readonly mask: number;
  private readonly ticks: Int32Array;
  private readonly frames: InputFrame[];

  constructor(size: number = NET.INPUT_RING) {
    let s = 1;
    while (s < size) s <<= 1;
    this.size = s;
    this.mask = s - 1;
    this.ticks = new Int32Array(s).fill(-1);
    this.frames = Array.from({ length: s }, () => makeInput());
  }

  /** Newest tick ever stored (kept beyond the ring's reach so a long-silent slot still holds its last frame). */
  lastTick: Tick = -1;
  readonly lastFrame: InputFrame = makeInput();

  set(tick: Tick, f: Readonly<InputFrame>): void {
    const i = tick & this.mask;
    this.ticks[i] = tick;
    copyInput(this.frames[i]!, f);
    if (tick >= this.lastTick) { this.lastTick = tick; copyInput(this.lastFrame, f); }
  }

  get(tick: Tick): InputFrame | null {
    const i = tick & this.mask;
    return this.ticks[i] === tick ? this.frames[i]! : null;
  }

  has(tick: Tick): boolean { return this.ticks[tick & this.mask] === tick; }

  delete(tick: Tick): void { const i = tick & this.mask; if (this.ticks[i] === tick) this.ticks[i] = -1; }

  clear(): void { this.ticks.fill(-1); this.lastTick = -1; }

  /** Newest stored tick ≤ `tick` within the ring's reach, or -1. */
  latestAtOrBefore(tick: Tick): Tick {
    for (let t = tick; t > tick - this.size && t >= 0; t--) if (this.ticks[t & this.mask] === t) return t;
    return -1;
  }

  /** Frame and tick of the newest frame ≤ `tick`, falling back to `lastFrame` when it is older than the ring. */
  frameAtOrBefore(tick: Tick): { tick: Tick; frame: InputFrame } | null {
    const t = this.latestAtOrBefore(tick);
    if (t >= 0) return { tick: t, frame: this.get(t)! };
    if (this.lastTick >= 0 && this.lastTick <= tick) return { tick: this.lastTick, frame: this.lastFrame };
    return null;
  }
}

/**
 * One tick of the missing-input rule applied to the running frame: edges are never synthesized, analog values are
 * held, the brake is released after `NET.MISSING_BRAKE_HOLD` ticks without a frame (a held brake would turn a short
 * brake drift turn into a spin-out the player never pressed), and after `NET.MISSING_HOLD` ticks steering decays by
 * ×0.85 per tick (integer steps). `missCount` is the number of consecutive ticks without a frame, including this one.
 */
export function stepMissing(cur: InputFrame, missCount: number): void {
  cur.edges = 0; cur.driftRequests = 0;
  if (missCount > NET.MISSING_BRAKE_HOLD) cur.brake = 0;
  if (missCount > NET.MISSING_HOLD) { cur.steer = Math.trunc(cur.steer * NET.MISSING_DECAY); cur.steerIntent = 0; }
}

/** Running per-slot input as a predictor walks forward tick by tick through a ring of known frames. */
export class RunningInput {
  readonly cur: InputFrame = makeInput();
  miss = 0;

  /** Positions the running frame at `tick` (as if every earlier tick had been walked). */
  seek(ring: InputRing, tick: Tick): void {
    const at = ring.frameAtOrBefore(tick);
    if (!at) { copyInput(this.cur, NEUTRAL); this.miss = 0; return; }
    copyInput(this.cur, at.frame);
    this.miss = 0;
    // once steering has decayed to zero further steps change nothing (the brake is already released by then,
    // MISSING_BRAKE_HOLD ≤ MISSING_HOLD), so long gaps stay cheap
    for (let t = at.tick + 1; t <= tick; t++) {
      this.miss++;
      stepMissing(this.cur, this.miss);
      if (this.cur.steer === 0 && this.miss > NET.MISSING_HOLD) { this.miss = tick - at.tick; break; }
    }
  }

  /** Advances to `tick`: the stored frame if known, else one missing-input step. Returns true for a known frame. */
  advance(ring: InputRing, tick: Tick): boolean {
    const f = ring.get(tick);
    if (f) { copyInput(this.cur, f); this.miss = 0; return true; }
    this.miss++;
    stepMissing(this.cur, this.miss);
    return false;
  }
}

const NEUTRAL: InputFrame = makeInput();

/** Packs frames for equality tests (6 fields → one number). */
export const sameFrame = (a: Readonly<InputFrame>, b: Readonly<InputFrame>): boolean =>
  a.steer === b.steer && a.throttle === b.throttle && a.brake === b.brake && a.held === b.held && a.edges === b.edges && a.aim === b.aim && a.emote === b.emote && a.steerIntent === b.steerIntent && a.driftRequests === b.driftRequests;
