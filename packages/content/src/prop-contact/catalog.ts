// Offline-generated model contacts: no renderer, DOM or compiler dependency enters the simulation.
import raw from './catalog.generated.json' with { type: 'json' };

export interface PropContact {
  policy: 'solid' | 'cosmetic';
  triangles: number[];
  supportTriangles: number[];
  bounds: number[];
  fingerprint: string;
  reason: string;
  groundSurface: boolean;
  cosmeticTriangles: number;
  proxyToleranceM: number;
}
interface StoredGeometry { vertices: string; indices: string; supportIndices: string; bounds: number[] }
interface StoredEntry { policy: PropContact['policy']; geometry: string; fingerprint: string; reason: string; groundSurface: boolean; cosmeticTriangles: number; proxyToleranceM: number }
interface Manifest { version: number; entries: Record<string, StoredEntry>; geometries: Record<string, StoredGeometry> }
const DATA = raw as unknown as Manifest;
const CACHE = new Map<string, PropContact>();
const GEOMETRY = new Map<string, { triangles: number[]; supportTriangles: number[] }>();
export const PROP_CONTACT_VERSION = DATA.version;

/** Delta/ZigZag varints in base64 keep generated data small without a platform-specific decoder. */
function decode(encoded: string): number[] {
  const out: number[] = []; let bits = 0, bitCount = 0, value = 0, factor = 1, previous = 0;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < encoded.length && encoded[i] !== '='; i++) {
    const digit = alphabet.indexOf(encoded[i]!);
    if (digit < 0) throw new Error('Invalid prop contact encoding');
    bits = (bits << 6) | digit; bitCount += 6;
    if (bitCount < 8) continue;
    bitCount -= 8;
    const byte = (bits >>> bitCount) & 255;
    value += (byte & 127) * factor;
    if (byte & 128) factor *= 128;
    else { previous += value % 2 ? -(value + 1) / 2 : value / 2; out.push(previous); value = 0; factor = 1; }
  }
  if (factor !== 1) throw new Error('Truncated prop contact encoding');
  return out;
}

/** Local XYZ triples in triangle order, quantized at the same 1/4096 metre precision as kart positions. */
export function getPropContact(theme: string, kind: string): PropContact | undefined {
  const key = `${theme}/${kind}`, old = CACHE.get(key);
  if (old) return old;
  const entry = DATA.entries[key]; if (!entry) return undefined;
  const geometry = DATA.geometries[entry.geometry];
  if (!geometry) throw new Error(`Missing prop contact geometry ${key}`);
  let expanded = GEOMETRY.get(entry.geometry);
  if (!expanded) {
    const vertices = decode(geometry.vertices);
    const expand = (encoded: string): number[] => decode(encoded).flatMap((i) => [vertices[i * 3]! / 4096, vertices[i * 3 + 1]! / 4096, vertices[i * 3 + 2]! / 4096]);
    expanded = { triangles: expand(geometry.indices), supportTriangles: expand(geometry.supportIndices) };
    GEOMETRY.set(entry.geometry, expanded);
  }
  const contact = { ...entry, ...expanded, bounds: geometry.bounds.map((x) => x / 4096) };
  CACHE.set(key, contact); return contact;
}
