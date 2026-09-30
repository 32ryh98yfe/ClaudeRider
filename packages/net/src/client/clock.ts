// Client clock sync (20-netcode-spec §2): PING every 2 s (250 ms while loading), 8 samples kept, samples more than 1σ
// from the median RTT discarded, and serverTick(clientMs) = pong.serverTick + tickPhase + (clientMs − t1 + rtt/2)/DT,
// averaged over the kept samples.
import { NET } from '../protocol/ids.ts';
import type { PongT } from '../protocol/messages.ts';

interface Sample { rtt: number; offset: number /* serverTick − clientMs/DT at the same instant */ }

export class ClockSync {
  private samples: Sample[] = [];
  private sent = new Map<number, number>();
  private nextId = 1;
  private offset = 0;
  rttMs = 0;
  jitterMs = 0;
  lastPingMs = -Infinity;
  /** Smallest RTT seen (the path's floor), for diagnostics. */
  minRttMs = Infinity;

  get ready(): boolean { return this.samples.length > 0; }
  get sampleCount(): number { return this.samples.length; }

  /** Allocates a ping id and remembers its send time. */
  ping(nowMs: number): { pingId: number; clientMs: number } {
    const pingId = this.nextId;
    this.nextId = (this.nextId + 1) & 0xffff || 1;
    this.sent.set(pingId, nowMs);
    if (this.sent.size > 32) { const first = this.sent.keys().next().value!; this.sent.delete(first); }
    this.lastPingMs = nowMs;
    return { pingId, clientMs: Math.floor(nowMs) >>> 0 };
  }

  /** True when a ping is due (`loading` uses the fast 250 ms cadence). */
  due(nowMs: number, loading: boolean): boolean {
    const every = loading || this.samples.length < 4 ? NET.PING_LOADING_MS : NET.PING_MS;
    return nowMs - this.lastPingMs >= every;
  }

  onPong(p: Readonly<PongT>, nowMs: number): void {
    const t0 = this.sent.get(p.pingId);
    if (t0 === undefined) return;
    this.sent.delete(p.pingId);
    const rtt = Math.max(0, nowMs - t0);
    const serverAtNow = p.serverTick + p.tickPhase / 65536 + (rtt / 2) / NET.TICK_MS;
    this.samples.push({ rtt, offset: serverAtNow - nowMs / NET.TICK_MS });
    if (this.samples.length > 8) this.samples.shift();
    if (rtt < this.minRttMs) this.minRttMs = rtt;
    this.recompute();
  }

  private recompute(): void {
    const rtts = this.samples.map((s) => s.rtt).sort((a, b) => a - b);
    const median = rtts[rtts.length >> 1]!;
    const mean = rtts.reduce((a, b) => a + b, 0) / rtts.length;
    const sigma = Math.sqrt(rtts.reduce((a, b) => a + (b - mean) * (b - mean), 0) / rtts.length);
    const kept = this.samples.filter((s) => Math.abs(s.rtt - median) <= sigma + 1e-9);
    const use = kept.length ? kept : this.samples;
    this.offset = use.reduce((a, s) => a + s.offset, 0) / use.length;
    this.rttMs = use.reduce((a, s) => a + s.rtt, 0) / use.length;
    this.jitterMs = sigma;
  }

  /** Estimated (fractional) server tick at client time `nowMs`. */
  serverTick(nowMs: number): number { return nowMs / NET.TICK_MS + this.offset; }

  /** Server wall-clock offset for lobby countdowns, given the server's tick epoch (ms). */
  serverMs(nowMs: number, tickEpochMs: number): number { return tickEpochMs + this.serverTick(nowMs) * NET.TICK_MS; }

  /** Client lead ℓ = ⌈(RTT/2)/dt⌉ + 2 + ⌈2σ/dt⌉ (ADR-007). */
  leadTicks(): number {
    return Math.ceil(this.rttMs / 2 / NET.TICK_MS) + NET.SLACK_TARGET + Math.ceil((2 * this.jitterMs) / NET.TICK_MS);
  }

  /** The jitter part of the lead: the extra slack the server should observe on top of the 2-tick target. */
  jitterTicks(): number { return Math.ceil((2 * this.jitterMs) / NET.TICK_MS); }
}
