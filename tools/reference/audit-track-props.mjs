// node tools/reference/audit-track-props.mjs [report.json]
// Requires baked public tracks. Uses the renderer's real theme geometry; no browser/GPU or source footage needed.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { loadContent } from '../../packages/content/src/index.ts';
import { loadCtrk, readContainer, toArrayBuffer, CVIS_MAGIC, CVIS_VERSION } from '../../packages/sim/src/index.ts';
import { PropRoadClearance } from '../../apps/client/src/render/track/clearance.ts';
const requireClient = createRequire(new URL('../../apps/client/package.json', import.meta.url));
const THREE = await import(pathToFileURL(requireClient.resolve('three/webgpu')).href);
const content = loadContent(), directory = new URL('../../apps/client/public/tracks/', import.meta.url), tracks = [];
for (const entry of content.tracks.all) {
  const track = loadCtrk(toArrayBuffer(readFileSync(new URL(`${entry.id}.ctrk`, directory))));
  const vis = readContainer(toArrayBuffer(readFileSync(new URL(`${entry.id}.vis`, directory))), CVIS_MAGIC, CVIS_VERSION);
  const kit = (await import(new URL(`../../apps/client/src/render/themes/${vis.meta.themeId}/index.ts`, import.meta.url).href)).default(content);
  const check = new PropRoadClearance(track), world = new THREE.Matrix4(), pos = new THREE.Vector3(), scale = new THREE.Vector3(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  let total = 0, fittedPillars = 0, widenedGantries = 0;
  const removed = [], retainedOpenings = new Set(), started = performance.now();
  for (let j = 0; j < vis.meta.props.length; j++) {
    const prop = vis.meta.props[j], transforms = vis.arrays.get(`p${j}.xf`), factory = kit.props[prop.kind];
    if (!factory) throw new Error(`Missing ${vis.meta.themeId}/${prop.kind}`);
    const geometry = factory.build(kit.data.palette).geometry;
    for (let i = 0; i < prop.n; i++) {
      total++;
      const o = i * 6, s = transforms[o + 4];
      pos.set(transforms[o], transforms[o + 1], transforms[o + 2]);
      q.setFromAxisAngle(up, transforms[o + 3]);
      scale.set(prop.kind === 'chevron' && transforms[o + 5] === 1 ? -s : s, prop.kind === 'pillar' ? s * (1 + transforms[o + 5]) : s, s);
      if (prop.kind === 'pillar') { const before = scale.y; check.fitPillar(geometry, pos, scale); if (before !== scale.y) fittedPillars++; }
      world.compose(pos, q, scale);
      if (prop.kind === 'gantry') {
        const before = scale.x;
        for (let pass = 0; pass < 8 && check.conflict(geometry, world); pass++) { scale.x *= 1.1; world.compose(pos, q, scale); }
        if (before !== scale.x) widenedGantries++;
      }
      const conflict = prop.kind === 'gore_cushion' ? null : check.conflict(geometry, world);
      if (conflict) removed.push({ kind: prop.kind, instance: i, position: pos.toArray(), ...conflict });
      else if (/arch|gantry|bunting|hollow_log|tunnel|bridge/.test(prop.kind)) retainedOpenings.add(prop.kind);
    }
  }
  tracks.push({ id: entry.id, total, retained: total - removed.length, fittedPillars, widenedGantries, milliseconds: Math.round(performance.now() - started), retainedOpenings: [...retainedOpenings], removed });
}
const report = { description: 'Actual prop triangles tested against every public-road driving corridor at load time. HAZ objects and baked collision meshes are independent of this scenery filter.', tracks };
const text = JSON.stringify(report, null, 2) + '\n';
if (process.argv[2]) writeFileSync(process.argv[2], text); else process.stdout.write(text);
