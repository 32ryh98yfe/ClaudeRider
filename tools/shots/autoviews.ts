// Standard before/after camera set for any baked track (34-stylized-pass §2): the same five views that the Meadow
// Loop pass used, computed from the .ctrk so every track is judged from equivalent poses.
//   a1 grid chase behind slot 0 · a2 3/4 kart close-up · a3 start wide
//   b1 approach to the first corner · b2 outside of the first corner
// Groups freeze at tick 200 (countdown, karts on the grid) and goTick + 370 (≈ 6 s after GO).
// Usage: node tools/shots/autoviews.ts <trackId> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { loadCtrk, type FrameSample } from '@cr/sim';

const [id, out] = process.argv.slice(2);
if (!id || !out) { console.error('usage: autoviews.ts <trackId> <out.json>'); process.exit(2); }
const buf = readFileSync(`apps/client/public/tracks/${id}.ctrk`);
const t = loadCtrk(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const f: FrameSample = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 1, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 };
const L = t.path(0).length;
const at = (s: number): FrameSample => { t.frameAt(0, ((s % L) + L) % L, f); return { ...f }; };
const r2 = (v: number): number => Math.round(v * 100) / 100;

// first corner: first s after the line where the heading turns faster than 1/70 rad per metre, then its apex
const STEP = 2;
const yawAt = (s: number): number => { const a = at(s); return Math.atan2(a.tx, a.tz); };
const turn = (s: number): number => { let d = yawAt(s + STEP) - yawAt(s); while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d / STEP; };
let s0 = 20;
while (s0 < Math.min(L, 900) && Math.abs(turn(s0)) < 1 / 70) s0 += STEP;
let s1 = s0;
while (s1 < s0 + 400 && Math.abs(turn(s1)) >= 1 / 90) s1 += STEP;
const apex = (s0 + s1) / 2, sign = Math.sign(turn(apex)) || 1;

const g = t.grid[0]!;
const fx = g.fx, fz = g.fz, lx = fz, lz = -fx; // left of the grid heading (y up)
const line = at(0);
const lfx = line.tx, lfz = line.tz, llx = lfz, llz = -lfx;
const A = at(s0 - 60), B = at(s0 + 28), M = at(apex);
// outward from the corner centre: the frame's right vector points away from the centre on a left-hand bend
const out2 = sign > 0 ? 1 : -1;
const ox = M.rx * out2, oz = M.rz * out2;
const halfW = Math.max(M.wL, M.wR);

const views = [
  { query: 'freezeAt=200', cams: [
    { name: 'a1-grid-chase', cam: [g.x - fx * 5.6, g.y + 2.2, g.z - fz * 5.6, g.x + fx * 10, g.y + 0.8, g.z + fz * 10, 70].map(r2), hud: true },
    { name: 'a2-kart-34', cam: [g.x + fx * 4.8 + lx * 4.6, g.y + 1.3, g.z + fz * 4.8 + lz * 4.6, g.x, g.y + 0.55, g.z, 38].map(r2), hud: false },
    { name: 'a3-start-wide', cam: [line.px - lfx * 32 - llx * 16, line.py + 9, line.pz - lfz * 32 - llz * 16, line.px + lfx * 15 + llx * 2, line.py, line.pz + lfz * 15 + llz * 2, 55].map(r2), hud: false },
  ] },
  { query: 'freezeAt=700', cams: [
    { name: 'b1-corner-approach', cam: [A.px, A.py + 3.2, A.pz, B.px, B.py + 0.5, B.pz, 60].map(r2), hud: false },
    { name: 'b2-corner-outside', cam: [M.px + ox * (halfW + 30), M.py + 7, M.pz + oz * (halfW + 30), M.px, M.py, M.pz, 55].map(r2), hud: false },
  ] },
];
writeFileSync(out, JSON.stringify(views, null, 1));
console.log(`${id}: first corner s ${s0.toFixed(0)}–${s1.toFixed(0)} (apex ${apex.toFixed(0)}, ${sign > 0 ? 'left' : 'right'}), length ${L.toFixed(0)} → ${out}`);
