// Menu navigation for keyboard and gamepad (31-ui-spec §8): arrows / D-pad / stick move focus spatially,
// Enter / A activates, Esc / B goes back one level, LB / RB (PageUp / PageDown on keyboards) switch tabs.
// Screens register back handlers and tab handlers through a stack so overlays win over the screen below.
import { gameKeysActive, isCapturing, inputDevice } from './keyboard.ts';
import { onPadButton, onPadStick } from './gamepad.ts';

type Dir = 'up' | 'down' | 'left' | 'right';
const backStack: (() => void)[] = [];
const tabStack: ((delta: -1 | 1) => void)[] = [];

/** Registers a back handler (topmost wins). Returns the unregister function. */
export function pushBack(fn: () => void): () => void { backStack.push(fn); return () => { const i = backStack.lastIndexOf(fn); if (i >= 0) backStack.splice(i, 1); }; }
/** Registers a tab-cycling handler for LB/RB and PageUp/PageDown. */
export function pushTabs(fn: (delta: -1 | 1) => void): () => void { tabStack.push(fn); return () => { const i = tabStack.lastIndexOf(fn); if (i >= 0) tabStack.splice(i, 1); }; }
export function goBack(): boolean { const f = backStack[backStack.length - 1]; if (!f) return false; f(); return true; }

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function scopeRoot(): HTMLElement {
  const scopes = document.querySelectorAll<HTMLElement>('[data-focus-scope]');
  return scopes.length ? scopes[scopes.length - 1]! : (document.getElementById('app') ?? document.body);
}

function visible(el: HTMLElement): boolean {
  if (el.closest('[inert],[aria-hidden="true"]')) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.pointerEvents !== 'none';
}

export function focusables(root: HTMLElement = scopeRoot()): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible);
}

/** Focuses the preferred element of the current scope ([data-autofocus] first). */
export function focusFirst(): void {
  const root = scopeRoot();
  const pref = root.querySelector<HTMLElement>('[data-autofocus]');
  const el = pref && visible(pref) ? pref : focusables(root)[0];
  el?.focus({ preventScroll: false });
}

/** Moves focus to the nearest focusable element in `dir` (spatial navigation). */
export function moveFocus(dir: Dir): void {
  const root = scopeRoot();
  const cur = document.activeElement as HTMLElement | null;
  if (!cur || cur === document.body || !root.contains(cur) || !visible(cur)) { focusFirst(); return; }
  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best: HTMLElement | null = null, bestScore = Infinity;
  for (const el of focusables(root)) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2, by = b.top + b.height / 2;
    let main: number, cross: number;
    // edge-to-edge distance along the move axis keeps rows and columns stable
    if (dir === 'down') { main = b.top - a.bottom; cross = Math.abs(bx - ax); if (by <= ay + 1) continue; }
    else if (dir === 'up') { main = a.top - b.bottom; cross = Math.abs(bx - ax); if (by >= ay - 1) continue; }
    else if (dir === 'right') { main = b.left - a.right; cross = Math.abs(by - ay); if (bx <= ax + 1) continue; }
    else { main = a.left - b.right; cross = Math.abs(by - ay); if (bx >= ax - 1) continue; }
    const score = Math.max(0, main) + cross * 2.2 + (main < -4 ? 400 : 0);
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) { best.focus({ preventScroll: false }); best.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }
}

function isTextField(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag !== 'INPUT') return (el as HTMLElement).isContentEditable;
  const type = (el as HTMLInputElement).type;
  return type !== 'range' && type !== 'checkbox' && type !== 'radio' && type !== 'button';
}

function onKey(e: KeyboardEvent): void {
  // The capture-phase race handler can open pause before this event bubbles here.
  // Its consumed Escape must not also close the newly mounted pause menu.
  if (gameKeysActive() || isCapturing() || e.defaultPrevented) return;
  const act = document.activeElement;
  const text = isTextField(act);
  if (e.key === 'Escape') {
    if (e.repeat) return;
    if (text) { (act as HTMLElement).blur(); e.preventDefault(); return; }
    if (goBack()) e.preventDefault();
    return;
  }
  if (text) return;
  const range = act instanceof HTMLInputElement && act.type === 'range';
  const select = act instanceof HTMLSelectElement;
  const map: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  const dir = map[e.key];
  if (dir) {
    if ((range && (dir === 'left' || dir === 'right')) || (select && (dir === 'up' || dir === 'down'))) return; // native adjust
    const own = (act as HTMLElement | null)?.closest?.('[data-arrows="own"]');
    if (own) return;
    e.preventDefault();
    moveFocus(dir);
    return;
  }
  if (e.key === 'PageUp' || e.key === 'PageDown') {
    const f = tabStack[tabStack.length - 1];
    if (f) { e.preventDefault(); f(e.key === 'PageUp' ? -1 : 1); }
  }
}

let installed = false;
export function installMenuNav(): void {
  if (installed) return;
  installed = true;
  window.addEventListener('keydown', onKey);
  onPadButton((b) => {
    if (gameKeysActive() || isCapturing()) return;
    inputDevice.value = 'pad';
    const act = document.activeElement as HTMLElement | null;
    switch (b) {
      case 0: // A
        if (act && act !== document.body) {
          if (act instanceof HTMLInputElement && act.type === 'checkbox') act.click();
          else act.click();
        } else focusFirst();
        break;
      case 1: goBack(); break; // B
      case 4: tabStack[tabStack.length - 1]?.(-1); break; // LB
      case 5: tabStack[tabStack.length - 1]?.(1); break; // RB
      case 12: moveFocus('up'); break;
      case 13: moveFocus('down'); break;
      case 14: adjustOrMove(act, 'left'); break;
      case 15: adjustOrMove(act, 'right'); break;
      default: break;
    }
  });
  onPadStick((d) => { if (!gameKeysActive() && !isCapturing()) adjustOrMove(document.activeElement as HTMLElement | null, d); });
}

function adjustOrMove(act: HTMLElement | null, d: Dir): void {
  if (act instanceof HTMLInputElement && act.type === 'range' && (d === 'left' || d === 'right')) {
    if (d === 'left') act.stepDown(); else act.stepUp();
    act.dispatchEvent(new Event('input', { bubbles: true }));
    act.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  moveFocus(d);
}
