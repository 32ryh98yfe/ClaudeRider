// The server's single 60 Hz clock (20-netcode-spec §4.2): a drift-compensated loop on performance.now() that sleeps
// with setTimeout and finishes the last millisecond with setImmediate, and catches up at most 5 ticks after a stall
// (further lag is dropped so the loop never spirals). Global tick G = ⌊(now − epoch) / 16.667 ms⌋.
import { performance } from 'node:perf_hooks';
import { NET } from '@cr/net';

export class Ticker {
  readonly epochMs = performance.now();
  /** Date.now() at the epoch, so lobby deadlines can be sent as wall-clock ms. */
  readonly epochWallMs = Date.now();
  tick = 0;
  dropped = 0;
  onTick: ((tick: number) => void) | null = null;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Wall time spent in onTick per tick (ms), last 3600 ticks. */
  readonly costMs: number[] = [];

  now(): number { return performance.now(); }
  /** Fractional global tick at `nowMs` (performance.now clock). */
  serverTick(nowMs = performance.now()): number { return (nowMs - this.epochMs) / NET.TICK_MS; }
  wallMs(nowMs = performance.now()): number { return this.epochWallMs + (nowMs - this.epochMs); }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.schedule();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    if (!this.running) return;
    const due = this.epochMs + (this.tick + 1) * NET.TICK_MS;
    const wait = due - performance.now();
    if (wait > 1.5) this.timer = setTimeout(() => this.run(), Math.max(0, wait - 1));
    else setImmediate(() => this.run());
  }

  private run(): void {
    if (!this.running) return;
    const target = Math.floor(this.serverTick());
    if (target > this.tick) {
      if (target - this.tick > 5) { this.dropped += target - this.tick - 5; this.tick = target - 5; }
      while (this.tick < target) {
        this.tick++;
        const t0 = performance.now();
        this.onTick?.(this.tick);
        this.costMs.push(performance.now() - t0);
        if (this.costMs.length > 3600) this.costMs.splice(0, this.costMs.length - 3600);
      }
    }
    this.schedule();
  }
}
