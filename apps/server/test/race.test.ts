// Online race through the whole server stack: lobby → loading → race → raceEnd, with two predicting NetClients
// sharing each socket with lobby JSON (FrameMux), a mid-race drop + resume, and the server's AI takeover.
import { describe, expect, it } from 'vitest';
import { loadContent } from '@cr/content';
import { AI_TIERS, createAiDriver, hashWorld } from '@cr/sim';
import { ClockSync, EarlyFrameBuffer, NetClient, S2C, type Channel, type S2CLobby } from '@cr/net';
import { memoryTracks, World, type TestClient } from './fixture.ts';

const content = loadContent();
const track = memoryTracks().get('proving_ring');

function netClientFor(c: TestClient, rs: Extract<S2CLobby, { t: 'raceStart' }>, w: World, transport?: Channel, clock?: ClockSync): NetClient {
  const ch = transport ?? c.mux.channel((t) => t === S2C.SNAPSHOT || t === S2C.EVENTS || t === S2C.INPUT_RELAY || t === S2C.PONG);
  const d = createAiDriver(track, content, rs.yourSlot, AI_TIERS.pro, {}, 11 + rs.yourSlot, rs.config);
  return new NetClient({
    transport: ch, track, content, cfg: rs.config, slot: rs.yourSlot, nowMs: () => w.clock.now, startTick: rs.startTick, mode: 'synced',
    ...(rs.resumeToken ? { resumeToken: rs.resumeToken } : {}), ...(clock ? { clock } : {}), inputProvider: (world, out) => d.decide(world, out),
  });
}

describe('online race through GameServer', () => {
  it('two players race 1 lap with bots, one drops for 2 s and resumes, both get the same results', () => {
    const w = new World();
    const h = w.client('Host').hello();
    h.send({ t: 'create', settings: { mode: 'speed', teams: 'solo', track: 'proving_ring', laps: 1, fillBots: true, botTier: 'pro', isPrivate: true, maxHumans: 8 } });
    const code = h.last('room')!.room.code;
    const g = w.client('Guest').hello().send({ t: 'join', code });
    g.send({ t: 'ready', ready: true });
    h.send({ t: 'start' });
    const players = [h, g];
    const ncs = new Map<TestClient, NetClient>();
    for (const c of players) {
      const rs = c.last('raceStart')!;
      ncs.set(c, netClientFor(c, rs, w));
      c.send({ t: 'loaded', trackHash: rs.config.trackHash });
    }
    const fin = h.last('raceStart')!;
    expect(fin.provisional).toBe(false);
    let seen = 0;
    w.onTick.push(() => {
      for (const c of players) {
        const rs = c.last('raceStart')!;
        const nc = ncs.get(c)!;
        nc.setStartTick(rs.startTick);
        nc.update(w.clock.now);
      }
      seen++;
    });
    const race = () => w.server.activeRooms().find((r) => r.race)?.race;
    // run until 10 s into the race, drop the guest for 2 s, then resume on a new socket
    w.advance(10_000);
    const gSlot = g.last('raceStart')!.yourSlot;
    g.drop();
    w.advance(2_000);
    expect(race()!.room.aiDriving(gSlot)).toBe(false); // 2 s < the 3 s takeover
    g.reconnect();
    const rs2 = g.last('raceStart')!;
    expect(rs2.raceId).toBe(fin.raceId);
    ncs.get(g)!.replaceTransport(g.mux.channel((t) => t === S2C.SNAPSHOT || t === S2C.EVENTS || t === S2C.INPUT_RELAY || t === S2C.PONG));
    const tResume = w.clock.now, tickAtResume = race()!.room.tickNo;
    let resumedAt = -1;
    for (let i = 0; i < 120 && resumedAt < 0; i++) { w.advance(1000 / 60); if (ncs.get(g)!.auth.tick >= tickAtResume) resumedAt = w.clock.now; }
    expect(resumedAt - tResume).toBeLessThan(1000);
    // finish the race
    for (let i = 0; i < 120 && !h.last('raceEnd'); i++) w.advance(1000);
    const rh = h.last('raceEnd')!, rg = g.last('raceEnd')!;
    expect(rh).toBeDefined();
    expect(rg.result).toEqual(rh.result);
    expect(rh.result.rows.length).toBe(8);
    expect(rh.result.rows.filter((r) => r.kind === 'human').every((r) => r.finished)).toBe(true);
    expect(h.last('room')!.room.phase).toBe('results');
    // both clients hold the authoritative world exactly (lossless snapshots) — compare at the server's current tick
    const srv = race();
    if (srv) {
      w.advance(200);
      for (const c of players) { const nc = ncs.get(c)!; if (nc.auth.tick === srv.room.world.tick) expect(hashWorld(nc.auth)).toBe(hashWorld(srv.room.world)); }
    }
    for (const nc of ncs.values()) {
      expect(nc.stats.decodeErrors).toBe(0);
      expect(nc.stats.snapshots).toBeGreaterThan(500);
    }
    // back to the room after the 12 s results screen, ready states reset
    w.advance(12_500);
    const v = h.last('room')!.room;
    expect(v.phase).toBe('waiting');
    expect(v.slots.find((s) => s.name === 'Guest')!.ready).toBe(false);
    expect(seen).toBeGreaterThan(0);
  }, 180_000);

  it('a player who never loads is driven by the AI after 3 s and the race still finishes', () => {
    const w = new World({ loadMaxMs: 2000 });
    const h = w.client('Host').hello();
    h.send({ t: 'create', settings: { mode: 'speed', teams: 'solo', track: 'proving_ring', laps: 1, fillBots: true, botTier: 'pro', isPrivate: true, maxHumans: 8 } });
    const code = h.last('room')!.room.code;
    const g = w.client('Late').hello().send({ t: 'join', code });
    g.send({ t: 'ready', ready: true });
    h.send({ t: 'start' });
    const rs = h.last('raceStart')!;
    const nc = netClientFor(h, rs, w);
    h.send({ t: 'loaded', trackHash: rs.config.trackHash });
    w.onTick.push(() => { nc.setStartTick(h.last('raceStart')!.startTick); nc.update(w.clock.now); });
    w.advance(2_100); // load deadline → start without the late player
    expect(h.last('room')!.room.phase).toBe('racing');
    w.advance(4_000);
    const race = w.server.activeRooms().find((r) => r.race)!.race!;
    expect(race.room.aiDriving(g.last('raceStart')!.yourSlot)).toBe(true);
    for (let i = 0; i < 120 && !h.last('raceEnd'); i++) w.advance(1000);
    const res = h.last('raceEnd')!.result;
    expect(res.rows.find((r) => r.slot === g.last('raceStart')!.yourSlot)!.finished).toBe(true);
  }, 180_000);

  it('a player who loads 20 s into the race (socket dropped while loading, main thread stalled) takes control and finishes', () => {
    const w = new World({ loadMaxMs: 2000 });
    const h = w.client('Host').hello();
    h.send({ t: 'create', settings: { mode: 'speed', teams: 'solo', track: 'proving_ring', laps: 2, fillBots: true, botTier: 'pro', isPrivate: true, maxHumans: 8 } });
    const g = w.client('Late').hello().send({ t: 'join', code: h.last('room')!.room.code });
    g.send({ t: 'ready', ready: true });
    h.send({ t: 'start' });
    const rsH = h.last('raceStart')!, rsG = g.last('raceStart')!;
    const nh = netClientFor(h, rsH, w);
    h.send({ t: 'loaded', trackHash: rsH.config.trackHash });
    // like net/online.ts: the late player's race channel opens at raceStart and buffers while the track loads
    const accept = (t: number): boolean => t === S2C.SNAPSHOT || t === S2C.EVENTS || t === S2C.INPUT_RELAY || t === S2C.PONG;
    const buf = new EarlyFrameBuffer();
    let early = g.mux.channel(accept);
    early.onMessage = (b) => buf.push(b);
    let ng: NetClient | null = null;
    let stalledUntil = 0, nextSlowUpdate = 0;
    w.onTick.push(() => {
      nh.setStartTick(h.last('raceStart')!.startTick); nh.update(w.clock.now);
      if (!ng) return;
      // a stalled main thread: only one update every 700 ms for the first seconds after loading
      if (w.clock.now < stalledUntil) { if (w.clock.now < nextSlowUpdate) return; nextSlowUpdate = w.clock.now + 700; }
      ng.setStartTick(g.last('raceStart')!.startTick); ng.update(w.clock.now);
    });
    w.advance(2_100); // the load deadline: the race starts without the late player
    const race = w.server.activeRooms().find((r) => r.race)!.race!;
    w.advance(8_000);
    expect(race.room.aiDriving(rsG.yourSlot)).toBe(true); // AI took the silent slot after 3 s
    g.drop(); w.advance(2_000); g.reconnect();              // the socket drops while still loading
    early = g.mux.channel(accept); early.onMessage = (b) => buf.push(b);
    w.advance(10_000);                                       // finishes loading 20 s into the race
    expect(buf.frames.length).toBeLessThan(400);             // the buffer stayed small (keyframes prune it)
    // the lobby connection's clock is already synced in the browser; model it with one exact sample
    const clock = new ClockSync();
    const ping = clock.ping(w.clock.now);
    clock.onPong({ pingId: ping.pingId, clientMsEcho: ping.clientMs, serverTick: Math.floor(w.clock.serverTick(w.clock.now)), tickPhase: 0 }, w.clock.now);
    ng = netClientFor(g, g.last('raceStart')!, w, early, clock); // as Session does: the early channel, then its buffer
    // before any snapshot is decoded it must wait for a keyframe, not replay from tick 0 on every update (the livelock
    // that starved loaded browsers: 240 replayed ticks per update and the snapshot never read)
    for (let i = 0; i < 5; i++) ng.update(w.clock.now + i);
    expect(ng.stats.waitingForKeyframe).toBe(true);
    expect(ng.stats.resimTicks).toBe(0);
    for (const b of buf.frames) early.onMessage?.(b);
    if (buf.needKeyframe) ng.requestKeyframe();
    g.send({ t: 'loaded', trackHash: rsG.config.trackHash });
    stalledUntil = w.clock.now + 5_000;
    w.advance(6_000);
    const N = race.room.tickNo;
    expect(ng.stats.waitingForKeyframe).toBe(false);
    expect(N - ng.auth.tick).toBeLessThan(30);               // it reads the live snapshot stream again
    expect(Math.abs(ng.world.tick - N)).toBeLessThan(30);    // and predicts near the server's tick
    expect(race.room.aiDriving(rsG.yourSlot)).toBe(false);   // its inputs took the kart back
    for (let i = 0; i < 120 && !g.last('raceEnd'); i++) w.advance(1000);
    const res = g.last('raceEnd')!.result;
    expect(h.last('raceEnd')!.result).toEqual(res);
    expect(res.rows.find((r) => r.slot === rsG.yourSlot)!.finished).toBe(true);
    expect(ng.stats.decodeErrors).toBeLessThan(5);
  }, 240_000);
});
