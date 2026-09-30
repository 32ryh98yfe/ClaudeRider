// SimLink (20-netcode-spec §13): the real RaceRoom and NetClients on virtual time over modelled links.
// Smoke by default (CI); NET_MATRIX=full runs the RTT × jitter × loss matrix with several seeds.
import { describe, expect, it } from 'vitest';
import { AI_TIERS, createAiDriver, type RaceConfig } from '@cr/sim';
import { RaceRoom } from '@cr/room';
import { runScenario, percentile, type LinkProfile, type ScenarioResult } from '../src/simlink/index.ts';
import { raceConfig, testContent, testTrack } from './helpers.ts';

const track = testTrack();
const content = testContent();

function run(o: { rtt: number; jitter: number; loss: number; seed?: number; ticks?: number; humans?: number[]; disconnect?: { slot: number; atTick: number; forMs: number }; frameHz?: number; skew?: boolean }): ScenarioResult {
  const humans = o.humans ?? [0, 1];
  const cfg: RaceConfig = raceConfig({ humans: humans.length, laps: 1, seed: o.seed ?? 5 });
  const prof: LinkProfile = { rttMs: o.rtt, jitterMs: o.jitter, loss: o.loss };
  return runScenario({
    cfg, track, content, humans, seed: o.seed ?? 3, ticks: o.ticks ?? 1200, frameHz: o.frameHz ?? 60, frameJitterMs: 2,
    makeAuthority: (now) => new RaceRoom({ config: cfg, track, content, clock: { nowMs: now }, collectEvents: false, limits: { perSec: 70, burst: 10 } }),
    link: () => ({ up: prof, down: prof }),
    driver: (slot) => { const d = createAiDriver(track, content, slot, AI_TIERS.pro, {}, 100 + slot); return (w, out) => d.decide(w, out); },
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
