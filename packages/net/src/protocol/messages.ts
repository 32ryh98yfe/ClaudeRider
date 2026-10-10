// Small fixed-layout messages (20-netcode-spec §3.1–3.3): INPUT, PING/PONG, RESUME, INPUT_RELAY, LOBBY_JSON.
import { makeInput, validDriftRequests, type InputFrame, type Tick } from '@cr/sim';
import { ByteReader, ByteWriter, ProtocolError } from './bytes.ts';
import { C2S, S2C } from './ids.ts';
import type { C2SLobby, S2CLobby } from './lobby.ts';

export interface Codec<T> { encode(w: ByteWriter, v: T): void; decode(r: ByteReader, into?: T): T }

// ---------------------------------------------------------------- InputFrame (8 bytes)

/** Writes a frame; out-of-range values are clamped (the sender is trusted to be sane, the receiver is not). */
export function writeFrame(w: ByteWriter, f: Readonly<InputFrame>): void {
  const steer = f.steer > 127 ? 127 : f.steer < -127 ? -127 : f.steer | 0;
  w.i8(steer);
  w.u8((f.throttle & 15) | ((f.brake & 15) << 4));
  w.u8(f.held & 7);
  w.u8(f.edges & 127);
  w.u8(f.aim >= 0 && f.aim < 8 ? f.aim : 255);
  w.u8(f.emote & 15);
  w.u16((f.steerIntent + 1) | (f.driftRequests << 2));
}

/** Reads a frame. Returns false when reserved bits or invalid values are present (§11: drop + strike). */
export function readFrame(r: ByteReader, out: InputFrame): boolean {
  const steer = r.i8(), pedals = r.u8(), held = r.u8(), edges = r.u8(), aim = r.u8(), emote = r.u8();
  out.steer = steer < -127 ? -127 : steer;
  out.throttle = pedals & 15;
  out.brake = pedals >>> 4;
  out.held = held & 7;
  out.edges = edges & 127;
  out.aim = aim < 8 ? aim : 255;
  out.emote = emote & 15;
  const extra = r.u16(); out.steerIntent = (extra & 3) - 1; out.driftRequests = (extra >>> 2) & 511;
  return (extra & ~2047) === 0 && (extra & 3) !== 3 && validDriftRequests(out.driftRequests) && (held & ~7) === 0 && (edges & ~127) === 0 && (emote & ~15) === 0 && (aim < 8 || aim === 255);
}

// ---------------------------------------------------------------- C2S_INPUT

export interface InputMsgT { firstTick: Tick; ackEventSeq: number; frames: InputFrame[]; valid?: boolean }

export const InputMsg: Codec<InputMsgT> = {
  encode(w, v) {
    const n = v.frames.length;
    if (n < 1 || n > 4) throw new ProtocolError('input', `n=${n}`);
    w.u8(C2S.INPUT); w.u32(v.firstTick); w.u16(v.ackEventSeq); w.u8(n);
    for (const f of v.frames) writeFrame(w, f);
  },
  decode(r, into) {
    const out = into ?? { firstTick: 0, ackEventSeq: 0, frames: [] };
    if (r.u8() !== C2S.INPUT) throw new ProtocolError('type');
    out.firstTick = r.u32();
    out.ackEventSeq = r.u16();
    const n = r.u8();
    if (n < 1 || n > 4) throw new ProtocolError('input', `n=${n}`);
    if (r.remaining() !== n * 8) throw new ProtocolError('input', 'length');
    let valid = true;
    for (let i = 0; i < n; i++) {
      const f = out.frames[i] ?? (out.frames[i] = makeInput());
      if (!readFrame(r, f)) valid = false;
    }
    out.frames.length = n;
    out.valid = valid;
    return out;
  },
};

// ---------------------------------------------------------------- PING / PONG

export interface PingT { pingId: number; clientMs: number }
export interface PongT { pingId: number; clientMsEcho: number; serverTick: Tick; tickPhase: number }

export const PingMsg: Codec<PingT> = {
  encode(w, v) { w.u8(C2S.PING); w.u16(v.pingId); w.u32(Math.floor(v.clientMs) >>> 0); },
  decode(r, into) {
    const out = into ?? { pingId: 0, clientMs: 0 };
    if (r.u8() !== C2S.PING) throw new ProtocolError('type');
    out.pingId = r.u16(); out.clientMs = r.u32();
    return out;
  },
};

export const PongMsg: Codec<PongT> = {
  encode(w, v) {
    w.u8(S2C.PONG); w.u16(v.pingId); w.u32(v.clientMsEcho); w.u32(v.serverTick);
    w.u16(Math.max(0, Math.min(65535, Math.floor(v.tickPhase))));
  },
  decode(r, into) {
    const out = into ?? { pingId: 0, clientMsEcho: 0, serverTick: 0, tickPhase: 0 };
    if (r.u8() !== S2C.PONG) throw new ProtocolError('type');
    out.pingId = r.u16(); out.clientMsEcho = r.u32(); out.serverTick = r.u32(); out.tickPhase = r.u16();
    return out;
  },
};

// ---------------------------------------------------------------- C2S_RESUME

export interface ResumeT { token: Uint32Array; lastSnapTick: Tick; lastEventSeq: number }

export const ResumeMsg: Codec<ResumeT> = {
  encode(w, v) {
    w.u8(C2S.RESUME);
    for (let i = 0; i < 4; i++) w.u32(v.token[i] ?? 0);
    w.i32(v.lastSnapTick); w.u16(v.lastEventSeq);
  },
  decode(r, into) {
    const out = into ?? { token: new Uint32Array(4), lastSnapTick: 0, lastEventSeq: 0 };
    if (r.u8() !== C2S.RESUME) throw new ProtocolError('type');
    for (let i = 0; i < 4; i++) out.token[i] = r.u32();
    out.lastSnapTick = r.i32(); out.lastEventSeq = r.u16();
    return out;
  },
};

// ---------------------------------------------------------------- S2C_INPUT_RELAY

export interface RelayEntry { slot: number; dTick: number; frame: InputFrame }
export interface RelayT { baseTick: Tick; entries: RelayEntry[] }

export const RelayMsg: Codec<RelayT> = {
  encode(w, v) {
    if (v.entries.length > 255) throw new ProtocolError('relay', 'too many');
    w.u8(S2C.INPUT_RELAY); w.u32(v.baseTick); w.u8(v.entries.length);
    for (const e of v.entries) {
      if (e.dTick < 0 || e.dTick > 255) throw new ProtocolError('relay', 'dTick');
      w.u8(e.slot); w.u8(e.dTick); writeFrame(w, e.frame);
    }
  },
  decode(r, into) {
    const out = into ?? { baseTick: 0, entries: [] };
    if (r.u8() !== S2C.INPUT_RELAY) throw new ProtocolError('type');
    out.baseTick = r.u32();
    const n = r.u8();
    if (r.remaining() !== n * 10) throw new ProtocolError('relay', 'length');
    for (let i = 0; i < n; i++) {
      const e = out.entries[i] ?? (out.entries[i] = { slot: 0, dTick: 0, frame: makeInput() });
      e.slot = r.u8();
      if (e.slot > 7) throw new ProtocolError('relay', 'slot');
      e.dTick = r.u8();
      if (!readFrame(r, e.frame)) throw new ProtocolError('relay', 'frame');
    }
    out.entries.length = n;
    return out;
  },
};

// ---------------------------------------------------------------- LOBBY_JSON (both directions)

type TextCodec = { encode(s: string): Uint8Array } & { decode?(b: Uint8Array): string };
const G = globalThis as unknown as { TextEncoder: new () => TextCodec; TextDecoder: new (label?: string, o?: { fatal?: boolean }) => { decode(b: Uint8Array): string } };
const enc = new G.TextEncoder();
const dec = new G.TextDecoder('utf-8', { fatal: true });

export const LOBBY_JSON_MAX = 4096;

export function encodeLobby(type: typeof C2S.LOBBY_JSON | typeof S2C.LOBBY_JSON, msg: C2SLobby | S2CLobby): Uint8Array {
  const body = enc.encode(JSON.stringify(msg));
  const out = new Uint8Array(body.length + 1);
  out[0] = type;
  out.set(body, 1);
  return out;
}
export const encodeC2SLobby = (m: C2SLobby): Uint8Array => encodeLobby(C2S.LOBBY_JSON, m);
export const encodeS2CLobby = (m: S2CLobby): Uint8Array => encodeLobby(S2C.LOBBY_JSON, m);

/** Parses a lobby JSON frame (either direction). Throws ProtocolError on bad UTF-8/JSON or oversize frames. */
export function decodeLobby(b: Uint8Array, maxBytes = Infinity): unknown {
  if (b.length - 1 > maxBytes) throw new ProtocolError('lobby', 'too large');
  try {
    return JSON.parse(dec.decode(b.subarray(1)));
  } catch (e) {
    throw new ProtocolError('lobby', String((e as Error)?.message ?? e));
  }
}

/** One reusable writer for encoders that immediately copy out (`finish`). */
export const scratchWriter = new ByteWriter(2048);
export function encodeWith<T>(c: Codec<T>, v: T): Uint8Array { scratchWriter.reset(); c.encode(scratchWriter, v); return scratchWriter.finish(); }
