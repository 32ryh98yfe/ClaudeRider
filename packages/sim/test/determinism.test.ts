// Determinism (ADR-003): identical inputs → identical world hashes; snapshots resume bit-exactly.
import { describe, expect, it } from 'vitest';
import { driftRequestAt, driftRequestCount, hashWorld, cloneWorld, copyWorld, makeContext, step, ArraySink, createAiDriver, AI_TIERS, Edge, Held, type InputFrame } from '@cr/sim';
import { determinismScenario } from '../src/testing/scenario.ts';
import { bakedTrack, makeRig, getContent } from './rig.ts';

const CHARS = ['clay', 'pixel', 'turbo', 'anchor', 'rune', 'nova', 'kage', 'bisque'] as const;
const KARTS = ['pebble', 'clay_comet', 'arrowhead', 'tugboat', 'glacier_sled', 'neon_blade', 'jet_kettle', 'crown_cruiser'] as const;
const TIERS = ['rookie', 'racer', 'pro', 'legend'] as const;
const field = CHARS.map((c, i) => ({ kind: 'bot' as const, characterId: c, kartBodyId: KARTS[i]!, name: c, ai: TIERS[i % 4]!, vMul: AI_TIERS[TIERS[i % 4]!].vMul }));

function hashes(mode: 'speed' | 'item', ticks: number, every: number): number[] {
  const rig = makeRig(bakedTrack('clayhill_village/meadow_loop'), { mode, slots: field, seed: 77 });
  const out: number[] = [];
  for (let t = 0; t < ticks; t++) { rig.tick(); if (t % every === 0) out.push(hashWorld(rig.w)); }
  return out;
}

describe('determinism', () => {
  it.each(['speed', 'item'] as const)('shared Node/browser/Worker scenario preserves ordered drift requests, pending reversal and snapshot restore in %s mode', (mode) => {
    const track = bakedTrack('clayhill_village/meadow_loop'), seen: number[] = [];
    let previousHeld = 0;
    let queuedSnapshot: ReturnType<typeof cloneWorld> | undefined;
    let resumedPending = false, reversed = false;
    const cfg = makeRig(track, { mode, slots: field, seed: 77 }).cfg;
    const hashes = determinismScenario(track, getContent(), mode, 600, 120, 77, (tick, w, inputs, events) => {
      const input = inputs[0]!, k = w.karts[0]!;
      if ((input.edges & Edge.DRIFT) !== 0) {
        seen.push(tick);
        expect(Math.hypot(k.body.vx, k.body.vy, k.body.vz)).toBeGreaterThan(10);
        expect(k.drive.drift).toBe(tick === 312 ? 0 : 1);
        const transitions = events.filter((e) => 'kart' in e && e.kart === 0 && (e.t === 'driftStart' || e.t === 'doubleDrift' || e.t === 'driftEnd'));
        expect(transitions).toHaveLength(1);
        expect(transitions[0]!.t).toBe(tick === 300 ? 'driftStart' : tick === 312 ? 'driftEnd' : 'doubleDrift');
        expect(driftRequestCount(input.driftRequests)).toBe(tick === 309 ? 3 : 1);
        if (tick === 300 || tick === 312) expect(input.held & Held.DRIFT).toBe(0);
        if (tick === 309) {
          expect(previousHeld & Held.DRIFT).toBe(Held.DRIFT);
          expect([0,1,2].map(i => driftRequestAt(input.driftRequests, i))).toEqual([-1,-1,1]);
          expect(k.drive.driftTarget).toBe(.75); // both in-direction requests tightened before the opposite request
          expect(k.drive.pendingDriftDir).toBe(-1); expect(k.drive.driftRecovering).toBe(2);
          queuedSnapshot = cloneWorld(w);
          const changed = cloneWorld(w); changed.karts[0]!.drive.pendingDriftDir = 0;
          expect(hashWorld(changed)).not.toBe(hashWorld(w));
        }
        if (tick === 312) { expect(input.steer).toBe(-127); expect(input.steerIntent).toBe(1); expect(input.edges & Edge.TAP_R).toBe(Edge.TAP_R); expect(k.drive.pendingDriftDir).toBe(-1); }
      }
      if (tick === 310 && queuedSnapshot) {
        const restored = cloneWorld(queuedSnapshot); copyWorld(restored, queuedSnapshot);
        step(restored, inputs, makeContext({ track, cfg, content: getContent(), role: 'authority', events: new ArraySink() }));
        expect(hashWorld(restored)).toBe(hashWorld(w)); resumedPending = true;
      }
      if (tick === 313) {
        expect(input.driftRequests).toBe(0); expect(input.held & Held.DRIFT).toBe(0);
        expect(k.drive.drift).toBe(1); expect(k.drive.driftDir).toBe(-1); expect(k.drive.pendingDriftDir).toBe(0);
        expect(events.some(e => e.t === 'driftStart' && e.kart === 0)).toBe(true); reversed = true;
      }
      previousHeld = input.held;
    });
    expect(seen).toEqual([300, 306, 309, 312]);
    expect(resumedPending).toBe(true); expect(reversed).toBe(true);
    expect(hashes).toEqual(determinismScenario(track, getContent(), mode, 600));
  });

  it('two runs of an 8-bot speed race produce identical hash streams', () => {
    expect(hashes('speed', 2400, 60)).toEqual(hashes('speed', 2400, 60));
  });

  it('two runs of an 8-bot item race produce identical hash streams', () => {
    expect(hashes('item', 2400, 60)).toEqual(hashes('item', 2400, 60));
  });

  it('a mid-race snapshot (cloneWorld/copyWorld) resumes bit-exactly', () => {
    const track = bakedTrack('clayhill_village/meadow_loop');
    const a = makeRig(track, { mode: 'item', slots: field, seed: 5 });
    a.run(900);
    const snap = cloneWorld(a.w);
    const into = cloneWorld(a.w);
    copyWorld(into, snap);
    expect(hashWorld(snap)).toBe(hashWorld(a.w));
    expect(hashWorld(into)).toBe(hashWorld(a.w));
    // continue both from the same state with fresh (identically seeded) drivers
    const content = getContent();
    const mk = () => field.map((s, i) => createAiDriver(track, content, i, AI_TIERS[s.ai], {}, 500 + i));
    const run = (w: typeof snap): number => {
      const ctx = makeContext({ track, cfg: a.cfg, content, role: 'authority', events: new ArraySink() });
      const d = mk();
      const inputs: InputFrame[] = a.inputs.map((x) => ({ ...x }));
      for (let t = 0; t < 900; t++) { for (let i = 0; i < 8; i++) d[i]!.decide(w, inputs[i]!); step(w, inputs, ctx); }
      return hashWorld(w);
    };
    expect(run(into)).toBe(run(snap));
  });

  it('hash changes when a single input bit changes', () => {
    const track = bakedTrack('clayhill_village/meadow_loop');
    const a = makeRig(track, { slots: [{}, ...field.slice(1)] });
    const b = makeRig(track, { slots: [{}, ...field.slice(1)] });
    const go = a.w.goTick;
    a.run(go + 120, (w, inp) => { inp[0]!.throttle = w.tick >= go ? 15 : 0; });
    b.run(go + 120, (w, inp) => { inp[0]!.throttle = w.tick >= go ? 15 : 0; inp[0]!.steer = w.tick === go + 60 ? 1 : 0; });
    expect(hashWorld(a.w)).not.toBe(hashWorld(b.w));
  });
});
