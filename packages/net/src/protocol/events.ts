// S2C_EVENTS (20-netcode-spec §3.3/§3.6): ordered, acked authority decisions plus a few net-control entries.
// Layout: u16 firstSeq, u8 n, n × {u8 evType, u32 tick, u8 len, payload[len]}.
// Decisions must arrive exactly as the authority emitted them (items read them back on the predictor), so every
// field is checked against its compact wire type; a decision with any value that does not fit (negative ids,
// off-grid hazard positions, …) is sent in an extended form (evType | 0x80) whose payload is a list of tagged
// numbers. Receivers therefore always reconstruct the identical object.
import type { Decision, EffectResult, Tick } from '@cr/sim';
import { ByteReader, ByteWriter, ProtocolError } from './bytes.ts';
import { EV, S2C } from './ids.ts';
import type { Codec } from './messages.ts';

export type NetEvent =
  | Decision
  | { k: 'rtt'; tick: Tick; slot: number; ms: number }
  | { k: 'timeAdjust'; tick: Tick; ticks: number }
  | { k: 'resync'; tick: Tick }
  | { k: 'mash'; tick: Tick; slot: number; endTick: Tick; credited: number }
  | { k: 'unknown'; tick: Tick; type: number };

export interface EventsT { firstSeq: number; decisions: NetEvent[] }

const RESULTS: readonly EffectResult[] = ['hit', 'shielded', 'immune', 'immune_grace', 'miss', 'hit_late_input'];

type Kind = 'u8' | 'u16' | 'u32' | 'i32' | 'i8' | 'pos';
interface Layout { type: number; k: NetEvent['k']; fields: readonly string[]; kinds: readonly Kind[] }

const L = (type: number, k: NetEvent['k'], spec: ReadonlyArray<readonly [string, Kind]>): Layout =>
  ({ type, k, fields: spec.map((s) => s[0]), kinds: spec.map((s) => s[1]) });

const LAYOUTS: readonly Layout[] = [
  L(EV.ITEM_GRANTED, 'grant', [['slot', 'u8'], ['item', 'u8'], ['boxId', 'u16']]),
  L(EV.ITEM_USED, 'use', [['slot', 'u8'], ['item', 'u8'], ['obj', 'u32'], ['target', 'u8']]),
  L(EV.ITEM_USE_REJECTED, 'reject', [['slot', 'u8'], ['item', 'u8'], ['reason', 'u8'], ['refund', 'u8']]),
  L(EV.PROJ_COMMIT, 'commit', [['obj', 'u32'], ['victim', 'u8'], ['eff', 'u32'], ['impact', 'i32']]),
  L(EV.EFFECT_SCHEDULE, 'effect', [['eff', 'u32'], ['code', 'u8'], ['victim', 'u8'], ['source', 'u8'], ['start', 'i32'], ['dur', 'u16'], ['flags', 'u8']]),
  L(EV.EFFECT_RESULT, 'result', [['eff', 'u32'], ['victim', 'u8'], ['result', 'u8']]),
  L(EV.HAZARD_SPAWN, 'hazard', [['obj', 'u32'], ['code', 'u8'], ['owner', 'u8'], ['arm', 'i32'], ['life', 'u16'], ['x', 'pos'], ['y', 'pos'], ['z', 'pos']]),
  L(EV.HAZARD_REMOVE, 'hazardRemove', [['obj', 'u32']]),
  L(EV.MASH_RESULT, 'mash', [['slot', 'u8'], ['endTick', 'i32'], ['credited', 'u8']]),
  L(EV.TIME_ADJUST, 'timeAdjust', [['ticks', 'i8']]),
  L(EV.PLAYER_RTT, 'rtt', [['slot', 'u8'], ['ms', 'u16']]),
  L(EV.RESYNC_FULL, 'resync', []),
];
const BY_KIND = new Map<string, Layout>(LAYOUTS.map((l) => [l.k, l]));
const BY_TYPE: (Layout | undefined)[] = [];
for (const l of LAYOUTS) BY_TYPE[l.type] = l;

const isInt = (v: number): boolean => Number.isInteger(v) && !Object.is(v, -0);
function fits(v: number, kind: Kind): boolean {
  switch (kind) {
    case 'u8': return isInt(v) && v >= 0 && v <= 0xff;
    case 'i8': return isInt(v) && v >= -128 && v <= 127;
    case 'u16': return isInt(v) && v >= 0 && v <= 0xffff;
    case 'u32': return isInt(v) && v >= 0 && v <= 0xffffffff;
    case 'i32': return isInt(v) && v >= -0x80000000 && v <= 0x7fffffff;
    case 'pos': { const s = v * 4096; return isInt(s) && s >= -0x80000000 && s <= 0x7fffffff; }
  }
}
const SIZE: Record<Kind, number> = { u8: 1, i8: 1, u16: 2, u32: 4, i32: 4, pos: 4 };

function fieldValue(e: NetEvent, f: string): number {
  const v = (e as unknown as Record<string, unknown>)[f];
  if (f === 'result' && typeof v === 'string') {
    const i = RESULTS.indexOf(v as EffectResult);
    if (i < 0) throw new ProtocolError('events', `result ${v}`);
    return i;
  }
  if (typeof v !== 'number') throw new ProtocolError('events', `${e.k}.${f} missing`);
  return v;
}

/** Appends one event entry (type, tick, len, payload). */
export function writeEvent(w: ByteWriter, e: NetEvent): void {
  const lay = BY_KIND.get(e.k);
  if (!lay) throw new ProtocolError('events', `kind ${e.k}`);
  let compact = true;
  for (let i = 0; i < lay.fields.length; i++) if (!fits(fieldValue(e, lay.fields[i]!), lay.kinds[i]!)) { compact = false; break; }
  if (!Number.isInteger(e.tick) || e.tick < -0x80000000 || e.tick > 0x7fffffff) throw new ProtocolError('events', 'tick');
  w.u8(compact ? lay.type : lay.type | 0x80);
  w.i32(e.tick);
  const lenAt = w.pos;
  w.u8(0);
  const start = w.pos;
  for (let i = 0; i < lay.fields.length; i++) {
    const v = fieldValue(e, lay.fields[i]!);
    if (compact) {
      switch (lay.kinds[i]!) {
        case 'u8': w.u8(v); break;
        case 'i8': w.i8(v); break;
        case 'u16': w.u16(v); break;
        case 'u32': w.u32(v); break;
        case 'i32': w.i32(v); break;
        case 'pos': w.i32(v * 4096); break;
      }
    } else if (isInt(v) && Math.abs(v) <= 2 ** 52) { w.u8(0); w.vari(v); } else { w.u8(1); w.f64(v); }
  }
  const len = w.pos - start;
  if (len > 255) throw new ProtocolError('events', 'payload');
  w.patchU8(lenAt, len);
}

/** Reads one event entry; unknown types are skipped by length and returned as `{k:'unknown'}` so seqs stay aligned. */
export function readEvent(r: ByteReader): NetEvent {
  const t = r.u8(), tick = r.i32(), len = r.u8();
  const lay = BY_TYPE[t & 0x7f];
  if (!lay) { r.bytes(len); return { k: 'unknown', tick, type: t }; }
  const end = r.pos + len;
  const o: Record<string, unknown> = { k: lay.k, tick };
  for (let i = 0; i < lay.fields.length; i++) {
    let v: number;
    if ((t & 0x80) === 0) {
      switch (lay.kinds[i]!) {
        case 'u8': v = r.u8(); break;
        case 'i8': v = r.i8(); break;
        case 'u16': v = r.u16(); break;
        case 'u32': v = r.u32(); break;
        case 'i32': v = r.i32(); break;
        case 'pos': v = r.i32() / 4096; break;
      }
    } else {
      const tag = r.u8();
      v = tag === 0 ? r.vari() : r.f64();
    }
    const f = lay.fields[i]!;
    if (f === 'result') {
      const s = RESULTS[v];
      if (s === undefined) throw new ProtocolError('events', `result code ${v}`);
      o[f] = s;
    } else o[f] = v;
  }
  if ((t & 0x80) === 0 && r.pos !== end) throw new ProtocolError('events', 'len');
  if (r.pos > end) throw new ProtocolError('events', 'len');
  r.pos = end;
  return o as unknown as NetEvent;
}

/** Compact payload size of an event (for budgeting); extended entries are larger. */
export function eventSize(e: NetEvent): number {
  const lay = BY_KIND.get(e.k);
  return 6 + (lay ? lay.kinds.reduce((a, k) => a + SIZE[k], 0) : 0);
}

export const EventsMsg: Codec<EventsT> = {
  encode(w, v) {
    if (v.decisions.length > 255) throw new ProtocolError('events', 'too many');
    w.u8(S2C.EVENTS); w.u16(v.firstSeq & 0xffff); w.u8(v.decisions.length);
    for (const e of v.decisions) writeEvent(w, e);
  },
  decode(r, into) {
    const out = into ?? { firstSeq: 0, decisions: [] };
    if (r.u8() !== S2C.EVENTS) throw new ProtocolError('type');
    out.firstSeq = r.u16();
    const n = r.u8();
    out.decisions.length = 0;
    for (let i = 0; i < n; i++) out.decisions.push(readEvent(r));
    if (r.remaining() !== 0) throw new ProtocolError('events', 'trailing');
    return out;
  },
};

/** Recovers a full sequence number from its u16 wire form, choosing the value nearest to `near`. */
export function unwrapSeq16(wire: number, near: number): number {
  const base = near - (near & 0xffff);
  let v = base + (wire & 0xffff);
  if (v - near > 0x8000) v -= 0x10000;
  else if (near - v > 0x8000) v += 0x10000;
  return v;
}
