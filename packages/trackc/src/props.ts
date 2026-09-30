// Seeded prop placement → instanced transforms [x, y, z, yaw, scale, variant] per prop kind (rendered by ThemeKits).
import type { TrackAst } from './dsl.ts';
import type { Geometry } from './geometry.ts';

export interface PropSet { kind: string; xf: number[] }

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function placeProps(g: Geometry, ast: TrackAst, seed: number, lineS: number): PropSet[] {
  const S = g.samples, R = rng(seed ^ 0x9e3779b9);
  const sets = new Map<string, number[]>();
  const add = (kind: string, x: number, y: number, z: number, yaw: number, scale = 1, variant = 0): void => {
    let a = sets.get(kind); if (!a) sets.set(kind, (a = [])); a.push(x, y, z, yaw, scale, variant);
  };
  const yawOf = (tx: number, tz: number): number => Math.atan2(tx, tz);
  // chevron boards on the outside of tight corners, every 8 m, facing the approaching kart
  for (let i = 0; i < S.length; i += 8) {
    const s = S[i]!;
    if (Math.abs(s.curv) < 1 / 32) continue;
    const outside = s.curv > 0 ? 1 : -1; // left turn → outside is right
    const off = outside * (s.w / 2 + s.shoulder + 1.4);
    add('chevron', s.x + s.rx * off, s.y + s.ry * off, s.z + s.rz * off, yawOf(-s.tx, -s.tz), 1, s.curv > 0 ? 1 : 0);
  }
  // start/finish gantry
  const li = Math.max(0, Math.min(S.length - 1, Math.round(lineS / (g.length / (S.length - 1)))));
  const ls = S[li]!;
  add('gantry', ls.x, ls.y, ls.z, yawOf(ls.tx, ls.tz), ls.w / 16);
  // user PROPS commands: kind=<k> along=<s0>-<s1>|all side=L|R|both every=<m> offset=<m>
  for (const p of ast.props) {
    const kind = p.kind ?? 'tree';
    const every = Number(p.every ?? 20), offset = Number(p.offset ?? 4);
    const [a0, a1] = p.along && p.along !== 'all' ? p.along.split('-').map(Number) : [0, g.length];
    const sides = p.side === 'L' ? [-1] : p.side === 'R' ? [1] : [-1, 1];
    for (let s = a0 ?? 0; s <= (a1 ?? g.length); s += every) {
      const i = Math.max(0, Math.min(S.length - 1, Math.round(s / (g.length / (S.length - 1)))));
      const smp = S[i]!;
      for (const side of sides) {
        const u = side * (smp.w / 2 + smp.shoulder + offset + R() * Number(p.jitter ?? 0));
        add(kind, smp.x + smp.rx * u, smp.y + smp.ry * u - 0.2, smp.z + smp.rz * u, yawOf(smp.tx, smp.tz) + (side < 0 ? Math.PI : 0), 0.85 + R() * 0.3, Math.floor(R() * 4));
      }
    }
  }
  // scatter (THEME scatter=kindA,kindB density=<per 100 m of track>): outside a keep-out corridor
  const scatter = (ast.theme.scatter ?? 'tree').split(',').filter(Boolean);
  const density = Number(ast.theme.density ?? 6);
  const total = Math.round((g.length / 100) * density);
  const keep = (x: number, z: number, minD: number): boolean => {
    for (let i = 0; i < S.length; i += 3) { const s = S[i]!; const d = Math.hypot(s.x - x, s.z - z); if (d < s.w / 2 + s.shoulder + minD) return false; }
    return true;
  };
  let placed = 0, tries = 0;
  while (placed < total && tries < total * 20) {
    tries++;
    const s = S[Math.floor(R() * S.length)]!;
    const side = R() < 0.5 ? -1 : 1;
    const dist = s.w / 2 + s.shoulder + 8 + R() * 70;
    const x = s.x + s.rx * side * dist, z = s.z + s.rz * side * dist;
    if (!keep(x, z, 6)) continue;
    const kind = scatter[Math.floor(R() * scatter.length)]!;
    add(kind, x, s.y - 1.5, z, R() * Math.PI * 2, 0.7 + R() * 0.8, Math.floor(R() * 4));
    placed++;
  }
  return [...sets.entries()].map(([kind, xf]) => ({ kind, xf }));
}
