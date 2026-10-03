import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Edge, SIM_VERSION, makeInput, packInput, type RaceConfig } from '@cr/sim';
import { ghostKey, loadGhost, type GhostData } from '../src/meta/ghost.ts';

const profile = vi.hoisted(() => ({ records: { proving_ring: { ghostKey: 'ghost:proving_ring' } } }));
vi.mock('../src/meta/save.ts', () => ({ save: { update: (fn: (value: typeof profile) => void) => fn(profile) } }));

// Only IndexedDB transport is replaced: the production loader decides compatibility, deletes stale data and
// clears its saved record. Requests complete asynchronously as they do in the browser.
const records = new Map<string, GhostData>();
function request<T>(result: T, done?: () => void): IDBRequest<T> {
  const req = { result } as IDBRequest<T>;
  queueMicrotask(() => { req.onsuccess?.call(req, new Event('success')); done?.(); });
  return req;
}

beforeEach(() => {
  records.clear(); profile.records.proving_ring = { ghostKey: ghostKey('proving_ring') };
  const db = {
    close: () => {}, objectStoreNames: { contains: () => true },
    transaction: () => {
      const transaction = { oncomplete: null as null | (() => void), objectStore: () => store };
      const done = (): void => { transaction.oncomplete?.(); };
      const store = {
        get: (key: string) => request(structuredClone(records.get(key)), done),
        delete: (key: string) => { records.delete(key); return request(undefined, done); },
      };
      return transaction;
    },
  };
  vi.stubGlobal('indexedDB', { open: () => request(db) });
});
afterEach(() => vi.unstubAllGlobals());

function ghost(version: number): GhostData {
  const config: RaceConfig = {
    simVersion: version, mode: 'timeAttack', teams: 'solo', trackId: 'proving_ring', trackHash: 'track-v1', laps: 1, seed: 7,
    slots: [{ kind: 'human', team: 0, name: 'driver', characterId: 'clay', kartBodyId: 'pebble', vMul: 1 }],
    rules: { retireTicks: 600, friendlyFire: 'off', itemSet: 'standard', rubberBand: false, instantBoostInItem: true },
    introTicks: 0, countdownTicks: 0,
  };
  return { v: 1, trackId: config.trackId, simVersion: version, trackHash: config.trackHash, config,
    inputs: [packInput({ ...makeInput(), edges: Edge.DRIFT }), 1], raceTicks: 1, savedAt: 0,
  };
}

describe('ghost compatibility before playback', () => {
  it('rejects and removes a previous-physics packed input log before its changed layout can be decoded', async () => {
    const key = ghostKey('proving_ring');
    records.set(key, ghost(SIM_VERSION - 1));
    expect(await loadGhost('proving_ring', SIM_VERSION, 'track-v1')).toBe('outdated');
    expect(records.has(key)).toBe(false);
    expect(profile.records.proving_ring.ghostKey).toBeUndefined();
    expect(await loadGhost('proving_ring', SIM_VERSION, 'track-v1')).toBeNull();
  });

  it('loads the current version and preserves its latched Drift input', async () => {
    const current = ghost(SIM_VERSION);
    records.set(ghostKey('proving_ring'), current);
    expect(await loadGhost('proving_ring', SIM_VERSION, 'track-v1')).toEqual(current);
    expect(records.has(ghostKey('proving_ring'))).toBe(true);
  });

  it('also rejects a current-physics ghost from a different track bake', async () => {
    records.set(ghostKey('proving_ring'), ghost(SIM_VERSION));
    expect(await loadGhost('proving_ring', SIM_VERSION, 'track-v2')).toBe('outdated');
    expect(records.size).toBe(0);
  });
});
