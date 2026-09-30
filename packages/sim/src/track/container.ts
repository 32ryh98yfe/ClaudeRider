/* eslint-disable no-restricted-globals -- binary IO needs Float32Array views; sim state never uses them. */
// FROZEN (contracts.lock). Generic binary container used by .ctrk (physics) and .vis (render) files.
//
// Layout (little-endian):
//   u32 magic | u16 version | u16 reserved | u32 dirBytes | dir JSON (UTF-8) | pad to 8 | data...
//   dir = { meta: <json>, arrays: { name: [type, byteOffset(from data start), count] } }
// Every array starts 8-byte aligned (relative to the data start, which itself is 8-byte aligned).

export type ArrayType = 'f64' | 'f32' | 'u32' | 'i32' | 'u16' | 'u8';
export type TypedArray = Float64Array | Float32Array | Uint32Array | Int32Array | Uint16Array | Uint8Array;

const CTOR = { f64: Float64Array, f32: Float32Array, u32: Uint32Array, i32: Int32Array, u16: Uint16Array, u8: Uint8Array } as const;
const BYTES = { f64: 8, f32: 4, u32: 4, i32: 4, u16: 2, u8: 1 } as const;

export interface ContainerData { meta: unknown; arrays: Map<string, TypedArray> }

function typeOf(a: TypedArray): ArrayType {
  if (a instanceof Float64Array) return 'f64';
  if (a instanceof Float32Array) return 'f32';
  if (a instanceof Uint32Array) return 'u32';
  if (a instanceof Int32Array) return 'i32';
  if (a instanceof Uint16Array) return 'u16';
  return 'u8';
}

const pad8 = (n: number): number => (n + 7) & ~7;

/** Minimal UTF-8 codec (TextEncoder/TextDecoder are not in the ES lib used by the sim). */
export function utf8Encode(str: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) { const c2 = str.charCodeAt(i + 1); if (c2 >= 0xdc00 && c2 < 0xe000) { c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00); i++; } }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}
export function utf8Decode(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length;) {
    const c = b[i++]!;
    let cp: number;
    if (c < 0x80) cp = c;
    else if (c < 0xe0) cp = ((c & 31) << 6) | (b[i++]! & 63);
    else if (c < 0xf0) { cp = ((c & 15) << 12) | ((b[i]! & 63) << 6) | (b[i + 1]! & 63); i += 2; }
    else { cp = ((c & 7) << 18) | ((b[i]! & 63) << 12) | ((b[i + 1]! & 63) << 6) | (b[i + 2]! & 63); i += 3; }
    s += String.fromCodePoint(cp);
  }
  return s;
}

export function writeContainer(magic: number, version: number, meta: unknown, arrays: ReadonlyArray<readonly [string, TypedArray]>): Uint8Array {
  const dirArrays: Record<string, [ArrayType, number, number]> = {};
  let off = 0;
  for (const [name, a] of arrays) {
    const t = typeOf(a);
    dirArrays[name] = [t, off, a.length];
    off = pad8(off + a.length * BYTES[t]);
  }
  const dirBytes = utf8Encode(JSON.stringify({ meta, arrays: dirArrays }));
  const headerLen = pad8(12 + dirBytes.length);
  const out = new Uint8Array(headerLen + off);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, magic, true);
  dv.setUint16(4, version, true);
  dv.setUint16(6, 0, true);
  dv.setUint32(8, dirBytes.length, true);
  out.set(dirBytes, 12);
  for (const [name, a] of arrays) {
    const [, o] = dirArrays[name]!;
    out.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), headerLen + o);
  }
  return out;
}

/** Zero-copy read. `buf` must be a standalone ArrayBuffer (copy Node Buffers first). */
export function readContainer(buf: ArrayBuffer, magic: number, maxVersion: number): ContainerData & { version: number } {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== magic) throw new Error('bad container magic');
  const version = dv.getUint16(4, true);
  if (version > maxVersion) throw new Error(`container version ${version} > supported ${maxVersion}`);
  const dirLen = dv.getUint32(8, true);
  const dir = JSON.parse(utf8Decode(new Uint8Array(buf, 12, dirLen))) as { meta: unknown; arrays: Record<string, [ArrayType, number, number]> };
  const headerLen = pad8(12 + dirLen);
  const arrays = new Map<string, TypedArray>();
  for (const [name, [t, o, n]] of Object.entries(dir.arrays)) arrays.set(name, new CTOR[t](buf, headerLen + o, n));
  return { meta: dir.meta, arrays, version };
}

/** Copies a (possibly pooled / offset) byte view into a fresh aligned ArrayBuffer. */
export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return ab;
}
