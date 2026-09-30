// Gamepad API (standard mapping, 31-ui-spec §7.2). One RAF poll loop feeds both the race input sampler and menu navigation.
// Edges are latched between samples so a press shorter than a tick is never lost (§7.3).
import { signal } from '@preact/signals';
import { save } from '../meta/save.ts';

export interface PadState {
  connected: boolean; id: string;
  steer: number;                 // −1..1 after deadzone and response curve
  throttle: number; brake: number; // 0..1 (analog triggers)
  buttons: boolean[];            // pressed, by standard index
  axes: number[];
}

export const padInfo = signal<{ connected: boolean; id: string }>({ connected: false, id: '' });
export const lastPadPress = signal<{ button: number; at: number } | null>(null);

const state: PadState = { connected: false, id: '', steer: 0, throttle: 0, brake: 0, buttons: [], axes: [] };
const prev: boolean[] = [];
let latched = 0;              // bitmask of standard buttons pressed since the last consume (buttons 0..31)
let stickFlick = 0;           // −1 / +1 flick edges past ±0.6 since the last consume (mash taps)
let lastStickSide = 0;
const pressListeners = new Set<(button: number) => void>();
const stickListeners = new Set<(dir: 'up' | 'down' | 'left' | 'right') => void>();
let stickRepeatAt = 0; let stickHeldDir = '';
let running = false;

/** Subscribes to pad button presses (edge). Returns an unsubscribe. */
export function onPadButton(fn: (button: number) => void): () => void { pressListeners.add(fn); return () => pressListeners.delete(fn); }
/** Left-stick menu navigation with key-repeat (400 ms, then 120 ms). */
export function onPadStick(fn: (dir: 'up' | 'down' | 'left' | 'right') => void): () => void { stickListeners.add(fn); return () => stickListeners.delete(fn); }

function curve(x: number, dz: number): number {
  const a = Math.abs(x);
  if (a <= dz) return 0;
  const n = (a - dz) / (1 - dz);
  return Math.sign(x) * Math.pow(Math.min(1, n), 1.3);
}

function poll(now: number): void {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let p: Gamepad | null = null;
  for (const g of pads ?? []) if (g && g.connected) { p = g; break; }
  if (!p) {
    if (state.connected) { state.connected = false; padInfo.value = { connected: false, id: '' }; }
    return;
  }
  if (!state.connected || state.id !== p.id) { state.connected = true; state.id = p.id; padInfo.value = { connected: true, id: p.id }; }
  const dz = save.get().settings.deadzone ?? 0.15;
  const ax = p.axes[0] ?? 0, ay = p.axes[1] ?? 0;
  state.steer = curve(ax, dz);
  state.axes = [...p.axes];
  const b = p.buttons;
  state.throttle = b[7]?.value ?? 0;
  state.brake = b[6]?.value ?? 0;
  for (let i = 0; i < b.length && i < 32; i++) {
    const now_ = !!b[i]?.pressed;
    state.buttons[i] = now_;
    if (now_ && !prev[i]) { latched |= 1 << i; lastPadPress.value = { button: i, at: now }; for (const f of pressListeners) f(i); }
    prev[i] = now_;
  }
  // stick flicks for mash-out taps
  const side = ax > 0.6 ? 1 : ax < -0.6 ? -1 : 0;
  if (side !== 0 && side !== lastStickSide) stickFlick |= side > 0 ? 2 : 1;
  lastStickSide = side;
  // stick menu navigation
  const dir = Math.abs(ax) > 0.55 || Math.abs(ay) > 0.55 ? (Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : (ay > 0 ? 'down' : 'up')) : '';
  if (dir !== stickHeldDir) { stickHeldDir = dir; if (dir) { stickRepeatAt = now + 400; for (const f of stickListeners) f(dir as 'up'); } }
  else if (dir && now >= stickRepeatAt) { stickRepeatAt = now + 120; for (const f of stickListeners) f(dir as 'up'); }
}

export function installGamepad(): void {
  if (running || typeof window === 'undefined') return;
  running = true;
  const loop = (now: number): void => { requestAnimationFrame(loop); poll(now); };
  requestAnimationFrame(loop);
  window.addEventListener('gamepadconnected', () => poll(performance.now()));
  window.addEventListener('gamepaddisconnected', () => poll(performance.now()));
}

/** Current pad state (read-only view). */
export function padState(): Readonly<PadState> { return state; }

/** Returns buttons pressed since the last call (bitmask) and clears them. */
export function consumePadPresses(): number { const x = latched; latched = 0; return x; }
/** Returns stick flick edges since the last call (bit0 = left, bit1 = right) and clears them. */
export function consumeStickFlicks(): number { const x = stickFlick; stickFlick = 0; return x; }

/** Neutralises everything (blur / visibility change). */
export function releasePad(): void { latched = 0; stickFlick = 0; }

/** Next pad button press, for the gamepad mapping screen. Returns a cancel function. */
export function capturePadButton(cb: (button: number) => void): () => void {
  const off = onPadButton((b) => { off(); cb(b); });
  return off;
}
