// Codex art overrides (ADR-013, 60-codex-pipeline §4). `/art/overrides/index.json` lists the drop-in images so the
// client fetches only slots that exist; it is always served (an empty folder gives {}), because a 404 would log a
// console error on every boot. Images are read live from the source folder, so a dropped file shows on reload
// without a rebuild. The Vite dev server uses buildArtIndex() too (apps/client/vite.config.ts).
import { createReadStream, readdirSync, statSync } from 'node:fs';
import { pipeline } from 'node:stream';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface ArtIndexEntry { file: string; mtime: number }
export type ArtIndex = Record<string, ArtIndexEntry>;

/** `<slotId>.<ext>`; slot ids are dotted lowercase names such as `portrait.clay`. */
const IMAGE = /^([a-z0-9][a-z0-9_.-]*)\.(webp|avif|png|jpe?g)$/i;
/** When a slot has several files, the first format here wins (the README asks for WebP, PNG for exact alpha). */
const PREFERENCE = ['webp', 'avif', 'png', 'jpg', 'jpeg'];
const TYPES: Record<string, string> = { webp: 'image/webp', avif: 'image/avif', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

function rank(file: string): number { return PREFERENCE.indexOf(file.slice(file.lastIndexOf('.') + 1).toLowerCase()); }

/** Index of every override image in `dirs`; an earlier directory wins for the same slot. Missing folders are skipped. */
export function buildArtIndex(dirs: readonly string[]): ArtIndex {
  const out: ArtIndex = {};
  const seen = new Set<string>();
  for (const dir of dirs) {
    let names: string[];
    try { names = readdirSync(dir); } catch { continue; }
    const here: ArtIndex = {};
    for (const name of names) {
      const m = IMAGE.exec(name);
      if (!m || seen.has(m[1]!)) continue;
      const prev = here[m[1]!];
      if (prev && rank(prev.file) <= rank(name)) continue;
      let st;
      try { st = statSync(join(dir, name)); } catch { continue; }
      if (!st.isFile()) continue;
      here[m[1]!] = { file: name, mtime: Math.floor(st.mtimeMs) };
    }
    for (const [id, e] of Object.entries(here)) { out[id] = e; seen.add(id); }
  }
  return out;
}

/** Handles `/art/overrides/index.json` and `/art/overrides/<file>` from `dirs`; returns false for any other path. */
export function createArtRoute(dirs: readonly string[]): (req: IncomingMessage, res: ServerResponse) => boolean {
  return (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    const path = (req.url ?? '/').split('?')[0]!;
    if (!path.startsWith('/art/overrides/')) return false;
    const name = path.slice('/art/overrides/'.length);
    if (name === 'index.json') {
      const body = JSON.stringify(buildArtIndex(dirs));
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : body);
      return true;
    }
    // only plain image names, never a path: the regex has no slash or backslash
    const m = IMAGE.exec(name);
    if (!m) return false;
    for (const dir of dirs) {
      const file = join(dir, name);
      try { if (!statSync(file).isFile()) continue; } catch { continue; }
      res.writeHead(200, { 'content-type': TYPES[m[2]!.toLowerCase()]!, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
      if (req.method === 'HEAD') res.end();
      else pipeline(createReadStream(file), res, (e) => { if (e) res.destroy(); }); // a read error ends the response, not the process
      return true;
    }
    return false;
  };
}
