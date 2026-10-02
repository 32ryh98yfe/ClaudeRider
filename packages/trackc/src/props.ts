// Seeded prop placement → instanced transforms [x, y, z, yaw, scale, variant] per prop kind (rendered by ThemeKits).
// Placement rules (docs/design/11-track-spec.md §2.3): rows skip exclusion zones (start line, pads, item rows ±6 m,
// junction windows, hazards ±8 m, jump gaps, warps), never land on a drivable surface, sit on the terrain, and
// never float (a row point whose terrain lies > 3 m below the road edge is dropped).
import { TrackDslError, num } from './dsl.ts';
import { sampleAt, type TrackModel } from './paths.ts';
import { inS, type Content } from './content.ts';
import type { TriSoup } from './soup.ts';
import { VS } from './soup.ts';
import type { Junction } from './clip.ts';
import type { TerrainField } from './terrain.ts';

export interface PropSet { kind: string; xf: number[] }
export interface Exclusion { path: number; s0: number; s1: number; why: string }

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** 2D index of ground triangles: "is this plan point on a drivable surface near height y?" */
export class GroundIndex {
  private cells = new Map<number, number[]>();
  private readonly cs = 6;
  private readonly soup: TriSoup;
  constructor(soup: TriSoup) {
    this.soup = soup;
    const V = soup.v;
    for (let t = 0; t < soup.count; t++) {
      const o = t * 3 * VS;
      const xs = [V[o]!, V[o + VS]!, V[o + 2 * VS]!], zs = [V[o + 2]!, V[o + VS + 2]!, V[o + 2 * VS + 2]!];
      const ix0 = Math.floor(Math.min(...xs) / this.cs), ix1 = Math.floor(Math.max(...xs) / this.cs);
      const iz0 = Math.floor(Math.min(...zs) / this.cs), iz1 = Math.floor(Math.max(...zs) / this.cs);
      for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
        const k = this.key(ix, iz); let l = this.cells.get(k); if (!l) this.cells.set(k, (l = [])); l.push(t);
      }
    }
  }
  private key(ix: number, iz: number): number { return (ix + 20000) * 40000 + (iz + 20000); }
  /** Height of the ground under (x, z) closest to yHint, or null. */
  heightAt(x: number, z: number, yHint: number, maxDy = 5): number | null {
    const l = this.cells.get(this.key(Math.floor(x / this.cs), Math.floor(z / this.cs)));
    if (!l) return null;
    const V = this.soup.v;
    let best: number | null = null;
    for (const t of l) {
      const o = t * 3 * VS;
      const ax = V[o]!, az = V[o + 2]!, bx = V[o + VS]!, bz = V[o + VS + 2]!, cx = V[o + 2 * VS]!, cz = V[o + 2 * VS + 2]!;
      const det = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
      if (Math.abs(det) < 1e-12) continue;
      const l1 = ((x - ax) * (cz - az) - (cx - ax) * (z - az)) / det, l2 = ((bx - ax) * (z - az) - (x - ax) * (bz - az)) / det;
      if (l1 < -1e-6 || l2 < -1e-6 || l1 + l2 > 1 + 1e-6) continue;
      const y = V[o + 1]! * (1 - l1 - l2) + V[o + VS + 1]! * l1 + V[o + 2 * VS + 1]! * l2;
      if (Math.abs(y - yHint) <= maxDy && (best === null || Math.abs(y - yHint) < Math.abs(best - yHint))) best = y;
    }
    return best;
  }
}

export function exclusions(m: TrackModel, c: Content, js: Junction[], hazardS: { path: number; s: number }[]): Exclusion[] {
  const ex: Exclusion[] = [];
  ex.push({ path: 0, s0: m.lineS - 10, s1: m.lineS + 10, why: 'line' });
  for (const p of c.pads) ex.push({ path: p.path, s0: p.s0 - 6, s1: p.s1 + 6, why: 'pad' });
  for (const r of c.items) ex.push({ path: r.path, s0: r.s - 6, s1: r.s + 6, why: 'items' });
  for (const j of js) { ex.push({ path: j.host, s0: j.hostS0, s1: j.hostS1, why: 'junction' }); ex.push({ path: j.branch, s0: j.branchS0, s1: j.branchS1, why: 'junction' }); }
  for (const h of hazardS) ex.push({ path: h.path, s0: h.s - 8, s1: h.s + 8, why: 'hazard' });
  for (const j of c.jumps) ex.push({ path: j.path, s0: j.lipS - 2, s1: j.landS0 + 2, why: 'gap' });
  return ex;
}

/** Why PROPS row instances were not placed in the last placeProps() call (bake stats: authors see what to move). */
export const DROPS = { onRoad: 0, floating: 0, excluded: 0 };
/** PROPS rows closer than this to the road edge are deck-edge dressing: on an elevated deck they stand on the deck. */
const DECK_EDGE = 2;
/** Farther-out props beside an elevated deck stand on the ground below unless it is deeper than this. */
const GROUND_BELOW = 40;

export function placeProps(m: TrackModel, c: Content, seed: number, gi: GroundIndex, tf: TerrainField | null, ex: Exclusion[], js: Junction[]): PropSet[] {
  DROPS.onRoad = 0; DROPS.floating = 0; DROPS.excluded = 0;
  const R = rng(seed ^ 0x9e3779b9);
  const sets = new Map<string, number[]>();
  const add = (kind: string, x: number, y: number, z: number, yaw: number, scale = 1, variant = 0): void => {
    let a = sets.get(kind); if (!a) sets.set(kind, (a = [])); a.push(x, y, z, yaw, scale, variant);
  };
  const yawOf = (tx: number, tz: number): number => Math.atan2(tx, tz);
  const excluded = (path: number, s: number, kinds?: string[]): boolean => ex.some((e) => e.path === path && (!kinds || kinds.includes(e.why)) && inS(m, path, s, e.s0, e.s1));
  const groundY = (x: number, z: number, fallback: number): number => (tf ? tf.height(x, z) : fallback);

  // chevron boards on the outside of tight corners (only where the outside has a wall to stand on)
  for (const p of m.paths) {
    if (p.kind === 'rail') continue;
    for (let i = 0; i < p.samples.length; i += 8) {
      const s = p.samples[i]!;
      if (Math.abs(s.curv) < 1 / 32 || s.jumpPart === 2 || s.warp) continue;
      if (excluded(p.index, s.s, ['junction', 'line', 'gap'])) continue;
      const outside = s.curv > 0 ? 1 : -1;
      const wall = outside > 0 ? s.wallR : s.wallL;
      if (wall.type === 'none' || wall.type === 'curb') continue;
      const off = outside * (s.w / 2 + (outside > 0 ? s.shR : s.shL) + 1.4);
      add('chevron', s.x + s.rx * off, s.y + s.ry * off, s.z + s.rz * off, yawOf(-s.tx, -s.tz), 1, s.curv > 0 ? 1 : 0);
    }
  }
  // start/finish gantry
  const ls = sampleAt(m.paths[0]!, m.lineS);
  add('gantry', ls.x, ls.y, ls.z, yawOf(ls.tx, ls.tz), ls.w / 16);
  // gore cushions at split points
  for (const j of js) if (j.gore && j.kind === 'split') add('gore_cushion', j.gore.x + j.gore.fx * 0.7, j.gore.y, j.gore.z + j.gore.fz * 0.7, yawOf(j.gore.fx, j.gore.fz), 1, 0);

  // PROPS rows: kind= along=main|<pathId>|all|<s0>-<s1> side=L|R|both every= offset= jitter= scale=a-b from= to= seed=
  for (const cmd of c.props) {
    const a = cmd.attrs;
    if (cmd.mode === 'landmark') {
      const at = (a.at ?? '(0,0,0)').replace(/[()]/g, '').split(',').map(Number);
      if (at.length < 3 || at.some((v) => !Number.isFinite(v))) throw new TrackDslError({ file: m.file, line: cmd.line, col: 1, msg: 'PROP needs at=(x,y,z)' });
      add(cmd.kind, at[0]!, at[1]!, at[2]!, (num(a.yaw, 0) * Math.PI) / 180, num(a.scale, 1), num(a.variant, 0));
      continue;
    }
    const pr = a.seed !== undefined ? rng(num(a.seed, 1)) : R;
    const every = Math.max(1, num(a.every, 20)), offset = num(a.offset, 4), jitter = num(a.jitter, 0);
    const [sc0, sc1] = (a.scale ?? '0.85-1.15').split('-').map(Number);
    let pathIdx = 0, s0: number, s1: number;
    const along = a.along ?? 'main';
    if (/^[-\d.]+-[-\d.]+$/.test(along)) {
      const [x, y] = along.split(/(?<=\d)-/).map(Number); s0 = m.toMain(x!); s1 = m.toMain(y!); if (s1 < s0 && m.closed) s1 += m.paths[0]!.length;
    } else {
      if (along !== 'all' && along !== 'main') {
        const p = m.paths.find((q) => q.id === along);
        if (!p) throw new TrackDslError({ file: m.file, line: cmd.line, col: 1, msg: `PROPS along=${along}: unknown path` });
        pathIdx = p.index;
      }
      const P = m.paths[pathIdx]!;
      s0 = a.from !== undefined ? m.sRef(a.from, pathIdx, cmd.line) : 0;
      s1 = a.to !== undefined ? m.sRef(a.to, pathIdx, cmd.line) : P.length;
      if (s1 < s0 && P.closed) s1 += P.length;
    }
    const P = m.paths[pathIdx]!;
    const sides = a.side === 'L' ? [-1] : a.side === 'R' ? [1] : [-1, 1];
    for (let s = s0; s <= s1 + 1e-6; s += every) {
      // ranges that wrap past the line (s1 += L above) must wrap back, or sampleAt clamps them onto the last sample
      const smp = sampleAt(P, P.closed ? ((s % P.length) + P.length) % P.length : s);
      if (smp.jumpPart === 2 || smp.warp || excluded(pathIdx, smp.s)) { DROPS.excluded += sides.length; continue; }
      for (const side of sides) {
        const edge = side * (smp.w / 2 + (side < 0 ? smp.shL : smp.shR));
        const u = edge + side * (offset + pr() * jitter);
        let x = smp.x + smp.rx * u, z = smp.z + smp.rz * u;
        // compare against the road edge, not the banked road plane extended out to u: on the high side of an 8° bank
        // that plane is 3 m above the ground by ~19 m out and dropped every grandstand and tyre wall there
        const yRoad = smp.y + smp.ry * edge;
        if (gi.heightAt(x, z, yRoad) !== null) { DROPS.onRoad++; continue; } // never on a road
        let y = groundY(x, z, yRoad - 0.2);
        // a stacked layout (overpass, spiral, hairpin) can put the landing point on another stretch of road: drop it
        // there too (S-D-props-other-level); a deck more than 2.5 m above still lets props stand under the bridge
        if (gi.heightAt(x, z, y, 2.5) !== null) { DROPS.onRoad++; continue; }
        if (y < yRoad - 3) {
          // beside an elevated deck (bridges, interchange ramps, skyways) the ground is far below:
          if (smp.kill) { DROPS.floating++; continue; }          // ledges over kill planes stay bare
          if (offset <= DECK_EDGE) {
            // deck-edge dressing (lamps, light strips, signs, rails) stands on the deck edge itself
            const ud = edge - side * 0.25;
            x = smp.x + smp.rx * ud; z = smp.z + smp.rz * ud; y = smp.y + smp.ry * ud;
          } else if (!tf || yRoad - y > GROUND_BELOW || gi.heightAt(x, z, y + 1, 3) !== null) { DROPS.floating++; continue; }
          // farther-out props (billboards, cranes, towers) stand on the ground below the deck
        }
        add(cmd.kind, x, y, z, yawOf(smp.tx, smp.tz) + (side < 0 ? Math.PI : 0), (sc0 ?? 0.85) + pr() * ((sc1 ?? 1.15) - (sc0 ?? 0.85)), Math.floor(pr() * 4));
      }
    }
  }

  // support pillars under elevated decks (render only), every 15 m where the deck stands > 4 m above the terrain
  if (tf) for (const p of m.paths) {
    if (p.kind === 'rail') continue;
    for (let i = 0; i < p.samples.length; i += 15) {
      const s = p.samples[i]!;
      if (s.jumpPart === 2 || s.warp) continue;
      const g = tf.height(s.x, s.z);
      if (s.y - g > 4 && gi.heightAt(s.x, s.z, g + 1, 3) === null) add('pillar', s.x, g, s.z, yawOf(s.tx, s.tz), 1, Math.min(3, Math.floor((s.y - g) / 6)));
    }
  }

  // scatter (THEME scatter=kindA,kindB density=<per 100 m of track>): outside a keep-out corridor
  const scatter = (c.theme.scatter ?? 'tree').split(',').filter((k) => k && k !== 'none');
  const density = num(c.theme.density, 6);
  const main = m.paths[0]!;
  const total = scatter.length ? Math.round((main.length / 100) * density) : 0;
  let placed = 0, tries = 0;
  const allSamples = m.paths.filter((p) => p.kind !== 'rail').flatMap((p) => p.samples.filter((_, i) => i % 3 === 0));
  const keep = (x: number, z: number, minD: number): boolean => {
    for (const s of allSamples) { const d = Math.hypot(s.x - x, s.z - z); if (d < s.w / 2 + Math.max(s.shL, s.shR) + minD) return false; }
    return true;
  };
  while (placed < total && tries < total * 20) {
    tries++;
    const s = main.samples[Math.floor(R() * main.samples.length)]!;
    const side = R() < 0.5 ? -1 : 1;
    const dist = s.w / 2 + Math.max(s.shL, s.shR) + 8 + R() * 70;
    const x = s.x + s.rx * side * dist, z = s.z + s.rz * side * dist;
    const kind = scatter[Math.floor(R() * scatter.length)]!;
    const yaw = R() * Math.PI * 2, scale = 0.7 + R() * 0.8, variant = Math.floor(R() * 4);
    if (!keep(x, z, 6)) continue;
    add(kind, x, groundY(x, z, s.y - 1.5), z, yaw, scale, variant);
    placed++;
  }
  return [...sets.entries()].map(([kind, xf]) => ({ kind, xf }));
}
