// Determinism (ADR-003): identical inputs → identical world hashes; snapshots resume bit-exactly.
import { describe, expect, it } from 'vitest';
import { hashWorld, cloneWorld, copyWorld, makeContext, step, ArraySink, createAiDriver, AI_TIERS, type InputFrame } from '@cr/sim';
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
