import { describe, expect, it } from 'vitest';
import type { ToneLib, ToneNodeLike } from '../src/audio/api.ts';
import { buildSong, type SongSpec, type VariantSpec } from '../src/audio/music/engine.ts';

interface Hit { duration: number | string; time: number; velocity: number }

/** Same monotonic start constraint as Tone.Source; no AudioContext is needed to exercise the sequencer. */
function toneRig() {
  const context = { currentTime: 0, sampleRate: 48000 };
  const mono: StubNode[] = [], noise: StubNode[] = [], all: StubNode[] = [];
  let callback: (time: number) => void = () => { throw new Error('song did not install its loop'); };
  const parameter = () => ({ value: 0, cancelScheduledValues() {}, setTargetAtTime() {}, rampTo() {} });
  class StubNode {
    gain = parameter(); wet = parameter(); volume = parameter();
    hits: Hit[] = [];
    private lastStart = -Infinity;
    constructor() { all.push(this); }
    connect(): this { return this; }
    start(): this { return this; }
    stop(): void {}
    dispose(): void {}
    triggerAttackRelease(_note: unknown, duration: number | string, time: number, velocity: number): void {
      this.hit(duration, time, velocity);
    }
    hit(duration: number | string, time: number, velocity: number): void {
      const start = Math.max(time, context.currentTime);
      if (start <= this.lastStart) throw new Error('duplicate source start');
      this.lastStart = start;
      this.hits.push({ duration, time, velocity });
    }
  }
  class Mono extends StubNode { constructor() { super(); mono.push(this); } }
  class Noise extends StubNode {
    constructor() { super(); noise.push(this); }
    override triggerAttackRelease(duration: number | string, time: number, velocity: number): void { this.hit(duration, time, velocity); }
  }
  class Loop extends StubNode { constructor(cb: (time: number) => void) { super(); callback = cb; } }
  const transport = { context, blockTime: 128 / context.sampleRate, bpm: parameter(), timeSignature: 4, start() {}, stop() {} };
  const T = {
    Gain: StubNode, Filter: StubNode, Chorus: StubNode, FeedbackDelay: StubNode, Reverb: StubNode,
    Distortion: StubNode, Vibrato: StubNode, PolySynth: StubNode, Synth: StubNode, FMSynth: StubNode,
    MonoSynth: Mono, MembraneSynth: StubNode, NoiseSynth: Noise, Loop,
    getTransport: () => transport, now: () => context.currentTime + 0.08,
  } as unknown as ToneLib;
  const v: VariantSpec = {
    bpm: 120, root: 57, scale: 'major', prog: [0, 4, 5, 3], drums: 'fourFloor', bass: 'octave', harmony: 'stabs',
    voices: { lead: 'supersaw', harm: 'supersaw', bass: 'synthbass', pad: 'choirpad' },
  };
  const spec: SongSpec = { id: 'scheduling', a: v, structure: [1, 1, 1, 1] };
  const song = buildSong(T, new StubNode() as unknown as ToneNodeLike, spec, v);
  song.start();
  return { context, mono, noise, all, tick: (time: number) => callback(time) };
}

describe('music transport scheduling', () => {
  it('drops overdue notes after a stall and resumes at the correct musical step', () => {
    const r = toneRig();
    r.context.currentTime = 5;
    for (const t of [4.5, 4.625, 4.75, 4.875]) r.tick(t);
    expect(r.all.flatMap((n) => n.hits)).toEqual([]);
    r.tick(5.125); // resume at step 4, then verify the next hat remains on step 6
    expect(r.mono[0]!.hits).toEqual([{ duration: '16n', time: 5.125, velocity: 0.8 }]);
    expect(r.noise[1]!.hits).toEqual([]); // fourFloor hat is on steps 2, 6, 10, 14
    r.tick(5.25);
    r.tick(5.375);
    expect(r.noise[1]!.hits.map((h) => h.time)).toEqual([5.375]);
  });

  it('keeps on-time note timestamps and replaces overlapping bridge backbeats with one fill hit', () => {
    const r = toneRig();
    for (let i = 0; i < 64; i++) r.tick(1 + i * 0.125);
    const snare = r.noise[0]!.hits;
    expect(snare).toHaveLength(9);
    expect(snare[0]).toEqual({ duration: '16n', time: 3.5, velocity: 0.7 * 0.85 + 0.2 });
    expect(snare.slice(-4)).toEqual([60, 61, 62, 63].map((i) => ({ duration: '32n', time: 1 + i * 0.125, velocity: 0.8 })));
    expect(r.mono[0]!.hits.map((h) => h.time)).toEqual(Array.from({ length: 32 }, (_, i) => 1 + i * 0.25));
  });

  it('also drops a note inside the current audio quantum instead of letting Tone clamp it', () => {
    const r = toneRig();
    r.context.currentTime = 5;
    r.tick(5.001);
    expect(r.all.flatMap((n) => n.hits)).toEqual([]);
    r.tick(5.125);
    expect(r.noise[2]!.hits).toEqual([{ duration: '64n', time: 5.125, velocity: 0.35 }]);
  });
});
