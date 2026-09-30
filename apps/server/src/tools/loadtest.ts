// Server load test (20-netcode-spec §13.5, 02-contracts E): N race rooms in one process, each with 7 bots and one
// attached human peer (its stamped inputs arrive over the binary protocol and it receives snapshots, relays and
// events), ticked as the 60 Hz server would. Reports per-room tick cost and total cost per server tick.
//   node apps/server/src/tools/loadtest.ts [--rooms 50] [--ticks 1800] [--mode item|speed] [--track proving_ring]
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { loadContent, type ContentTables } from '@cr/content';
import { AI_TIERS, SIM_VERSION, createAiDriver, loadCtrk, makeInput, toArrayBuffer, type BakedTrack, type RaceConfig, type SlotConfig } from '@cr/sim';
import { ByteWriter, InputMsg, loopbackPair } from '@cr/net';
import { RaceRoom } from '@cr/room';

export interface LoadResult {
  rooms: number; ticks: number;
  /** Wall time (includes time the process was descheduled on a shared machine). */
  roomTickP50: number; roomTickP99: number; totalP50: number; totalP99: number; totalMax: number;
  /** CPU time (process.cpuUsage), which excludes preemption by other processes. */
  cpuRoomTickP50: number; cpuRoomTickP99: number; cpuTotalP50: number; cpuTotalP99: number;
  bytesPerPeerPerSec: number;
}

const CHARS = ['clay', 'pixel', 'turbo', 'anchor', 'rune', 'nova', 'kage', 'bisque'] as const;
const KARTS = ['pebble', 'clay_comet', 'arrowhead', 'tugboat', 'glacier_sled', 'neon_blade', 'jet_kettle', 'crown_cruiser'] as const;

function config(track: BakedTrack, mode: 'item' | 'speed', seed: number): RaceConfig {
  const slots: SlotConfig[] = CHARS.map((c, i): SlotConfig => (i === 0
    ? { kind: 'human', team: 0, name: 'p', characterId: c, kartBodyId: KARTS[i]!, vMul: 1 }
    : { kind: 'bot', team: 0, name: `b${i}`, characterId: c, kartBodyId: KARTS[i]!, ai: 'pro', vMul: AI_TIERS.pro.vMul }));
  return {
    simVersion: SIM_VERSION, mode, teams: 'solo', trackId: track.id, trackHash: track.hash, laps: 3, slots, seed,
    rules: { retireTicks: 600, friendlyFire: 'area', itemSet: 'standard', rubberBand: true, instantBoostInItem: true }, introTicks: 0, countdownTicks: 60,
  };
}

const pct = (xs: number[], p: number): number => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0; };

export function runLoad(o: { track: BakedTrack; content: ContentTables; rooms: number; ticks: number; mode?: 'item' | 'speed'; warmup?: number; peers?: boolean }): LoadResult {
  const mode = o.mode ?? 'item';
  const warm = o.warmup ?? 120;
  const w = new ByteWriter(64);
  // a virtual 60 Hz clock: the test runs faster than real time, and the rate limiter must see the real message rate
  let tick = 0;
  const clock = { nowMs: (): number => tick * (1000 / 60) };
  const rooms = Array.from({ length: o.rooms }, (_, i) => {
    const cfg = config(o.track, mode, 1000 + i);
    const room = new RaceRoom({ config: cfg, track: o.track, content: o.content, clock, collectEvents: false, limits: { perSec: 70, burst: 10 } });
    const [client, server] = loopbackPair(0);
    let bytes = 0;
    client.onMessage = (b) => { bytes += b.length; };
    // peers: false measures the simulation alone (the player's frames go in through setInput)
    if (o.peers !== false) room.attach({ id: `p${i}`, slot: 0, transport: server, resumeToken: '0'.repeat(32) });
    // the player's inputs come from a driver on the authoritative world (its cost is not counted as server time)
    const d = createAiDriver(o.track, o.content, 0, AI_TIERS.pro, {}, 7 + i, cfg);
    return { room, client, d, frame: makeInput(), bytes: () => bytes };
  });
  const roomMs: number[] = [], totalMs: number[] = [], cpuRoom: number[] = [], cpuTotal: number[] = [];
  const cpu = (): number => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
  for (let t = 0; t < o.ticks + warm; t++) {
    tick = t;
    let total = 0, ctotal = 0;
    for (const r of rooms) {
      r.d.decide(r.room.world, r.frame);
      w.reset(); InputMsg.encode(w, { firstTick: r.room.tickNo + 1, ackEventSeq: r.room.eventSeqHead & 0xffff, frames: [r.frame] });
      const msg = w.finish();
      const c0 = cpu(), t0 = performance.now();
      if (o.peers !== false) r.client.send(msg);     // delivered synchronously: decoding and buffering count as server work
      else r.room.setInput(0, r.frame);
      r.room.tick();
      const dt = performance.now() - t0, dc = cpu() - c0;
      total += dt; ctotal += dc;
      if (t >= warm) { roomMs.push(dt); cpuRoom.push(dc); }
    }
    if (t >= warm) { totalMs.push(total); cpuTotal.push(ctotal); }
  }
  const secs = (o.ticks + warm) / 60;
  return {
    rooms: o.rooms, ticks: o.ticks,
    roomTickP50: pct(roomMs, 50), roomTickP99: pct(roomMs, 99), totalP50: pct(totalMs, 50), totalP99: pct(totalMs, 99), totalMax: Math.max(...totalMs),
    cpuRoomTickP50: pct(cpuRoom, 50), cpuRoomTickP99: pct(cpuRoom, 99), cpuTotalP50: pct(cpuTotal, 50), cpuTotalP99: pct(cpuTotal, 99),
    bytesPerPeerPerSec: rooms.reduce((a, r) => a + r.bytes(), 0) / rooms.length / secs,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (f: string, d: string): string => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] ?? d : d; };
  const id = arg('--track', 'proving_ring');
  const track = loadCtrk(toArrayBuffer(readFileSync(new URL(`../../../client/public/tracks/${id}.ctrk`, import.meta.url))));
  const r = runLoad({ track, content: loadContent(), rooms: Number(arg('--rooms', '50')), ticks: Number(arg('--ticks', '1800')), mode: arg('--mode', 'item') as 'item' | 'speed', peers: arg('--peers', '1') !== '0' });
  const f = (x: number): string => x.toFixed(3);
  console.log(`rooms ${r.rooms} × ${r.ticks} ticks, ${(r.bytesPerPeerPerSec / 1024).toFixed(1)} KB/s per peer`);
  console.log(`  wall: room tick p50 ${f(r.roomTickP50)} p99 ${f(r.roomTickP99)} ms (budget 0.5) | server tick p50 ${f(r.totalP50)} p99 ${f(r.totalP99)} max ${f(r.totalMax)} ms (budget 4)`);
  console.log(`  cpu:  room tick p50 ${f(r.cpuRoomTickP50)} p99 ${f(r.cpuRoomTickP99)} ms | server tick p50 ${f(r.cpuTotalP50)} p99 ${f(r.cpuTotalP99)} ms`);
}
