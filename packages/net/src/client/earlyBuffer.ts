// Holds race frames that arrive while the race is still loading (the race channel opens at raceStart, the NetClient
// exists only once the track and renderer are ready, which can take far longer than the race takes to start).
// It stays small however long the load lasts: a keyframe makes every older snapshot useless, relays older than the
// last 4 s are dropped, and EVENTS are always kept (they are the decision log). If it ever overflows anyway it keeps
// only events and asks for a keyframe on hand-over.
import { NetFlag, S2C } from '../protocol/ids.ts';

const NETFLAGS_AT = 10; // u8 type, u32 tick, i32 ackInputTick, i8 inputSlack, u8 netFlags
const MAX_RELAYS = 240;

export class EarlyFrameBuffer {
  frames: Uint8Array[] = [];
  /** Frames were dropped: the receiver must request a keyframe before decoding deltas. */
  needKeyframe = false;
  dropped = 0;
  private readonly cap: number;
  private relays = 0;

  constructor(cap = 4096) { this.cap = cap; }

  push(b: Uint8Array): void {
    const t = b[0];
    if (t === S2C.SNAPSHOT && b.length > NETFLAGS_AT && (b[NETFLAGS_AT]! & NetFlag.KEYFRAME) !== 0) {
      this.keep((f) => f[0] !== S2C.SNAPSHOT);
      this.needKeyframe = false; // this keyframe is a valid base again
    }
    if (t === S2C.INPUT_RELAY && ++this.relays > MAX_RELAYS) {
      const i = this.frames.findIndex((f) => f[0] === S2C.INPUT_RELAY);
      if (i >= 0) { this.frames.splice(i, 1); this.relays--; this.dropped++; }
    }
    if (this.frames.length >= this.cap) {
      this.keep((f) => f[0] === S2C.EVENTS);
      this.needKeyframe = true;
      if (t !== S2C.EVENTS) { this.dropped++; return; }
    }
    this.frames.push(b);
  }

  private keep(pred: (f: Uint8Array) => boolean): void {
    const before = this.frames.length;
    this.frames = this.frames.filter(pred);
    this.dropped += before - this.frames.length;
    this.relays = this.frames.reduce((a, f) => a + (f[0] === S2C.INPUT_RELAY ? 1 : 0), 0);
  }
}
