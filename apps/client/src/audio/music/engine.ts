// Procedural song engine (32-audio-spec §5): every song = 4 stems (drums, bass, harmony, lead) + a pad stem,
// sequenced per 16th note from a seeded arrangement (intro 4 · A 16 · B 16 · bridge 8), so tempo and layers can
// change live. setIntensity: 0 pads only · 0.3 +bass · 0.6 +drums · 0.8 +harmony · 1.0 +lead (0.3 s ramps, no
// clicks). Songs are data (SongSpec, one file each); Tone.js is injected by the lazy loader, never imported here.
import type { SongDef, SongHandle, ToneLib, ToneNodeLike } from '../api.ts';

type T_ = any; // Tone's option types are deeply generic; the engine only uses documented constructors.

export type Scale = 'major' | 'minor' | 'dorian' | 'phrygianDom' | 'mixolydian' | 'harmonicMinor' | 'lydian';
const SCALES: Record<Scale, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], phrygianDom: [0, 1, 4, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10], harmonicMinor: [0, 2, 3, 5, 7, 8, 11], lydian: [0, 2, 4, 6, 7, 9, 11],
};
export type DrumStyle = 'pop' | 'fourFloor' | 'rock' | 'dnb' | 'darbuka' | 'taiko' | 'swing' | 'brush' | 'funk' | 'march' | 'shanty' | 'halftime' | 'surf';
export type BassStyle = 'root8' | 'rootFifth' | 'walking' | 'slap' | 'arp' | 'sustain' | 'syncop' | 'octave';
export type HarmStyle = 'stabs' | 'offbeat' | 'arp' | 'strum' | 'pad' | 'waltz' | 'stutter';
export type VoiceKind =
  | 'rhodes' | 'marimba' | 'uke' | 'accordion' | 'strings' | 'oud' | 'surf' | 'glock' | 'chip' | 'orch' | 'pizz' | 'flute' | 'guitar'
  | 'clav' | 'powersaw' | 'brass' | 'theremin' | 'harpsi' | 'steel' | 'supersaw' | 'bell' | 'pulse' | 'organ'
  | 'roundbass' | 'slapbass' | 'distbass' | 'subbass' | 'synthbass' | 'warmpad' | 'choirpad' | 'glasspad' | 'darkpad';

export interface VariantSpec {
  bpm: number; root: number; scale: Scale;
  prog: number[]; progB?: number[];
  feel?: 'straight' | 'swing' | 'six8';
  drums: DrumStyle; bass: BassStyle; harmony: HarmStyle;
  voices: { lead: VoiceKind; harm: VoiceKind; bass: VoiceKind; pad: VoiceKind };
  leadDensity?: number; leadOctave?: number; harmOctave?: number; seed?: number;
  /** Extra colour: vinyl crackle (lobby), crowd chant pad (spark), breath noise (flute). */
  texture?: 'vinyl' | 'crowd' | 'none';
}
export interface SongSpec { id: string; a: VariantSpec; b?: VariantSpec; structure?: [number, number, number, number] }

export function defineSong(spec: SongSpec): SongDef {
  return { id: spec.id, bpm: spec.a.bpm, ...(spec.b ? { bpmB: spec.b.bpm } : {}), build: (T, out, variant) => buildSong(T, out, spec, variant === 'b' && spec.b ? spec.b : spec.a) };
}

const hz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** Seeded PRNG (mulberry32) so every song arrangement is stable run to run. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ------------------------------------------------------------------------------------------ voices
interface Voice { node: T_; play(n: number | number[], dur: number | string, time: number, vel: number): void; dispose(): void }

function voice(T: T_, kind: VoiceKind, fx: { chorus: T_; delay: T_; verb: T_ }): Voice {
  const poly = (Base: T_, opts: T_, max = 5): T_ => { const p = new T.PolySynth(Base, opts); p.maxPolyphony = max; return p; };
  let n: T_; let post: T_ | null = null; let sendDelay = 0, sendVerb = 0.15;
  switch (kind) {
    case 'rhodes': n = poly(T.FMSynth, { harmonicity: 1, modulationIndex: 2, envelope: { attack: 0.005, decay: 1.2, sustain: 0.2, release: 0.8 }, modulationEnvelope: { attack: 0.01, decay: 0.6, sustain: 0.1, release: 0.5 } }); sendVerb = 0.25; break;
    case 'marimba': n = poly(T.FMSynth, { harmonicity: 4, modulationIndex: 1.4, envelope: { attack: 0.002, decay: 0.35, sustain: 0, release: 0.2 }, modulationEnvelope: { attack: 0.002, decay: 0.1, sustain: 0, release: 0.1 } }); break;
    case 'uke': case 'pizz': case 'harpsi': case 'guitar': case 'oud':
      n = poly(T.Synth, { oscillator: { type: kind === 'harpsi' ? 'square8' : kind === 'oud' ? 'sawtooth6' : kind === 'pizz' ? 'triangle' : 'fmtriangle' }, envelope: { attack: 0.002, decay: kind === 'pizz' ? 0.18 : 0.4, sustain: 0.02, release: 0.3 } });
      post = new T.Filter(kind === 'harpsi' ? 5200 : kind === 'oud' ? 2600 : 3200, 'lowpass'); sendDelay = kind === 'oud' ? 0.2 : 0.08; break;
    case 'accordion': n = poly(T.Synth, { oscillator: { type: 'fatsquare', count: 2, spread: 12 }, envelope: { attack: 0.03, decay: 0.2, sustain: 0.7, release: 0.2 } }); post = new T.Vibrato(5.5, 0.08); break;
    case 'strings': case 'orch': n = poly(T.Synth, { oscillator: { type: 'fatsawtooth', count: 3, spread: 22 }, envelope: { attack: kind === 'orch' ? 0.08 : 0.25, decay: 0.3, sustain: 0.8, release: 0.9 } }); post = new T.Filter(2400, 'lowpass'); sendVerb = 0.35; break;
    case 'surf': n = poly(T.Synth, { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.003, decay: 0.3, sustain: 0.3, release: 0.4 } }); post = new T.Filter(2800, 'lowpass'); sendDelay = 0.25; sendVerb = 0.35; break;
    case 'glock': case 'bell': n = poly(T.FMSynth, { harmonicity: 3.5, modulationIndex: kind === 'glock' ? 6 : 4, envelope: { attack: 0.001, decay: 1.4, sustain: 0, release: 0.8 }, modulationEnvelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.3 } }); sendDelay = 0.2; sendVerb = 0.3; break;
    case 'chip': case 'pulse': n = poly(T.Synth, { oscillator: { type: kind === 'chip' ? 'pulse' : 'square', ...(kind === 'chip' ? { width: 0.25 } : {}) }, envelope: { attack: 0.002, decay: 0.12, sustain: 0.4, release: 0.08 } }); post = new T.Filter(4200, 'lowpass'); break;
    case 'flute': n = poly(T.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.06, decay: 0.2, sustain: 0.8, release: 0.3 } }, 2); post = new T.Vibrato(5, 0.06); sendVerb = 0.35; break;
    case 'theremin': n = poly(T.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.12, decay: 0.1, sustain: 0.9, release: 0.5 }, portamento: 0.08 }, 2); post = new T.Vibrato(6, 0.18); sendVerb = 0.45; break;
    case 'clav': n = poly(T.FMSynth, { harmonicity: 3, modulationIndex: 8, envelope: { attack: 0.002, decay: 0.18, sustain: 0.1, release: 0.1 } }); post = new T.Filter(3000, 'bandpass'); break;
    case 'powersaw': n = poly(T.Synth, { oscillator: { type: 'fatsawtooth', count: 2, spread: 18 }, envelope: { attack: 0.005, decay: 0.2, sustain: 0.6, release: 0.2 } }); post = new T.Distortion(0.35); break;
    case 'brass': n = poly(T.Synth, { oscillator: { type: 'fatsawtooth', count: 2, spread: 10 }, envelope: { attack: 0.04, decay: 0.3, sustain: 0.6, release: 0.3 } }); post = new T.Filter(1900, 'lowpass'); break;
    case 'steel': n = poly(T.FMSynth, { harmonicity: 1.5, modulationIndex: 3, envelope: { attack: 0.002, decay: 0.5, sustain: 0.05, release: 0.4 }, modulationEnvelope: { attack: 0.002, decay: 0.25, sustain: 0, release: 0.2 } }); sendDelay = 0.12; break;
    case 'supersaw': n = poly(T.Synth, { oscillator: { type: 'fatsawtooth', count: 5, spread: 38 }, envelope: { attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.35 } }); post = new T.Filter(3600, 'lowpass'); sendDelay = 0.18; sendVerb = 0.3; break;
    case 'organ': n = poly(T.Synth, { oscillator: { type: 'sine4' }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.9, release: 0.1 } }); break;
    case 'roundbass': n = new T.MonoSynth({ oscillator: { type: 'fmtriangle' }, envelope: { attack: 0.005, decay: 0.3, sustain: 0.6, release: 0.2 }, filter: { Q: 1, type: 'lowpass' }, filterEnvelope: { attack: 0.005, decay: 0.2, sustain: 0.4, release: 0.2, baseFrequency: 180, octaves: 2.5 } }); sendVerb = 0; break;
    case 'slapbass': n = new T.MonoSynth({ oscillator: { type: 'square' }, envelope: { attack: 0.002, decay: 0.2, sustain: 0.3, release: 0.1 }, filter: { Q: 3, type: 'lowpass' }, filterEnvelope: { attack: 0.002, decay: 0.12, sustain: 0.2, release: 0.1, baseFrequency: 200, octaves: 3.5 } }); sendVerb = 0; break;
    case 'distbass': n = new T.MonoSynth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.004, decay: 0.2, sustain: 0.7, release: 0.15 }, filter: { Q: 2, type: 'lowpass' }, filterEnvelope: { attack: 0.004, decay: 0.15, sustain: 0.5, release: 0.1, baseFrequency: 160, octaves: 3 } }); post = new T.Distortion(0.3); sendVerb = 0; break;
    case 'subbass': n = new T.MonoSynth({ oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.3, sustain: 0.9, release: 0.3 }, filter: { Q: 0.5, type: 'lowpass' }, filterEnvelope: { baseFrequency: 300, octaves: 1 } }); sendVerb = 0; break;
    case 'synthbass': n = new T.MonoSynth({ oscillator: { type: 'pulse', width: 0.4 }, envelope: { attack: 0.003, decay: 0.18, sustain: 0.5, release: 0.12 }, filter: { Q: 4, type: 'lowpass' }, filterEnvelope: { attack: 0.003, decay: 0.15, sustain: 0.25, release: 0.1, baseFrequency: 220, octaves: 3 } }); sendVerb = 0; break;
    case 'warmpad': case 'choirpad': case 'glasspad': case 'darkpad':
      n = poly(kind === 'glasspad' ? T.FMSynth : T.Synth, kind === 'glasspad'
        ? { harmonicity: 2, modulationIndex: 1.2, envelope: { attack: 1.2, decay: 1, sustain: 0.8, release: 2 }, modulationEnvelope: { attack: 1.5, decay: 1, sustain: 0.6, release: 2 } }
        : { oscillator: { type: kind === 'choirpad' ? 'fatsine' : 'fatsawtooth', count: 3, spread: 30 }, envelope: { attack: 1.0, decay: 1.0, sustain: 0.8, release: 2.2 } }, 4);
      post = new T.Filter(kind === 'darkpad' ? 700 : kind === 'choirpad' ? 1600 : 1300, 'lowpass'); sendVerb = 0.5; break;
    default: n = poly(T.Synth, {}); break;
  }
  const out = new T.Gain(1);
  if (post) { n.connect(post); post.connect(out); } else n.connect(out);
  if (kind === 'strings' || kind.endsWith('pad') || kind === 'accordion') out.connect(fx.chorus);
  if (sendDelay > 0) { const s = new T.Gain(sendDelay); out.connect(s); s.connect(fx.delay); }
  if (sendVerb > 0) { const s = new T.Gain(sendVerb); out.connect(s); s.connect(fx.verb); }
  return {
    node: out,
    play(note, dur, time, vel): void {
      const f = Array.isArray(note) ? note.map(hz) : hz(note);
      n.triggerAttackRelease(f, dur, time, vel);
    },
    dispose(): void { n.dispose(); post?.dispose(); out.dispose(); },
  };
}

interface Kit { kick: T_; snare: T_; hat: T_; perc: T_; nodes: T_[] }
function kit(T: T_, style: DrumStyle, out: T_): Kit {
  const kick = new T.MembraneSynth({ pitchDecay: 0.04, octaves: 6, envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.1 } });
  const snareF = new T.Filter(style === 'brush' ? 3500 : 2200, style === 'brush' ? 'highpass' : 'bandpass');
  const snare = new T.NoiseSynth({ noise: { type: style === 'brush' ? 'pink' : 'white' }, envelope: { attack: 0.001, decay: style === 'brush' ? 0.25 : 0.16, sustain: 0 } });
  const hatF = new T.Filter(8000, 'highpass');
  const hat = new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.04, sustain: 0 } });
  const perc = new T.MembraneSynth({ pitchDecay: style === 'taiko' ? 0.12 : 0.02, octaves: style === 'taiko' ? 3 : 1.5, envelope: { attack: 0.001, decay: style === 'taiko' ? 0.6 : 0.18, sustain: 0, release: 0.1 } });
  kick.connect(out); snare.connect(snareF); snareF.connect(out); hat.connect(hatF); hatF.connect(out); perc.connect(out);
  kick.volume.value = -4; snare.volume.value = style === 'brush' ? -16 : -11; hat.volume.value = -20; perc.volume.value = -8;
  return { kick, snare, hat, perc, nodes: [kick, snare, snareF, hat, hatF, perc] };
}

// ------------------------------------------------------------------------------------------ patterns (16 steps)
const P = (s: string): boolean[] => [...s].map((c) => c === 'x');
const DRUMS: Record<DrumStyle, { k: boolean[]; s: boolean[]; h: boolean[]; p?: boolean[] }> = {
  pop: { k: P('x.......x.x.....'), s: P('....x.......x...'), h: P('x.x.x.x.x.x.x.x.') },
  fourFloor: { k: P('x...x...x...x...'), s: P('....x.......x...'), h: P('..x...x...x...x.') },
  rock: { k: P('x.....x.x.......'), s: P('....x.......x...'), h: P('x.x.x.x.x.x.x.x.') },
  dnb: { k: P('x.........x.....'), s: P('....x.......x..x'), h: P('x.xxx.xxx.xxx.xx') },
  darbuka: { k: P('x.....x...x.....'), s: P('....x.......x.x.'), h: P('..x.x...x.x...x.'), p: P('x..x..x...x..x..') },
  taiko: { k: P('x.......x.......'), s: P('........x.......'), h: P('................'), p: P('x...x.x.x...x.xx') },
  swing: { k: P('x.......x.......'), s: P('....x.......x...'), h: P('x..xx..xx..xx..x') },
  brush: { k: P('x.......x.......'), s: P('....x.......x...'), h: P('x.xxx.xxx.xxx.xx') },
  funk: { k: P('x..x..x...x..x..'), s: P('....x..x.x..x...'), h: P('xxxxxxxxxxxxxxxx') },
  march: { k: P('x.......x.......'), s: P('....x..x....x.xx'), h: P('x...x...x...x...') },
  shanty: { k: P('x.....x.....'), s: P('...x.....x..'), h: P('x.xx.xx.xx.x'), p: P('x.....x.....') },
  halftime: { k: P('x.........x.....'), s: P('........x.......'), h: P('x.x.x.x.x.x.x.x.') },
  surf: { k: P('x.x.....x.x.....'), s: P('....x.......x...'), h: P('xxxxxxxxxxxxxxxx') },
};

type SectionName = 'intro' | 'A' | 'B' | 'bridge';

/** Builds the Tone graph for one variant and returns the stem-controlled handle. */
export function buildSong(Tlib: ToneLib, out: ToneNodeLike, spec: SongSpec, v: VariantSpec): SongHandle {
  const T = Tlib as T_;
  const tr = Tlib.getTransport() as T_;
  const scale = SCALES[v.scale];
  const six8 = v.feel === 'six8';
  const steps = six8 ? 12 : 16;
  const [intro, lenA, lenB, bridge] = spec.structure ?? [4, 16, 16, 8];
  const total = intro + lenA + lenB + bridge;
  const loopFrom = intro; // after the intro, loop A B bridge
  const rand = rng((v.seed ?? 7) * 7919 + spec.id.length * 131 + v.bpm);
  // stems
  const stems = { pad: new T.Gain(0), bass: new T.Gain(0), drums: new T.Gain(0), harm: new T.Gain(0), lead: new T.Gain(0), hats: new T.Gain(0) };
  const master = new T.Gain(0.9);
  for (const s of Object.values(stems)) (s as T_).connect(master);
  master.connect(out);
  const fx = { chorus: new T.Chorus(1.5, 3.5, 0.5).start(), delay: new T.FeedbackDelay('8n.', 0.28), verb: new T.Reverb({ decay: 2.2, wet: 1 }) };
  fx.delay.wet.value = 1;
  const fxBus = new T.Gain(0.55);
  fx.chorus.connect(stems.pad); fx.delay.connect(fxBus); fx.verb.connect(fxBus); fxBus.connect(master);
  const lead = voice(T, v.voices.lead, fx), harm = voice(T, v.voices.harm, fx), bass = voice(T, v.voices.bass, fx), pad = voice(T, v.voices.pad, fx);
  lead.node.connect(stems.lead); harm.node.connect(stems.harm); bass.node.connect(stems.bass); pad.node.connect(stems.pad);
  lead.node.gain.value = 0.32; harm.node.gain.value = 0.22; bass.node.gain.value = 0.5; pad.node.gain.value = 0.18;
  const drums = kit(T, v.drums, stems.drums);
  const hats = new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.03, sustain: 0 } });
  const hatsF = new T.Filter(9000, 'highpass'); hats.connect(hatsF); hatsF.connect(stems.hats); hats.volume.value = -22;
  let crackle: T_ = null;
  if (v.texture === 'vinyl') { crackle = new T.Noise('brown').start(); const f = new T.Filter(2500, 'bandpass'); crackle.connect(f); const g = new T.Gain(0.02); f.connect(g); g.connect(master); crackle._f = f; crackle._g = g; }
  if (v.texture === 'crowd') { crackle = new T.Noise('pink').start(); const f = new T.AutoFilter({ frequency: 0.1, baseFrequency: 600, octaves: 1.5 }).start(); crackle.connect(f); const g = new T.Gain(0.04); f.connect(g); g.connect(stems.pad); crackle._f = f; crackle._g = g; }

  // harmony helpers
  const deg = (d: number, oct = 0): number => { const n = scale.length; const o = Math.floor(d / n); const i = ((d % n) + n) % n; return v.root + scale[i]! + 12 * (o + oct); };
  const chordOf = (d: number, oct: number): number[] => [deg(d, oct), deg(d + 2, oct), deg(d + 4, oct)];
  const progA = v.prog, progB = v.progB ?? v.prog.slice().reverse();
  const sectionOf = (bar: number): { name: SectionName; local: number } => {
    const b = bar < total ? bar : loopFrom + ((bar - loopFrom) % (total - loopFrom));
    if (b < intro) return { name: 'intro', local: b };
    if (b < intro + lenA) return { name: 'A', local: b - intro };
    if (b < intro + lenA + lenB) return { name: 'B', local: b - intro - lenA };
    return { name: 'bridge', local: b - intro - lenA - lenB };
  };
  const rootAt = (bar: number): number => { const s = sectionOf(bar); const p = s.name === 'B' ? progB : s.name === 'bridge' ? [progA[0]! + 3, progA[1]! + 1, progB[0]!, progA[progA.length - 1]!] : progA; return p[s.local % p.length]!; };
  // melody: 2-bar motifs per section (seeded), chord tones on strong beats, stepwise elsewhere
  const density = v.leadDensity ?? 0.55;
  const motif = (len: number): ([number, number] | null)[] => {
    const out: ([number, number] | null)[] = [];
    let d = 4 + Math.floor(rand() * 3);
    for (let i = 0; i < len; i++) {
      const strong = i % 4 === 0;
      if (rand() > (strong ? 0.9 : density)) { out.push(null); continue; }
      d += strong ? (rand() < 0.5 ? 0 : 2) * (rand() < 0.5 ? -1 : 1) : Math.round((rand() - 0.5) * 3);
      d = Math.max(0, Math.min(11, d));
      out.push([d, rand() < 0.25 ? 2 : 1]);
    }
    return out;
  };
  const eighths = six8 ? 6 : 8;
  const motifs = { intro: motif(eighths * 2), A: motif(eighths * 2), B: motif(eighths * 2), bridge: motif(eighths * 2) };
  const leadOct = v.leadOctave ?? 1, harmOct = v.harmOctave ?? 0;
  const pat = DRUMS[v.drums];
  let step = 0;
  const swing16 = v.feel === 'swing';
  const loop = new T.Loop((time: number) => {
    const s = step % steps, bar = Math.floor(step / steps);
    step++;
    const sec = sectionOf(bar);
    const beatLen = 60 / tr.bpm.value / 4; // one 16th
    const t = swing16 && s % 2 === 1 ? time + beatLen * 0.33 : time;
    // A busy render frame can deliver several old transport callbacks together. Tone clamps old
    // starts to the same audio time and monophonic voices then throw on the repeated start. Drop
    // missed notes while advancing the arrangement; leave one audio quantum for on-time scheduling.
    if (t < tr.context.currentTime + tr.blockTime) return;
    const root = rootAt(bar);
    const energy = sec.name === 'intro' ? 0.4 : sec.name === 'bridge' ? 0.7 : sec.name === 'B' ? 1 : 0.85;
    // drums
    const ps = s % pat.k.length;
    if (pat.k[ps]) drums.kick.triggerAttackRelease(hz(v.root - 24), '8n', t, 0.9);
    const snareFill = sec.name === 'bridge' && sec.local === (bridge - 1) && s >= steps - 4;
    if (snareFill) drums.snare.triggerAttackRelease('32n', t, 0.8); // fill replaces this step's backbeat
    else if (pat.s[ps] && sec.name !== 'intro') drums.snare.triggerAttackRelease('16n', t, 0.7 * energy + 0.2);
    if (pat.h[ps]) drums.hat.triggerAttackRelease('32n', t, (s % 4 === 0 ? 0.5 : 0.3) * energy);
    if (pat.p?.[ps]) drums.perc.triggerAttackRelease(hz(v.root - 12 + (s % 3 === 0 ? 7 : 0)), '8n', t, 0.6);
    hats.triggerAttackRelease('64n', t, s % 2 === 0 ? 0.6 : 0.35);
    // bass
    const bRoot = deg(root, -2);
    switch (v.bass) {
      case 'root8': if (s % 2 === 0) bass.play(bRoot, '8n', t, 0.8); break;
      case 'rootFifth': if (s % 8 === 0) bass.play(bRoot, '4n', t, 0.85); else if (s % 8 === 4) bass.play(deg(root + 4, -2), '8n', t, 0.7); break;
      case 'walking': if (s % 4 === 0) bass.play(deg(root + [0, 2, 4, 5][s / 4 % 4]!, -2), '4n', t, 0.8); break;
      case 'slap': if (s === 0 || s === 3 || s === 6 || s === 10) bass.play(s === 6 ? bRoot + 12 : bRoot, '16n', t, 0.9); break;
      case 'arp': if (s % 2 === 0) bass.play(deg(root + [0, 2, 4, 7][(s / 2) % 4]!, -2), '16n', t, 0.75); break;
      case 'sustain': if (s === 0) bass.play(bRoot, '1m', t, 0.8); break;
      case 'syncop': if (s === 0 || s === 3 || s === 8 || s === 11 || s === 14) bass.play(bRoot, '16n', t, 0.85); break;
      case 'octave': if (s % 2 === 0) bass.play(s % 4 === 0 ? bRoot : bRoot + 12, '16n', t, 0.8); break;
    }
    // harmony
    const ch = chordOf(root, harmOct);
    switch (v.harmony) {
      case 'stabs': if (s === 0 || s === 6 || s === 10) harm.play(ch, '16n', t, 0.6); break;
      case 'offbeat': if (s % 4 === 2) harm.play(ch, '16n', t, 0.55); break;
      case 'arp': if (s % 2 === 0) harm.play(ch[(s / 2) % 3]! + (s >= 8 ? 12 : 0), '16n', t, 0.5); break;
      case 'strum': if (s === 0 || s === 4 || s === 7 || s === 10 || s === 12) { for (let i = 0; i < 3; i++) harm.play(ch[i]!, '8n', t + i * 0.012, 0.5); } break;
      case 'pad': if (s === 0) harm.play(ch, '2n', t, 0.45); break;
      case 'waltz': if (six8 ? s % 6 === 3 : s === 4 || s === 8 || s === 12) harm.play(ch, '8n', t, 0.5); break;
      case 'stutter': if (s % 2 === 0 && (s < 6 || s === 10 || s === 14)) harm.play(ch, '32n', t, 0.55); break;
    }
    if (s === 0) pad.play(chordOf(root, -1), '1m', t, 0.4);
    // lead: motif per section, second half of the 2-bar motif transposed by the chord
    if (s % 2 === 0) {
      const m = motifs[sec.name];
      const idx = ((bar % 2) * eighths + s / 2) % m.length;
      const e = m[idx];
      if (e) lead.play(deg(e[0] + (root % 7 === 0 ? 0 : 0), leadOct), e[1] === 2 ? '4n' : '8n', t, 0.7);
    }
  }, '16n');

  let intensity = 0;
  const applyIntensity = (x: number, at?: number): void => {
    const on = (th: number): number => (x >= th - 1e-3 ? 1 : 0);
    const tt = at ?? Tlib.now();
    const set = (g: T_, v2: number): void => { g.gain.cancelScheduledValues(tt); g.gain.setTargetAtTime(v2, tt, 0.1); }; // τ 0.1 s → max step ≪ 0.1 per 10 ms
    set(stems.pad, 1); set(stems.bass, on(0.3)); set(stems.drums, on(0.6)); set(stems.harm, on(0.8)); set(stems.lead, on(0.95));
  };
  return {
    start(): void {
      tr.bpm.value = v.bpm;
      tr.timeSignature = six8 ? [6, 8] : 4;
      step = 0;
      loop.start(0);
      tr.start('+0.05');
      applyIntensity(intensity);
    },
    stop(): void {
      loop.stop(); tr.stop();
      const all: T_[] = [loop, ...Object.values(stems), master, fx.chorus, fx.delay, fx.verb, fxBus, hats, hatsF, ...drums.nodes];
      if (crackle) all.push(crackle, crackle._f, crackle._g);
      // let release tails ring out before freeing the graph
      setTimeout(() => { lead.dispose(); harm.dispose(); bass.dispose(); pad.dispose(); for (const n of all) { try { n.dispose(); } catch { /* already */ } } }, 2500);
    },
    setIntensity(x: number): void { intensity = Math.max(0, Math.min(1, x)); applyIntensity(intensity); },
    setTempoMul(m: number, rampSec: number): void { tr.bpm.rampTo(v.bpm * m, rampSec); },
    addHats(on: boolean): void { stems.hats.gain.cancelScheduledValues(Tlib.now()); stems.hats.gain.setTargetAtTime(on ? 1 : 0, Tlib.now(), 0.2); },
  };
}
