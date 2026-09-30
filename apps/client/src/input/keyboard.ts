// Keyboard + gamepad → InputFrame. Uses KeyboardEvent.code (layout independent).
// Browser pitfalls (31-ui-spec §7.4): Alt keyup menu bar, Ctrl+W, Sticky Keys → alternates Space/E/C; F-keys, Tab,
// Backspace and Space defaults are suppressed only while a race has focus; text fields and IME composition suspend game keys.
import { signal } from '@preact/signals';
import { Held, Edge, makeInput, type InputFrame } from '@cr/sim';
import { save } from '../meta/save.ts';
import { installGamepad, padState, consumePadPresses, consumeStickFlicks, releasePad, onPadButton } from './gamepad.ts';

/** Where the last input came from; HUD and menus switch their key hints to pad glyphs on 'pad' (31-ui-spec §7.2). */
export const inputDevice = signal<'kb' | 'pad'>('kb');
/** Held actions that the HUD shows (rear view, full standings). */
export const heldUi = signal<{ look: boolean; standings: boolean }>({ look: false, standings: false });

const down = new Set<string>();
let edges = 0;
let emote = 0;
let anyKeyCbs: (() => void)[] = [];
let lastSteer = 0;
let gameActive = false;
let composing = false;
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
  if (!on) { down.clear(); edges = 0; }
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
  if (acts.length || BROWSER_DEFAULTS.has(e.code)) e.preventDefault();
  if (!e.repeat) {
    for (const a of acts) {
      switch (a) {
        case 'item': edges |= Edge.USE_ITEM; break;
        case 'swap': edges |= Edge.SWAP; break;
        case 'reset': edges |= Edge.RESPAWN; break;
        case 'left': edges |= Edge.TAP_L; break;
        case 'right': edges |= Edge.TAP_R; break;
        case 'emote1': case 'emote2': case 'emote3': case 'emote4': edges |= Edge.EMOTE; emote = Number(a.slice(5)); fire(a); break;
        case 'pause': case 'restart': fire(a); break;
        case 'standings': heldUi.value = { ...heldUi.value, standings: true }; break;
        case 'look': heldUi.value = { ...heldUi.value, look: true }; break;
        default: break;
      }
    }
  }
  down.add(e.code);
}

function onUp(e: KeyboardEvent): void {
  if (e.code === 'AltLeft' || e.code === 'AltRight') e.preventDefault();
  if (isTextTarget(e.target)) return;
  const acts = actionsOf(e.code);
  if (gameActive && acts.length) e.preventDefault();
  down.delete(e.code);
  if (acts.includes('standings')) heldUi.value = { ...heldUi.value, standings: false };
  if (acts.includes('look')) heldUi.value = { ...heldUi.value, look: false };
}

function releaseAll(): void {
  down.clear(); edges = 0; lastSteer = 0; releasePad();
  if (heldUi.value.look || heldUi.value.standings) heldUi.value = { look: false, standings: false };
  for (const f of uiListeners.get('blur') ?? []) f();
}

let installed = false;
export function installKeyboard(): void {
  if (installed) return;
  installed = true;
  window.addEventListener('keydown', onDown, { capture: true });
  window.addEventListener('keyup', onUp, { capture: true });
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
  window.addEventListener('compositionstart', () => { composing = true; }, { capture: true });
  window.addEventListener('compositionend', () => { composing = false; }, { capture: true });
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

const frame = makeInput();
/** Samples the current input state; consumes latched edges. Called by game/Session once per rendered frame. */
export function sampleInput(): InputFrame {
  const gp = readPad();
  const l = held('left') || gp.left, r = held('right') || gp.right;
  let steer = gp.steer !== 0 ? gp.steer : (r ? 1 : 0) - (l ? 1 : 0);
  // light digital smoothing keeps keyboard steering from feeling twitchy
  if (gp.steer === 0) { lastSteer += (steer - lastSteer) * 0.6; if (Math.abs(lastSteer - steer) < 0.02) lastSteer = steer; steer = lastSteer; } else lastSteer = steer;
  frame.steer = Math.round(Math.max(-1, Math.min(1, steer)) * 127);
  frame.throttle = held('accel') || gp.accel > 0.1 ? Math.max(1, Math.round((gp.accel > 0.1 ? gp.accel : 1) * 15)) : 0;
  frame.brake = held('brake') || gp.brake > 0.1 ? Math.max(1, Math.round((gp.brake > 0.1 ? gp.brake : 1) * 15)) : 0;
  const look = held('look') || gp.look;
  frame.held = (held('drift') || gp.drift ? Held.DRIFT : 0) | (look ? Held.LOOK_BACK : 0) | (save.get().settings.autoBoost && (held('item') || gp.item) ? Held.ITEM : 0);
  frame.edges = edges | gp.edges;
  frame.aim = 255;
  frame.emote = gp.edges & Edge.EMOTE ? 1 : emote;
  if (gp.look !== heldUi.value.look && !held('look')) heldUi.value = { ...heldUi.value, look: gp.look };
  edges = 0; emote = 0;
  return frame;
}

// ------------------------------------------------------------------ gamepad (standard mapping, rebindable)
const padOut = { steer: 0, accel: 0, brake: 0, drift: false, item: false, look: false, left: false, right: false, edges: 0 };
function readPad(): typeof padOut {
  const o = padOut;
  o.steer = 0; o.accel = 0; o.brake = 0; o.drift = false; o.item = false; o.look = false; o.left = false; o.right = false; o.edges = 0;
  const p = padState();
  const presses = consumePadPresses(), flicks = consumeStickFlicks();
  if (!p.connected) return o;
  const map = save.get().settings.pad ?? {};
  const btn = (a: string): boolean => (map[a] ?? []).some((b) => p.buttons[b]);
  const pressed = (a: string): boolean => (map[a] ?? []).some((b) => (presses & (1 << b)) !== 0);
  o.steer = p.steer;
  // triggers are analog when bound to their default buttons, digital otherwise
  o.accel = (map['accel'] ?? []).includes(7) ? Math.max(p.throttle, btn('accel') ? 1 : 0) : btn('accel') ? 1 : 0;
  o.brake = (map['brake'] ?? []).includes(6) ? Math.max(p.brake, btn('brake') ? 1 : 0) : btn('brake') ? 1 : 0;
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
