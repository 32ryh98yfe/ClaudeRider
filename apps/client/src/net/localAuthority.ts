// Offline authority host (ADR-007: "RaceRoom identical in the Node server and the offline Worker"). The same RaceRoom
// and NetClient path as online, hosted in lockstep: the room simulates a tick as soon as the local player's input for
// it has arrived, so there is never a late input, the race pauses with the tab, and ?simRate runs as fast as the
// client produces inputs. Runs inside authority.worker.ts, or on the main thread as the fallback.
import type { ContentTables } from '@cr/content';
import type { BakedTrack, RaceConfig } from '@cr/sim';
import { encodeS2CLobby, type Transport } from '@cr/net';
import { RaceRoom } from '@cr/room';

export class LocalAuthority {
  readonly room: RaceRoom;
  private pumping = false;

  constructor(o: { config: RaceConfig; track: BakedTrack; content: ContentTables; slot: number; transport: Transport }) {
    this.room = new RaceRoom({ config: o.config, track: o.track, content: o.content, collectEvents: false });
    const raw = o.transport;
    // the room owns the peer transport's handlers; wrap it so every delivered input also drives the lockstep pump
    const peer: Transport = {
      id: 'local', onMessage: null, onClose: null,
      send: (b) => raw.send(b), close: (c, r) => raw.close(c, r), bufferedAmount: () => raw.bufferedAmount(),
    };
    raw.onMessage = (b) => { peer.onMessage?.(b); this.pump(); };
    raw.onClose = (r) => peer.onClose?.(r);
    this.room.attach({ id: 'local', slot: o.slot, transport: peer, resumeToken: '0'.repeat(32) });
    this.room.onEnd((r) => raw.send(encodeS2CLobby({ t: 'raceEnd', result: r })));
  }

  /** Simulates every tick whose inputs are in (re-entrancy safe for synchronous loopback transports). */
  pump(): void {
    if (this.pumping) return;
    this.pumping = true;
    try {
      let n = 0;
      while (n < 600 && this.room.readyFor(this.room.tickNo + 1)) { this.room.tick(); n++; }
    } finally { this.pumping = false; }
  }
}
