// Terrain vs road-edge height check (render only): how far the baked .vis terrain rises above the road edge just off
// the shoulder, per side. On a banked corner the low side's edge sits below the centreline, so a terrain that only
// follows the centreline height pokes up over the inside shoulder and half-buries karts there.
// Usage: node tools/dev/bankpoke.mjs <trackId> [<trackId>…]
// (plain JS: it imports client render code, which the Node-only tools tsconfig cannot type-check)
import { readFileSync } from 'node:fs';
import { loadCtrk, toArrayBuffer } from '@cr/sim';
import { buildGroundField } from '../../apps/client/src/render/ground/field.ts';

for (const id of process.argv.slice(2)) {
  const t = loadCtrk(toArrayBuffer(readFileSync(`apps/client/public/tracks/${id}.ctrk`)));
  const field = buildGroundField(toArrayBuffer(readFileSync(`apps/client/public/tracks/${id}.vis`)));
  const f = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 1, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 };
  const L = t.path(0).length;
  let worst = 0, worstS = 0, worstSide = '', over = 0, n = 0;
  for (let s = 0; s < L; s += 2) {
    t.frameAt(0, s, f);
    for (const [side, w] of [[-1, f.wL], [1, f.wR]] ) {
      const u = side * (w + 0.8); // just past the drivable edge (shoulder included in wL/wR)
      const x = f.px + f.rx * u, z = f.pz + f.rz * u, yEdge = f.py + f.ry * side * w;
      const h = field.heightAt(x, z);
      if (!Number.isFinite(h)) continue;
      n++;
      const d = h - yEdge;
      if (d > 0.15) over++;
      if (d > worst) { worst = d; worstS = s; worstSide = side < 0 ? 'L' : 'R'; }
    }
  }
  console.log(`${id}: terrain above the road edge by > 0.15 m at ${over}/${n} edge samples; worst +${worst.toFixed(2)} m at s ${worstS} (${worstSide})`);
}
