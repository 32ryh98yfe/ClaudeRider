// SimLink network model (20-netcode-spec §13.1): per direction a one-way base latency, shifted-lognormal jitter,
// latency spikes, TCP loss modelled as a head-of-line stall until the retransmit (RTO = max(200 ms, 2·RTT)),
// a bandwidth cap and in-order delivery. Byte counters include modelled WebSocket and TCP/IP framing.
import type { Transport } from '../transport.ts';
import { gaussian, type VirtualLoop } from './vtime.ts';

export interface LinkProfile {
  /** Round-trip base latency (split evenly between directions). */
  rttMs: number;
  /** Standard deviation of the one-way delay jitter. */
  jitterMs: number;
  /** Packet loss probability (0.005 = 0.5%). */
  loss: number;
  spikeProb?: number;
  spikeMs?: number;
  /** Per-direction bandwidth cap in kilobits per second (0 = unlimited). */
  kbps?: number;
}

export interface LinkCounters { msgs: number; bytes: number; wireBytes: number; lost: number }

/** Modelled per-message overhead: WebSocket frame header (+4 mask bytes client→server) plus 40 B of TCP/IP. */
export function wireSize(payload: number, masked: boolean): number {
  const ws = payload < 126 ? 2 : payload < 65536 ? 4 : 10;
  return payload + ws + (masked ? 4 : 0) + 40;
}

const LOGN_S = 0.6;
const LOGN_STD = Math.sqrt((Math.exp(LOGN_S * LOGN_S) - 1) * Math.exp(LOGN_S * LOGN_S));
const LOGN_MEAN = Math.exp((LOGN_S * LOGN_S) / 2);

class Direction {
  readonly counters: LinkCounters = { msgs: 0, bytes: 0, wireBytes: 0, lost: 0 };
  private lastDelivery = 0;
  private busyUntil = 0;
  queued = 0;
  private loop: VirtualLoop;
  private prof: LinkProfile;
  private rng: () => number;
  private masked: boolean;

  constructor(loop: VirtualLoop, prof: LinkProfile, rng: () => number, masked: boolean) {
    this.loop = loop; this.prof = prof; this.rng = rng; this.masked = masked;
  }

  delay(): number {
    const p = this.prof;
    const base = p.rttMs / 2;
    let x = 0;
    if (p.jitterMs > 0) {
      // shifted lognormal with the requested σ, re-centred so the mean one-way delay stays at base
      const m = p.jitterMs / LOGN_STD;
      x = m * Math.exp(LOGN_S * gaussian(this.rng)) - m * LOGN_MEAN;
    }
    let d = Math.max(0, base + x);
    if (p.spikeProb && this.rng() < p.spikeProb) d += p.spikeMs ?? 100;
    return d;
  }

  send(bytes: Uint8Array, deliver: (b: Uint8Array) => void): void {
    const now = this.loop.now, p = this.prof;
    const wire = wireSize(bytes.length, this.masked);
    this.counters.msgs++; this.counters.bytes += bytes.length; this.counters.wireBytes += wire;
    const depart = Math.max(now, this.busyUntil) + (p.kbps ? (wire * 8) / p.kbps : 0);
    this.busyUntil = depart;
    this.queued += wire;
    this.loop.at(depart, () => { this.queued -= wire; });
    let t = depart + this.delay();
    // TCP: a lost segment is resent after RTO = max(200 ms, srtt + 4·rttvar); everything behind it waits (in-order)
    if (p.loss > 0 && this.rng() < p.loss) { this.counters.lost++; t += Math.max(200, p.rttMs + 4 * p.jitterMs * Math.SQRT2); }
    t = Math.max(t, this.lastDelivery);
    this.lastDelivery = t;
    const copy = bytes.slice();
    this.loop.at(t, () => deliver(copy));
  }
}

export interface SimLinkPair {
  client: Transport;
  server: Transport;
  up: LinkCounters;
  down: LinkCounters;
  /** Drops the connection: in-flight data is lost and both ends see onClose after `detectMs`. */
  cut(detectMs?: number): void;
  readonly open: boolean;
}

let linkId = 0;

export function simLink(loop: VirtualLoop, prof: { up: LinkProfile; down: LinkProfile }, rng: () => number): SimLinkPair {
  const id = ++linkId;
  let open = true;
  let epoch = 0;
  const up = new Direction(loop, prof.up, rng, true);
  const down = new Direction(loop, prof.down, rng, false);
  const mk = (name: string, dir: Direction, peer: () => Transport): Transport => ({
    id: `${name}${id}`,
    onMessage: null,
    onClose: null,
    send(b: Uint8Array): void {
      if (!open) return;
      const e = epoch;
      dir.send(b, (copy) => { if (open && e === epoch) peer().onMessage?.(copy); });
    },
    close(_code?: number, reason = 'closed'): void {
      if (!open) return;
      open = false; epoch++;
      const p = peer();
      loop.after(prof.up.rttMs / 2, () => p.onClose?.(reason));
    },
    bufferedAmount: () => dir.queued,
  });
  const client: Transport = mk('c', up, () => server);
  const server: Transport = mk('s', down, () => client);
  return {
    client, server, up: up.counters, down: down.counters,
    get open() { return open; },
    cut(detectMs = 50): void {
      if (!open) return;
      open = false; epoch++;
      loop.after(detectMs, () => { client.onClose?.('cut'); server.onClose?.('cut'); });
    },
  };
}
