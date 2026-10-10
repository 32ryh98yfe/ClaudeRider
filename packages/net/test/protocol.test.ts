// Codec round-trip and fuzz tests (20-netcode-spec §13.5): every message decodes to exactly what was encoded,
// world blocks are lossless (flat- and hash-equal), and garbage never throws anything but ProtocolError.
import { describe, expect, it } from 'vitest';
import {
  cloneWorld, createWorld, hashWorld, makeInput, makeContext, step, ArraySink, createAiDriver, AI_TIERS,
  type Decision, type InputFrame, type WorldState,
} from '@cr/sim';
import {
  ByteReader, ByteWriter, ProtocolError, InputMsg, PingMsg, PongMsg, ResumeMsg, RelayMsg, EventsMsg, encodeWith,
  encodeC2SLobby, decodeLobby, FlatWorld, flattenWorld, flatEquals, flatHash, encodeWorld, decodeWorld, referenceWorld,
  SnapshotDecoder, SnapshotEncoder, NetFlag, newMeta, KART_GROUPS, KN, unwrapSeq16, createSnapshotCodec, type NetEvent,
} from '../src/index.ts';
import { mulberry, raceConfig, testContent, testTrack } from './helpers.ts';

const track = testTrack();
const content = testContent();

describe('ByteWriter / ByteReader', () => {
  it('round-trips primitives and varints at their edges', () => {
    const w = new ByteWriter(4);
    const ints = [0, 1, 127, 128, 255, 16383, 16384, 2 ** 31 - 1, 2 ** 31, 2 ** 32, 2 ** 45 + 3, 2 ** 53 - 1];
    const zz = [0, -1, 1, -64, 64, -(2 ** 31), 2 ** 31, -(2 ** 52), 2 ** 52 - 1];
    w.u8(200); w.i8(-100); w.u16(65535); w.i16(-32768); w.i24(-8388608); w.i24(8388607); w.u32(4294967295); w.i32(-2147483648); w.f64(Math.PI);
    for (const v of ints) w.varu(v);
    for (const v of zz) w.vari(v);
    const r = new ByteReader(w.finish());
    expect([r.u8(), r.i8(), r.u16(), r.i16(), r.i24(), r.i24(), r.u32(), r.i32(), r.f64()]).toEqual([200, -100, 65535, -32768, -8388608, 8388607, 4294967295, -2147483648, Math.PI]);
    for (const v of ints) expect(r.varu()).toBe(v);
    for (const v of zz) expect(r.vari()).toBe(v);
    expect(r.remaining()).toBe(0);
    expect(() => r.u8()).toThrow(ProtocolError);
  });

  it('unwraps 16-bit sequence numbers around the nearest value', () => {
    expect(unwrapSeq16(5, 65534)).toBe(65541);
    expect(unwrapSeq16(65530, 65541)).toBe(65530);
    expect(unwrapSeq16(100, 90)).toBe(100);
    expect(unwrapSeq16(0xffff, 3)).toBe(-1);
  });
});

const frame = (p: Partial<InputFrame>): InputFrame => ({ ...makeInput(), ...p });

describe('small messages', () => {
  it('INPUT is 16 bytes for one frame and round-trips up to 4 frames', () => {
    const one = encodeWith(InputMsg, { firstTick: 1234, ackEventSeq: 77, frames: [frame({ steer: -127, throttle: 15, brake: 3, held: 5, edges: 33, aim: 7, emote: 9 })] });
    expect(one.length).toBe(16);
    const frames = [frame({ steer: 12 }), frame({ steer: 127, throttle: 1, edges: 64, steerIntent: -1, driftRequests: 6 }), frame({ aim: 255, edges: 127, steerIntent: 1, driftRequests: 341 }), frame({ held: 7, brake: 15 })];
    const out = InputMsg.decode(new ByteReader(encodeWith(InputMsg, { firstTick: 99, ackEventSeq: 65535, frames })));
    expect(out).toEqual({ firstTick: 99, ackEventSeq: 65535, frames, valid: true });
  });

  it('INPUT with reserved bits is flagged invalid; wrong lengths throw', () => {
    const b = encodeWith(InputMsg, { firstTick: 1, ackEventSeq: 0, frames: [frame({})] });
    const bad = b.slice(); bad[8 + 2] = 0x80; // held bit 7
    expect(InputMsg.decode(new ByteReader(bad)).valid).toBe(false);
    const edge = b.slice(); edge[8 + 3] = 0x80; // edge bit 7 remains reserved
    expect(InputMsg.decode(new ByteReader(edge)).valid).toBe(false);
    const aim = b.slice(); aim[8 + 4] = 9;
    expect(InputMsg.decode(new ByteReader(aim)).valid).toBe(false);
    for (const extra of [3, 1 | (511 << 2), 0x8001]) { const invalid = b.slice(); new DataView(invalid.buffer).setUint16(14, extra, true); expect(InputMsg.decode(new ByteReader(invalid)).valid).toBe(false); }
    expect(() => InputMsg.decode(new ByteReader(b.subarray(0, 13)))).toThrow(ProtocolError);
    const n0 = b.slice(); n0[7] = 0;
    expect(() => InputMsg.decode(new ByteReader(n0))).toThrow(ProtocolError);
  });

  it('PING (7 B), PONG, RESUME (23 B) and RELAY round-trip', () => {
    const ping = encodeWith(PingMsg, { pingId: 65535, clientMs: 2 ** 32 + 5 });
    expect(ping.length).toBe(7);
    expect(PingMsg.decode(new ByteReader(ping))).toEqual({ pingId: 65535, clientMs: 5 });
    const pong = { pingId: 3, clientMsEcho: 123456, serverTick: 987654, tickPhase: 40000 };
    expect(PongMsg.decode(new ByteReader(encodeWith(PongMsg, pong)))).toEqual(pong);
    const token = new Uint32Array([1, 0xffffffff, 3, 0x80000000]);
    const res = encodeWith(ResumeMsg, { token, lastSnapTick: 4321, lastEventSeq: 9 });
    expect(res.length).toBe(23);
    expect(ResumeMsg.decode(new ByteReader(res))).toEqual({ token, lastSnapTick: 4321, lastEventSeq: 9 });
    const relay = { baseTick: 500, entries: [{ slot: 3, dTick: 0, frame: frame({ steer: 5 }) }, { slot: 7, dTick: 255, frame: frame({ throttle: 15, held: 1 }) }] };
    const rb = encodeWith(RelayMsg, relay);
    expect(rb.length).toBe(6 + 2 * 10);
    expect(RelayMsg.decode(new ByteReader(rb))).toEqual(relay);
  });

  it('lobby JSON frames round-trip and reject garbage', () => {
    const m = { t: 'chat' as const, text: '안녕 hello' };
    expect(decodeLobby(encodeC2SLobby(m))).toEqual(m);
    expect(() => decodeLobby(new Uint8Array([0x10, 0xff, 0xfe]))).toThrow(ProtocolError);
    expect(() => decodeLobby(new Uint8Array([0x10, ...new Array(5000).fill(32)]), 4096)).toThrow(ProtocolError);
  });
});

function randomDecision(R: () => number, extended: boolean): NetEvent {
  const u8 = (): number => Math.floor(R() * 256), u16 = (): number => Math.floor(R() * 65536), u32 = (): number => Math.floor(R() * 4294967296);
  const tick = Math.floor(R() * 100000);
  const pos = (): number => extended && R() < 0.5 ? R() * 100 - 50 : Math.round((R() * 2000 - 1000) * 4096) / 4096;
  const odd = (v: number): number => (extended && R() < 0.3 ? -1 - Math.floor(R() * 5) : v);
  const kinds = ['grant', 'use', 'reject', 'commit', 'effect', 'result', 'hazard', 'hazardRemove', 'rtt', 'timeAdjust', 'resync', 'mash'] as const;
  const k = kinds[Math.floor(R() * kinds.length)]!;
  switch (k) {
    case 'grant': return { k, tick, slot: u8() & 7, item: u8(), boxId: odd(u16()) };
    case 'use': return { k, tick, slot: u8() & 7, item: u8(), obj: u32(), target: odd(u8()) };
    case 'reject': return { k, tick, slot: u8() & 7, item: u8(), reason: u8(), refund: (u8() & 1) as 0 | 1 };
    case 'commit': return { k, tick, obj: u32(), victim: u8() & 7, eff: u32(), impact: odd(tick + 20) };
    case 'effect': return { k, tick, eff: u32(), code: u8(), victim: u8() & 7, source: odd(u8() & 7), start: tick + 21, dur: u16(), flags: u8() };
    case 'result': return { k, tick, eff: u32(), victim: u8() & 7, result: (['hit', 'shielded', 'immune', 'immune_grace', 'miss', 'hit_late_input'] as const)[u8() % 6]! };
    case 'hazard': return { k, tick, obj: u32(), code: u8(), owner: u8() & 7, arm: tick + 10, life: u16(), x: pos(), y: pos(), z: pos() };
    case 'hazardRemove': return { k, tick, obj: u32() };
    case 'rtt': return { k, tick, slot: u8() & 7, ms: u16() };
    case 'timeAdjust': return { k, tick, ticks: u8() - 128 };
    case 'resync': return { k, tick };
    case 'mash': return { k, tick, slot: u8() & 7, endTick: tick + u8(), credited: u8() };
  }
}

describe('EVENTS', () => {
  it('carries every decision kind unchanged, compact or extended', () => {
    const R = mulberry(11);
    for (let round = 0; round < 200; round++) {
      const decisions = Array.from({ length: 1 + Math.floor(R() * 30) }, () => randomDecision(R, round % 2 === 1));
      const out = EventsMsg.decode(new ByteReader(encodeWith(EventsMsg, { firstSeq: round * 300, decisions })));
      expect(out.firstSeq).toBe((round * 300) & 0xffff);
      expect(out.decisions).toEqual(decisions);
      for (let i = 0; i < decisions.length; i++) for (const [key, v] of Object.entries(decisions[i]!)) expect(Object.is((out.decisions[i] as unknown as Record<string, unknown>)[key], v)).toBe(true);
    }
  });

  it('uses the compact layout sizes of §3.6', () => {
    const d: Decision = { k: 'use', tick: 10, slot: 1, item: 4, obj: 0xdeadbeef, target: 255 };
    expect(encodeWith(EventsMsg, { firstSeq: 1, decisions: [d] }).length).toBe(4 + 6 + 7);
    const h: Decision = { k: 'hazard', tick: 10, obj: 1, code: 2, owner: 3, arm: 30, life: 600, x: 1.5, y: -2.25, z: 100 };
    expect(encodeWith(EventsMsg, { firstSeq: 1, decisions: [h] }).length).toBe(4 + 6 + 24);
  });
});

// ---------------------------------------------------------------- world block

function setRandomOnGrid(o: Record<string, number>, keys: readonly string[], scales: readonly number[], R: () => number, wild: boolean): void {
  for (let j = 0; j < keys.length; j++) {
    const s = scales[j]!;
    let v = Math.round((R() * 2 - 1) * (R() < 0.5 ? 50 : 5000) * s) / s;
    if (wild) {
      const x = R();
      if (x < 0.03) v = -0; else if (x < 0.05) v = NaN; else if (x < 0.07) v = R() * 10 - 5; else if (x < 0.08) v = Infinity;
    }
    o[keys[j]!] = v;
  }
}

function randomWorld(R: () => number, template: WorldState, wild: boolean): WorldState {
  const w = cloneWorld(template);
  w.tick = Math.floor(R() * 1e6); w.phase = Math.floor(R() * 5) as 0; w.goTick = Math.floor(R() * 400); w.seq = Math.floor(R() * 4294967296); w.nextObjId = Math.floor(R() * 1e6);
  w.firstFinishTick = R() < 0.5 ? -1 : Math.floor(R() * 1e5); w.endTick = -1;
  for (const k of w.karts) {
    if (R() < 0.15) continue; // leave some slots untouched (inactive-like)
    for (const g of KART_GROUPS) setRandomOnGrid(g.obj(k), g.keys, g.scales, R, wild);
    if (R() < 0.5) Object.assign(k.race.lastValid, k.race.loc);
  }
  const n = (m: number): number => Math.floor(R() * m);
  w.teams = Array.from({ length: n(4) }, () => ({ gauge: Math.round(R() * 65536) / 65536, granted: n(5) }));
  w.effects = Array.from({ length: n(10) }, () => ({ id: n(2 ** 32), code: n(20), victim: n(8), source: n(8), start: n(1e5), end: n(1e5), param: wild && R() < 0.2 ? R() : n(100) - 50, flags: n(256), result: n(4) as 0 }));
  w.projectiles = Array.from({ length: n(6) }, () => ({ id: n(2 ** 32), code: n(18), owner: n(8), target: n(8), phase: n(4), path: n(3), s: n(4e6) / 4096, u: (n(8e4) - 4e4) / 4096, h: n(4e4) / 4096, px: (n(8e6) - 4e6) / 4096, py: n(4e5) / 4096, pz: (n(8e6) - 4e6) / 4096, spawn: n(1e5), commit: n(1e5), impact: n(1e5) }));
  w.hazards = Array.from({ length: n(6) }, () => ({ id: n(2 ** 32), code: n(18), owner: n(8), team: n(4), px: n(4e6) / 4096, py: n(4e5) / 4096, pz: -n(4e6) / 4096, radius: n(4e4) / 4096, arm: n(1e5), expire: n(1e5), flags: n(8) }));
  for (let i = 0; i < w.boxRespawn.length; i++) w.boxRespawn[i] = R() < 0.2 ? n(1e5) : 0;
  return w;
}

function roundTripKeyframe(w: WorldState): WorldState {
  const ref = referenceWorld(w.boxRespawn.length);
  const refFlat = flattenWorld(ref, new FlatWorld());
  const wr = new ByteWriter();
  encodeWorld(wr, flattenWorld(w, new FlatWorld()), refFlat);
  const out = cloneWorld(w);
  out.tick = 0;
  decodeWorld(new ByteReader(wr.finish()), out, refFlat, ref);
  out.tick = w.tick;
  return out;
}

describe('world block', () => {
  const cfg = raceConfig({ empty: 2 });
  const template = createWorld(cfg, track, content);

  it('keyframes of random on-grid worlds are flat-, hash- and deep-equal', () => {
    const R = mulberry(3);
    for (let i = 0; i < 150; i++) {
      const w = randomWorld(R, template, false);
      const out = roundTripKeyframe(w);
      expect(flatEquals(flattenWorld(out, new FlatWorld()), flattenWorld(w, new FlatWorld()))).toBe(true);
      expect(hashWorld(out)).toBe(hashWorld(w));
      expect({ ...out, decisions: null }).toEqual({ ...w, decisions: null });
    }
  });

  it('the generated kart flattener matches the field table exactly (ints, raws, exception counts)', () => {
    const R = mulberry(8);
    for (let i = 0; i < 50; i++) {
      const w = randomWorld(R, template, true);
      const f = flattenWorld(w, new FlatWorld());
      for (let s = 0; s < 8; s++) KART_GROUPS.forEach((g, gi) => {
        let exc = 0;
        g.keys.forEach((key, j) => {
          const x = g.obj(w.karts[s]!)[key]!, at = s * KN + g.off + j, v = x * g.scales[j]!;
          let n = Math.round(v);
          let e = n !== v || (n === 0 && 1 / x < 0);
          if (!(n <= 2 ** 51 && n >= -(2 ** 51))) { e = true; n = 0; }
          if (e) exc++;
          expect(Object.is(f.kRaw[at], x)).toBe(true);
          expect(f.k[at]).toBe(n);
        });
        expect(f.kExc[s * KART_GROUPS.length + gi]).toBe(exc);
      });
    }
  });

  it('every numeric KartState field is in exactly one group', () => {
    const k = template.karts[0]!;
    const listed = new Set<string>();
    for (const g of KART_GROUPS) for (const key of g.keys) { const id = `${g.path}.${key}`; expect(listed.has(id)).toBe(false); listed.add(id); }
    const walk = (o: Record<string, unknown>, path: string): void => {
      for (const [key, v] of Object.entries(o)) {
        if (typeof v === 'number') expect(listed.has(`${path}.${key}`), `${path}.${key}`).toBe(true);
        else if (v && typeof v === 'object') walk(v as Record<string, unknown>, path ? `${path}.${key}` : key);
      }
    };
    walk(k as unknown as Record<string, unknown>, '');
  });

  it('stays lossless for −0, NaN, ±Infinity and off-grid floats (exception list)', () => {
    const R = mulberry(4);
    for (let i = 0; i < 150; i++) {
      const w = randomWorld(R, template, true);
      const a = flattenWorld(w, new FlatWorld()), b = flattenWorld(roundTripKeyframe(w), new FlatWorld());
      expect(flatEquals(b, a)).toBe(true);
      expect(flatHash(b)).toBe(flatHash(a));
    }
  });

  it('delta chains of random worlds equal their keyframes', () => {
    const R = mulberry(5);
    const enc = new SnapshotEncoder(template.boxRespawn.length, 4);
    const dec = new SnapshotDecoder(template);
    let base = 0;
    for (let i = 0; i < 200; i++) {
      const w = randomWorld(R, template, i % 3 === 0);
      w.tick = 2 * (i + 1);
      if (R() < 0.5) { const prev = dec.world; w.karts[3] = cloneWorld(prev).karts[3]!; } // unchanged kart groups
      enc.capture(w);
      const key = base === 0 || R() < 0.1;
      const meta = { ...newMeta(), tick: w.tick, baseTick: key ? 0 : base, netFlags: key ? NetFlag.KEYFRAME : 0 };
      dec.decode(enc.message(meta, enc.body(meta.baseTick)));
      expect(flatEquals(dec.flat, flattenWorld(w, new FlatWorld()))).toBe(true);
      base = w.tick;
    }
  });

  it('1000-snapshot delta chain from a real race equals the authority at every step (≈ 400 B deltas)', () => {
    const cfg8 = raceConfig({ mode: 'item', laps: 3 });
    const w = createWorld(cfg8, track, content);
    const ctx = makeContext({ track, cfg: cfg8, content, role: 'authority', events: new ArraySink() });
    const drivers = cfg8.slots.map((s, i) => createAiDriver(track, content, i, AI_TIERS[s.ai ?? 'pro'], {}, 40 + i));
    const inputs = cfg8.slots.map(() => makeInput());
    const enc = new SnapshotEncoder(w.boxRespawn.length);
    const dec = new SnapshotDecoder(w);
    let base = 0, deltaBytes = 0, deltas = 0, keyBytes = 0, keys = 0;
    for (let s = 0; s < 1000; s++) {
      for (let t = 0; t < 2; t++) {
        for (let i = 0; i < 8; i++) drivers[i]!.decide(w, inputs[i]!);
        step(w, inputs, ctx);
        (ctx.events as ArraySink).list.length = 0;
      }
      enc.capture(w);
      const key = s % 30 === 0;
      const meta = { ...newMeta(), tick: w.tick, baseTick: key ? 0 : base, netFlags: key ? NetFlag.KEYFRAME : 0 };
      const body = enc.body(meta.baseTick);
      dec.decode(enc.message(meta, body));
      expect(hashWorld(dec.world)).toBe(hashWorld(w));
      expect(flatEquals(dec.flat, flattenWorld(w, new FlatWorld()))).toBe(true);
      if (key) { keyBytes += body.length; keys++; } else if (w.phase >= 2) { deltaBytes += body.length; deltas++; }
      base = w.tick;
    }
    const avgDelta = deltaBytes / deltas, avgKey = keyBytes / keys;
    console.log(`snapshot body: delta avg ${avgDelta.toFixed(0)} B, keyframe avg ${avgKey.toFixed(0)} B`);
    expect(avgDelta).toBeLessThan(450);
    expect(avgKey).toBeLessThan(1600);
  });

  it('the contract codec (createSnapshotCodec) round-trips a stream', () => {
    const cfg1 = raceConfig();
    const w = createWorld(cfg1, track, content);
    const a = createSnapshotCodec(w), b = createSnapshotCodec(w);
    const R = mulberry(9);
    for (let i = 0; i < 20; i++) {
      const x = randomWorld(R, w, false); x.tick = 2 * (i + 1);
      const wr = new ByteWriter();
      a.encode(wr, { meta: newMeta(), world: x });
      const out = b.decode(new ByteReader(wr.finish()));
      expect(hashWorld(out.world)).toBe(hashWorld(x));
    }
  });
});

describe('fuzz', () => {
  it('mutated and random frames only ever throw ProtocolError', () => {
    const R = mulberry(12);
    const cfg = raceConfig();
    const template = createWorld(cfg, track, content);
    const samples: Uint8Array[] = [
      encodeWith(InputMsg, { firstTick: 5, ackEventSeq: 1, frames: [makeInput(), makeInput()] }),
      encodeWith(RelayMsg, { baseTick: 5, entries: [{ slot: 1, dTick: 3, frame: makeInput() }] }),
      encodeWith(EventsMsg, { firstSeq: 3, decisions: Array.from({ length: 5 }, () => randomDecision(R, true)) }),
      encodeWith(ResumeMsg, { token: new Uint32Array(4), lastSnapTick: 1, lastEventSeq: 2 }),
    ];
    const enc = new SnapshotEncoder(template.boxRespawn.length);
    const w = randomWorld(R, template, true); w.tick = 10;
    enc.capture(w);
    samples.push(enc.message({ ...newMeta(), tick: 10, netFlags: NetFlag.KEYFRAME }, enc.body(0)));
    const decoders: ((b: Uint8Array) => unknown)[] = [
      (b) => InputMsg.decode(new ByteReader(b)), (b) => RelayMsg.decode(new ByteReader(b)), (b) => EventsMsg.decode(new ByteReader(b)),
      (b) => ResumeMsg.decode(new ByteReader(b)), (b) => PongMsg.decode(new ByteReader(b)), (b) => new SnapshotDecoder(template).decode(b),
    ];
    let threw = 0, ok = 0;
    for (let i = 0; i < 4000; i++) {
      let b: Uint8Array;
      if (i % 5 === 0) b = new Uint8Array(Array.from({ length: Math.floor(R() * 64) }, () => Math.floor(R() * 256)));
      else {
        b = samples[i % samples.length]!.slice();
        const muts = 1 + Math.floor(R() * 4);
        for (let m = 0; m < muts; m++) {
          const x = R();
          if (x < 0.6 && b.length) b[Math.floor(R() * b.length)] = Math.floor(R() * 256);
          else if (x < 0.8) b = b.subarray(0, Math.floor(R() * b.length));
          else b = new Uint8Array([...b, ...Array.from({ length: 1 + Math.floor(R() * 8) }, () => Math.floor(R() * 256))]);
        }
      }
      for (const d of decoders) {
        try { d(b); ok++; } catch (e) {
          if (!(e instanceof ProtocolError)) throw new Error(`non-protocol error ${String(e)} for ${Array.from(b).join(',')}`, { cause: e });
          threw++;
        }
      }
    }
    expect(threw).toBeGreaterThan(0);
    expect(ok).toBeGreaterThan(0);
  });
});
