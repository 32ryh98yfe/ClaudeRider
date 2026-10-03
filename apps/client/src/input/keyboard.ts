// Keyboard + gamepad → InputFrame. Uses KeyboardEvent.code (layout independent).
// Browser pitfalls (31-ui-spec §7.4): Alt keyup menu bar, Ctrl+W, Sticky Keys → alternates Space/E/C; F-keys, Tab,
// Backspace and Space defaults are suppressed only while a race has focus; text fields and IME composition suspend game keys.
import { signal } from '@preact/signals';
import { Edge, makeInput, type InputFrame } from '@cr/sim';
import { save } from '../meta/save.ts';
import { InputActionFilter, actionPressEdge, type DriveActions } from './actionFilter.ts';
import { installGamepad, padState, consumePadPresses, consumeStickFlicks, releasePad, onPadButton } from './gamepad.ts';

/** Where the last input came from; HUD and menus switch their key hints to pad glyphs on 'pad' (31-ui-spec §7.2). */
export const inputDevice = signal<'kb' | 'pad'>('kb');
/** Held actions that the HUD shows (rear view, full standings). */
export const heldUi = signal<{ look: boolean; standings: boolean }>({ look: false, standings: false });

const down = new Set<string>();
let edges = 0;
let emote = 0;
let anyKeyCbs: (() => void)[] = [];
const actionFilter = new InputActionFilter();
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
  // Integrate the old direction up to the event before changing the held keys. A short
  // counter-steer then has the same duration even when it falls between rendered frames.
  advanceSteering(readPad(false), performance.now());
  if (acts.length || BROWSER_DEFAULTS.has(e.code)) e.preventDefault();
  if (!e.repeat) {
    for (const a of acts) {
      edges |= actionPressEdge(a);
      switch (a) {
        case 'emote1': case 'emote2': case 'emote3': case 'emote4': emote = Number(a.slice(5)); fire(a); break;
        case 'pause': case 'restart': fire(a); break;
        case 'standings': heldUi.value = { ...heldUi.value, standings: true }; break;
        case 'look': heldUi.value = { ...heldUi.value, look: true }; break;
        default: break;
      }
    }
  }
  if (gameActive) down.add(e.code);
}

function onUp(e: KeyboardEvent): void {
  if (e.code === 'AltLeft' || e.code === 'AltRight') e.preventDefault();
  if (gameActive) advanceSteering(readPad(false), performance.now());
  down.delete(e.code);
  const acts = actionsOf(e.code);
  if (gameActive && acts.length && !isTextTarget(e.target)) e.preventDefault();
  if (acts.includes('standings')) heldUi.value = { ...heldUi.value, standings: false };
  if (acts.includes('look')) heldUi.value = { ...heldUi.value, look: false };
}

function clearInput(now = performance.now()): void {
  down.clear(); edges = 0; emote = 0; actionFilter.reset(now); releasePad();
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
function advanceSteering(gp: typeof padOut, now: number): number {
  return actionFilter.advance(readActions(gp), now);
}

const frame = makeInput();
/** Samples and consumes latched edges using the monotonic render/fallback-pump time in milliseconds. */
export function sampleInput(now = performance.now()): InputFrame {
  const gp = readPad();
  if (!gameActive || composing || !focused || document.hidden || isTextTarget(document.activeElement)) {
    clearInput(now);
    frame.steer = 0; frame.throttle = 0; frame.brake = 0; frame.held = 0; frame.edges = 0; frame.aim = 255; frame.emote = 0;
    return frame;
  }
  actionFilter.sample(readActions(gp), now, edges | gp.edges, frame, save.get().settings.autoBoost, gp.edges & Edge.EMOTE ? 1 : emote);
  if (gp.look !== heldUi.value.look && !held('look')) heldUi.value = { ...heldUi.value, look: gp.look };
  edges = 0; emote = 0;
  return frame;
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
  if (pressed('swap')) o.edges |= Edge.SWAP;
  if (pressed('reset')) o.edges |= Edge.RESPAWN;
  if (pressed('left') || (flicks & 1)) o.edges |= Edge.TAP_L;
  if (pressed('right') || (flicks & 2)) o.edges |= Edge.TAP_R;
  if (pressed('emote1')) o.edges |= Edge.EMOTE;
  return o;
}
