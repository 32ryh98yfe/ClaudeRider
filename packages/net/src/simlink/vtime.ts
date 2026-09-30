// Virtual-time event loop for SimLink (20-netcode-spec §13.1): a binary heap of timed callbacks, ordered by time
// then insertion, so every run with the same seed is identical.

interface Ev { t: number; seq: number; fn: () => void }

export class VirtualLoop {
  now = 0;
  private heap: Ev[] = [];
  private seq = 0;

  at(t: number, fn: () => void): void {
    const e: Ev = { t: Math.max(t, this.now), seq: this.seq++, fn };
    const h = this.heap;
    h.push(e);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (less(h[p]!, e)) break;
      h[i] = h[p]!; i = p;
    }
    h[i] = e;
  }

  after(ms: number, fn: () => void): void { this.at(this.now + ms, fn); }

  /** Runs events until the queue is empty or the next one is later than `untilMs`. */
  run(untilMs: number, stop?: () => boolean): void {
    const h = this.heap;
    while (h.length && h[0]!.t <= untilMs) {
      const e = this.pop();
      this.now = e.t;
      e.fn();
      if (stop?.()) return;
    }
    this.now = Math.max(this.now, untilMs);
  }

  get pending(): number { return this.heap.length; }

  private pop(): Ev {
    const h = this.heap;
    const top = h[0]!;
    const last = h.pop()!;
    if (h.length) {
      // sift `last` down from the root
      let i = 0;
      const n = h.length;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = -1, best = last;
        if (l < n && less(h[l]!, best)) { m = l; best = h[l]!; }
        if (r < n && less(h[r]!, best)) { m = r; best = h[r]!; }
        if (m < 0) break;
        h[i] = h[m]!; i = m;
      }
      h[i] = last;
    }
    return top;
  }
}

const less = (a: Ev, b: Ev): boolean => a.t < b.t || (a.t === b.t && a.seq < b.seq);

/** mulberry32 */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(r: () => number): number {
  const u = Math.max(1e-12, r()), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
