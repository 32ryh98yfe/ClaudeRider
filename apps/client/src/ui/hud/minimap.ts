/** World-space X/Z paths: only an authored circuit is closed. Branches and point-to-point routes remain open. */
export interface HudMapPath { id: string; points: Float32Array; closed: boolean }
export interface HudMapData { paths: readonly HudMapPath[] }
export interface HudMapGeometry { paths: { id: string; d: string }[]; x0: number; z0: number; w: number; h: number }

export function minimapGeometry(map: HudMapData | null): HudMapGeometry | null {
  if (!map) return null;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const path of map.paths) for (let i = 0; i + 1 < path.points.length; i += 2) {
    const x = path.points[i]!, z = path.points[i + 1]!;
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  if (!Number.isFinite(x0)) return null;
  const pad = Math.max(8, Math.max(x1 - x0, z1 - z0) * 0.035);
  x0 -= pad; z0 -= pad;
  const paths = map.paths.flatMap((path) => {
    let d = '', n = 0;
    for (let i = 0; i + 1 < path.points.length; i += 2) {
      const x = path.points[i]!, z = path.points[i + 1]!;
      if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
      d += `${n++ ? 'L' : 'M'}${(x - x0).toFixed(2)} ${(z - z0).toFixed(2)} `;
    }
    return n >= 2 ? [{ id: path.id, d: d + (path.closed ? 'Z' : '') }] : [];
  });
  return paths.length ? { paths, x0, z0, w: x1 - x0 + pad, h: z1 - z0 + pad } : null;
}
