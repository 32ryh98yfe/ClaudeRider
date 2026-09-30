// Bot input lookahead (ADR-007, 14-ai §1): at tick t the driver decides the frame for t + N; the room relays
// it at t so clients hold bot inputs before they need them. This ring buffer is the reference pipe that
// RaceRoom and the headless tools share, so pace measured offline equals pace in a room.
import type { InputFrame } from '../core/input.ts';
import { copyInput, makeInput } from '../core/input.ts';

export class InputDelayLine {
  readonly delay: number;
  private readonly ring: InputFrame[];
  private head = 0;

  /** `delay` = lookahead ticks (0 = pass-through). Frames before the first N pushes are neutral. */
  constructor(delay: number) {
    this.delay = Math.max(0, Math.floor(delay));
    this.ring = Array.from({ length: this.delay + 1 }, () => makeInput());
  }

  /** Pushes this tick's decision and writes the frame to apply now (decided `delay` ticks ago) into `out`. */
  push(decided: Readonly<InputFrame>, out: InputFrame): void {
    if (this.delay === 0) { copyInput(out, decided); return; }
    copyInput(this.ring[this.head]!, decided);
    this.head = (this.head + 1) % this.ring.length;
    copyInput(out, this.ring[this.head]!);
  }

  /** Frame `k` ticks ahead of the one applied now (k = 1 … delay), e.g. to relay upcoming bot inputs. */
  peek(k: number): Readonly<InputFrame> {
    const n = this.ring.length;
    return this.ring[(this.head + k) % n]!;
  }

  clear(): void { for (const f of this.ring) { f.steer = 0; f.throttle = 0; f.brake = 0; f.held = 0; f.edges = 0; f.aim = 255; f.emote = 0; } }
}
