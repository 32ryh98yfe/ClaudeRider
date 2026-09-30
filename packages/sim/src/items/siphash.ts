// HalfSipHash-2-4 (Aumasson & Bernstein reference, 32-bit output, 64-bit key). Synchronous and integer-only, so it
// runs identically in Node and the browser Worker inside step() (ADR-007; WebCrypto HMAC is async and cannot).

const rotl = (x: number, b: number): number => (x << b) | (x >>> (32 - b));

const V = new Int32Array(4);
function round(): void {
  let v0 = V[0]!, v1 = V[1]!, v2 = V[2]!, v3 = V[3]!;
  v0 = (v0 + v1) | 0; v1 = rotl(v1, 5); v1 ^= v0; v0 = rotl(v0, 16);
  v2 = (v2 + v3) | 0; v3 = rotl(v3, 8); v3 ^= v2;
  v0 = (v0 + v3) | 0; v3 = rotl(v3, 7); v3 ^= v0;
  v2 = (v2 + v1) | 0; v1 = rotl(v1, 13); v1 ^= v2; v2 = rotl(v2, 16);
  V[0] = v0; V[1] = v1; V[2] = v2; V[3] = v3;
}

/** HalfSipHash-2-4 of `len` bytes of `data` under the key words (k0, k1) (little-endian halves of the 8-byte key). */
export function halfSipHash24Bytes(k0: number, k1: number, data: ArrayLike<number>, len: number): number {
  V[0] = k0 | 0; V[1] = k1 | 0; V[2] = 0x6c796765 ^ k0; V[3] = 0x74656462 ^ k1;
  const full = len - (len & 3);
  let i = 0;
  for (; i < full; i += 4) {
    const m = (data[i]! & 0xff) | ((data[i + 1]! & 0xff) << 8) | ((data[i + 2]! & 0xff) << 16) | ((data[i + 3]! & 0xff) << 24);
    V[3] ^= m; round(); round(); V[0] ^= m;
  }
  let b = (len & 0xff) << 24;
  const left = len & 3;
  if (left >= 3) b |= (data[i + 2]! & 0xff) << 16;
  if (left >= 2) b |= (data[i + 1]! & 0xff) << 8;
  if (left >= 1) b |= data[i]! & 0xff;
  V[3] ^= b; round(); round(); V[0] ^= b;
  V[2] ^= 0xff;
  round(); round(); round(); round();
  return (V[1]! ^ V[3]!) >>> 0;
}

const BYTES = new Uint8Array(64);
/** HalfSipHash-2-4 over `n` uint32 words serialized little-endian (the ADR-007 roll message). */
export function halfSipHash24Words(k0: number, k1: number, words: ArrayLike<number>, n: number): number {
  for (let i = 0; i < n; i++) {
    const w = words[i]! >>> 0;
    BYTES[i * 4] = w & 0xff; BYTES[i * 4 + 1] = (w >>> 8) & 0xff; BYTES[i * 4 + 2] = (w >>> 16) & 0xff; BYTES[i * 4 + 3] = w >>> 24;
  }
  return halfSipHash24Bytes(k0, k1, BYTES, n * 4);
}
