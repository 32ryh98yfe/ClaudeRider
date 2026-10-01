// SimLink (20-netcode-spec §13): the real RaceRoom and NetClients on virtual time over modelled links.
// Smoke by default (CI); NET_MATRIX=full runs the RTT × jitter × loss matrix with several seeds.
import { describe, expect, it } from 'vitest';
import { AI_TIERS, createAiDriver, type RaceConfig, type SimEvent } from '@cr/sim';
import { RaceRoom } from '@cr/room';
import { runScenario, percentile, type LinkProfile, type ScenarioResult } from '../src/simlink/index.ts';
import { raceConfig, testContent, testTrack } from './helpers.ts';

const track = testTrack();
const content = testContent();

function run(o: { rtt: number; jitter: number; loss: number; mode?: 'speed' | 'item'; laps?: number; seed?: number; ticks?: number; humans?: number[]; disconnect?: { slot: number; atTick: number; forMs: number }; frameHz?: number; skew?: boolean }): ScenarioResult {
  const humans = o.humans ?? [0, 1];
  const cfg: RaceConfig = raceConfig({ humans: humans.length, laps: o.laps ?? 1, seed: o.seed ?? 5, mode: o.mode ?? 'speed' });
  const prof: LinkProfile = { rttMs: o.rtt, jitterMs: o.jitter, loss: o.loss };
  return runScenario({
    cfg, track, content, humans, seed: o.seed ?? 3, ticks: o.ticks ?? 1200, frameHz: o.frameHz ?? 60, frameJitterMs: 2,
    makeAuthority: (now) => new RaceRoom({ config: cfg, track, content, secret: new Uint32Array([o.seed ?? 3, 0x51, 0x4c, 0x9]), clock: { nowMs: now }, collectEvents: false, limits: { perSec: 70, burst: 10 } }),
    link: () => ({ up: prof, down: prof }),
    driver: (slot) => { const d = createAiDriver(track, content, slot, AI_TIERS.pro, {}, 100 + slot, cfg); return (w, out) => d.decide(w, out); },
    ...(o.skew ? { skewPpm: (s: number) => (s === 0 ? 150 : -150) } : {}),
    ...(o.disconnect ? { disconnect: o.disconnect } : {}),
  });
}

function summary(name: string, r: ScenarioResult): Record<string, number | string | boolean> {
  const all = (f: (m: ScenarioResult['clients'][number]) => number[]): number[] => r.clients.flatMap(f);
  const out = {
    name,
    localCorrP99: +percentile(all((m) => m.localCorrections), 99).toFixed(4),
    remoteP95: +percentile(all((m) => m.remoteErrors), 95).toFixed(3),
    remoteHumanP95: +percentile(all((m) => m.remoteHumanErrors), 95).toFixed(3),
    updateP99ms: +percentile(all((m) => m.updateMs), 99).toFixed(2),
    downKBps: +Math.max(...r.clients.map((m) => m.downKBps)).toFixed(2),
    upKBps: +Math.max(...r.clients.map((m) => m.upKBps)).toFixed(2),
    mismatches: r.clients.reduce((a, m) => a + m.snapshotMismatches, 0),
    predictedMatch: +(r.clients.reduce((a, m) => a + m.predictedMatches, 0) / Math.max(1, r.clients.reduce((a, m) => a + m.reconciles, 0))).toFixed(3),
    resumeMs: r.clients.map((m) => m.resumeMs).find((x) => x !== null) ?? -1,
    finalHashMatch: r.finalHashMatch,
    grants: r.clients.reduce((a, m) => a + m.grants, 0),
    m8KnownBeforeLanding: +(r.clients.reduce((a, m) => a + m.grantsKnownBeforeLanding, 0) / Math.max(1, r.clients.reduce((a, m) => a + m.grants, 0))).toFixed(4),
    effectsOnMe: r.clients.reduce((a, m) => a + m.effectsOnMe, 0),
    m3Late: r.clients.reduce((a, m) => a + m.effectsLate, 0),
    effectsAll: r.clients.reduce((a, m) => a + m.effectsAll, 0),
    m3LateAnyVictim: r.clients.reduce((a, m) => a + m.effectsAllLate, 0),
    shortLeadEffects: r.clients.reduce((a, m) => a + m.shortLeadEffects, 0),
    shortLeadLate: r.clients.reduce((a, m) => a + m.shortLeadLate, 0),
    decisionsEqual: r.clients.every((m) => m.decisionsEqual !== false),
  };
  (globalThis as unknown as { process: { stdout: { write(s: string): void } } }).process.stdout.write(`[simlink] ${JSON.stringify(out)}\n`);
  return out;
}

describe('SimLink smoke', () => {
  it('100 ms ± 10 ms, 0.5% loss: local correction p99 ≤ 0.05 m, remote p95 ≤ 0.3 m, ≤ 24/5 KB/s, lossless', () => {
    const s = summary('100/10/0.5%', run({ rtt: 100, jitter: 10, loss: 0.005 }));
    expect(s.mismatches).toBe(0);
    expect(s.finalHashMatch).toBe(true);
    expect(s.localCorrP99).toBeLessThanOrEqual(0.05);
    expect(s.remoteP95).toBeLessThanOrEqual(0.3);
    expect(s.downKBps).toBeLessThanOrEqual(24);
    expect(s.upKBps).toBeLessThanOrEqual(5);
  });

  it('0 ms: snapshots decode to the authority exactly and the local kart is never corrected', () => {
    const s = summary('0/0/0', run({ rtt: 0, jitter: 0, loss: 0, ticks: 900 }));
    expect(s.mismatches).toBe(0);
    expect(s.finalHashMatch).toBe(true);
    expect(s.localCorrP99).toBe(0);
  });

  it('S9: a 2 s drop resumes within 1 s (events replayed, keyframe, AI not engaged)', () => {
    const s = summary('S9 100/10/0 drop 2 s', run({ rtt: 100, jitter: 10, loss: 0, ticks: 1200, disconnect: { slot: 1, atTick: 500, forMs: 2000 } }));
    expect(s.mismatches).toBe(0);
    expect(s.resumeMs).toBeGreaterThanOrEqual(0);
    expect(s.resumeMs).toBeLessThanOrEqual(1000);
    expect(s.finalHashMatch).toBe(true);
  });

  it('200 ms ± 30 ms, 2% loss with clock skew and 144 Hz frames stays consistent', () => {
    const s = summary('200/30/2% skew 144Hz', run({ rtt: 200, jitter: 30, loss: 0.02, ticks: 900, frameHz: 144, skew: true }));
    expect(s.mismatches).toBe(0);
    expect(s.finalHashMatch).toBe(true);
    expect(s.downKBps).toBeLessThanOrEqual(24);
  });
});

describe('SimLink items (L2 decisions over EVENTS + predictor)', () => {
  it('item race at 0 ms: every decision arrives unchanged and snapshots stay lossless', () => {
    const s = summary('item 0/0/0', run({ rtt: 0, jitter: 0, loss: 0, mode: 'item', ticks: 1500, humans: [0] }));
    expect(s.mismatches).toBe(0);
    expect(s.finalHashMatch).toBe(true);
    expect(s.decisionsEqual).toBe(true);
    expect(s.grants).toBeGreaterThan(0);
  });

  it('item race at 200 ms without loss: no effect schedule reaches its victim late (M3) and roulettes are known before landing (M8)', () => {
    const s = summary('item 200/10/0', run({ rtt: 200, jitter: 10, loss: 0, mode: 'item', laps: 3, ticks: 3600 }));
    expect(s.mismatches).toBe(0);
    expect(s.decisionsEqual).toBe(true);
    expect(s.m3Late).toBe(0);
    expect(s.m3LateAnyVictim).toBe(0);
    expect(s.m8KnownBeforeLanding).toBeGreaterThanOrEqual(0.999);
  });

  it('item race at 300 ms: roulettes are still known before landing (M8 ≥ 99.9%)', () => {
    const s = summary('item 300/10/0', run({ rtt: 300, jitter: 10, loss: 0, mode: 'item', ticks: 1200 }));
    expect(s.mismatches).toBe(0);
    expect(s.m8KnownBeforeLanding).toBeGreaterThanOrEqual(0.999);
  });
});

describe('SimLink missing-input brake (20-netcode-spec §6.2)', () => {
  /**
   * One player (Pro AI on its predicted world) who, 10 ticks into every drift, brakes for exactly 6 ticks: a brake
   * drift turn (doc 15 §4.3), far from the 11-tick spin-out. `stall` stalls the uplink at a server race tick.
   */
  function brakeTurns(stall?: { atTick: number; ms: number }): { r: ScenarioResult; brakes: number[]; spins: number[]; serverBrake: number[] } {
    const cfg = raceConfig({ humans: 1, empty: 7, laps: 1, seed: 5 });
    const prof: LinkProfile = { rttMs: 100, jitterMs: 0, loss: 0 };
    const brakes: number[] = [], evs: SimEvent[] = [], serverBrake: number[] = [];
    const r = runScenario({
      cfg, track, content, humans: [0], seed: 3, ticks: 1500, frameHz: 60, frameJitterMs: 0,
      makeAuthority: (now) => {
        const room = new RaceRoom({ config: cfg, track, content, secret: new Uint32Array([3, 0x51, 0x4c, 0x9]), clock: { nowMs: now }, collectEvents: true, limits: { perSec: 70, burst: 10 } });
        return {
          attach: (p) => room.attach(p), detach: (id, why) => room.detach(id, why),
          tick: () => { room.tick(); room.drainEvents(evs); serverBrake.push(room.world.karts[0]!.drive.brakeTicks); },
          get world() { return room.world; },
        };
      },
      link: () => ({ up: prof, down: prof }),
      driver: () => {
        const ai = createAiDriver(track, content, 0, AI_TIERS.pro, {}, 100, cfg);
        let last = -100;
        return (w, out) => {
          ai.decide(w, out);
          const d = w.karts[0]!.drive, T = w.tick + 1;
          if (d.drift === 1 && d.driftTicks === 10 && T > last + 6) { last = T; brakes.push(T); }
          out.brake = T >= last && T < last + 6 ? 15 : 0;
        };
      },
      ...(stall ? { stall: { slot: 0, ...stall } } : {}),
    });
    return { r, brakes, spins: evs.filter((e) => e.t === 'spinOut' && e.kart === 0).map((e) => e.tick), serverBrake };
  }

  it('a 300 ms uplink stall inside a 6-tick brake turn: the server releases the brake, no spin-out, lossless snapshots', () => {
    const base = brakeTurns();
    expect(base.spins).toEqual([]);
    expect(base.brakes.length).toBeGreaterThan(0);
    const B = base.brakes[0]!;
    // stall the uplink a few ticks before and up to the start of the brake turn on the server's timeline
    for (const off of [-4, -2, 0, 2]) {
      const s = brakeTurns({ atTick: B + off, ms: 300 });
      expect(s.brakes[0], `offset ${off}`).toBe(B); // identical up to the stall
      expect(s.spins, `offset ${off}`).toEqual([]);
      // the server never counts more than the 6 pressed brake ticks plus the 2-tick missing-input hold
      expect(Math.max(...s.serverBrake.slice(B - 10, B + 40)), `offset ${off}`).toBeLessThanOrEqual(6 + 2);
      expect(s.r.clients[0]!.snapshotMismatches, `offset ${off}`).toBe(0);
      expect(s.r.finalHashMatch, `offset ${off}`).toBe(true);
    }
  });
});

const FULL = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env['NET_MATRIX'] === 'full';
describe.runIf(FULL)('SimLink full matrix (NET_MATRIX=full)', () => {
  const rtts = [0, 50, 100, 200, 300], jitters = [0, 10, 30, 60], losses = [0, 0.005, 0.02];
  for (const rtt of rtts) for (const jitter of jitters) for (const loss of losses) {
    it(`${rtt} ms ± ${jitter} ms, ${loss * 100}% loss`, () => {
      for (let seed = 1; seed <= 3; seed++) {
        const s = summary(`${rtt}/${jitter}/${loss * 100}% s${seed}`, run({ rtt, jitter, loss, seed, ticks: 900 }));
        expect(s.mismatches).toBe(0);
        expect(s.finalHashMatch).toBe(true);
        expect(s.downKBps).toBeLessThanOrEqual(24);
        expect(s.upKBps).toBeLessThanOrEqual(5);
        if (rtt <= 100 && jitter <= 10) { expect(s.localCorrP99).toBeLessThanOrEqual(0.05); expect(s.remoteP95).toBeLessThanOrEqual(0.3); }
      }
    }, 600_000);
  }
});
