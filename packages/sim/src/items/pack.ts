// Integer packing of small vectors into effect params (params are integers on the wire and in hashWorld).

/** Packs a horizontal unit normal into 24 bits (two 12-bit signed components). */
export const packNormal = (nx: number, nz: number): number => ((Math.round(nx * 2047) + 2048) << 12) | (Math.round(nz * 2047) + 2048);

export function unpackNormal(p: number, out: { x: number; z: number }): void {
  out.x = (((p >> 12) & 0xfff) - 2048) / 2047;
  out.z = ((p & 0xfff) - 2048) / 2047;
}
