// Keyboard + gamepad → InputFrame. Uses KeyboardEvent.code (layout independent).
// Browser pitfalls (31-ui-spec §7.4): Alt keyup menu bar, Ctrl+W, Sticky Keys → alternates Space/E/C; F-keys, Tab,
// Backspace and Space defaults are suppressed only while a race has focus; text fields and IME composition suspend game keys.
import { signal } from '@preact/signals';
import { Edge, makeInput, type InputFrame } from '@cr/sim';
import { save } from '../meta/save.ts';
import type { DriveActions } from './actionFilter.ts';
import { InputTimeline, type InputTrace } from './timeline.ts';
import { installGamepad, padState, consumePadPresses, consumeStickFlicks, releasePad, onPadButton } from './gamepad.ts';

/** Where the last input came from; HUD and menus switch their key hints to pad glyphs on 'pad' (31-ui-spec §7.2). */
export const inputDevice = signal<'kb' | 'pad'>('kb');
/** Held actions that the HUD shows (rear view, full standings). */
export const heldUi = signal<{ look: boolean; standings: boolean }>({ look: false, standings: false });

const down = new Set<string>();
let emote = 0;
let anyKeyCbs: (() => void)[] = [];
const timeline = new InputTimeline();
const trace: InputTrace[] = [];
let traceEnabled = false;
export function inputTrace(enable = true): readonly InputTrace[] { traceEnabled = enable; if (enable) trace.length = 0; return trace; }
timeline.trace = (entry) => { if (traceEnabled) { if (trace.length >= 20000) trace.shift(); trace.push(entry); } };
let gameActive = false;
let composing = false;
let focused = true;
let captureCb: ((code: string) => void) | null = null;
const uiListeners = new Map<string, Set<() => void>>();

/** UI actions fired from key or pad presses: pause, standings, restart, music, sfx, fullscreen, emote1..4. */
export function onUiAction(action: string, fn: () => void): () => void {
  let s = uiListeners.get(action);
  if (!s) { s = new Set(); uiListeners.set(action, s); }
  s.add(fn);
  return () => s.delete(fn);
}
function fire(action: string): void { for (const f of uiListeners.get(action) ?? []) f(); }

/** True while the race owns the keyboard (not paused, not in a menu). */
export function setGameKeysActive(on: boolean): void {
  gameActive = on;
  clearInput();
}
export function gameKeysActive(): boolean { return gameActive; }

/** The next key press is delivered to `cb` (rebinding) instead of the game. Escape still arrives as 'Escape'. */
export function captureKey(cb: (code: string) => void): () => void {
  captureCb = cb;
  return () => { if (captureCb === cb) captureCb = null; };
}
export function isCapturing(): boolean { return captureCb !== null; }

function isTextTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  const type = (el as HTMLInputElement).type;
  return type === 'text' || type === 'search' || type === 'password' || type === 'email' || type === 'number' || type === 'url';
}

function actionsOf(code: string): string[] {
  const keys = save.get().settings.keys;
  const out: string[] = [];
  for (const [a, codes] of Object.entries(keys)) if (codes.includes(code)) out.push(a);
  return out;
}

const BROWSER_DEFAULTS = new Set(['F7', 'F8', 'Tab', 'Backspace', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F11']);
const SYSTEM_ACTIONS = new Set(['music', 'sfx', 'fullscreen']);

function onDown(e: KeyboardEvent): void {
  if (captureCb) {
    e.preventDefault(); e.stopImmediatePropagation();
    const cb = captureCb; captureCb = null; cb(e.code);
    return;
  }
  if (composing || e.isComposing || isTextTarget(e.target)) return;
  inputDevice.value = 'kb';
  if (e.code === 'AltLeft' || e.code === 'AltRight') e.preventDefault();
  const acts = actionsOf(e.code);
  if (anyKeyCbs.length && !e.repeat) { const cbs = anyKeyCbs; anyKeyCbs = []; for (const cb of cbs) cb(); }
  // system hotkeys work everywhere (menus and race)
  for (const a of acts) if (SYSTEM_ACTIONS.has(a)) { e.preventDefault(); if (!e.repeat) fire(a); }
  if (!gameActive) return;
  const fresh = !e.repeat && !down.has(e.code);
  if (acts.length || BROWSER_DEFAULTS.has(e.code)) e.preventDefault();
  if (fresh) {
    for (const a of acts) {
      switch (a) {
        case 'emote1': case 'emote2': case 'emote3': case 'emote4': emote = Number(a.slice(5)); fire(a); break;
        case 'pause': case 'restart': fire(a); break;
        case 'standings': heldUi.value = { ...heldUi.value, standings: true }; break;
        case 'look': heldUi.value = { ...heldUi.value, look: true }; break;
        default: break;
      }
    }
  }
  if (gameActive) { down.add(e.code); timeline.enqueue(readActions(readPad(false)), eventTime(e), fresh ? acts : [], emote); }
}

function onUp(e: KeyboardEvent): void {
  if (e.code === 'AltLeft' || e.code === 'AltRight') e.preventDefault();
  down.delete(e.code);
  if (gameActive) timeline.enqueue(readActions(readPad(false)), eventTime(e));
  const acts = actionsOf(e.code);
  if (gameActive && acts.length && !isTextTarget(e.target)) e.preventDefault();
  if (acts.includes('standings')) heldUi.value = { ...heldUi.value, standings: false };
  if (acts.includes('look')) heldUi.value = { ...heldUi.value, look: false };
}

/** Clear held driving controls without disabling pause/menu hotkeys. */
export function clearDrivingInput(now = performance.now()): void { clearInput(now); }
function clearInput(now = performance.now()): void {
  down.clear(); emote = 0; padSnapshot = ''; timeline.reset(now); releasePad();
  if (heldUi.value.look || heldUi.value.standings) heldUi.value = { look: false, standings: false };
}

function releaseAll(): void {
  clearInput();
  for (const f of uiListeners.get('blur') ?? []) f();
}

let installed = false;
export function installKeyboard(): void {
  if (installed) return;
  installed = true;
  window.addEventListener('keydown', onDown, { capture: true });
  window.addEventListener('keyup', onUp, { capture: true });
  window.addEventListener('blur', () => { focused = false; releaseAll(); });
  window.addEventListener('focus', () => { focused = true; clearInput(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
  window.addEventListener('compositionstart', () => { composing = true; clearInput(); }, { capture: true });
  window.addEventListener('compositionend', () => { composing = false; }, { capture: true });
  window.addEventListener('focusin', (e) => { if (isTextTarget(e.target)) clearInput(); }, { capture: true });
  // no context menu / text selection on the game surface
  window.addEventListener('contextmenu', (e) => { if (!isTextTarget(e.target)) e.preventDefault(); });
  installGamepad();
  onPadButton((b) => {
    inputDevice.value = 'pad';
    if (anyKeyCbs.length) { const cbs = anyKeyCbs; anyKeyCbs = []; for (const cb of cbs) cb(); }
    if (!gameActive) return;
    const pad = save.get().settings.pad ?? {};
    for (const [a, btns] of Object.entries(pad)) if (btns.includes(b) && (a === 'pause' || a === 'standings' || a === 'emote1')) fire(a);
  });
}
/** One-shot: `cb` runs on the next key or pad press. Returns an unsubscribe. */
export function onAnyKey(cb: () => void): () => void { anyKeyCbs.push(cb); return () => { anyKeyCbs = anyKeyCbs.filter((c) => c !== cb); }; }

const held = (a: string): boolean => (save.get().settings.keys[a] ?? []).some((c) => down.has(c));

const actions: DriveActions = { up: false, down: false, left: false, right: false, drift: false, boost: false };
function readActions(gp: typeof padOut): DriveActions {
  actions.up = held('accel'); actions.down = held('brake');
  actions.left = held('left') || gp.left; actions.right = held('right') || gp.right;
  actions.drift = held('drift') || gp.drift; actions.boost = held('item') || gp.item;
  actions.look = held('look') || gp.look;
  actions.analogSteer = gp.steer; actions.analogThrottle = gp.accel; actions.analogBrake = gp.brake;
  return actions;
}
/** DOM timestamps share performance.timeOrigin in modern browsers; normalize legacy epoch stamps. */
function eventTime(e: Event): number {
  const now = performance.now();
  const stamp = e.timeStamp > 1e12 ? e.timeStamp - performance.timeOrigin : e.timeStamp;
  return Number.isFinite(stamp) && stamp >= 0 && stamp <= now + 1000 ? stamp : now;
}

const frame = makeInput();
let padSnapshot = '';
/** Poll once per presentation/pump. Raw keyboard transitions have already been queued by DOM handlers. */
export function pumpInput(now = performance.now()): void {
  const gp = readPad();
  if (!gameActive || composing || !focused || document.hidden || isTextTarget(document.activeElement)) { clearInput(now); return; }
  const snapshot = `${gp.steer},${gp.accel},${gp.brake},${gp.drift},${gp.item},${gp.look},${gp.left},${gp.right}`;
  if (snapshot !== padSnapshot || gp.edges) {
    padSnapshot = snapshot;
    const presses: string[] = [];
    if (gp.edges & Edge.DRIFT) presses.push('drift');
    if (gp.edges & Edge.USE_ITEM) presses.push('item');
    if (gp.edges & Edge.SWAP) presses.push('swap');
    if (gp.edges & Edge.RESPAWN) presses.push('reset');
    if (gp.edges & Edge.TAP_L) presses.push('left');
    if (gp.edges & Edge.TAP_R) presses.push('right');
    if (gp.edges & Edge.EMOTE) presses.push('emote1');
    timeline.enqueue(readActions(gp), now, presses, gp.edges & Edge.EMOTE ? 1 : 0);
  }
  if (gp.look !== heldUi.value.look && !held('look')) heldUi.value = { ...heldUi.value, look: gp.look };
}

/** Called once per NEW physics tick; rollback reuses the stored frame, never consumes raw events again. */
export function sampleInputTick(until: number, out: InputFrame = frame): InputFrame {
  if (!gameActive || composing || !focused || document.hidden || isTextTarget(document.activeElement)) {
    out.steer = 0; out.steerIntent = 0; out.driftRequests = 0; out.throttle = 0; out.brake = 0; out.held = 0; out.edges = 0; out.aim = 255; out.emote = 0;
    return out;
  }
  timeline.sample(until, out, save.get().settings.autoBoost);
  return out;
}

/** Compatibility/manual sampler. The live Session instead polls once and samples each physics boundary. */
export function sampleInput(now = performance.now()): InputFrame {
  pumpInput(now);
  return sampleInputTick(now + 1e-6);
}

// ------------------------------------------------------------------ gamepad (standard mapping, rebindable)
const padOut = { steer: 0, accel: 0, brake: 0, drift: false, item: false, look: false, left: false, right: false, edges: 0 };
function digitalPedal(bindings: readonly number[] | undefined, buttons: readonly boolean[], trigger: number): boolean {
  if (bindings) for (const button of bindings) if (button !== trigger && buttons[button]) return true;
  return false;
}
function readPad(consumeEdges = true): typeof padOut {
  const o = padOut;
  o.steer = 0; o.accel = 0; o.brake = 0; o.drift = false; o.item = false; o.look = false; o.left = false; o.right = false; o.edges = 0;
  const p = padState();
  const presses = consumeEdges ? consumePadPresses() : 0, flicks = consumeEdges ? consumeStickFlicks() : 0;
  if (!p.connected) return o;
  const map = save.get().settings.pad ?? {};
  const btn = (a: string): boolean => (map[a] ?? []).some((b) => p.buttons[b]);
  const pressed = (a: string): boolean => (map[a] ?? []).some((b) => (presses & (1 << b)) !== 0);
  o.steer = p.steer;
  // triggers are analog when bound to their default buttons, digital otherwise
  o.accel = digitalPedal(map['accel'], p.buttons, 7) ? 1 : map['accel']?.includes(7) ? p.throttle : 0;
  o.brake = digitalPedal(map['brake'], p.buttons, 6) ? 1 : map['brake']?.includes(6) ? p.brake : 0;
  o.drift = btn('drift'); o.item = btn('item'); o.look = btn('look');
  o.left = btn('left'); o.right = btn('right');
  if (pressed('item')) o.edges |= Edge.USE_ITEM;
  if (pressed('drift')) o.edges |= Edge.DRIFT;
  if (pressed('swap')) o.edges |= Edge.SWAP;
  if (pressed('reset')) o.edges |= Edge.RESPAWN;
  if (pressed('left') || (flicks & 1)) o.edges |= Edge.TAP_L;
  if (pressed('right') || (flicks & 2)) o.edges |= Edge.TAP_R;
  if (pressed('emote1')) o.edges |= Edge.EMOTE;
  return o;
}
