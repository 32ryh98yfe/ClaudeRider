// SVG bake preview: plan view (every path, surfaces, walls, s ticks, features) + elevation strip + findings list.
import { SURFACE_IDS } from '@cr/content';
import type { BuildResult } from './build.ts';
import { sampleAt } from './paths.ts';
import { straightRatio } from './validate.ts';

const SURF_COLOR: Record<string, string> = {
  asphalt: '#6b6e76', stone: '#8a8580', cobble: '#9a8672', dirt: '#8f6a45', sand: '#d8b56a', gravel: '#a39a8a', ice: '#bfe3f5', snow: '#f2f5f7',
  grass: '#6a9a4a', wet: '#4d5a6a', wood: '#a2723f', metal: '#9aa3ad', boost_pad: '#2de0c0', jump_pad: '#ff7a8a', conveyor_fwd: '#5aa0e0',
  conveyor_back: '#e07a5a', lava: '#ff5a1f', basalt: '#4b4a4f', obsidian: '#3a3048', glass: '#a8d8e8', rail: '#c0c0c0',
};
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function previewSvg(r: BuildResult): string {
  const m = r.model, meta = r.meta;
  const [x0, , z0, x1, , z1] = meta.bounds;
  const pad = 40, W = Math.max(600, x1 - x0 + 2 * pad), head = 60 + 13 * Math.min(12, r.findings.length), Hplan = z1 - z0 + 2 * pad + head;
  const X = (x: number): string => (x - x0 + pad).toFixed(1), Z = (z: number): string => (z - z0 + pad + head).toFixed(1);
  const stripH = Math.max(140, W * 0.18), H = Hplan + stripH + 60;
  const parts: string[] = [];
  parts.push(`<rect width="100%" height="100%" fill="#1d2b1f"/>`);
  // ground triangles coloured by surface (plan view)
  const g = r.track;
  void g;
  const soupTris: string[] = [];
  for (const sl of r.slots) {
    if (sl.material === 'terrain' || sl.material === 'underside' || sl.material === 'wall') continue;
    const col = sl.material === 'kerb' ? '#e84a3c' : sl.material === 'startline' ? '#ffffff' : sl.material === 'boostpad' ? (sl.variant === 'jump' ? SURF_COLOR.jump_pad! : SURF_COLOR.boost_pad!) : SURF_COLOR[sl.variant] ?? '#777';
    const pts: string[] = [];
    for (let i = 0; i < sl.idx.length; i += 3) {
      const a = sl.idx[i]!, b = sl.idx[i + 1]!, c = sl.idx[i + 2]!;
      pts.push(`M${X(sl.pos[a * 3]!)} ${Z(sl.pos[a * 3 + 2]!)}L${X(sl.pos[b * 3]!)} ${Z(sl.pos[b * 3 + 2]!)}L${X(sl.pos[c * 3]!)} ${Z(sl.pos[c * 3 + 2]!)}Z`);
    }
    soupTris.push(`<path d="${pts.join('')}" fill="${col}" stroke="${col}" stroke-width="0.15"/>`);
  }
  parts.push(...soupTris);
  // walls
  for (const sl of r.slots) {
    if (sl.material !== 'wall') continue;
    const pts: string[] = [];
    for (let i = 0; i < sl.idx.length; i += 3) {
      const a = sl.idx[i]!, b = sl.idx[i + 1]!;
      pts.push(`M${X(sl.pos[a * 3]!)} ${Z(sl.pos[a * 3 + 2]!)}L${X(sl.pos[b * 3]!)} ${Z(sl.pos[b * 3 + 2]!)}`);
    }
    parts.push(`<path d="${pts.join('')}" stroke="#f4efe6" stroke-width="0.6" fill="none" opacity="0.8"/>`);
  }
  // centrelines + s ticks every 100 m on the main line
  for (const p of m.paths) {
    const pts = p.samples.filter((_, i) => i % 3 === 0).map((s) => `${X(s.x)},${Z(s.z)}`).join(' ');
    const col = p.kind === 'main' ? '#ffffff' : p.kind === 'rail' ? '#ffd23f' : '#9ff0ff';
    parts.push(`<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="${p.kind === 'rail' ? 1.2 : 0.6}" stroke-dasharray="${p.kind === 'main' ? '4 4' : '2 2'}"/>`);
    if (p.kind !== 'main') { const s0 = p.samples[Math.floor(p.samples.length / 2)]!; parts.push(`<text x="${X(s0.x)}" y="${Z(s0.z)}" fill="${col}" font-size="9" font-family="sans-serif">${esc(p.id)}</text>`); }
  }
  const main = m.paths[0]!;
  for (let s = 0; s < m.lapLength; s += 100) {
    const q = sampleAt(main, m.closed ? s : s + m.lineS);
    const d = q.w / 2 + 6;
    parts.push(`<line x1="${X(q.x - q.rx * d)}" y1="${Z(q.z - q.rz * d)}" x2="${X(q.x + q.rx * d)}" y2="${Z(q.z + q.rz * d)}" stroke="#ffe08a" stroke-width="0.8"/>`);
    parts.push(`<text x="${X(q.x + q.rx * (d + 3))}" y="${Z(q.z + q.rz * (d + 3))}" fill="#ffe08a" font-size="8" font-family="sans-serif">${s}</text>`);
  }
  // features: key gates, boxes, grid, junction gores, jumps
  for (const k of meta.keyGates) { const q = sampleAt(main, m.closed ? k : k + m.lineS); const d = q.w / 2 + 2; parts.push(`<line x1="${X(q.x - q.rx * d)}" y1="${Z(q.z - q.rz * d)}" x2="${X(q.x + q.rx * d)}" y2="${Z(q.z + q.rz * d)}" stroke="#ff4fd8" stroke-width="1.4"/>`); }
  for (const b of meta.boxes) parts.push(`<circle cx="${X(b.x)}" cy="${Z(b.z)}" r="1.4" fill="#f5c542"/>`);
  for (const p of meta.grid) parts.push(`<circle cx="${X(p.x)}" cy="${Z(p.z)}" r="1.2" fill="#d97757"/>`);
  for (const j of meta.junctions ?? []) if (j.gore) parts.push(`<circle cx="${X(j.gore.x)}" cy="${Z(j.gore.z)}" r="2.2" fill="none" stroke="#ff3030" stroke-width="1"/>`);
  // hazards: kind-coloured markers at their base pose; lane traffic draws its whole run
  const HZC: Record<string, string> = { geyser: '#ff9d2e', press: '#9aa4b1', train: '#7a5cff', traffic: '#2ec4ff', swinger: '#3ddc84' };
  const lanesDrawn = new Set<string>();
  for (const h of meta.hazards) {
    const p = m.paths[h.path]!, q = sampleAt(p, h.s), col = HZC[h.kind] ?? '#fff';
    const x = q.x + q.rx * h.u, z = q.z + q.rz * h.u;
    if (h.motion?.type === 'lane') {
      const key = `${h.group ?? h.id}:${h.u}`;
      if (lanesDrawn.has(key)) continue;
      lanesDrawn.add(key);
      const pts: string[] = [];
      for (let s = h.motion.s0 ?? h.s; s <= (h.motion.s1 ?? h.s); s += 5) { const a = sampleAt(p, s); pts.push(`${X(a.x + a.rx * h.u)},${Z(a.z + a.rz * h.u)}`); }
      parts.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="1.6" stroke-dasharray="3 2"/>`);
    } else parts.push(`<rect x="${X(x - 2)}" y="${Z(z - 2)}" width="4" height="4" fill="${col}" transform="rotate(45 ${X(x)} ${Z(z)})"/>`);
  }
  for (const j of r.content.jumps) { const p = m.paths[j.path]!; const a = sampleAt(p, j.lipS), b = sampleAt(p, j.landS0); parts.push(`<line x1="${X(a.x)}" y1="${Z(a.z)}" x2="${X(b.x)}" y2="${Z(b.z)}" stroke="#ff7a8a" stroke-width="3" stroke-dasharray="1 1"/>`); }
  for (const w of meta.warps) { const a = sampleAt(m.paths[w.path]!, w.s), b = sampleAt(m.paths[w.exitPath]!, w.exitS); parts.push(`<line x1="${X(a.x)}" y1="${Z(a.z)}" x2="${X(b.x)}" y2="${Z(b.z)}" stroke="#b36bff" stroke-width="1.2" stroke-dasharray="6 3"/>`); }

  // elevation strip (main + branches)
  const top = Hplan + 30;
  let yMin = Infinity, yMax = -Infinity;
  for (const p of m.paths) for (const s of p.samples) { yMin = Math.min(yMin, s.y); yMax = Math.max(yMax, s.y); }
  if (yMax - yMin < 4) { yMax += 2; yMin -= 2; }
  const sx = (W - 60) / Math.max(1, main.length), sy = (stripH - 20) / (yMax - yMin);
  parts.push(`<rect x="20" y="${top}" width="${W - 40}" height="${stripH}" fill="#0f1712" stroke="#335"/>`);
  const elev = (p: typeof main, col: string): void => {
    const pts = p.samples.filter((_, i) => i % 2 === 0).map((s) => `${(30 + (p.kind === 'main' ? s.s : s.sMain) * sx).toFixed(1)},${(top + stripH - 10 - (s.y - yMin) * sy).toFixed(1)}`).join(' ');
    parts.push(`<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1"/>`);
  };
  for (const p of m.paths) if (p.kind !== 'rail') elev(p, p.kind === 'main' ? '#9fe870' : '#9ff0ff');
  for (const j of r.content.jumps) if (j.path === 0) parts.push(`<rect x="${(30 + j.lipS * sx).toFixed(1)}" y="${top}" width="${Math.max(1, (j.landS0 - j.lipS) * sx).toFixed(1)}" height="${stripH}" fill="#ff7a8a" opacity="0.25"/>`);
  parts.push(`<text x="26" y="${top + 12}" fill="#9fe870" font-size="10" font-family="sans-serif">elevation ${yMin.toFixed(1)}–${yMax.toFixed(1)} m</text>`);
  const errs = r.findings.filter((f) => f.severity === 'error').length, warns = r.findings.length - errs;
  const title = `${meta.id} · ${meta.lapLength.toFixed(0)} m · D${meta.difficulty} · ${meta.laps} laps · straight ${(straightRatio(m) * 100).toFixed(1)}% · ${m.paths.length} paths · ${errs} errors / ${warns} warnings`;
  parts.push(`<text x="10" y="24" fill="#fff" font-size="16" font-family="sans-serif">${esc(title)}</text>`);
  r.findings.slice(0, 12).forEach((f, i) => parts.push(`<text x="10" y="${44 + i * 13}" fill="${f.severity === 'error' ? '#ff7070' : '#ffd070'}" font-size="10" font-family="monospace">${esc(`${f.rule}${f.s !== undefined ? ' @' + f.s.toFixed(0) : ''}: ${f.msg}`)}</text>`));
  void SURFACE_IDS;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" width="${Math.min(1400, W).toFixed(0)}">\n${parts.join('\n')}\n</svg>`;
}
