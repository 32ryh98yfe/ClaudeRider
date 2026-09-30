// Emotes (art bible §7): 1.5–2.5 s keyframed clips, every one starts and ends in the idle pose ("idle is the universal
// hinge"). Clips are real THREE.AnimationClips of NumberKeyframeTracks (smooth interpolation), built in code; the rig
// samples them through pre-built interpolants so playback never allocates. Values are layered over the procedural pose
// with an ease-in/out envelope, so any emote can start from (and return to) whatever the driver was doing.
import * as THREE from 'three/webgpu';

export type EmoteSlot = 'idle' | 'win' | 'podium' | 'lose' | 'retire' | 'attackLanded' | 'gotHit' | 'lobby';
export const EMOTE_SLOTS: readonly EmoteSlot[] = ['idle', 'win', 'podium', 'lose', 'retire', 'attackLanded', 'gotHit', 'lobby'];
export type EyeExpr = 'open' | 'blink' | 'happy' | 'dizzy' | 'star' | 'angry' | 'sleepy' | 'wink';

/**
 * Channels. Additive: y (hop, rig m), rx/ry/rz (body pitch/yaw/roll, rad), sq (squash: +y stretch / −y squash), s (uniform scale, −1 = vanish),
 * hx/hy/hz (head-accessory bone rotation), hl (head accessory lift, m), spin (extra sparkle spin, rad/s),
 * p0..p2 (character prop channels, meaning defined by the character). Absolute (blended in by the envelope):
 * aLr/aRr (arm raise: + up), aLf/aRf (arm swing forward: + toward the face).
 */
export const CHANNELS = ['y', 'rx', 'ry', 'rz', 'sq', 's', 'hx', 'hy', 'hz', 'hl', 'spin', 'p0', 'p1', 'p2', 'aLr', 'aLf', 'aRr', 'aRf'] as const;
export type Channel = typeof CHANNELS[number];
export const ARM_CHANNELS: ReadonlySet<Channel> = new Set<Channel>(['aLr', 'aLf', 'aRr', 'aRf']);

/** Flat keyframes [t0, v0, t1, v1, …]. */
export type Keys = number[];
export interface EmoteSpec {
  duration: number;
  keys: Partial<Record<Channel, Keys>>;
  eyes?: ReadonlyArray<readonly [number, EyeExpr]>;
  fx?: ReadonlyArray<readonly [number, string]>;
  /** Quantize playback to this many frames per second (Pixel's 8-bit hop). */
  stepped?: number;
}
/** Per-character emote: tweak or replace the base clip. */
export type EmoteBuilder = (base: EmoteSpec) => EmoteSpec;

/** Oscillation helper: keys for `amp·sin` waves between t0 and t1 with `n` half-cycles, easing to 0 at both ends. */
export function wave(t0: number, t1: number, amp: number, n: number, base = 0): Keys {
  const out: Keys = [t0, base];
  for (let i = 1; i <= n; i++) out.push(t0 + ((t1 - t0) * (i - 0.5)) / n, base + (i % 2 ? amp : -amp));
  out.push(t1, base);
  return out;
}
/** Hop keys: `n` hops of height h between t0 and t1. */
export function hops(t0: number, t1: number, h: number, n: number): Keys {
  const out: Keys = [t0, 0];
  const d = (t1 - t0) / n;
  for (let i = 0; i < n; i++) out.push(t0 + d * (i + 0.5), h, t0 + d * (i + 1), 0);
  return out;
}

// Arm poses (rad): raise 0 = sideways stub, 1.3 ≈ straight up; forward 0 = sideways, 1 ≈ pointing ahead.
export const BASE_EMOTES: Record<EmoteSlot, EmoteSpec> = {
  idle: {
    duration: 2.2,
    keys: { ry: [0, 0, 0.5, 0.32, 1.1, 0.32, 1.5, -0.3, 2.0, -0.3, 2.2, 0], rz: [0, 0, 0.5, -0.05, 1.5, 0.05, 2.2, 0] },
    eyes: [[0, 'open'], [1.25, 'blink'], [1.37, 'open']],
  },
  lobby: {
    duration: 2.4,
    keys: {
      y: hops(0.05, 0.45, 0.07, 1),
      aRr: [0, 0, 0.25, 1.45, 2.1, 1.45, 2.4, 0], aRf: [0, 0, 0.3, 0.2, ...wave(0.3, 1.95, 0.55, 5, 0.2).slice(2), 2.4, 0],
      rz: [0, 0, 0.35, -0.08, 1.9, -0.08, 2.4, 0], ry: [0, 0, 0.4, 0.18, 1.9, 0.18, 2.4, 0],
      sq: [0, 0, 0.06, -0.06, 0.14, 0.05, 0.3, 0],
    },
    eyes: [[0, 'open'], [0.35, 'happy'], [2.05, 'open']],
  },
  win: {
    duration: 2.4,
    keys: {
      y: [...hops(0.1, 1.0, 0.24, 2), ...hops(1.3, 1.8, 0.14, 1).slice(2)],
      ry: [0, 0, 0.3, 0, 0.9, Math.PI * 2, 2.4, Math.PI * 2],
      aLr: [0, 0, 0.2, 1.5, 1.9, 1.5, 2.4, 0], aRr: [0, 0, 0.2, 1.5, 1.9, 1.5, 2.4, 0],
      aLf: wave(0.25, 1.9, 0.35, 6), aRf: wave(0.25, 1.9, -0.35, 6),
      sq: [0, 0, 0.08, -0.1, 0.16, 0.08, 0.32, 0, 1.0, 0, 1.06, -0.08, 1.16, 0],
      spin: [0, 0, 0.3, 14, 1.6, 14, 2.2, 0],
    },
    eyes: [[0, 'happy'], [2.2, 'open']],
    fx: [[0.3, 'confetti'], [1.0, 'sparkle']],
  },
  podium: {
    duration: 2.2,
    keys: {
      rx: [0, 0, 0.4, -0.16, 1.8, -0.16, 2.2, 0],
      aLr: [0, 0, 0.3, 1.2, 1.9, 1.2, 2.2, 0], aRr: [0, 0, 0.55, 1.2, 1.9, 1.2, 2.2, 0],
      aLf: [0, 0, 0.3, 0.1, 1.9, 0.1, 2.2, 0], aRf: [0, 0, 0.55, 0.1, 1.9, 0.1, 2.2, 0],
      y: hops(0.1, 0.4, 0.06, 1), sq: [0, 0, 0.4, 0.05, 1.8, 0.05, 2.2, 0],
    },
    eyes: [[0, 'open'], [0.5, 'star'], [1.9, 'happy'], [2.15, 'open']],
    fx: [[0.55, 'sparkle']],
  },
  lose: {
    duration: 2.2,
    keys: {
      rx: [0, 0, 0.5, 0.34, 1.8, 0.34, 2.2, 0], sq: [0, 0, 0.5, -0.07, 1.8, -0.07, 2.2, 0],
      aLr: [0, 0, 0.5, -0.55, 1.8, -0.55, 2.2, 0], aRr: [0, 0, 0.5, -0.55, 1.8, -0.55, 2.2, 0],
      ry: [0, 0, 0.8, 0, 1.1, 0.12, 1.4, -0.12, 1.7, 0, 2.2, 0],
    },
    eyes: [[0, 'open'], [0.4, 'sleepy'], [1.0, 'blink'], [1.3, 'sleepy'], [2.05, 'open']],
    fx: [[0.6, 'sweat']],
  },
  retire: {
    duration: 2.5,
    keys: {
      y: [0, 0, 0.4, -0.07, 2.1, -0.07, 2.5, 0], sq: [0, 0, 0.4, -0.08, 0.9, -0.02, 1.3, -0.1, 2.1, -0.08, 2.5, 0],
      rx: [0, 0, 0.4, 0.12, 2.1, 0.12, 2.5, 0],
      aLr: [0, 0, 0.4, -0.6, 2.1, -0.6, 2.5, 0], aRr: [0, 0, 0.4, -0.6, 2.1, -0.6, 2.5, 0],
    },
    eyes: [[0, 'sleepy'], [2.3, 'open']],
    fx: [[0.9, 'sigh']],
  },
  attackLanded: {
    duration: 1.6,
    keys: {
      y: hops(0.05, 0.5, 0.12, 1),
      aRr: [0, 0, 0.15, 1.5, 1.2, 1.5, 1.6, 0], aRf: [0, 0, 0.2, 0.3, 0.35, -0.2, 0.5, 0.3, 0.65, -0.2, 0.8, 0.2, 1.6, 0],
      rz: [0, 0, 0.2, -0.12, 1.2, -0.12, 1.6, 0], sq: [0, 0, 0.05, -0.08, 0.15, 0.06, 0.3, 0],
    },
    eyes: [[0, 'star'], [1.3, 'happy'], [1.55, 'open']],
    fx: [[0.1, 'stars']],
  },
  gotHit: {
    duration: 1.6,
    keys: {
      rz: [0, 0, 0.08, 0.34, 0.25, -0.28, 0.45, 0.2, 0.7, -0.12, 0.95, 0.06, 1.6, 0],
      ry: [0, 0, 0.1, -0.4, 0.3, 0.3, 0.55, -0.18, 0.9, 0.08, 1.6, 0],
      sq: [0, 0, 0.06, -0.14, 0.2, 0.08, 0.38, 0],
      aLr: [0, 0, 0.1, 0.9, 0.5, 0.2, 0.8, 0.6, 1.6, 0], aRr: [0, 0, 0.1, 0.7, 0.5, 0.9, 0.8, 0.3, 1.6, 0],
    },
    eyes: [[0, 'dizzy'], [1.4, 'open']],
    fx: [[0.05, 'stars']],
  },
};

export interface CompiledEmote {
  spec: EmoteSpec;
  clip: THREE.AnimationClip;
  channels: Channel[];
  interps: THREE.Interpolant[];
}

/** Build the AnimationClip + interpolants for one spec (cached by the caller per character and slot). */
export function compileEmote(name: string, spec: EmoteSpec): CompiledEmote {
  const tracks: THREE.KeyframeTrack[] = [];
  const channels: Channel[] = [];
  for (const ch of CHANNELS) {
    const k = spec.keys[ch];
    if (!k || k.length < 4) continue;
    const times: number[] = [], values: number[] = [];
    for (let i = 0; i + 1 < k.length; i += 2) { times.push(k[i]!); values.push(k[i + 1]!); }
    tracks.push(new THREE.NumberKeyframeTrack(`.${ch}`, times, values, THREE.InterpolateSmooth));
    channels.push(ch);
  }
  const clip = new THREE.AnimationClip(name, spec.duration, tracks);
  const interps = tracks.map((t) => (t as unknown as { createInterpolant(): THREE.Interpolant }).createInterpolant());
  return { spec, clip, channels, interps };
}
