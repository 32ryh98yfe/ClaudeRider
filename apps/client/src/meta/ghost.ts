// Time Attack ghost storage (13-modes-rules §4): the PB race as a packed input log in IndexedDB `cr-ghosts`,
// key `ghost:<trackId>`. Recording/replay itself lives in the sim + session (L1); this module only persists and validates.
import type { RaceConfig } from '@cr/sim';
import type { TrackId } from '@cr/content';
import { save } from './save.ts';

export interface GhostData { v: 1; trackId: TrackId; simVersion: number; trackHash: string; config: RaceConfig; inputs: number[]; raceTicks: number; savedAt: number }

const DB = 'cr-ghosts', STORE = 'ghosts';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') { rej(new Error('no indexedDB')); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error ?? new Error('idb open failed'));
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((res, rej) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error ?? new Error('idb request failed'));
    t.oncomplete = () => db.close();
  });
}

export const ghostKey = (trackId: TrackId): string => `ghost:${trackId}`;

export async function saveGhost(g: GhostData): Promise<void> {
  await tx('readwrite', (s) => s.put(g, ghostKey(g.trackId)));
  save.update((d) => { (d.records[g.trackId] ??= {}).ghostKey = ghostKey(g.trackId); });
}

/** Loads the ghost for a track; drops it (and returns 'outdated') when the sim version or track hash changed. */
export async function loadGhost(trackId: TrackId, simVersion: number, trackHash: string): Promise<GhostData | 'outdated' | null> {
  let g: GhostData | undefined;
  try { g = await tx<GhostData | undefined>('readonly', (s) => s.get(ghostKey(trackId)) as IDBRequest<GhostData | undefined>); } catch { return null; }
  if (!g) return null;
  if (g.simVersion !== simVersion || g.trackHash !== trackHash) { await deleteGhost(trackId); return 'outdated'; }
  return g;
}

export async function deleteGhost(trackId: TrackId): Promise<void> {
  try { await tx('readwrite', (s) => s.delete(ghostKey(trackId))); } catch { /* ignore */ }
  save.update((d) => { const r = d.records[trackId]; if (r) delete r.ghostKey; });
}
