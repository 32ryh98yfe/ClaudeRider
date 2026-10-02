// Whole-lap survey camera set for any baked track (companion to autoviews.ts, which covers start → first corner).
// One approach view per corner (60 m before the turn-in, looking at the turn-in + 28 m, the b1 framing) and a
// high outside view of its apex, plus a chase view on every long straight, all frozen at one tick so props,
// karts and lighting are comparable between before and after.
// Usage: node tools/shots/lapviews.ts <trackId> <out.json> [maxCorners=10] [freezeTick=700]
import { writeFileSync, readFileSync } from 'node:fs';
import { loadCtrk, type FrameSample } from '@cr/sim';

const [id, out, maxArg, tickArg] = process.argv.slice(2);
if (!id || !out) { console.error('usage: lapviews.ts <trackId> <out.json> [maxCorners] [freezeTick]'); process.exit(2); }
const maxCorners = Number(maxArg ?? 10), tick = Number(tickArg ?? 700);
const buf = readFileSync(`apps/client/public/tracks/${id}.ctrk`);
const t = loadCtrk(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const f: FrameSample = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 1, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 };
const L = t.path(0).length;
const at = (s: number): FrameSample => { t.frameAt(0, ((s % L) + L) % L, f); return { ...f }; };
const r2 = (v: number): number => Math.round(v * 100) / 100;
const STEP = 2;
const yawAt = (s: number): number => { const a = at(s); return Math.atan2(a.tx, a.tz); };
const turn = (s: number): number => { let d = yawAt(s + STEP) - yawAt(s); while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d / STEP; };

// corner spans: |turn| ≥ 1/70 rad/m opens a corner, < 1/90 closes it; spans closer than 30 m merge (S-bends)
const spans: { s0: number; s1: number }[] = [];
let open = -1;
for (let s = 0; s < L; s += STEP) {
  const k = Math.abs(turn(s));
  if (open < 0 && k >= 1 / 70) open = s;
  else if (open >= 0 && k < 1 / 90) { spans.push({ s0: open, s1: s }); open = -1; }
}
if (open >= 0) spans.push({ s0: open, s1: L });
const merged: { s0: number; s1: number }[] = [];
for (const sp of spans) { const last = merged[merged.length - 1]; if (last && sp.s0 - last.s1 < 30) last.s1 = sp.s1; else merged.push({ ...sp }); }

const cams: { name: string; cam: number[]; hud: boolean }[] = [];
const pick = merged.length <= maxCorners ? merged : merged.filter((_, i) => i % Math.ceil(merged.length / maxCorners) === 0);
pick.forEach((c, i) => {
  const A = at(c.s0 - 60), B = at(c.s0 + 28);
  const apex = (c.s0 + c.s1) / 2, M = at(apex), sign = Math.sign(turn(apex)) || 1;
  const ox = M.rx * sign, oz = M.rz * sign, halfW = Math.max(M.wL, M.wR);
  const n = String(i + 1).padStart(2, '0');
  cams.push({ name: `c${n}-approach-s${c.s0.toFixed(0)}`, cam: [A.px, A.py + 3.2, A.pz, B.px, B.py + 0.5, B.pz, 60].map(r2), hud: false });
  cams.push({ name: `c${n}-outside-s${apex.toFixed(0)}`, cam: [M.px + ox * (halfW + 30), M.py + 7, M.pz + oz * (halfW + 30), M.px, M.py, M.pz, 55].map(r2), hud: false });
});
// straights: a chase view in the middle of every gap of ≥ 120 m between corners
const gaps: number[] = [];
for (let i = 0; i < merged.length; i++) {
  const a = merged[i]!.s1, b = i + 1 < merged.length ? merged[i + 1]!.s0 : merged[0]!.s0 + L;
  if (b - a >= 120) gaps.push((a + b) / 2);
}
gaps.forEach((s, i) => {
  const P = at(s - 8), Q = at(s + 30);
  cams.push({ name: `s${String(i + 1).padStart(2, '0')}-chase-s${(s % L).toFixed(0)}`, cam: [P.px, P.py + 3.2, P.pz, Q.px, Q.py + 0.8, Q.pz, 62].map(r2), hud: false });
});
writeFileSync(out, JSON.stringify([{ query: `freezeAt=${tick}`, cams }], null, 1));
console.log(`${id}: ${merged.length} corners (${pick.length} shot), ${gaps.length} straights, ${cams.length} views → ${out}`);
