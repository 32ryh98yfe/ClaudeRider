// One-shot event de-duplication (B4): rollback re-simulation re-emits events with the same deterministic key, so
// sounds and VFX are played once. Keys are remembered for 2 s of ticks.
import type { SimEvent, Tick } from '@cr/sim';

export class EventDeduper {
  private seen = new Map<number, Tick>();
  private readonly keepTicks: number;
  private lastPrune = 0;
  dropped = 0;

  constructor(keepTicks = 120) { this.keepTicks = keepTicks; }

  /** True if the event is new (and records it). */
  admit(e: SimEvent, nowTick: Tick): boolean {
    const exp = this.seen.get(e.key);
    if (exp !== undefined && exp >= nowTick) { this.dropped++; return false; }
    this.seen.set(e.key, e.tick + this.keepTicks);
    if (nowTick - this.lastPrune > 60) this.prune(nowTick);
    return true;
  }

  private prune(nowTick: Tick): void {
    this.lastPrune = nowTick;
    for (const [k, exp] of this.seen) if (exp < nowTick) this.seen.delete(k);
  }

  clear(): void { this.seen.clear(); }
}
