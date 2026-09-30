// Track validators V1–V20 (docs/design/11-track-spec.md §9, thresholds from §6–§8).
// Severity policy: structural rules are always errors. Design/placement rules (V5 V6 V9 V10 V13 V14 V19 V20) are
// errors in strict mode — any track that declares `@signature` (every roster track, §13) or `--strict` — and
// warnings otherwise, so M1-era tracks keep baking while their world lane brings them up to the roster rules.
import { SFLAG, TFLAG, type GroundHit, type Contact } from '@cr/sim';
import type { BuildResult } from './build.ts';
import { inSpans } from './build.ts';
import { sampleAt, type PathModel, type Sample, type TrackModel } from './paths.ts';
import { inS } from './content.ts';
import { DEG } from './turtle.ts';

export interface Finding { rule: `V${number}`; severity: 'error' | 'warn'; path?: string; s?: number; msg: string }
export interface GhostData { refLapTicks: number; corners?: { s: number; driftGain: number }[] }
export interface ValidateOptions { strict: boolean; ghost?: GhostData }

export const MIN_R = [0, 30, 22, 16, 12, 9];
export const MIN_W = [0, 15, 14, 12, 12, 11];
export const STRAIGHT_BAND: [number, number][] = [[0, 1], [0.40, 0.55], [0.32, 0.45], [0.25, 0.38], [0.18, 0.30], [0.12, 0.24]];
export const GRADE = [0, 0.08, 0.08, 0.10, 0.12, 0.12];
export const MAX_BANK = [0, 15, 18, 20, 22, 25];
export const V19_N = [0, 3, 4, 5, 7, 9];
export const V_REF = [0, 37, 36, 35, 34, 33];
const G = 28;
const DESIGN_RULES = new Set(['V5', 'V6', 'V9', 'V10', 'V13', 'V14', 'V19', 'V20']);

export function validate(r: BuildResult, o: ValidateOptions): Finding[] {
  const out: Finding[] = [];
  const m = r.model;
  const push = (rule: Finding['rule'], msg: string, s?: number, path?: string, sev: 'error' | 'warn' = 'error'): void => {
    let severity = sev;
    if (severity === 'error' && DESIGN_RULES.has(rule) && !o.strict) severity = 'warn';
    out.push({ rule, severity, msg, ...(s !== undefined ? { s: Math.round(s * 10) / 10 } : {}), ...(path ? { path } : {}) });
  };
  for (const w of m.warnings) push('V18', `line ${w.line}: ${w.msg}`, undefined, undefined, 'warn');
  v1(r, push); v2(r, push); v3(r, push); v4(r, push); v5(r, push); v6(r, push); v7(r, push); v8(r, push);
  v9(r, push); v10(r, push); v11(r, push); v12(r, push); v13(r, push, o); v14(r, push); v15(r, push); v16(r, push);
  v17(r, push); v18(r, push); v19(r, push, o); v20(r, push);
  // V0 (bake report): every @signature feature is present, or its @fallback is recorded as taken
  for (const f of m.ast.signature) {
    if (hasFeature(r, f)) continue;
    const fb = m.ast.fallbacks.find((q) => q.feature === f);
    if (!fb) push('V0', `@signature ${f} is missing and has no @fallback`, undefined, undefined, 'error');
    else { r.meta.fallbacksTaken?.push(f); push('V0', `@signature ${f} missing: fallback "${fb.substitute}" taken (${fb.when})`, undefined, undefined, 'warn'); }
  }
  return out;
}

type Push = (rule: Finding['rule'], msg: string, s?: number, path?: string, sev?: 'error' | 'warn') => void;
const D = (m: TrackModel): number => Math.max(1, Math.min(5, m.difficulty));
const isProving = (m: TrackModel): boolean => m.id === 'proving_ring';

export function hasFeature(r: BuildResult, f: string): boolean {
  const m = r.model, c = r.content;
  switch (f) {
    case 'branch': return m.paths.some((p) => p.kind === 'branch');
    case 'pads': return c.pads.some((p) => p.kind === 'boost');
    case 'surfaces': return m.paths.some((p) => p.prims.some((q) => q.attr.surf !== m.paths[0]!.prims[0]!.attr.surf || q.attr.surfSub.length > 0 || q.attr.shL > 0 || q.attr.shR > 0)) || c.zones.some((z) => z.kind === 'surface');
    case 'conveyor': return c.zones.some((z) => z.kind === 'conveyor');
    case 'jump': return c.jumps.some((j) => !j.legacy) || c.pads.some((p) => p.kind === 'jump');
    case 'kill': return c.killPlanes.length > 0 || c.zones.some((z) => z.kind === 'kill') || c.jumps.some((j) => !j.legacy && j.floor === 'kill') || m.paths.some((p) => p.samples.some((s) => !!s.kill) || p.prims.some((q) => q.attr.wallL.ledgeKill || q.attr.wallR.ledgeKill));
    case 'ledge': return m.paths.some((p) => p.prims.some((q) => q.attr.wallL.type === 'none' || q.attr.wallR.type === 'none'));
    case 'halfpipe': return m.paths.some((p) => p.samples.some((s) => s.profT > 0.5 && m.profiles.get(s.prof)?.kind === 'halfpipe'));
    case 'plaza': return m.paths.some((p) => p.samples.some((s) => !!s.area));
    case 'rail': return m.paths.some((p) => p.kind === 'rail');
    case 'warp': return r.meta.warps.length > 0;
    case 'helix': return m.paths.some((p) => { let acc = 0; for (const q of p.prims) { if (q.kind === 'arc') { acc += q.len * Math.abs(q.k0) / DEG; if (acc >= 359 && Math.abs(q.dy) > 0) return true; } else if (q.len > 1) acc = 0; } return false; });
    case 'stacked': return stackedPairs(r) > 0;
    case 'loop': return m.paths.some((p) => p.prims.some((q) => q.kind === 'loop'));
    case 'zeroG': return m.paths.some((p) => p.samples.some((s) => s.gravMode === 2));
    case 'cloverleaf': return m.ast.stmts.some((s) => s.cmd === 'CLOVERLEAF');
    default:
      if (f.startsWith('hazard:')) return r.meta.hazards.some((h) => h.kind === f.slice(7));
      return true;
  }
}

// ------------------------------------------------------------------------------------------------ V1 closure
function v1(r: BuildResult, push: Push): void {
  const m = r.model;
  if (!m.closed) return;
  const e = Math.hypot(m.closure.dx, m.closure.dz);
  if (e >= 0.05) push('V1', `closure error ${e.toFixed(3)} m (limit 0.05; target < 0.01)`);
  if (Math.abs(m.closure.dpsi) >= 0.1) push('V1', `heading closure ${m.closure.dpsi.toFixed(2)}° (turns must sum to ±360°)`);
  if (Math.abs(m.closure.dy) >= 0.05) push('V1', `elevation does not close (Σdy = ${m.closure.dy.toFixed(2)} m)`);
  const turns = Math.round(m.paths[0]!.turn / 360);
  if (Math.abs(turns) !== 1 && !(Math.abs(turns) === 2 && stackedPairs(r) > 0)) push('V1', `turning number ${turns} (must be ±1, or ±2 when every crossing is stacked)`);
}

// ------------------------------------------------------------------------------------------------ V2 self-overlap
let stackCache: { r: BuildResult; n: number; bad: { s: number; path: string; dy: number }[] } | null = null;
function overlapScan(r: BuildResult): { n: number; bad: { s: number; path: string; dy: number }[] } {
  if (stackCache?.r === r) return stackCache;
  const m = r.model;
  const pts: { p: PathModel; s: Sample; sm: number }[] = [];
  for (const p of m.paths) { if (p.kind === 'rail') continue; for (let i = 0; i < p.samples.length; i += 2) pts.push({ p, s: p.samples[i]!, sm: p.samples[i]!.sMain }); }
  const CS = 16, grid = new Map<number, number[]>();
  const key = (ix: number, iz: number): number => (ix + 10000) * 20000 + iz + 10000;
  pts.forEach((q, i) => { const k = key(Math.floor(q.s.x / CS), Math.floor(q.s.z / CS)); let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(i); });
  const L = m.paths[0]!.length;
  const bad: { s: number; path: string; dy: number }[] = [];
  let stacked = 0;
  const seen = new Set<string>();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const ha = a.s.w / 2 + Math.max(a.s.shL, a.s.shR);
    const ix = Math.floor(a.s.x / CS), iz = Math.floor(a.s.z / CS);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      for (const j of grid.get(key(ix + dx, iz + dz)) ?? []) {
        if (j <= i) continue;
        const b = pts[j]!;
        const hb = b.s.w / 2 + Math.max(b.s.shL, b.s.shR);
        const lim = ha + hb + 0.9 + 1;
        const d2 = (a.s.x - b.s.x) ** 2 + (a.s.z - b.s.z) ** 2;
        if (d2 > lim * lim) continue;
        // graph distance: along one path, or through the progress map
        let gd: number;
        if (a.p === b.p) { gd = Math.abs(a.s.s - b.s.s); if (a.p.closed) gd = Math.min(gd, a.p.length - gd); }
        else { gd = Math.abs(a.sm - b.sm); if (m.closed) gd = Math.min(gd, L - gd); }
        if (gd <= Math.max(40, 2 * Math.max(a.s.w, b.s.w))) continue;
        if (a.s.rmf && b.s.rmf && a.p === b.p) continue; // RMF loop, exempt within its own span
        if ((a.s.flags & SFLAG.BLEND) && (b.s.flags & SFLAG.BLEND)) continue;
        const dy = deckSeparation(a.s, ha, b.s, hb);
        if (dy === Infinity) continue; // the ribbons do not actually overlap at this sample pair
        const tag = `${a.p.index}:${Math.floor(a.s.s / 50)}|${b.p.index}:${Math.floor(b.s.s / 50)}`;
        if (dy >= 8) { if (!seen.has('ok' + tag)) { seen.add('ok' + tag); stacked++; } continue; }
        if (!seen.has(tag)) { seen.add(tag); bad.push({ s: a.s.s, path: a.p.id, dy }); }
      }
    }
  }
  stackCache = { r, n: stacked, bad };
  return stackCache;
}
function stackedPairs(r: BuildResult): number { return overlapScan(r).n; }

/** Vertical deck separation where two cross-sections overlap in plan, or Infinity if they don't.
 *  Probes 5 points across each deck and measures to the other deck's centreline height at the same plan point
 *  (within ±1.25 m along it; the scan samples every 2 m). Bank is left out on purpose: the 8 m rule and the gap-3
 *  design numbers are centreline separations. Plain centreline-to-centreline dy of nearby samples was too pessimistic
 *  for helices, where two turns 20° apart are "close" in plan but never stacked at the same plan point. */
function deckSeparation(a: Sample, ha: number, b: Sample, hb: number): number {
  let best = Infinity;
  const probe = (p: Sample, hp: number, q: Sample, hq: number): void => {
    for (let k = -2; k <= 2; k++) {
      const u = (hp * k) / 2;
      const px = p.x + p.rx * u, py = p.y, pz = p.z + p.rz * u;
      const dx = px - q.x, dz = pz - q.z;
      // plan coordinates in q's frame (tangent and right projected onto the ground plane)
      const tl = Math.hypot(q.tx, q.tz) || 1, rl = Math.hypot(q.rx, q.rz) || 1;
      const along = (dx * q.tx + dz * q.tz) / tl, lat = (dx * q.rx + dz * q.rz) / rl;
      if (Math.abs(along) > 1.25 || Math.abs(lat) > hq) continue;
      const qy = q.y + (q.ty / tl) * along;
      const d = Math.abs(py - qy);
      if (d < best) best = d;
    }
  };
  probe(a, ha, b, hb);
  probe(b, hb, a, ha);
  return best;
}
function v2(r: BuildResult, push: Push): void {
  for (const b of overlapScan(r).bad.slice(0, 8)) push('V2', `footprints overlap with only ${b.dy.toFixed(1)} m vertical separation (need ≥ 8 m)`, b.s, b.path);
}

// ------------------------------------------------------------------------------------------------ V3 radius
function v3(r: BuildResult, push: Push): void {
  const m = r.model, d = D(m);
  for (const p of m.paths) {
    if (p.kind === 'rail') continue;
    const lim = p.kind === 'main' ? MIN_R[d]! : 0.8 * MIN_R[d]!;
    for (const q of p.prims) {
      if (q.kind !== 'arc' && q.kind !== 'clothoid') continue;
      const R = 1 / Math.max(Math.abs(q.k0), Math.abs(q.k1));
      const s = p.index === 0 ? m.toMain(q.s0) : q.s0;
      if (R < lim - 1e-6) push('V3', `radius ${R.toFixed(1)} m below the D${d} ${p.kind === 'main' ? 'minimum' : 'branch minimum'} ${lim.toFixed(1)} m (line ${q.line})`, s, p.id);
      const w = q.attr.prof !== 'flat' ? (m.profiles.get(q.attr.prof)?.width || q.attr.w) : q.attr.w;
      if (R - w / 2 < 3 - 1e-6) push('V3', `inner edge radius ${(R - w / 2).toFixed(1)} m < 3 m (R ${R.toFixed(1)}, w ${w}) (line ${q.line})`, s, p.id);
    }
  }
}

// ------------------------------------------------------------------------------------------------ V4 width
function v4(r: BuildResult, push: Push): void {
  const m = r.model, d = D(m);
  if (m.blend < 15) push('V4', `DEFAULTS blend=${m.blend}: attribute blends must be ≥ 15 m`);
  for (const p of m.paths) {
    if (p.kind === 'rail') continue;
    for (const q of p.prims) {
      if (q.attr.warp) continue;
      const w = q.attr.prof !== 'flat' && m.profiles.get(q.attr.prof)?.kind !== 'flat' ? m.profiles.get(q.attr.prof)!.width : q.attr.w;
      const s = p.index === 0 ? m.toMain(q.s0) : q.s0;
      const corner = (q.kind === 'arc' || q.kind === 'clothoid') && Math.max(Math.abs(q.k0), Math.abs(q.k1)) > 1 / 150;
      if (p.kind === 'branch') { if (w < 7 - 1e-6) push('V4', `branch width ${w} m < 7 m (line ${q.line})`, s, p.id); continue; }
      if (corner && w < 11 - 1e-6) push('V4', `corner width ${w} m < 11 m (line ${q.line})`, s, p.id);
      else if (!corner && w < 9 - 1e-6) push('V4', `width ${w} m < 9 m (line ${q.line})`, s, p.id);
      else if (!corner && w < MIN_W[d]! - 1e-6 && q.len >= 60) push('V4', `width ${w} m below the D${d} band minimum ${MIN_W[d]} m on a straight ≥ 60 m (line ${q.line})`, s, p.id);
      else if (corner && w < MIN_W[d]! - 1e-6) push('V4', `corner width ${w} m below the D${d} band minimum ${MIN_W[d]} m (line ${q.line})`, s, p.id);
      if (corner && w > 18 + 1e-6 && !q.attr.area && q.attr.prof === 'flat') push('V4', `corner width ${w} m > 18 m makes the corner flat-out on grip (line ${q.line})`, s, p.id, 'warn');
    }
  }
}

// ------------------------------------------------------------------------------------------------ V5 grades
function v5(r: BuildResult, push: Push): void {
  const m = r.model, d = D(m);
  for (const p of m.paths) {
    if (p.kind === 'rail') continue;
    const S = p.samples, n = S.length;
    const lim = GRADE[d]! + (!m.closed && p.kind === 'main' && d === 5 ? 0.03 : 0);
    let reported = -1e9;
    const exempt = (s: Sample): boolean => s.jumpPart > 0 || s.rmf || !!s.warp;
    for (let i = 0; i + 30 < n; i += 3) {
      const a = S[i]!, b = S[i + 30]!;
      if (exempt(a) || exempt(b) || S.slice(i, i + 31).some(exempt)) continue;
      const g = (b.y - a.y) / Math.max(1e-6, b.s - a.s);
      const downhillP2P = !m.closed && p.kind === 'main' && g < 0 && d === 5;
      if (Math.abs(g) > (downhillP2P ? 0.15 : lim) + 1e-4 && a.s - reported > 60) { reported = a.s; push('V5', `sustained grade ${(g * 100).toFixed(1)}% over 30 m (D${d} limit ${(lim * 100).toFixed(0)}%)`, a.s, p.id); }
    }
    for (let i = 0; i + 12 < n; i += 2) {
      const a = S[i]!, b = S[i + 12]!;
      if (S.slice(i, i + 13).some((s) => s.rmf || !!s.warp || s.jumpPart === 2)) continue;
      const g = (b.y - a.y) / Math.max(1e-6, b.s - a.s);
      if (Math.abs(g) > 0.3 + 1e-4) { push('V5', `ramp grade ${(g * 100).toFixed(0)}% over 12 m exceeds 30%`, a.s, p.id); break; }
    }
    const crest = (40 * 40) / (0.8 * G);
    let lastC = -1e9;
    for (let i = 3; i + 3 < n; i++) {
      const a = S[i - 3]!, b = S[i]!, c = S[i + 3]!;
      if (exempt(a) || exempt(b) || exempt(c)) continue;
      const h = (c.s - a.s) / 2;
      const ypp = (c.y - 2 * b.y + a.y) / (h * h);
      if (Math.abs(ypp) < 1e-9) continue;
      const Rv = 1 / Math.abs(ypp);
      if (b.s - lastC < 40) continue;
      if (ypp < 0 && Rv < crest) { lastC = b.s; push('V5', `crest vertical radius ${Rv.toFixed(0)} m < ${crest.toFixed(0)} m (karts go light at 40 m/s)`, b.s, p.id); }
      if (ypp > 0 && Rv < 30) { lastC = b.s; push('V5', `sag vertical radius ${Rv.toFixed(0)} m < 30 m`, b.s, p.id); }
    }
  }
}

// ------------------------------------------------------------------------------------------------ V6 bank
function v6(r: BuildResult, push: Push): void {
  const m = r.model, d = D(m);
  for (const p of m.paths) {
    let lastRate = -1e9, lastMax = -1e9;
    for (let i = 1; i < p.samples.length; i++) {
      const a = p.samples[i - 1]!, b = p.samples[i]!;
      const rate = Math.abs(b.bank - a.bank) / Math.max(1e-6, b.s - a.s);
      if (rate > 1.5 + 1e-6 && b.s - lastRate > 50) { lastRate = b.s; push('V6', `bank rate ${rate.toFixed(2)}°/m > 1.5°/m`, b.s, p.id); }
      if (Math.abs(b.bank) > MAX_BANK[d]! + 1e-6 && b.s - lastMax > 50) { lastMax = b.s; push('V6', `bank ${b.bank.toFixed(1)}° above the D${d} maximum ${MAX_BANK[d]}°`, b.s, p.id); }
    }
  }
}

// ------------------------------------------------------------------------------------------------ V7 frames
function v7(r: BuildResult, push: Push): void {
  for (const p of r.model.paths) {
    for (const s of p.samples) if (s.frameReq === 1 && Math.abs(s.ty) > 0.9) { push('V7', 'frame=worldUp where |T·Y| > 0.9 (use frame=rmf or leave frame auto)', s.s, p.id); break; }
  }
}

// ------------------------------------------------------------------------------------------------ V8 gates
function v8(r: BuildResult, push: Push): void {
  const m = r.model, keys = r.meta.keyGates;
  if (keys.length < 6) push('V8', `only ${keys.length} key gates (need ≥ 6)`);
  const spans: [number, number][] = [];
  const L = m.paths[0]!.length;
  for (const p of m.paths) if (p.map && p.map.host === 0) { const a = p.hostFrom; let b = p.hostTo; if (m.closed && b < a) b += L; spans.push([a, b]); }
  for (const w of r.meta.warps) if (w.path === 0 && w.exitPath === 0) spans.push([Math.min(w.s, w.exitS), Math.max(w.s, w.exitS)]);
  for (const j of r.junctions) if (j.host === 0) spans.push([j.hostS0, j.hostS1]);
  for (const k of keys) {
    const s = m.closed ? k : k + m.lineS;
    if (inSpans(m, s, spans)) push('V8', `key gate at ${k.toFixed(1)} lies inside a branch, rail, warp or junction span`, k);
  }
  const gates = r.meta.gates ?? [];
  for (let i = 1; i < gates.length; i++) if (gates[i]!.s - gates[i - 1]!.s > 30 + 1e-6) { push('V8', 'ordinary gates are more than 30 m apart'); break; }
}

// ------------------------------------------------------------------------------------------------ V9 item rows
function apexes(m: TrackModel, rMax: number): number[] {
  const out: number[] = [];
  const p = m.paths[0]!;
  for (const q of p.prims) if ((q.kind === 'arc' || q.kind === 'clothoid') && 1 / Math.max(Math.abs(q.k0), Math.abs(q.k1)) < rMax) out.push(m.toMain(q.s0 + q.len / 2));
  return out;
}
function circDist(m: TrackModel, a: number, b: number): number {
  let d = Math.abs(a - b);
  if (m.closed) d = Math.min(d, m.paths[0]!.length - d);
  return d;
}
function v9(r: BuildResult, push: Push): void {
  const m = r.model, c = r.content;
  const rows = c.items;
  if (!rows.length) { push('V9', 'no item rows (every track needs them; hidden in speed mode)'); return; }
  const L = m.lapLength;
  const want = Math.round(L / 250);
  const mainRows = rows.filter((q) => q.path === 0);
  if (mainRows.length < want - 1 || mainRows.length > want + 1) push('V9', `${mainRows.length} item rows on the main line; want ${want} ± 1 (≈ L/250)`);
  const sm = (q: { s: number }): number => (m.closed ? q.s : q.s - m.lineS);
  const sorted = [...mainRows].sort((a, b) => sm(a) - sm(b));
  if (sorted.length && sm(sorted[0]!) < 60 - 1e-6) push('V9', `first item row ${sm(sorted[0]!).toFixed(0)} m after the line (need ≥ 60 m)`, sorted[0]!.s);
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!, b = sorted[(i + 1) % sorted.length]!;
    if (sorted.length > 1 && (i + 1 < sorted.length || m.closed)) {
      let gap = sm(b) - sm(a); if (gap <= 0) gap += L;
      if (gap < 150 - 1e-6) push('V9', `item rows only ${gap.toFixed(0)} m apart (need ≥ 150 m)`, a.s);
    }
  }
  const tight = apexes(m, 30);
  for (const row of rows) {
    const p = m.paths[row.path]!;
    const smp = sampleAt(p, row.s);
    if (row.n < 4 || row.n > 6) push('V9', `item row of ${row.n} boxes (rows hold 4–6)`, row.s, p.id);
    if (row.span > smp.w - 3 + 1e-6) push('V9', `item row spans ${row.span.toFixed(1)} m on a ${smp.w.toFixed(1)} m road (keep 1.5 m clear each side)`, row.s, p.id);
    if (row.path === 0) for (const ap of tight) if (circDist(m, row.s, ap) < 20) push('V9', `item row ${circDist(m, row.s, ap).toFixed(0)} m from the apex of an R < 30 corner (need ≥ 20 m)`, row.s);
    const wideArea = !!smp.area && smp.w >= 24;
    if (!wideArea) for (let ds = -10; ds <= 10; ds += 1) {
      const q = sampleAt(p, row.s + ds);
      if (Math.abs(q.curv) > 1 / 60 + 1e-9) { push('V9', `local radius ${(1 / Math.abs(q.curv)).toFixed(0)} m < 60 m within ±10 m of the item row`, row.s, p.id); break; }
    }
    if (smp.flags & SFLAG.BLEND) push('V9', 'item row inside a junction blend', row.s, p.id);
    if (smp.flags & SFLAG.RAIL) push('V9', 'item row on a rail span', row.s, p.id);
    for (const j of c.jumps) if (j.path === row.path && inS(m, row.path, row.s, j.s0, j.landS1)) push('V9', 'item row on a jump ramp or landing', row.s, p.id);
    for (const h of r.meta.hazards) if (h.path === row.path && circDist(m, h.s, row.s) < 15) { push('V9', 'item row within ±15 m of a hazard', row.s, p.id); break; }
  }
}

// ------------------------------------------------------------------------------------------------ V10 boost pads
function v10(r: BuildResult, push: Push): void {
  const m = r.model, c = r.content, track = r.track;
  const boost = c.pads.filter((p) => p.kind === 'boost' && p.path === 0);
  if (boost.length && (boost.length < 2 || boost.length > Math.max(4, Math.round(m.lapLength / 200)))) push('V10', `${boost.length} boost pads per lap (standard 2–4; boost-heavy ≈ 1 per 200 m)`, undefined, undefined, 'warn');
  const tight = apexes(m, 30);
  const cs: Contact[] = Array.from({ length: 4 }, () => ({ x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, depth: 0, flags: 0, tri: 0 }));
  for (const pd of c.pads) {
    const p = m.paths[pd.path]!;
    if (pd.path === 0) for (const ap of tight) if (circDist(m, pd.s0, ap) < 15 || circDist(m, pd.s1, ap) < 15) push('V10', 'pad within 15 m of the apex of an R < 30 corner', pd.s0);
    for (const j of c.jumps) if (j.path === pd.path && pd.kind === 'boost' && (inS(m, pd.path, pd.s0, j.landS0, j.landS1) || inS(m, pd.path, pd.s1, j.landS0, j.landS1))) push('V10', 'boost pad in a jump landing zone', pd.s0, p.id);
    if (pd.kind !== 'boost') continue;
    // no wall ahead within 2 s × 44.4 m/s: march straight along the pad's tangent at kart height
    const q = sampleAt(p, pd.s1);
    const d = (pd.d0 + pd.d1) / 2;
    const ox = q.x + q.rx * d + q.ux * 0.8, oy = q.y + q.ry * d + q.uy * 0.8, oz = q.z + q.rz * d + q.uz * 0.8;
    for (let t = 2; t <= 88.8; t += 1) {
      const n = track.sphereWalls(ox + q.tx * t, oy + q.ty * t, oz + q.tz * t, 0.6, cs, 4);
      if (n > 0) { push('V10', `wall ${t.toFixed(0)} m straight ahead of the boost pad (need ≥ 89 m = 2 s at 44.4 m/s)`, pd.s0, p.id); break; }
    }
  }
}

// ------------------------------------------------------------------------------------------------ V11 jumps
export function landingDistance(v: number, lipDeg: number, dropBelowLip: number): number {
  const a = lipDeg * DEG, vx = v * Math.cos(a), vy = v * Math.sin(a);
  const t = (vy + Math.sqrt(vy * vy + 2 * G * dropBelowLip)) / G;
  return vx * t;
}
function v11(r: BuildResult, push: Push): void {
  const m = r.model;
  for (const j of r.content.jumps) {
    if (j.legacy) continue;
    const p = m.paths[j.path]!;
    const lip = sampleAt(p, j.lipS), land = sampleAt(p, j.landS0 + 0.5);
    const lipAng = Math.atan2(lip.ty, Math.hypot(lip.tx, lip.tz)) / DEG;
    const drop = lip.y - land.y;
    const lo = j.gapLen + 2, hi = j.gapLen + j.landLen - 5;
    for (let k = 0; k <= 10; k++) {
      const v = j.vMin + ((j.vMax - j.vMin) * k) / 10;
      const x = landingDistance(v, lipAng, drop);
      if (x < lo - 1e-6 || x > hi + 1e-6) { push('V11', `at ${v.toFixed(0)} m/s the kart lands ${x.toFixed(1)} m past the lip; landing window is ${lo.toFixed(0)}–${hi.toFixed(0)} m (line ${j.line})`, j.lipS, p.id); break; }
    }
    if (j.landLen < 40 - 1e-6) push('V11', `landing zone ${j.landLen} m < 40 m (line ${j.line})`, j.lipS, p.id);
    if (j.landW < p.samples[0]!.w - 1e-6 && j.landW > 0 && j.landW < sampleAt(p, j.s0).w - 1e-6) push('V11', `landing narrower (${j.landW} m) than the road (line ${j.line})`, j.lipS, p.id);
    for (let s = j.landS0; s < j.landS1; s += 2) { const q = sampleAt(p, s); if (Math.abs(q.curv) > 1 / 80 + 1e-9) { push('V11', 'landing zone radius < 80 m', s, p.id); break; } if (Math.abs(q.ty) > 0.0995) { push('V11', 'landing grade beyond ±10%', s, p.id); break; } }
  }
}

// ------------------------------------------------------------------------------------------------ V12 hazards
function v12(r: BuildResult, push: Push): void {
  const m = r.model;
  const groups = new Map<number, typeof r.meta.hazards>();
  for (const h of r.meta.hazards) { const g = h.group ?? h.id; let l = groups.get(g); if (!l) groups.set(g, (l = [])); l.push(h); }
  for (const hs of groups.values()) {
    const h = hs[0]!;
    const p = m.paths[h.path]!;
    if (h.periodTicks < 120) push('V12', `hazard ${h.name ?? h.id}: period ${h.periodTicks} ticks < 120 (2.0 s)`, h.s, p.id);
    const active = h.activeTo - h.activeFrom;
    const always = h.kind === 'traffic' || h.kind === 'swinger' || h.motion?.type === 'rotate';
    if (!always && active > h.periodTicks / 2 + 1e-6) push('V12', `hazard ${h.name ?? h.id}: active ${active} of ${h.periodTicks} ticks (> 50%)`, h.s, p.id);
    if (!always && h.telegraphTicks < 36) push('V12', `hazard ${h.name ?? h.id}: telegraph ${h.telegraphTicks} ticks < 36 (0.6 s)`, h.s, p.id);
    if (h.kind === 'traffic') {
      // at least one lane-sized corridor across the road stays clear of every traffic lane
      const smp = sampleAt(p, h.s);
      const lanes = hs.map((x) => ({ u: x.u, half: x.size[1]! / 2 + 1 }));
      let clear = false;
      for (let u = -smp.w / 2 + 1.5; u <= smp.w / 2 - 1.5; u += 0.25) if (lanes.every((l) => Math.abs(u - l.u) > l.half + 1.5)) { clear = true; break; }
      if (!clear) push('V12', `hazard ${h.name ?? h.id}: traffic leaves no safe lane`, h.s, p.id);
    }
    // lane traffic occupies its whole run, everything else its own s
    const s0 = h.motion?.type === 'lane' ? h.motion.s0 ?? h.s : h.s, s1 = h.motion?.type === 'lane' ? h.motion.s1 ?? h.s : h.s;
    const near = (s: number, pad: number): boolean => inS(m, h.path, s, s0 - pad, s1 + pad);
    for (const row of r.content.items) if (row.path === h.path && near(row.s, 15)) { push('V12', `hazard ${h.name ?? h.id} within ±15 m of an item row`, h.s, p.id); break; }
    for (const j of r.content.jumps) if (j.path === h.path && near(j.lipS, 20)) { push('V12', `hazard ${h.name ?? h.id} within ±20 m of a jump lip`, h.s, p.id); break; }
  }
}

// ------------------------------------------------------------------------------------------------ V13 timing
function v13(r: BuildResult, push: Push, o: ValidateOptions): void {
  const m = r.model;
  const ticks = o.ghost?.refLapTicks ?? r.meta.refLapTicks;
  if (!ticks) return;
  const ref = ticks / 60;
  const want = Math.max(1, Math.min(5, Math.round(115 / ref)));
  if (want !== m.laps) push('V13', `laps=${m.laps} but the ghost lap ${ref.toFixed(1)} s gives clamp(round(115/ref)) = ${want}`);
  const race = ref * m.laps;
  if (!isProving(m) && (race < 100 || race > 130)) push('V13', `reference race ${race.toFixed(0)} s outside 100–130 s`);
  const table = m.lapLength / V_REF[D(m)]!;
  if (Math.abs(ref - table) / table > 0.08) push('V13', `ghost lap ${ref.toFixed(1)} s is ${(((ref - table) / table) * 100).toFixed(0)}% off the table value ${table.toFixed(1)} s (L / v_ref(D), ±8%)`);
}

// ------------------------------------------------------------------------------------------------ V14 straight ratio
export function straightRatio(m: TrackModel): number {
  const p = m.paths[0]!;
  let straight = 0, total = 0;
  for (const s of p.samples.slice(0, p.samples.length - 1)) {
    if (s.jumpPart > 0 || s.warp || (s.flags & SFLAG.RAIL)) continue;
    if (!m.closed && (s.s < m.lineS || s.s > m.lineS + m.lapLength)) continue;
    total += p.step;
    if (Math.abs(s.curv) <= 1 / 150 + 1e-12) straight += p.step;
  }
  return total > 0 ? straight / total : 0;
}
function v14(r: BuildResult, push: Push): void {
  const m = r.model, [lo, hi] = STRAIGHT_BAND[D(m)]!;
  const ratio = straightRatio(m);
  if (ratio < lo - 1e-9 || ratio > hi + 1e-9) push('V14', `straight ratio ${(ratio * 100).toFixed(1)}% outside the D${D(m)} band ${(lo * 100).toFixed(0)}–${(hi * 100).toFixed(0)}%`, undefined, undefined, isProving(m) ? 'warn' : 'error');
}

// ------------------------------------------------------------------------------------------------ V15 respawn
function v15(r: BuildResult, push: Push): void {
  const m = r.model, track = r.track;
  const hit: GroundHit = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, surf: 0, tri: 0, flags: 0 };
  for (const p of m.paths) {
    if (p.kind === 'rail') continue;
    let missing = 0, first = -1;
    for (const s of p.samples) {
      if (s.flags & (SFLAG.JUMP | SFLAG.WARP | SFLAG.NO_GROUND)) continue;
      if (!track.groundRay(s.x + s.ux, s.y + s.uy, s.z + s.uz, -s.ux, -s.uy, -s.uz, 2, hit)) { missing++; if (first < 0) first = s.s; }
    }
    if (missing) push('V15', `${missing} samples have no ground and are not in a declared jump/warp span`, first, p.id);
    const rok = r.track.respawnOk ? p.samples.filter((_, i) => r.track.respawnOk!(p.index, i)).length : p.samples.length;
    if (p.kind === 'main' && rok < p.samples.length * 0.8) push('V15', `only ${((rok / p.samples.length) * 100).toFixed(0)}% of main samples are valid respawn slots`, undefined, p.id, 'warn');
  }
}

// ------------------------------------------------------------------------------------------------ V16 areas
function v16(r: BuildResult, push: Push): void {
  for (const q of r.areaReports) {
    if (!q.ok) push('V16', `AREA ${q.id} does not triangulate`);
    if (!q.guideInside) push('V16', `AREA ${q.id}: its guide path leaves the area`);
    if (Math.abs(q.dy) > 0.3) push('V16', `AREA ${q.id}: guide path height differs from the area by ${q.dy.toFixed(2)} m`);
  }
}

// ------------------------------------------------------------------------------------------------ V17 rails
function v17(r: BuildResult, push: Push): void {
  const m = r.model;
  for (const p of m.paths) {
    if (p.kind !== 'rail' || !p.rail) continue;
    const host = m.paths[p.rail.host]!;
    const end = p.samples[p.samples.length - 1]!, hq = sampleAt(host, p.rail.hostTo);
    const dot = end.tx * hq.tx + end.ty * hq.ty + end.tz * hq.tz;
    const err = Math.acos(Math.max(-1, Math.min(1, dot))) / DEG;
    if (err > 5 + 1e-6) push('V17', `rail ${p.id}: exit tangent error ${err.toFixed(1)}° > 5°`, p.rail.hostTo, host.id);
    const tMin = (p.length / p.rail.speed.max) * 60, tMax = (p.length / p.rail.speed.min) * 60;
    if (tMin < 48 - 1e-6 || tMax > 180 + 1e-6) push('V17', `rail ${p.id}: lock time ${tMin.toFixed(0)}–${tMax.toFixed(0)} ticks outside 48–180`, p.rail.hostFrom, host.id);
    const st = p.samples[0]!, hs = sampleAt(host, p.rail.hostFrom);
    const u = (st.x - hs.x) * hs.rx + (st.y - hs.y) * hs.ry + (st.z - hs.z) * hs.rz;
    const h = (st.x - hs.x) * hs.ux + (st.y - hs.y) * hs.uy + (st.z - hs.z) * hs.uz;
    if (Math.abs(u) > hs.w / 2 + p.rail.capture.dMax || h > 2.5 || h < -0.5) push('V17', `rail ${p.id}: entry (d ${u.toFixed(1)}, h ${h.toFixed(1)}) is not reachable from the road`, p.rail.hostFrom, host.id);
  }
}

// ------------------------------------------------------------------------------------------------ V18 branches
function v18(r: BuildResult, push: Push): void {
  const m = r.model;
  const branches = m.paths.filter((p) => p.kind === 'branch');
  const L = m.paths[0]!.length;
  for (const b of branches) {
    if (!b.map) continue;
    if (b.residual && Math.abs(b.residual.dpsi) > 5) push('V18', `branch ${b.id}: rejoin tangent error ${Math.abs(b.residual.dpsi).toFixed(1)}° > 5° (the branch's turns must match the host's heading change)`, b.hostTo, b.id);
    if (b.aiMinSkill < 0 || b.aiMinSkill > 1) push('V18', `branch ${b.id}: aiMin ${b.aiMinSkill} outside [0, 1]`, b.hostFrom, b.id);
    let span = b.map.toS - b.map.fromS; if (m.closed && span < 0) span += L;
    const saved = span - b.length;
    if (saved > 0.08 * m.lapLength) push('V18', `branch ${b.id}: saves ${saved.toFixed(0)} m (> 8% of the lap)`, b.hostFrom, b.id);
    const hA = sampleAt(m.paths[0]!, b.hostFrom), hB = sampleAt(m.paths[0]!, b.hostTo);
    if (Math.abs(hA.bank) > 4 || Math.abs(hB.bank) > 4) push('V18', `branch ${b.id}: host bank > 4° at a junction makes the surfaces step`, b.hostFrom, b.id, 'warn');
  }
  // ≥ 1 key gate between consecutive branches
  const keys = r.meta.keyGates.map((k) => (m.closed ? k : k + m.lineS));
  const sorted = branches.filter((b) => b.map).sort((a, b) => a.hostFrom - b.hostFrom);
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!, b = sorted[(i + 1) % sorted.length]!;
    if (sorted.length < 2 || (i + 1 === sorted.length && !m.closed)) continue;
    const s0 = a.hostTo; let s1 = b.hostFrom; if (s1 < s0) s1 += L;
    if (!keys.some((k) => inS(m, 0, k, s0, s1))) push('V18', `no key gate between branch ${a.id} and branch ${b.id}`, a.hostTo);
  }
}

// ------------------------------------------------------------------------------------------------ V19 drift demand
/** gap-2 validated envelope (ADR-012 #16): grip radius needed to hold speed v, and drift radius with no net loss. */
const GRIP_ENV: [number, number][] = [[15, 14.7], [20, 21], [25, 29], [30, 39.5], [34, 50], [44.4, 86]];
const DRIFT_ENV: [number, number][] = [[15, 11], [20, 14], [25, 21], [30, 26], [34, 47], [44.4, 80]];
function speedFor(env: [number, number][], R: number): number {
  if (R <= env[0]![1]) return env[0]![0] * Math.sqrt(R / env[0]![1]);
  for (let i = 1; i < env.length; i++) if (R <= env[i]![1]) { const [v0, r0] = env[i - 1]!, [v1, r1] = env[i]!; return v0 + ((v1 - v0) * (R - r0)) / (r1 - r0); }
  return 99;
}
export interface CornerInfo { s: number; deg: number; R: number; w: number; RL: number; gain: number }
export function corners(m: TrackModel): CornerInfo[] {
  const p = m.paths[0]!, out: CornerInfo[] = [];
  let cur: { s: number; deg: number; R: number; w: number; sign: number; len: number } | null = null;
  const flush = (): void => {
    if (!cur) return;
    const Rc = cur.R, W = cur.w, dl = Math.min(cur.deg, 180) * DEG;
    const Ro = Rc + W / 2 - 1.5, Ri = Rc - W / 2 + 1.5;
    const RL = cur.deg >= 180 ? Ro : (Ro - Ri * Math.cos(dl / 2)) / (1 - Math.cos(dl / 2));
    const vIn = 34; // V_GRIP entry (a Pro ghost carries more with boosts; the ghost-based V19 refines this)
    const vg = Math.min(vIn, speedFor(GRIP_ENV, RL)), vd = Math.min(vIn, speedFor(DRIFT_ENV, RL) * 1.0 + 0);
    const arc = RL * dl;
    const accelLoss = (v0: number): number => { let t = 0; for (let v = v0; v < vIn - 0.05; v += 0.1) { const a = 18 * (1 - v / 35); t += 0.1 / Math.max(0.5, a) - (0.1 / Math.max(0.5, a)) * (v / vIn); } return t; };
    const gain = vg >= vIn ? 0 : arc / vg - arc / Math.max(vg, vd) + accelLoss(vg) - accelLoss(Math.max(vg, vd));
    out.push({ s: cur.s, deg: cur.deg, R: Rc, w: W, RL, gain });
    cur = null;
  };
  for (const q of p.prims) {
    const k = Math.max(Math.abs(q.k0), Math.abs(q.k1));
    if ((q.kind === 'arc' || q.kind === 'clothoid') && k > 1 / 150) {
      const sign = Math.sign(q.k0 + q.k1), deg = (q.len * ((Math.abs(q.k0) + Math.abs(q.k1)) / 2)) / DEG;
      if (cur && cur.sign === sign) { cur.deg += deg; cur.R = Math.min(cur.R, 1 / k); cur.len += q.len; }
      else { flush(); cur = { s: m.toMain(q.s0), deg, R: 1 / k, w: q.attr.w, sign, len: q.len }; }
    } else if (q.len > 20 || q.kind !== 'line') flush();
  }
  flush();
  return out;
}
function v19(r: BuildResult, push: Push, o: ValidateOptions): void {
  const m = r.model;
  if (isProving(m)) return;
  const need = V19_N[D(m)]!;
  const measured = o.ghost?.corners;
  const n = measured ? measured.filter((c) => c.driftGain >= 0.1).length : corners(m).filter((c) => c.gain >= 0.1).length;
  if (n < need) push('V19', `${n} corners where drift beats grip by ≥ 0.1 s (${measured ? 'ghost' : 'analytic envelope estimate'}); D${D(m)} needs ${need}`, undefined, undefined, measured ? 'error' : 'warn');
}

// ------------------------------------------------------------------------------------------------ V20 render budget
export const V20_TIERS = { low: { groups: 8, tris: 20000, draws: 70, visTris: 350000 }, medium: { groups: 10, tris: 30000, draws: 140, visTris: 800000 }, high: { groups: 12, tris: 40000, draws: 250, visTris: 1400000 } } as const;
function v20(r: BuildResult, push: Push): void {
  const vm = r.visMeta;
  const mats = new Set(vm.slots.map((s) => s.name));
  if (mats.size > 24) push('V20', `${mats.size} unique track material slots (≤ 24)`);
  for (const ch of vm.chunks ?? []) {
    if (ch.kind === 'terrain') continue;
    if (ch.groups.length > V20_TIERS.low.groups) { push('V20', `chunk ${ch.id} has ${ch.groups.length} draw groups (Low ≤ ${V20_TIERS.low.groups})`, ch.s0); break; }
    if (ch.tris > V20_TIERS.low.tris) { push('V20', `chunk ${ch.id} has ${ch.tris} triangles (Low ≤ ${V20_TIERS.low.tris})`, ch.s0); break; }
  }
  const pvs = (r as BuildResult & { pvsWorst?: { draws: number; tris: number } }).pvsWorst;
  if (pvs) {
    if (pvs.draws > V20_TIERS.low.draws) push('V20', `worst visible static set ${pvs.draws} draws (Low ≤ ${V20_TIERS.low.draws})`);
    if (pvs.tris > V20_TIERS.low.visTris) push('V20', `worst visible static set ${pvs.tris} triangles (Low ≤ ${V20_TIERS.low.visTris})`);
  }
  void TFLAG;
}
