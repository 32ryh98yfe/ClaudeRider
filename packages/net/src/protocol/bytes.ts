// Little-endian byte writer/reader with LEB128 varints (02-contracts B9). Shared by every codec.
// Readers throw ProtocolError on truncated or malformed input, so a server can drop a bad frame without
// corrupting state; nothing here allocates per value.

export class ProtocolError extends Error {
  readonly code: string;
  constructor(code: string, detail = '') { super(detail ? `${code}: ${detail}` : code); this.code = code; }
}

const TWO32 = 4294967296;
/** Largest integer a varint may carry (53-bit safe). */
export const MAX_VARINT = 9007199254740991;

export class ByteWriter {
  private buf: Uint8Array;
  private dv: DataView;
  pos = 0;

  constructor(capacity = 256) {
    this.buf = new Uint8Array(capacity);
    this.dv = new DataView(this.buf.buffer);
  }

  reset(): this { this.pos = 0; return this; }

  private ensure(n: number): void {
    if (this.pos + n <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.pos + n) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.pos));
    this.buf = next;
    this.dv = new DataView(next.buffer);
  }

  u8(v: number): void { this.ensure(1); this.buf[this.pos++] = v & 0xff; }
  i8(v: number): void { this.ensure(1); this.dv.setInt8(this.pos, v); this.pos += 1; }
  u16(v: number): void { this.ensure(2); this.dv.setUint16(this.pos, v & 0xffff, true); this.pos += 2; }
  i16(v: number): void { this.ensure(2); this.dv.setInt16(this.pos, v, true); this.pos += 2; }
  i24(v: number): void {
    this.ensure(3);
    const x = v & 0xffffff;
    this.buf[this.pos] = x & 0xff; this.buf[this.pos + 1] = (x >>> 8) & 0xff; this.buf[this.pos + 2] = (x >>> 16) & 0xff;
    this.pos += 3;
  }
  u32(v: number): void { this.ensure(4); this.dv.setUint32(this.pos, v >>> 0, true); this.pos += 4; }
  i32(v: number): void { this.ensure(4); this.dv.setInt32(this.pos, v | 0, true); this.pos += 4; }
  f64(v: number): void { this.ensure(8); this.dv.setFloat64(this.pos, v, true); this.pos += 8; }
  bytes(b: Uint8Array): void { this.ensure(b.length); this.buf.set(b, this.pos); this.pos += b.length; }

  /** Unsigned LEB128 for integers 0 … 2^53 − 1. */
  varu(v: number): void {
    if (v < 0x80) { this.ensure(1); this.buf[this.pos++] = v; return; }
    this.ensure(8);
    if (v < 0x80000000) {
      let x = v;
      while (x >= 0x80) { this.buf[this.pos++] = (x & 0x7f) | 0x80; x >>>= 7; }
      this.buf[this.pos++] = x;
      return;
    }
    let x = v;
    while (x >= 0x80) { this.buf[this.pos++] = (x % 0x80) | 0x80; x = Math.floor(x / 0x80); }
    this.buf[this.pos++] = x;
  }

  /** Zigzag LEB128 for integers in ±2^52. */
  vari(v: number): void { this.varu(v >= 0 ? v * 2 : -v * 2 - 1); }

  /** Overwrites one byte already written (header patching). */
  patchU8(at: number, v: number): void { this.buf[at] = v & 0xff; }

  /** A copy of the written bytes (safe to hand to a transport that queues by reference). */
  finish(): Uint8Array { return this.buf.slice(0, this.pos); }
  /** A view of the written bytes; valid only until the next write or reset. */
  view(): Uint8Array { return this.buf.subarray(0, this.pos); }
}

export class ByteReader {
  private buf: Uint8Array;
  private dv: DataView;
  pos = 0;
  end = 0;

  constructor(b: Uint8Array = new Uint8Array(0)) {
    this.buf = b;
    this.dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    this.end = b.length;
  }

  reset(b: Uint8Array): this {
    this.buf = b;
    this.dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    this.pos = 0;
    this.end = b.length;
    return this;
  }

  remaining(): number { return this.end - this.pos; }
  private need(n: number): void { if (this.pos + n > this.end) throw new ProtocolError('truncated', `need ${n} at ${this.pos}/${this.end}`); }

  u8(): number { this.need(1); return this.buf[this.pos++]!; }
  i8(): number { this.need(1); const v = this.dv.getInt8(this.pos); this.pos += 1; return v; }
  u16(): number { this.need(2); const v = this.dv.getUint16(this.pos, true); this.pos += 2; return v; }
  i16(): number { this.need(2); const v = this.dv.getInt16(this.pos, true); this.pos += 2; return v; }
  i24(): number {
    this.need(3);
    const x = this.buf[this.pos]! | (this.buf[this.pos + 1]! << 8) | (this.buf[this.pos + 2]! << 16);
    this.pos += 3;
    return (x << 8) >> 8;
  }
  u32(): number { this.need(4); const v = this.dv.getUint32(this.pos, true); this.pos += 4; return v; }
  i32(): number { this.need(4); const v = this.dv.getInt32(this.pos, true); this.pos += 4; return v; }
  f64(): number { this.need(8); const v = this.dv.getFloat64(this.pos, true); this.pos += 8; return v; }
  bytes(n: number): Uint8Array { this.need(n); const b = this.buf.subarray(this.pos, this.pos + n); this.pos += n; return b; }

  varu(): number {
    this.need(1);
    let b = this.buf[this.pos++]!;
    if (b < 0x80) return b;
    let v = b & 0x7f, mul = 0x80;
    for (let i = 1; i < 8; i++) {
      this.need(1);
      b = this.buf[this.pos++]!;
      v += (b & 0x7f) * mul;
      if (b < 0x80) {
        if (v > MAX_VARINT) throw new ProtocolError('varint', 'overflow');
        return v;
      }
      mul *= 0x80;
    }
    throw new ProtocolError('varint', 'too long');
  }

  vari(): number { const u = this.varu(); return u % 2 === 0 ? u / 2 : -(u + 1) / 2; }
}

/** u32 split helpers for 128-bit tokens. */
export const u32Hex = (w: ArrayLike<number>): string => Array.from(w, (x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
export function hexU32(s: string, out: Uint32Array = new Uint32Array(4)): Uint32Array {
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(s.slice(i * 8, i * 8 + 8), 16) >>> 0;
  return out;
}
export { TWO32 };
