// Racing line: minimum-curvature lateral offsets inside the road corridor (14-ai §11.1).
// Shared by the bake (trackc/aibake.ts) and by the runtime plan when an older .ctrk carries no line.
// Projected coordinate descent on Σ|P(i−1) − 2P(i) + P(i+1)|² with box limits on each offset, run
// coarse-to-fine (16 → 1 m) because 4th-order smoothing diffuses far too slowly on a 1 m grid alone.

/**
 * @param X,Y   centre positions in the plan (any right-handed 2D frame)
 * @param RX,RY unit right vectors (offset + = right)
 * @param lim   allowed |offset| per sample (m)
 * @param closed circuit (samples wrap; do not repeat the first sample at the end)
 * @param ds    sample spacing (m)
 */
export function relaxRacingLine(X: ArrayLike<number>, Y: ArrayLike<number>, RX: ArrayLike<number>, RY: ArrayLike<number>, lim: ArrayLike<number>, closed: boolean, ds: number): Float64Array {
  const n = X.length;
  const alpha = new Float64Array(n);
  if (n < 8) return alpha;
  const levels = [16, 8, 4, 2, 1];
  for (const h of levels) {
    const st = Math.max(1, Math.round(h / ds));
    const nc = closed ? Math.max(8, Math.round(n / st)) : Math.max(3, Math.floor((n - 1) / st) + 1);
    if (nc > n) continue;
    const idx = new Int32Array(nc);
    for (let j = 0; j < nc; j++) idx[j] = closed ? Math.min(n - 1, Math.round((j * n) / nc)) : Math.min(n - 1, j * st);
    if (!closed) idx[nc - 1] = n - 1;
    const cx = new Float64Array(nc), cy = new Float64Array(nc), rx = new Float64Array(nc), ry = new Float64Array(nc), lm = new Float64Array(nc), a = new Float64Array(nc);
    for (let j = 0; j < nc; j++) {
      const i = idx[j]!;
      cx[j] = X[i]!; cy[j] = Y[i]!; rx[j] = RX[i]!; ry[j] = RY[i]!; a[j] = alpha[i]!;
      // the limit of a coarse point is the tightest limit it stands for (never cut a narrow neck)
      let m = lim[i]!;
      const i0 = i - (st >> 1), i1 = i + (st >> 1);
      for (let q = i0; q <= i1; q++) {
        const qq = closed ? ((q % n) + n) % n : q < 0 ? 0 : q > n - 1 ? n - 1 : q;
        if (lim[qq]! < m) m = lim[qq]!;
      }
      lm[j] = m > 0 ? m : 0;
    }
    const iters = h >= 16 ? 1500 : h >= 4 ? 600 : 250;
    const omega = 1.6 / 6;
    // positions kept in step with the offsets, and neighbour indices resolved once per level (the modulo in the
    // inner loop dominated the plan build)
    const PX = new Float64Array(nc), PY = new Float64Array(nc);
    for (let j = 0; j < nc; j++) { PX[j] = cx[j]! + rx[j]! * a[j]!; PY[j] = cy[j]! + ry[j]! * a[j]!; }
    const j0 = closed ? 0 : 2, j1 = closed ? nc : nc - 2;
    const nb = new Int32Array(nc * 4);
    for (let j = j0; j < j1; j++) {
      const w = (q: number): number => (closed ? ((q % nc) + nc) % nc : q);
      nb[j * 4] = w(j - 2); nb[j * 4 + 1] = w(j - 1); nb[j * 4 + 2] = w(j + 1); nb[j * 4 + 3] = w(j + 2);
    }
    for (let it = 0; it < iters; it++) {
      for (let j = j0; j < j1; j++) {
        const jm2 = nb[j * 4]!, jm1 = nb[j * 4 + 1]!, jp1 = nb[j * 4 + 2]!, jp2 = nb[j * 4 + 3]!;
        const d4x = PX[jm2]! - 4 * PX[jm1]! + 6 * PX[j]! - 4 * PX[jp1]! + PX[jp2]!;
        const d4y = PY[jm2]! - 4 * PY[jm1]! + 6 * PY[j]! - 4 * PY[jp1]! + PY[jp2]!;
        let v = a[j]! - omega * (d4x * rx[j]! + d4y * ry[j]!);
        const L = lm[j]!;
        if (v > L) v = L; else if (v < -L) v = -L;
        a[j] = v; PX[j] = cx[j]! + rx[j]! * v; PY[j] = cy[j]! + ry[j]! * v;
      }
      if (!closed) {
        // second points: plain Laplacian (ends stay on the centre)
        for (let e = 0; e < 2; e++) {
          const j = e === 0 ? 1 : nc - 2;
          const mx = 0.5 * (PX[j - 1]! + PX[j + 1]!), my = 0.5 * (PY[j - 1]! + PY[j + 1]!);
          let v = a[j]! + ((mx - PX[j]!) * rx[j]! + (my - PY[j]!) * ry[j]!);
          const L = lm[j]!;
          if (v > L) v = L; else if (v < -L) v = -L;
          a[j] = v; PX[j] = cx[j]! + rx[j]! * v; PY[j] = cy[j]! + ry[j]! * v;
        }
      }
    }
    // prolong to every sample (linear between coarse points)
    for (let j = 0; j < nc; j++) {
      const i0 = idx[j]!, jn = closed ? (j + 1) % nc : j + 1;
      if (jn >= nc) { alpha[i0] = a[j]!; continue; }
      let i1 = idx[jn]!;
      if (closed && i1 <= i0) i1 += n;
      for (let i = i0; i < i1; i++) {
        const t = (i - i0) / (i1 - i0);
        const v = a[j]! + (a[jn]! - a[j]!) * t;
        const ii = i % n;
        alpha[ii] = Math.max(-lim[ii]!, Math.min(lim[ii]!, v));
      }
    }
  }
  return alpha;
}
