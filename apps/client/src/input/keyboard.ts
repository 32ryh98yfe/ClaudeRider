// Keyboard + gamepad → InputFrame. Uses KeyboardEvent.code (layout independent).
// Browser pitfalls (docs/design/31-ui-spec.md): Alt keyup menu, Ctrl+W, Sticky Keys → alternates Space/E/C.
import { Held, Edge, makeInput, type InputFrame } from '@cr/sim';
import { save } from '../meta/save.ts';

const down = new Set<string>();
let edges = 0;
let anyKeyCbs: (() => void)[] = [];
let lastSteer = 0;

function actionOf(code: string): string | null {
  const keys = save.get().settings.keys;
  for (const [a, codes] of Object.entries(keys)) if (codes.includes(code)) return a;
  return null;
}

function onDown(e: KeyboardEvent): void {
  const a = actionOf(e.code);
  if (a || e.code === 'AltLeft' || e.code === 'AltRight' || e.code === 'Tab') e.preventDefault();
  if (!e.repeat) {
    if (a === 'item') edges |= Edge.USE_ITEM;
    if (a === 'swap') edges |= Edge.SWAP;
    if (a === 'reset') edges |= Edge.RESPAWN;
    if (a === 'left') edges |= Edge.TAP_L;
    if (a === 'right') edges |= Edge.TAP_R;
  }
  down.add(e.code);
  if (anyKeyCbs.length) { const cbs = anyKeyCbs; anyKeyCbs = []; for (const cb of cbs) cb(); }
}
function onUp(e: KeyboardEvent): void {
  if (e.code === 'AltLeft' || e.code === 'AltRight' || actionOf(e.code)) e.preventDefault();
  down.delete(e.code);
}

export function installKeyboard(): void {
  window.addEventListener('keydown', onDown, { capture: true });
  window.addEventListener('keyup', onUp, { capture: true });
  window.addEventListener('blur', () => down.clear());
}
/** One-shot: `cb` runs on the next key press. Returns an unsubscribe. */
export function onAnyKey(cb: () => void): () => void { anyKeyCbs.push(cb); return () => { anyKeyCbs = anyKeyCbs.filter((c) => c !== cb); }; }

const held = (a: string): boolean => (save.get().settings.keys[a] ?? []).some((c) => down.has(c));

const frame = makeInput();
/** Samples the current input state; consumes latched edges. */
export function sampleInput(): InputFrame {
  const gp = readGamepad();
  const l = held('left') || gp.left, r = held('right') || gp.right;
  let steer = gp.steer !== 0 ? gp.steer : (r ? 1 : 0) - (l ? 1 : 0);
  // light digital smoothing keeps keyboard steering from feeling twitchy
  if (gp.steer === 0) { lastSteer += (steer - lastSteer) * 0.6; if (Math.abs(lastSteer - steer) < 0.02) lastSteer = steer; steer = lastSteer; } else lastSteer = steer;
  frame.steer = Math.round(Math.max(-1, Math.min(1, steer)) * 127);
  frame.throttle = held('accel') || gp.accel > 0.1 ? Math.max(1, Math.round((gp.accel > 0.1 ? gp.accel : 1) * 15)) : 0;
  frame.brake = held('brake') || gp.brake > 0.1 ? Math.max(1, Math.round((gp.brake > 0.1 ? gp.brake : 1) * 15)) : 0;
  frame.held = (held('drift') || gp.drift ? Held.DRIFT : 0) | (held('look') || gp.look ? Held.LOOK_BACK : 0) | (save.get().settings.autoBoost && (held('item') || gp.item) ? Held.ITEM : 0);
  frame.edges = edges | gp.edges;
  frame.aim = 255;
  frame.emote = 0;
  edges = 0;
  return frame;
}

// ------------------------------------------------------------------ gamepad (standard mapping)
const prevButtons: boolean[] = [];
function readGamepad(): { steer: number; accel: number; brake: number; drift: boolean; item: boolean; look: boolean; left: boolean; right: boolean; edges: number } {
  const out = { steer: 0, accel: 0, brake: 0, drift: false, item: false, look: false, left: false, right: false, edges: 0 };
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  const p = pads && [...pads].find((g) => g && g.connected);
  if (!p) return out;
  const ax = p.axes[0] ?? 0;
  out.steer = Math.abs(ax) > 0.15 ? (ax - Math.sign(ax) * 0.15) / 0.85 : 0;
  const btn = (i: number): number => p.buttons[i]?.value ?? 0;
  const pressed = (i: number): boolean => !!p.buttons[i]?.pressed;
  out.accel = Math.max(btn(7), pressed(0) ? 0 : 0);
  out.brake = btn(6);
  out.drift = pressed(2) || pressed(5);
  out.item = pressed(0);
  out.look = pressed(4);
  out.left = pressed(14); out.right = pressed(15);
  const edge = (i: number): boolean => { const was = prevButtons[i] ?? false; const now = pressed(i); prevButtons[i] = now; return now && !was; };
  if (edge(0)) out.edges |= Edge.USE_ITEM;
  if (edge(1)) out.edges |= Edge.SWAP;
  if (edge(3)) out.edges |= Edge.RESPAWN;
  return out;
}
