// S2C_SNAPSHOT (20-netcode-spec §3.4–3.5): 17-byte header + lossless world block.
// Header: u8 type, u32 tick, i32 ackInputTick, i8 inputSlack, u8 netFlags, u16 eventSeqHead, u32 baseTick.
// The delta base is the previous snapshot sent on the same connection (the WebSocket is reliable and ordered).
import { cloneWorld, type Tick, type WorldState } from '@cr/sim';
import { ByteReader, ByteWriter, ProtocolError } from './bytes.ts';
import { NetFlag, S2C } from './ids.ts';
import type { Codec } from './messages.ts';
import { FlatWorld, decodeWorld, encodeWorld, flattenWorld, referenceWorld } from './world.ts';

export interface SnapshotMeta { tick: Tick; ackInputTick: Tick; inputSlack: number; netFlags: number; eventSeqHead: number; baseTick: Tick }
export const SNAPSHOT_HEADER_BYTES = 17;

export const newMeta = (): SnapshotMeta => ({ tick: 0, ackInputTick: 0, inputSlack: 0, netFlags: 0, eventSeqHead: 0, baseTick: 0 });

export function writeSnapshotHeader(w: ByteWriter, m: Readonly<SnapshotMeta>): void {
  w.u8(S2C.SNAPSHOT); w.u32(m.tick); w.i32(m.ackInputTick);
  w.i8(Math.max(-128, Math.min(127, Math.round(m.inputSlack))));
  w.u8(m.netFlags); w.u16(m.eventSeqHead & 0xffff); w.u32(m.baseTick);
}

export function readSnapshotHeader(r: ByteReader, m: SnapshotMeta): SnapshotMeta {
  if (r.u8() !== S2C.SNAPSHOT) throw new ProtocolError('type');
  m.tick = r.u32(); m.ackInputTick = r.i32(); m.inputSlack = r.i8(); m.netFlags = r.u8(); m.eventSeqHead = r.u16(); m.baseTick = r.u32();
  return m;
}

/** Client side: owns the authoritative world and decodes each snapshot into it in place. */
export class SnapshotDecoder {
  readonly world: WorldState;
  readonly flat = new FlatWorld();
  readonly meta: SnapshotMeta = newMeta();
  private readonly ref: WorldState;
  private readonly refFlat: FlatWorld;
  private readonly r = new ByteReader();
  hasBase = false;

  constructor(template: Readonly<WorldState>) {
    this.world = cloneWorld(template);
    this.ref = referenceWorld(template.boxRespawn.length);
    this.refFlat = flattenWorld(this.ref, new FlatWorld());
  }

  /** Decodes into `world`; throws ProtocolError('base') when a delta does not match the held base. */
  decode(bytes: Uint8Array): SnapshotMeta {
    const r = this.r.reset(bytes);
    const m = readSnapshotHeader(r, this.meta);
    const key = (m.netFlags & NetFlag.KEYFRAME) !== 0;
    if (!key && (!this.hasBase || this.flat.tick !== m.baseTick)) throw new ProtocolError('base', `have ${this.hasBase ? this.flat.tick : 'none'} need ${m.baseTick}`);
    decodeWorld(r, this.world, key ? this.refFlat : this.flat, key ? this.ref : null, key ? 0 : m.tick - m.baseTick);
    if (r.remaining() !== 0) throw new ProtocolError('snapshot', 'trailing');
    this.world.tick = m.tick;
    flattenWorld(this.world, this.flat);
    this.hasBase = true;
    return m;
  }
}

interface RingEntry { tick: Tick; flat: FlatWorld; used: boolean }

/**
 * Server side, shared by every peer of one room: flattens each snapshot world once, and encodes one body per
 * distinct delta base (peers that received the same previous snapshot share bytes).
 */
export class SnapshotEncoder {
  private readonly ring: RingEntry[];
  private head = -1;
  private readonly refFlat: FlatWorld;
  private readonly w = new ByteWriter(4096);
  private readonly bodies = new Map<number, Uint8Array>();
  private readonly hw = new ByteWriter(64);
  /** Size of the last keyframe body (for the "delta larger than keyframe" rule). */
  keyframeBytes = 0;

  constructor(boxLen: number, ringSize = 16) {
    this.refFlat = flattenWorld(referenceWorld(boxLen), new FlatWorld());
    this.ring = Array.from({ length: ringSize }, () => ({ tick: -1, flat: new FlatWorld(), used: false }));
  }

  /** Captures the world at its current tick as the next snapshot. */
  capture(world: Readonly<WorldState>): void {
    this.head = (this.head + 1) % this.ring.length;
    const e = this.ring[this.head]!;
    flattenWorld(world, e.flat);
    e.tick = world.tick; e.used = true;
    this.bodies.clear();
  }

  get tick(): Tick { return this.head < 0 ? -1 : this.ring[this.head]!.tick; }

  /** True if a delta against `baseTick` can be encoded (the base is still in the ring). */
  hasBase(baseTick: Tick): boolean { return baseTick > 0 && this.find(baseTick) !== null; }

  private find(tick: Tick): FlatWorld | null {
    for (const e of this.ring) if (e.used && e.tick === tick) return e.flat;
    return null;
  }

  /** World block for the current snapshot against `baseTick` (0 = keyframe). Cached per base. */
  body(baseTick: Tick): Uint8Array {
    const cached = this.bodies.get(baseTick);
    if (cached) return cached;
    const cur = this.ring[this.head]!.flat;
    const base = baseTick > 0 ? this.find(baseTick) : this.refFlat;
    if (!base) throw new ProtocolError('base', `no base ${baseTick}`);
    this.w.reset();
    encodeWorld(this.w, cur, base, baseTick > 0 ? cur.tick - baseTick : 0);
    const out = this.w.finish();
    this.bodies.set(baseTick, out);
    if (baseTick === 0) this.keyframeBytes = out.length;
    return out;
  }

  /** Full message: header + body. */
  message(meta: Readonly<SnapshotMeta>, body: Uint8Array): Uint8Array {
    this.hw.reset();
    writeSnapshotHeader(this.hw, meta);
    const out = new Uint8Array(SNAPSHOT_HEADER_BYTES + body.length);
    out.set(this.hw.view(), 0);
    out.set(body, SNAPSHOT_HEADER_BYTES);
    return out;
  }
}

/**
 * The contract codec (B9): a stateful per-connection codec. `encode` deltas against the previous world it encoded
 * (keyframe when `meta.netFlags` has KEYFRAME or on first use); `decode` needs the same history on the other side.
 */
export function createSnapshotCodec(template: Readonly<WorldState>): Codec<{ meta: SnapshotMeta; world: WorldState }> {
  const enc = new SnapshotEncoder(template.boxRespawn.length, 2);
  let lastTick = 0;
  const dec = new SnapshotDecoder(template);
  return {
    encode(w, v) {
      enc.capture(v.world);
      const key = (v.meta.netFlags & NetFlag.KEYFRAME) !== 0 || lastTick === 0 || !enc.hasBase(lastTick);
      const meta = { ...v.meta, tick: v.world.tick, baseTick: key ? 0 : lastTick, netFlags: key ? v.meta.netFlags | NetFlag.KEYFRAME : v.meta.netFlags };
      writeSnapshotHeader(w, meta);
      w.bytes(enc.body(meta.baseTick));
      lastTick = v.world.tick;
    },
    decode(r, into) {
      const bytes = r.bytes(r.remaining());
      const meta = { ...dec.decode(bytes) };
      if (into) { into.meta = meta; return into; }
      return { meta, world: dec.world };
    },
  };
}

export const SnapshotMsg = createSnapshotCodec;
