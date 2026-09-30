// Online race through the whole server stack: lobby → loading → race → raceEnd, with two predicting NetClients
// sharing each socket with lobby JSON (FrameMux), a mid-race drop + resume, and the server's AI takeover.
import { describe, expect, it } from 'vitest';
import { loadContent } from '@cr/content';
import { AI_TIERS, createAiDriver, hashWorld } from '@cr/sim';
import { NetClient, S2C, type S2CLobby } from '@cr/net';
import { memoryTracks, World, type TestClient } from './fixture.ts';

const content = loadContent();
const track = memoryTracks().get('proving_ring');

function netClientFor(c: TestClient, rs: Extract<S2CLobby, { t: 'raceStart' }>, w: World): NetClient {
  const ch = c.mux.channel((t) => t === S2C.SNAPSHOT || t === S2C.EVENTS || t === S2C.INPUT_RELAY || t === S2C.PONG);
  const d = createAiDriver(track, content, rs.yourSlot, AI_TIERS.pro, {}, 11 + rs.yourSlot, rs.config);
  return new NetClient({
    transport: ch, track, content, cfg: rs.config, slot: rs.yourSlot, nowMs: () => w.clock.now, startTick: rs.startTick, mode: 'synced',
    ...(rs.resumeToken ? { resumeToken: rs.resumeToken } : {}), inputProvider: (world, out) => d.decide(world, out),
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
});
