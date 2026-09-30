// Lazy Tone.js loader (ADR-001: loaded after the first user gesture, never in the initial bundle).
// Imports the class barrel and Global directly (not the `tone` index, which eagerly creates its own AudioContext),
// then points Tone at our AudioContext so songs route into the mixer's music bus.
import type { ToneLib } from '../api.ts';

let pending: Promise<ToneLib> | null = null;

export function loadTone(ac: AudioContext): Promise<ToneLib> {
  pending ??= (async () => {
    (globalThis as unknown as { TONE_SILENCE_LOGGING?: boolean }).TONE_SILENCE_LOGGING = true;
    const [G, classes] = await Promise.all([import('tone/build/esm/core/Global.js'), import('tone/build/esm/classes.js')]);
    G.setContext(ac);
    const ctx = G.getContext();
    ctx.lookAhead = 0.08;
    return { ...classes, getTransport: () => G.getContext().transport, now: () => G.getContext().now() } as unknown as ToneLib;
  })();
  return pending;
}

export function toneLoaded(): boolean { return pending !== null; }
