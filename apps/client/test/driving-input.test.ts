import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Edge, Held } from '@cr/sim';
import { defaultKeys, defaultPad } from '../src/input/bindings.ts';

const source = vi.hoisted(() => ({
  settings: { keys: {} as Record<string, string[]>, pad: {} as Record<string, number[]>, autoBoost: true },
  pad: { connected: false, id: 'test', steer: 0, throttle: 0, brake: 0, buttons: [] as boolean[], axes: [] as number[] },
  presses: 0,
  flicks: 0,
}));

vi.mock('../src/meta/save.ts', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/meta/save.ts')>(),
  save: { get: () => ({ settings: source.settings }) },
}));
vi.mock('../src/input/gamepad.ts', () => ({
  installGamepad: () => {},
  onPadButton: () => () => {},
  padState: () => source.pad,
  consumePadPresses: () => { const value = source.presses; source.presses = 0; return value; },
  consumeStickFlicks: () => { const value = source.flicks; source.flicks = 0; return value; },
  releasePad: () => { source.presses = 0; source.flicks = 0; },
}));

import { heldUi, installKeyboard, sampleInput, setGameKeysActive } from '../src/input/keyboard.ts';

const windowEvents = new EventTarget();
const documentEvents = Object.assign(new EventTarget(), { hidden: false, activeElement: null as null | { tagName: string; type: string } });
let time = 0;

function key(type: 'keydown' | 'keyup', code: string, at = time): void {
  time = at;
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { code, repeat: false, isComposing: false });
  windowEvents.dispatchEvent(event);
}

function sample(at: number): ReturnType<typeof sampleInput> {
  time = at;
  return { ...sampleInput(at) };
}

beforeAll(() => {
  vi.stubGlobal('window', windowEvents);
  vi.stubGlobal('document', documentEvents);
  vi.spyOn(performance, 'now').mockImplementation(() => time);
  installKeyboard();
});
afterAll(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
beforeEach(() => {
  time = 0;
  source.settings.keys = defaultKeys();
  source.settings.pad = defaultPad();
  Object.assign(source.pad, { connected: false, steer: 0, throttle: 0, brake: 0, buttons: [] });
  documentEvents.hidden = false;
  documentEvents.activeElement = null;
  windowEvents.dispatchEvent(new Event('focus'));
  windowEvents.dispatchEvent(new Event('compositionend'));
  setGameKeysActive(true);
});

type KeyChange = readonly [at: number, type: 'keydown' | 'keyup', code: string];
function steeringAt(hz: number, changes: readonly KeyChange[], end: number): number {
  time = 0;
  setGameKeysActive(true);
  let change = 0;
  for (let frame = 1; frame * 1000 / hz < end; frame++) {
    const at = frame * 1000 / hz;
    while (change < changes.length && changes[change]![0] <= at) {
      const [when, type, code] = changes[change++]!;
      key(type, code, when);
    }
    sample(at);
  }
  while (change < changes.length && changes[change]![0] <= end) {
    const [when, type, code] = changes[change++]!;
    key(type, code, when);
  }
  return sample(end).steer;
}

describe('driving input timing', () => {
  it('preserves the initial calibrated 60 Hz keyboard response', () => {
    key('keydown', 'ArrowRight');
    expect(sample(1000 / 60).steer).toBe(76);
    expect(sample(2000 / 60).steer).toBe(107);
    expect(sample(3000 / 60).steer).toBe(119);
  });

  it.each([12, 25, 50, 75, 95])('reaches identical held-steer values at %i ms across 30/60/120/144 Hz', (end) => {
    const values = [30, 60, 120, 144].map((hz) => steeringAt(hz, [[0, 'keydown', 'ArrowRight']], end));
    expect(new Set(values).size).toBe(1);
  });

  it.each([55, 80, 105, 130, 165])('keeps short counter-steer and release timing equal at %i ms across refresh rates', (end) => {
    const changes: KeyChange[] = [
      [0, 'keydown', 'ArrowRight'],
      [47, 'keyup', 'ArrowRight'], [47, 'keydown', 'ArrowLeft'],
      [74, 'keyup', 'ArrowLeft'],
      [111, 'keydown', 'ArrowRight'], [119, 'keyup', 'ArrowRight'],
    ];
    const values = [30, 60, 120, 144].map((hz) => steeringAt(hz, changes, end));
    expect(new Set(values).size).toBe(1);
  });

  it('does not advance the filter when render and fallback pump sample the same timestamp', () => {
    key('keydown', 'ArrowRight');
    const first = sample(1000 / 60).steer;
    expect(sample(1000 / 60).steer).toBe(first);
    expect(sample(1000 / 60 - 1).steer).toBe(first);
    expect(sample(2000 / 60).steer).toBe(107);
  });

  it('retains keyboard and pad edges through between-frame steering updates and consumes them once', () => {
    source.pad.connected = true;
    source.presses = 1 << 0;
    source.flicks = 1;
    key('keydown', 'ArrowRight', 2);
    key('keyup', 'ArrowRight', 5);
    key('keydown', 'KeyE', 7);
    key('keyup', 'KeyE', 9);
    expect(sample(16).edges).toBe(Edge.TAP_R | Edge.TAP_L | Edge.USE_ITEM | Edge.SWAP);
    expect(sample(17).edges).toBe(0);
  });
});

describe('driving input suspension', () => {
  it.each(['deactivate', 'blur', 'composition', 'hidden', 'text'])('neutralizes held controls, edges and filter on %s', (reason) => {
    key('keydown', 'ArrowRight');
    key('keydown', 'ArrowUp');
    key('keydown', 'ShiftLeft');
    key('keydown', 'KeyX');
    expect(sample(50).held & Held.DRIFT).toBe(Held.DRIFT);
    source.pad.connected = true;
    Object.assign(source.pad, { steer: 1, throttle: 0.7, brake: 0.4, buttons: [true] });
    source.presses = 1;
    key('keydown', 'Digit1');
    if (reason === 'deactivate') setGameKeysActive(false);
    if (reason === 'blur') windowEvents.dispatchEvent(new Event('blur'));
    if (reason === 'composition') windowEvents.dispatchEvent(new Event('compositionstart'));
    if (reason === 'hidden') documentEvents.hidden = true;
    if (reason === 'text') documentEvents.activeElement = { tagName: 'INPUT', type: 'text' };
    expect(sample(60)).toEqual({ steer: 0, throttle: 0, brake: 0, held: 0, edges: 0, aim: 255, emote: 0 });
    expect(heldUi.value).toEqual({ look: false, standings: false });
    source.pad.connected = false;
    documentEvents.hidden = false;
    documentEvents.activeElement = null;
    windowEvents.dispatchEvent(new Event('compositionend'));
    windowEvents.dispatchEvent(new Event('focus'));
    setGameKeysActive(true);
    expect(sample(80)).toEqual({ steer: 0, throttle: 0, brake: 0, held: 0, edges: 0, aim: 255, emote: 0 });
  });
});

describe('analog and digital pedals', () => {
  it.each([0.2, 0.49, 0.51, 0.7, 1])('keeps %s trigger pressure proportional even when the browser reports pressed', (pressure) => {
    source.pad.connected = true;
    source.pad.throttle = pressure;
    source.pad.brake = pressure;
    source.pad.buttons[7] = true;
    source.pad.buttons[6] = true;
    const input = sample(16);
    expect(input.throttle).toBe(Math.round(pressure * 15));
    expect(input.brake).toBe(Math.round(pressure * 15));
  });

  it('retains full digital alternate bindings and honors removed analog bindings', () => {
    source.pad.connected = true;
    source.pad.throttle = 0.35;
    source.pad.brake = 0.4;
    source.settings.pad['accel'] = [7, 0];
    source.settings.pad['brake'] = [6, 1];
    source.pad.buttons[0] = true;
    source.pad.buttons[1] = true;
    expect(sample(16)).toMatchObject({ throttle: 15, brake: 15 });
    source.pad.buttons[0] = false;
    source.pad.buttons[1] = false;
    expect(sample(32)).toMatchObject({ throttle: 5, brake: 6 });
    source.settings.pad['accel'] = [0];
    source.settings.pad['brake'] = [1];
    expect(sample(48)).toMatchObject({ throttle: 0, brake: 0 });
  });

  it('keeps a keyboard pedal fully pressed alongside a partially held trigger', () => {
    source.pad.connected = true;
    source.pad.throttle = 0.35;
    source.pad.brake = 0.4;
    key('keydown', 'ArrowUp');
    key('keydown', 'ArrowDown');
    expect(sample(16)).toMatchObject({ throttle: 15, brake: 15 });
  });
});
