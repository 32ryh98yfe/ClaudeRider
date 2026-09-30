// Item VFX registry (import.meta.glob, one file per item in ./defs). Keys come from the item's
// presentation.vfxKey when L2's ItemDef exists, else `item.<ITEM_IDS name>`. Unknown keys get a visible
// placeholder (magenta orb) and a dev warning — never a crash.
import * as THREE from 'three/webgpu';
import { ITEM_IDS, type ContentTables } from '@cr/content';
import type { ItemVfxDef } from './api.ts';
import { makeProxy, orient } from './proxy.ts';
import { paint, sph } from '../../util/geo.ts';

const mods = import.meta.glob<{ default: ItemVfxDef }>('./defs/*.ts', { eager: true });
const byKey = new Map<string, ItemVfxDef>();
for (const m of Object.values(mods)) byKey.set(m.default.key, m.default);

let placeholderGeo: THREE.BufferGeometry | null = null;
const placeholder = (key: string): ItemVfxDef => ({
  key,
  projectile() {
    placeholderGeo ??= paint(sph(0.4, 10, 8), '#ff00ff');
    const p = makeProxy({ lit: null, glow: placeholderGeo }, key);
    return { root: p.root, update(v) { orient(p.root, v as never); } };
  },
  hazard() {
    placeholderGeo ??= paint(sph(0.4, 10, 8), '#ff00ff');
    const p = makeProxy({ lit: null, glow: placeholderGeo }, key);
    return { root: p.root, update(v) { p.root.position.set((v as { x: number }).x, (v as { y: number }).y + 0.5, (v as { z: number }).z); } };
  },
});

const warned = new Set<string>();
const resolved = new Map<number, ItemVfxDef>();

/** vfxKey for an item wire code. */
export function vfxKeyOf(code: number, content: ContentTables | null): string {
  const def = content?.items.byCode[code];
  return def?.presentation.vfxKey ?? `item.${ITEM_IDS[code - 1] ?? `unknown_${code}`}`;
}

export function itemVfx(code: number, content: ContentTables | null): ItemVfxDef {
  let d = resolved.get(code);
  if (d) return d;
  const key = vfxKeyOf(code, content);
  d = byKey.get(key);
  if (!d) {
    if (import.meta.env.DEV && !warned.has(key)) { warned.add(key); console.warn(`[vfx] no item VFX for ${key}; using placeholder`); }
    d = placeholder(key);
  }
  resolved.set(code, d);
  return d;
}

export function itemVfxKeys(): string[] { return [...byKey.keys()].sort(); }
