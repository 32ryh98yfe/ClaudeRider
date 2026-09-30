// Frames (docs/design/11-track-spec.md §4): worldUp where |T·Y| ≤ 0.9, double-reflection RMF (Wang et al. 2008)
// for loops / corkscrews / zero-g tubes, residual twist distributed by smoothstep of arc fraction, bank applied last.

export interface FrameSample {
  x: number; y: number; z: number;
  tx: number; ty: number; tz: number; rx: number; ry: number; rz: number; ux: number; uy: number; uz: number;
  bank: number;       // degrees, + raises the right edge
  frameReq: 0 | 1 | 2; // 0 auto, 1 forced worldUp, 2 forced rmf
  tanSide?: -1 | 0 | 1; // tangent difference: −1 backward, +1 forward (jump lips / landings), 0 central
  rmf: boolean;        // result: frame built by RMF
}

type V = [number, number, number];
const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V): V => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V, s: number): V => [a[0] * s, a[1] * s, a[2] * s];

/** Up-constrained frame: R = normalize(T × Ŷ); near-vertical tangents keep the previous R for continuity. */
function upRight(t: V, rPrev: V | null): V {
  const r: V = [-t[2], 0, t[0]]; // T × Y
  const l = Math.hypot(r[0], r[2]);
  if (l < 0.15) {
    const rp = rPrev ?? [1, 0, 0];
    return norm(sub(rp, scale(t, dot(rp, t))));
  }
  return [r[0] / l, 0, r[2] / l];
}

/** Double reflection (Wang et al. 2008) transporting r0 from (p0, t0) to (p1, t1). */
export function doubleReflect(p0: V, t0: V, r0: V, p1: V, t1: V): V {
  const v1 = sub(p1, p0), c1 = dot(v1, v1);
  let rL = r0, tL = t0;
  if (c1 > 1e-12) { rL = sub(r0, scale(v1, (2 * dot(v1, r0)) / c1)); tL = sub(t0, scale(v1, (2 * dot(v1, t0)) / c1)); }
  const v2 = sub(t1, tL), c2 = dot(v2, v2);
  const r1 = c2 > 1e-12 ? sub(rL, scale(v2, (2 * dot(v2, rL)) / c2)) : rL;
  return norm(sub(r1, scale(t1, dot(r1, t1))));
}

function rotateAbout(r: V, t: V, a: number): V {
  const c = Math.cos(a), s = Math.sin(a), k = cross(t, r), d = dot(t, r);
  return norm([r[0] * c + k[0] * s + t[0] * d * (1 - c), r[1] * c + k[1] * s + t[1] * d * (1 - c), r[2] * c + k[2] * s + t[2] * d * (1 - c)]);
}
const signedAngle = (a: V, b: V, axis: V): number => Math.atan2(dot(cross(a, b), axis), dot(a, b));

/**
 * Computes t/r/u for every sample. `closed` paths store the first sample again at the end.
 * Tangents: central differences of the 1 m samples (bake time only; the sim reads the baked vectors).
 */
export function computeFrames(S: FrameSample[], closed: boolean): void {
  const n = S.length;
  if (n < 2) return;
  const m = closed ? n - 1 : n; // unique samples
  const at = (i: number): number => (closed ? ((i % m) + m) % m : Math.max(0, Math.min(n - 1, i)));
  const T: V[] = [], P: V[] = [];
  for (let i = 0; i < m; i++) {
    const side = S[i]!.tanSide ?? 0;
    const a = S[at(side > 0 ? i : i - 1)]!, b = S[at(side < 0 ? i : i + 1)]!;
    T.push(norm([b.x - a.x, b.y - a.y, b.z - a.z]));
    P.push([S[i]!.x, S[i]!.y, S[i]!.z]);
  }
  // worldUp right vectors (with continuity fallback)
  const Rup: V[] = [];
  let prev: V | null = null;
  for (let i = 0; i < m; i++) { prev = upRight(T[i]!, prev); Rup.push(prev); }
  const rmf = new Uint8Array(m);
  for (let i = 0; i < m; i++) {
    const req = S[i]!.frameReq;
    rmf[i] = req === 2 || (req === 0 && Math.abs(T[i]![1]) > 0.9) ? 1 : 0;
  }
  const R: V[] = Rup.map((r) => r);
  // RMF runs (maximal, cyclic for closed paths)
  const allRmf = rmf.every((v) => v === 1);
  if (allRmf) {
    R[0] = Rup[0]!;
    for (let i = 1; i < m; i++) R[i] = doubleReflect(P[i - 1]!, T[i - 1]!, R[i - 1]!, P[i]!, T[i]!);
    if (closed) {
      const rEnd = doubleReflect(P[m - 1]!, T[m - 1]!, R[m - 1]!, P[0]!, T[0]!);
      const phi = signedAngle(rEnd, R[0]!, T[0]!);
      for (let i = 1; i < m; i++) R[i] = rotateAbout(R[i]!, T[i]!, (phi * i) / m);
    }
  } else if (rmf.some((v) => v === 1)) {
    // start scanning from a worldUp sample so cyclic runs are handled in one pass
    const first = rmf.indexOf(0);
    for (let k = 0; k < m; k++) {
      const i = closed ? (first + k) % m : k;
      if (!rmf[i] || (k > 0 && rmf[closed ? (i - 1 + m) % m : i - 1])) continue;
      // run starts at i
      const run: number[] = [];
      let j = i;
      while (rmf[j] && run.length < m) { run.push(j); j = closed ? (j + 1) % m : j + 1; if (!closed && j >= m) break; }
      const a = closed ? (i - 1 + m) % m : i - 1;
      const x = closed ? j % m : j < m ? j : -1;
      let rPrev: V = a >= 0 ? R[a]! : Rup[i]!;
      let pPrev: V = a >= 0 ? P[a]! : P[i]!, tPrev: V = a >= 0 ? T[a]! : T[i]!;
      const arc: number[] = [];
      let acc = 0;
      for (const q of run) {
        acc += Math.hypot(P[q]![0] - pPrev[0], P[q]![1] - pPrev[1], P[q]![2] - pPrev[2]);
        R[q] = doubleReflect(pPrev, tPrev, rPrev, P[q]!, T[q]!);
        rPrev = R[q]!; pPrev = P[q]!; tPrev = T[q]!;
        arc.push(acc);
      }
      if (x >= 0) {
        const rEnd = doubleReflect(pPrev, tPrev, rPrev, P[x]!, T[x]!);
        const phi = signedAngle(rEnd, Rup[x]!, T[x]!);
        const span = acc + Math.hypot(P[x]![0] - pPrev[0], P[x]![1] - pPrev[1], P[x]![2] - pPrev[2]);
        run.forEach((q, qi) => { const f = arc[qi]! / span; R[q] = rotateAbout(R[q]!, T[q]!, phi * f * f * (3 - 2 * f)); });
      }
    }
  }
  for (let i = 0; i < n; i++) {
    const k = closed ? (i % m) : i;
    const t = T[k]!, r0 = R[k]!;
    const u0 = cross(r0, t);
    const b = (S[i]!.bank * Math.PI) / 180, c = Math.cos(b), s = Math.sin(b);
    const s0 = S[i]!;
    s0.tx = t[0]; s0.ty = t[1]; s0.tz = t[2];
    s0.rx = r0[0] * c + u0[0] * s; s0.ry = r0[1] * c + u0[1] * s; s0.rz = r0[2] * c + u0[2] * s;
    s0.ux = u0[0] * c - r0[0] * s; s0.uy = u0[1] * c - r0[1] * s; s0.uz = u0[2] * c - r0[2] * s;
    s0.rmf = rmf[k] === 1;
  }
}
