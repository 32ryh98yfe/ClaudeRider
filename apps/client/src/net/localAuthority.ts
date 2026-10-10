// Offline authority host (ADR-007: "RaceRoom identical in the Node server and the offline Worker"). The same RaceRoom
// and NetClient path as online, hosted in lockstep: the room simulates a tick as soon as the local player's input for
// it has arrived, so there is never a late input, the race pauses with the tab, and ?simRate runs as fast as the
// client produces inputs. Runs inside authority.worker.ts, or on the main thread as the fallback.
import type { ContentTables } from '@cr/content';
import { copyWorld, type BakedTrack, type RaceConfig, type SimEvent, type WorldState } from '@cr/sim';
import { encodeS2CLobby, SnapshotEncoder, NetFlag, type Transport } from '@cr/net';
import { RaceRoom } from '@cr/room';

export class LocalAuthority {
  readonly room: RaceRoom;
  private pumping = false;
  private readonly transport: Transport;
  private readonly onTick: ((world: Readonly<WorldState>, events: readonly SimEvent[]) => void) | undefined;
  private readonly tickEvents: SimEvent[] = [];

  constructor(o: { config: RaceConfig; track: BakedTrack; content: ContentTables; slot: number; transport: Transport; initialize?: (world: WorldState) => void; onTick?: (world: Readonly<WorldState>, events: readonly SimEvent[]) => void }) {
    this.transport = o.transport;
    this.onTick = o.onTick;
    this.room = new RaceRoom({ config: o.config, track: o.track, content: o.content, collectEvents: !!o.onTick });
    o.initialize?.(this.room.world);
    if (o.initialize) copyWorld(this.room.prev, this.room.world);
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

  /** Publish a seeded tick-zero state through the ordinary snapshot codec after the client has bound. */
  publishInitialSnapshot(): void {
    if (this.room.tickNo !== 0) throw new Error('Initial snapshot requires tick zero');
    const encoder = new SnapshotEncoder(this.room.world.boxRespawn.length);
    encoder.capture(this.room.world);
    this.transport.send(encoder.message({ tick: 0, ackInputTick: 0, inputSlack: 0, netFlags: NetFlag.KEYFRAME, eventSeqHead: 0, baseTick: 0 }, encoder.body(0)));
  }

  /** Simulates every tick whose inputs are in (re-entrancy safe for synchronous loopback transports). */
  pump(): void {
    if (this.pumping) return;
    this.pumping = true;
    try {
      let n = 0;
      while (n < 600 && this.room.readyFor(this.room.tickNo + 1)) {
        this.room.tick(); n++;
        if (this.onTick) {
          this.room.drainEvents(this.tickEvents);
          this.onTick(this.room.world, this.tickEvents);
          this.tickEvents.length = 0;
        }
      }
    } finally { this.pumping = false; }
  }
}
