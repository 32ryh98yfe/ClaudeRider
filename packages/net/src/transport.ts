// FROZEN (contracts.lock). Byte transport abstraction (WebSocket, in-process loopback, Worker port).
export interface Transport {
  readonly id: string;
  send(bytes: Uint8Array): void;
  onMessage: ((b: Uint8Array) => void) | null;
  onClose: ((reason: string) => void) | null;
  close(code?: number, reason?: string): void;
  bufferedAmount(): number;
}

/** In-process pair with optional one-way latency (ms) using the provided scheduler. */
export function loopbackPair(latencyMs = 0, schedule: (fn: () => void, ms: number) => void = (fn, ms) => { (globalThis as unknown as { setTimeout(f: () => void, ms: number): unknown }).setTimeout(fn, ms); }): [Transport, Transport] {
  let aOpen = true, bOpen = true;
  const mk = (id: string, peer: () => Transport, open: () => boolean, closeSelf: () => void): Transport => ({
    id,
    onMessage: null,
    onClose: null,
    send(bytes: Uint8Array): void {
      if (!open()) return;
      const copy = bytes.slice();
      const deliver = (): void => { const p = peer(); if (p.onMessage) p.onMessage(copy); };
      if (latencyMs <= 0) deliver(); else schedule(deliver, latencyMs);
    },
    close(_code?: number, reason = 'closed'): void {
      if (!open()) return;
      closeSelf();
      const p = peer();
      if (p.onClose) p.onClose(reason);
    },
    bufferedAmount: () => 0,
  });
  const a: Transport = mk('a', () => b, () => aOpen, () => { aOpen = false; bOpen = false; });
  const b: Transport = mk('b', () => a, () => bOpen, () => { aOpen = false; bOpen = false; });
  return [a, b];
}
