// Rebinding rules (31-ui-spec §7.1): conflict detection, moving a key, caps, presets, pad bindings, labels.
import { describe, expect, it } from 'vitest';
import { ACTIONS, bindKey, bindPad, defaultKeys, findConflict, findPadConflict, keyLabel, padLabel, presetKeys, unbindKey, unbound, MAX_KEYS } from '../src/input/bindings.ts';
import { allKeys } from '../src/i18n/index.ts';

describe('key bindings', () => {
  it('every action has a label in both locales and a default binding', () => {
    const ko = new Set(allKeys('ko')), en = new Set(allKeys('en'));
    const d = defaultKeys();
    for (const a of ACTIONS) {
      expect(ko.has(`settings.action.${a.id}`), a.id).toBe(true);
      expect(en.has(`settings.action.${a.id}`), a.id).toBe(true);
      expect(d[a.id]?.length, a.id).toBeGreaterThan(0);
    }
  });
  it('defaults include the browser-pitfall alternates Space / E / C', () => {
    const d = defaultKeys();
    expect(d['item']).toContain('Space');
    expect(d['swap']).toContain('KeyE');
    expect(d['drift']).toContain('KeyC');
  });
  it('detects conflicts with other actions only', () => {
    const d = defaultKeys();
    expect(findConflict(d, 'drift', 'Space')).toBe('item');
    expect(findConflict(d, 'item', 'Space')).toBeNull();
    expect(findConflict(d, 'item', 'KeyQ')).toBeNull();
  });
  it('binding a used key moves it; replacing and appending respect the cap', () => {
    const d = defaultKeys();
    const moved = bindKey(d, 'drift', 0, 'Space');
    expect(moved['drift']![0]).toBe('Space');
    expect(moved['item']).not.toContain('Space');
    expect(d['item']).toContain('Space'); // input untouched
    const appended = bindKey(bindKey(d, 'reset', 5, 'KeyT'), 'reset', 5, 'KeyY');
    expect(appended['reset']).toEqual(['KeyR', 'KeyT', 'KeyY']);
    expect(bindKey(appended, 'reset', 9, 'KeyU')['reset']).toHaveLength(MAX_KEYS);
    expect(unbindKey(appended, 'reset', 1)['reset']).toEqual(['KeyR', 'KeyY']);
  });
  it('rebinding the same key twice does not duplicate it', () => {
    const d = bindKey(defaultKeys(), 'accel', 1, 'ArrowUp');
    expect(d['accel']!.filter((c) => c === 'ArrowUp')).toHaveLength(1);
  });
  it('WASD preset puts WASD + C / Space / E first', () => {
    const w = presetKeys('wasd');
    expect(w['accel']![0]).toBe('KeyW');
    expect(w['drift']![0]).toBe('KeyC');
    expect(w['item']![0]).toBe('Space');
    expect(w['swap']![0]).toBe('KeyE');
  });
  it('reports unbound driving actions', () => {
    expect(unbound(defaultKeys())).toEqual([]);
    expect(unbound({ ...defaultKeys(), drift: [] })).toEqual(['drift']);
  });
  it('pad bindings move buttons and cap at 2', () => {
    const p = { item: [0], swap: [1] };
    expect(findPadConflict(p, 'item', 1)).toBe('swap');
    const q = bindPad(p, 'item', 1, 1);
    expect(q['item']).toEqual([0, 1]);
    expect(q['swap']).toEqual([]);
    expect(bindPad(q, 'item', 3, 2)['item']).toHaveLength(2);
  });
  it('labels keys by code, layout-independent', () => {
    expect(keyLabel('KeyA')).toBe('A');
    expect(keyLabel('Digit3')).toBe('3');
    expect(keyLabel('ArrowLeft')).toBe('←');
    expect(keyLabel('ShiftLeft')).toBe('L Shift');
    expect(keyLabel('Space', '스페이스')).toBe('스페이스');
    expect(padLabel(0)).toBe('A');
    expect(padLabel(7)).toBe('RT');
  });
});
