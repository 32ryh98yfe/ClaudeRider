// The rendered handling courses use the exact same vertices as the independent physics acceptance fixtures.
import { mkdirSync, writeFileSync } from 'node:fs';
import { CVIS_MAGIC, CVIS_VERSION, writeContainer, type TypedArray } from '@cr/sim';
import type { VisMeta } from '../../packages/sim/src/track/vis-format.ts';
import { cornerKit, flatPlane } from '../../packages/sim/test/fixtures/kits.ts';
import { buildFixture, type Mesh } from '../../packages/sim/test/fixtures/builder.ts';
import schedules from '../../docs/research/handling-keyboard-scenarios.json' with { type: 'json' };

const directory = new URL('../../apps/client/public/reference/', import.meta.url);
mkdirSync(directory, { recursive: true });
for (const name of ['flat', ...schedules.scenarios.flatMap(s => [`R${s.radiusM}L`, `R${s.radiusM}R`])]) {
  const radius = Number(name.slice(1, -1)), side = name.endsWith('R') ? -1 : 1;
  const original = name === 'flat' ? flatPlane() : cornerKit(radius, 180, 12, side === 1 ? 'L' : 'R');
  const u = (schedules.scenarios.find(s => s.radiusM === radius)?.initialU ?? 0) * side;
  const f = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 };
  original.track.frameAt(0, name === 'flat' ? 300 : schedules.initialS, f);
  const fixture = buildFixture({ ...original.spec, id: 'proving_ring', grid: [{ x: f.px + f.rx * u, y: f.py + f.ry * u, z: f.pz + f.rz * u, fx: f.tx, fy: f.ty, fz: f.tz }] });
  const arrays: [string, TypedArray][] = [];
  const slots: VisMeta['slots'] = [];
  function mesh(m: Mesh, material: string): void {
    const j = slots.length, positions: number[] = [], normals: number[] = [], uv: number[] = [];
    for (let t = 0; t < m.idx.length; t += 3) {
      const a = m.idx[t]! * 3, b = m.idx[t + 1]! * 3, c = m.idx[t + 2]! * 3;
      const ax = m.pos[b]! - m.pos[a]!, ay = m.pos[b + 1]! - m.pos[a + 1]!, az = m.pos[b + 2]! - m.pos[a + 2]!;
      const bx = m.pos[c]! - m.pos[a]!, by = m.pos[c + 1]! - m.pos[a + 1]!, bz = m.pos[c + 2]! - m.pos[a + 2]!;
      const n = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx], len = Math.hypot(...n) || 1;
      for (const i of [a, b, c]) { positions.push(m.pos[i]!, m.pos[i + 1]!, m.pos[i + 2]!); normals.push(...n.map(v => v / len)); uv.push(m.pos[i]! / 8, m.pos[i + 2]! / 8); }
    }
    const bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    positions.forEach((v, i) => { const a = i % 3; bounds[a] = Math.min(bounds[a]!, v); bounds[a + 3] = Math.max(bounds[a + 3]!, v); });
    slots.push({ name: material, material, chunks: [{ i0: 0, n: m.idx.length, bbox: bounds }] });
    arrays.push([`s${j}.pos`, Float32Array.from(positions)], [`s${j}.nrm`, Float32Array.from(normals)], [`s${j}.uv`, Float32Array.from(uv)], [`s${j}.col`, new Float32Array(positions.length).fill(1)], [`s${j}.idx`, Uint32Array.from({ length: m.idx.length }, (_, i) => i)]);
  }
  mesh(fixture.spec.ground, 'road'); if (fixture.spec.walls) mesh(fixture.spec.walls, 'wall');
  const map = Float32Array.from(fixture.spec.paths[0]!.frames.flatMap(f => [f.x, f.z]));
  arrays.push(['minimap', map], ['minimap.main', map]);
  const meta: VisMeta = { id: 'proving_ring', themeId: 'spark_circuit', name, slots, props: [], bounds: fixture.track.meta.bounds, line: { x: f.px, y: f.py, z: f.pz, fx: f.tx, fy: f.ty, fz: f.tz, w: 12 }, theme: {}, lapLength: fixture.track.lapLength, minimapPaths: [{ id: 'main', kind: 'main', array: 'minimap.main' }] };
  writeFileSync(new URL(`handling_${name}.ctrk`, directory), fixture.bytes);
  writeFileSync(new URL(`handling_${name}.vis`, directory), writeContainer(CVIS_MAGIC, CVIS_VERSION, meta, arrays));
  console.log(`${name}: ${fixture.track.hash}`);
}
