// Adaptive music director (32-audio-spec §5–§7): lobby / race / finalLap / finish / results states, intro
// intensity 0.3, countdown duck −8 dB, full band on the GO downbeat, battle intensity 1.0 (3 s hysteresis),
// final lap (+6 % tempo over 2 s, 16th hats, filter sweep, brass stinger), finish → win/lose jingle on the next
// bar, results jingle then the lobby song. Songs are lazy chunks (one per file) and Tone.js is lazy too.
import type { MusicState, SongDef, SongHandle, ToneLib, SfxOpts } from '../api.ts';
import type { Mixer } from '../mixer.ts';
import { loadTone } from './tone.ts';

const songMods = import.meta.glob<{ default: SongDef }>('./songs/*.ts');
const songLoaders = new Map<string, () => Promise<{ default: SongDef }>>();
for (const [p, load] of Object.entries(songMods)) songLoaders.set(p.replace(/^.*\/(.+)\.ts$/, '$1'), load);
export const SONG_IDS = [...songLoaders.keys()].sort();

interface Playing { id: string; variant: 'a' | 'b'; handle: SongHandle; out: { gain: { rampTo(v: number, t: number): void; value: number }; dispose(): void }; bpm: number }

export class MusicDirector {
  state: MusicState | 'idle' = 'idle';
  private cur: Playing | null = null;
  private T: ToneLib | null = null;
  private intensity = 0.8;
  private battleUntil = 0;
  private token = 0;
  private mixer: Mixer; private ac: AudioContext; private sfx: (id: string, o?: SfxOpts) => void;

  constructor(mixer: Mixer, ac: AudioContext, sfx: (id: string, o?: SfxOpts) => void) { this.mixer = mixer; this.ac = ac; this.sfx = sfx; }

  /** Starts `song` (crossfade: the old song fades out first — songs share Tone's transport). */
  async play(song: string, o: { fadeSec?: number; variant?: 'a' | 'b'; intensity?: number } = {}): Promise<void> {
    const variant = o.variant ?? 'a';
    if (this.cur && this.cur.id === song && this.cur.variant === variant) { if (o.intensity !== undefined) this.setIntensity(o.intensity); return; }
    const my = ++this.token;
    const load = songLoaders.get(song);
    if (!load) { if (import.meta.env.DEV) console.warn(`[music] no song ${song}`); return; }
    const [T, mod] = await Promise.all([this.T ? Promise.resolve(this.T) : loadTone(this.ac), load()]);
    this.T = T;
    if (my !== this.token) return;
    const fade = o.fadeSec ?? 1.0;
    await this.stopCurrent(fade);
    if (my !== this.token) return;
    const def = mod.default;
    const out = new (T as unknown as { Gain: new (v: number) => Playing['out'] & { connect(n: AudioNode): void } }).Gain(0);
    out.connect(this.mixer.buses.music);
    const handle = def.build(T, out as never, variant);
    this.intensity = o.intensity ?? this.intensity;
    handle.setIntensity(this.intensity);
    handle.start();
    out.gain.rampTo(1, Math.max(0.05, fade * 0.6));
    this.cur = { id: song, variant, handle, out, bpm: variant === 'b' ? def.bpmB ?? def.bpm : def.bpm };
  }

  private stopCurrent(fade: number): Promise<void> {
    const c = this.cur;
    if (!c) return Promise.resolve();
    this.cur = null;
    c.out.gain.rampTo(0, Math.max(0.05, fade));
    return new Promise((res) => setTimeout(() => { c.handle.stop(); setTimeout(() => c.out.dispose(), 2600); res(); }, Math.max(50, fade * 1000)));
  }

  stop(fadeSec = 1): void { this.token++; void this.stopCurrent(fadeSec); this.state = 'idle'; }

  setIntensity(x: number): void { this.intensity = x; this.cur?.handle.setIntensity(x); }

  /** Battle: any rival within 15 m → intensity 1.0, held 3 s after the last contact. */
  battle(on: boolean): void {
    const t = this.ac.currentTime;
    if (on) this.battleUntil = t + 3;
    if (this.state !== 'race') return;
    const want = t < this.battleUntil ? 1 : 0.8;
    if (Math.abs(want - this.intensity) > 1e-3) this.setIntensity(want);
  }

  /** Seconds until the next bar line of the current song (for "on the next downbeat" cues). */
  private nextBar(): number {
    const T = this.T;
    if (!T || !this.cur) return 0;
    const tr = T.getTransport() as unknown as { seconds: number; bpm: { value: number } };
    const bar = (60 / tr.bpm.value) * 4;
    const pos = tr.seconds % bar;
    return bar - pos;
  }

  /** Race intro: the track song at intensity 0.3 (pads + bass). */
  async intro(song: string, variant: 'a' | 'b'): Promise<void> {
    this.state = 'race';
    this.battleUntil = 0;
    await this.play(song, { variant, fadeSec: 1.5, intensity: 0.3 });
  }
  countdown(beats: number): void { this.mixer.duck('countdown', -8, beats * (60 / 60) + 0.2); }
  go(): void {
    this.mixer.unduck('countdown');
    const dt = this.nextBar();
    setTimeout(() => { if (this.state === 'race') this.setIntensity(0.8); }, Math.min(2500, dt * 1000));
  }

  setState(s: MusicState, o: { rank?: number; song?: string; variant?: 'a' | 'b' } = {}): void {
    const prev = this.state;
    this.state = s;
    switch (s) {
      case 'lobby': void this.play('lobby', { fadeSec: prev === 'results' ? 2 : 1, intensity: 0.8 }); break;
      case 'race': if (o.song) void this.play(o.song, { variant: o.variant ?? 'a', intensity: 0.8 }); else this.setIntensity(0.8); break;
      case 'finalLap': {
        this.sfx('jingle.final_lap', { gain: 0.9 });
        this.cur?.handle.setTempoMul?.(1.06, 2);
        this.cur?.handle.addHats?.(true);
        this.setIntensity(1);
        this.mixer.sweepOpen(900, 2);
        break;
      }
      case 'finish': {
        const win = (o.rank ?? 9) <= 3;
        const dt = Math.min(2.5, this.nextBar());
        const my = ++this.token;
        setTimeout(() => { if (my !== this.token) return; void this.stopCurrent(0.15); this.sfx(win ? 'jingle.finish_win' : 'jingle.finish_lose', { gain: 0.9 }); }, dt * 1000);
        break;
      }
      case 'results': {
        const win = (o.rank ?? 9) <= 3;
        const my = ++this.token;
        void this.stopCurrent(0.4);
        this.sfx(win ? 'jingle.results_win' : 'jingle.results_lose', { gain: 0.9 });
        setTimeout(() => { if (my === this.token && this.state === 'results') void this.play('lobby', { fadeSec: 2, intensity: 0.8 }); }, win ? 4200 : 2800);
        break;
      }
    }
  }

  retireCountdown(): void { this.sfx('jingle.retire_count', { gain: 0.8 }); this.setIntensity(0.3); }

  current(): { id: string; variant: string } | null { return this.cur ? { id: this.cur.id, variant: this.cur.variant } : null; }
}
