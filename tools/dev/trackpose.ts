import { readFileSync } from 'node:fs';
import { loadCtrk } from '@cr/sim';
const id = process.argv[2] ?? 'meadow_loop';
const buf = readFileSync(`apps/client/public/tracks/${id}.ctrk`);
const t = loadCtrk(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
console.log('grid', t.grid.slice(0, 4).map((g: any) => [g.x, g.y, g.z, g.fx ?? g.hx, g.fz ?? g.hz].map((v: number) => +(+v).toFixed(2))));
const f: any = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 1, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 };
const L = t.path(0).length;
console.log('length', L);
for (const s of [L - 30, L - 10, 0, 20, 60, 120, 170, 200, 215, 230, 250, 270, 290]) { t.frameAt(0, ((s % L) + L) % L, f); console.log(s.toFixed(0), [f.px, f.py, f.pz, f.tx, f.tz, f.wL, f.wR].map((v: number) => +v.toFixed(2)).join(' ')); }
