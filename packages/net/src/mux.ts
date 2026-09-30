// Splits one byte transport (a WebSocket, a Worker port) into typed channels by the frame's first byte.
// The lobby layer and the race layer (RaceRoom on the server, NetClient on the client) each get a Transport of their
// own, so the race code keeps the plain B9 Transport contract while sharing the socket with lobby JSON.
import type { Transport } from './transport.ts';

export interface Channel extends Transport { detach(): void; readonly attached: boolean }

export class FrameMux {
  readonly raw: Transport;
  private channels: { accept: (type: number) => boolean; ch: ChannelImpl }[] = [];
  /** Frames no channel accepted. */
  onOther: ((b: Uint8Array) => void) | null = null;
  onClose: ((reason: string) => void) | null = null;
  closed = false;

  constructor(raw: Transport) {
    this.raw = raw;
    raw.onMessage = (b) => this.dispatch(b);
    raw.onClose = (reason) => {
      this.closed = true;
      for (const c of [...this.channels]) c.ch.closedByRaw(reason);
      this.onClose?.(reason);
    };
  }

  private dispatch(b: Uint8Array): void {
    if (b.length === 0) return;
    const t = b[0]!;
    let taken = false;
    for (const c of this.channels) if (c.accept(t)) { taken = true; c.ch.onMessage?.(b); }
    if (!taken) this.onOther?.(b);
  }

  /**
   * A channel receiving every frame whose type passes `accept`. Several channels may accept the same type.
   * With `closeRaw`, closing the channel closes the shared socket too (server kicks); otherwise it only detaches.
   */
  channel(accept: (type: number) => boolean, opts: { id?: string; closeRaw?: boolean } = {}): Channel {
    const ch = new ChannelImpl(this, opts.id ?? this.raw.id, opts.closeRaw === true);
    this.channels.push({ accept, ch });
    return ch;
  }

  /** @internal */
  remove(ch: ChannelImpl): void { this.channels = this.channels.filter((c) => c.ch !== ch); }
}

class ChannelImpl implements Channel {
  readonly id: string;
  onMessage: ((b: Uint8Array) => void) | null = null;
  onClose: ((reason: string) => void) | null = null;
  private mux: FrameMux;
  private closeRaw: boolean;
  attached = true;

  constructor(mux: FrameMux, id: string, closeRaw: boolean) { this.mux = mux; this.id = id; this.closeRaw = closeRaw; }

  send(bytes: Uint8Array): void { if (this.attached && !this.mux.closed) this.mux.raw.send(bytes); }
  bufferedAmount(): number { return this.mux.raw.bufferedAmount(); }
  close(code?: number, reason = 'closed'): void {
    if (!this.attached) return;
    this.detach();
    this.onClose?.(reason);
    if (this.closeRaw && !this.mux.closed) this.mux.raw.close(code, reason);
  }
  detach(): void { if (!this.attached) return; this.attached = false; this.mux.remove(this); }
  closedByRaw(reason: string): void { if (!this.attached) return; this.attached = false; this.mux.remove(this); this.onClose?.(reason); }
}
