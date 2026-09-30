// Baked tracks for server rooms: the same .ctrk bytes the clients load (hash-checked at `loaded`).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { TRACK_IDS, type TrackId } from '@cr/content';
import { loadCtrk, toArrayBuffer, type BakedTrack } from '@cr/sim';

export class TrackStore {
  private readonly dirs: string[];
  private readonly cache = new Map<TrackId, BakedTrack>();

  constructor(dirs: string[]) { this.dirs = dirs.filter((d) => existsSync(d)); }

  private file(id: string): string | null {
    for (const d of this.dirs) { const f = join(d, `${id}.ctrk`); if (existsSync(f)) return f; }
    return null;
  }

  /** Track ids that have a baked .ctrk available. */
  list(): TrackId[] {
    const found = new Set<string>();
    for (const d of this.dirs) for (const f of readdirSync(d)) if (f.endsWith('.ctrk')) found.add(f.slice(0, -5));
    return TRACK_IDS.filter((id) => found.has(id));
  }

  has(id: string): id is TrackId { return (TRACK_IDS as readonly string[]).includes(id) && this.file(id) !== null; }

  get(id: TrackId): BakedTrack {
    const hit = this.cache.get(id);
    if (hit) return hit;
    const f = this.file(id);
    if (!f) throw new Error(`track ${id} not baked (looked in ${this.dirs.join(', ')})`);
    const t = loadCtrk(toArrayBuffer(readFileSync(f)));
    this.cache.set(id, t);
    return t;
  }
}
