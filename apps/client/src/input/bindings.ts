// Action catalogue for rebinding (31-ui-spec §7), key/button labels and conflict detection. Pure data + functions.
import { DEFAULT_KEYS, DEFAULT_KEYS_EXTRA, DEFAULT_PAD } from '../meta/save.ts';

export type ActionGroup = 'drive' | 'race' | 'system';
export interface ActionDef { id: string; group: ActionGroup; /** can be bound on a gamepad */ pad: boolean }

/** Every rebindable action, in the order the Controls tab lists them. Labels: `settings.action.<id>`. */
export const ACTIONS: readonly ActionDef[] = [
  { id: 'accel', group: 'drive', pad: true }, { id: 'brake', group: 'drive', pad: true },
  { id: 'left', group: 'drive', pad: true }, { id: 'right', group: 'drive', pad: true },
  { id: 'drift', group: 'drive', pad: true }, { id: 'item', group: 'drive', pad: true },
  { id: 'swap', group: 'drive', pad: true }, { id: 'reset', group: 'drive', pad: true }, { id: 'look', group: 'drive', pad: true },
  { id: 'pause', group: 'race', pad: true }, { id: 'standings', group: 'race', pad: true }, { id: 'restart', group: 'race', pad: false },
  { id: 'emote1', group: 'race', pad: true }, { id: 'emote2', group: 'race', pad: false }, { id: 'emote3', group: 'race', pad: false }, { id: 'emote4', group: 'race', pad: false },
  { id: 'music', group: 'system', pad: false }, { id: 'sfx', group: 'system', pad: false }, { id: 'fullscreen', group: 'system', pad: false },
];

/** Maximum keyboard bindings per action (primary + alternates). */
export const MAX_KEYS = 3;

/** Keys that can never be rebound (browser/OS reserved or needed for menus). */
export const RESERVED = new Set(['MetaLeft', 'MetaRight', 'ContextMenu', 'PrintScreen', 'OSLeft', 'OSRight']);

export function defaultKeys(): Record<string, string[]> { return structuredClone({ ...DEFAULT_KEYS, ...DEFAULT_KEYS_EXTRA }); }
export function defaultPad(): Record<string, number[]> { return structuredClone(DEFAULT_PAD); }

/** Layout presets (Settings → Controls): arrows first, or WASD first (anti-ghosting: WASD + C / Space / E). */
export function presetKeys(preset: 'arrows' | 'wasd'): Record<string, string[]> {
  const k = defaultKeys();
  if (preset === 'wasd') {
    k['accel'] = ['KeyW', 'ArrowUp']; k['brake'] = ['KeyS', 'ArrowDown']; k['left'] = ['KeyA', 'ArrowLeft']; k['right'] = ['KeyD', 'ArrowRight'];
    k['drift'] = ['KeyC', 'ShiftLeft', 'ShiftRight']; k['item'] = ['Space', 'ControlLeft', 'ControlRight']; k['swap'] = ['KeyE', 'AltLeft'];
  }
  return k;
}

/** The action (other than `self`) that already uses `code`, or null. */
export function findConflict(keys: Readonly<Record<string, readonly string[]>>, self: string, code: string): string | null {
  for (const a of ACTIONS) if (a.id !== self && (keys[a.id] ?? []).includes(code)) return a.id;
  for (const [a, codes] of Object.entries(keys)) if (a !== self && codes.includes(code)) return a;
  return null;
}

/**
 * Binds `code` to `action` at binding index `index` (append when index ≥ length). When another action uses the code
 * it is removed there ("move"). Returns a new map; the input is not mutated.
 */
export function bindKey(keys: Readonly<Record<string, readonly string[]>>, action: string, index: number, code: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [a, c] of Object.entries(keys)) out[a] = c.filter((x) => a === action || x !== code);
  const cur = (out[action] ?? []).filter((x) => x !== code);
  if (index < cur.length) cur.splice(index, 1, code); else cur.push(code);
  out[action] = cur.slice(0, MAX_KEYS);
  return out;
}

export function unbindKey(keys: Readonly<Record<string, readonly string[]>>, action: string, index: number): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [a, c] of Object.entries(keys)) out[a] = [...c];
  out[action] = (out[action] ?? []).filter((_, i) => i !== index);
  return out;
}

/** Actions with no binding at all (warned in the Controls tab). */
export function unbound(keys: Readonly<Record<string, readonly string[]>>): string[] {
  return ACTIONS.filter((a) => a.group === 'drive' && !(keys[a.id]?.length)).map((a) => a.id);
}

export function findPadConflict(pad: Readonly<Record<string, readonly number[]>>, self: string, button: number): string | null {
  for (const [a, b] of Object.entries(pad)) if (a !== self && b.includes(button)) return a;
  return null;
}
export function bindPad(pad: Readonly<Record<string, readonly number[]>>, action: string, index: number, button: number): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const [a, b] of Object.entries(pad)) out[a] = b.filter((x) => a === action || x !== button);
  const cur = (out[action] ?? []).filter((x) => x !== button);
  if (index < cur.length) cur.splice(index, 1, button); else cur.push(button);
  out[action] = cur.slice(0, 2);
  return out;
}

// ------------------------------------------------------------------ labels
const SYMBOL: Record<string, string> = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', Backspace: 'Backspace', Enter: 'Enter', Tab: 'Tab',
  ShiftLeft: 'L Shift', ShiftRight: 'R Shift', ControlLeft: 'L Ctrl', ControlRight: 'R Ctrl', AltLeft: 'L Alt', AltRight: 'R Alt',
  CapsLock: 'Caps', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'",
  Comma: ',', Period: '.', Slash: '/', Backquote: '`', Insert: 'Ins', Delete: 'Del', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
  NumpadEnter: 'Num Enter', NumpadAdd: 'Num +', NumpadSubtract: 'Num -', NumpadMultiply: 'Num *', NumpadDivide: 'Num /', NumpadDecimal: 'Num .',
  Lang1: '한/영', Lang2: '한자', IntlBackslash: '\\', IntlRo: 'Ro', IntlYen: '¥',
};
/** Short keycap label for a KeyboardEvent.code. `space` is passed in so it can be localised. */
export function keyLabel(code: string, space = 'Space'): string {
  if (code === 'Space') return space;
  if (SYMBOL[code]) return SYMBOL[code]!;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

export const PAD_LABELS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'LS', 'RS', 'D↑', 'D↓', 'D←', 'D→', 'Home'] as const;
export function padLabel(b: number): string { return PAD_LABELS[b] ?? `B${b}`; }
