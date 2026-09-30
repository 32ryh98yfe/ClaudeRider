// trackc CLI: node packages/trackc/src/cli.ts build <ids|all> [--validate] [--ghost] [--preview] [--strict] [--no-ao] [--no-pvs] [--out dir]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { buildTrack } from './build.ts';

const ROOT = new URL('../../..', import.meta.url).pathname;
const args = process.argv.slice(2);
const cmd = args[0];
const flag = (f: string): boolean => args.includes(f);
const opt = (f: string, def: string): string => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1]! : def; };

function findTracks(): Map<string, string> {
  const m = new Map<string, string>();
  const walk = (d: string): void => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) { if (!e.startsWith('_') || e === '_test') walk(p); }
      else if (e.endsWith('.ctd')) m.set(basename(e, '.ctd'), p);
    }
  };
  walk(join(ROOT, 'tracks'));
  return m;
}

if (cmd !== 'build') { console.error('usage: cli.ts build <ids|all> [--validate] [--ghost] [--preview] [--strict] [--out dir]'); process.exit(2); }
const all = findTracks();
const want = (args[1] ?? 'all') === 'all' ? [...all.keys()].filter((k) => !all.get(k)!.includes('/_test/')) : args[1]!.split(',');
const out = opt('--out', join(ROOT, 'apps/client/public/tracks'));
mkdirSync(out, { recursive: true });
let errors = 0;
const manifest: Record<string, unknown> = {};
for (const id of want.sort()) {
  const file = all.get(id) ?? (id.endsWith('.ctd') ? id : undefined);
  if (!file) { console.error(`✗ ${id}: no tracks/**/${id}.ctd`); errors++; continue; }
  const t0 = Date.now();
  let r;
  try {
    r = buildTrack(readFileSync(file, 'utf8'), file, { strict: flag('--strict') || undefined, ao: !flag('--no-ao'), pvs: !flag('--no-pvs') });
    if (flag('--ghost')) {
      const { ghostLap } = await import('./ghost.ts');
      const g = ghostLap(r.track);
      r = buildTrack(readFileSync(file, 'utf8'), file, { refLapTicks: g.lapTicks, strict: flag('--strict') || undefined, ao: !flag('--no-ao'), pvs: !flag('--no-pvs') });
      console.log(`  ghost: ${(g.lapTicks / 60).toFixed(2)} s/lap (${g.note})`);
    }
  } catch (e) { console.error(`✗ ${id}: ${(e as Error).message}`); errors++; continue; }
  writeFileSync(join(out, `${r.id}.ctrk`), r.ctrk);
  writeFileSync(join(out, `${r.id}.vis`), r.vis);
  writeFileSync(join(out, `${r.id}.meta.json`), JSON.stringify({ meta: r.meta, stats: r.stats, findings: r.findings, timings: r.timings }, null, 1));
  if (flag('--preview')) writeFileSync(join(out, `${r.id}.svg`), r.previewSvg);
  manifest[r.id] = { hash: r.meta.hash, lapLength: r.meta.lapLength, laps: r.meta.laps, refLapTicks: r.meta.refLapTicks, theme: r.meta.themeId };
  const errs = r.findings.filter((f) => f.severity === 'error');
  if (flag('--validate') && errs.length) errors += errs.length;
  const s = r.stats;
  console.log(`${errs.length ? '✗' : '✓'} ${r.id}: ${s.lapLength!.toFixed(0)} m, ${s.paths} paths, minR ${s.minR!.toFixed(0)}, minW ${s.minW!.toFixed(0)}, ${s.groundTris} ground / ${s.wallTris} wall tris, ctrk ${(s.ctrkBytes! / 1024).toFixed(0)} KB, vis ${(s.visBytes! / 1024).toFixed(0)} KB, ${Date.now() - t0} ms`);
  for (const f of r.findings) console.log(`    ${f.severity === 'error' ? 'ERROR' : 'warn '} ${f.rule}${f.s !== undefined ? ` @${f.s.toFixed(0)}` : ''}${f.path && f.path !== 'main' ? ` [${f.path}]` : ''}: ${f.msg}`);
}
writeFileSync(join(out, 'index.json'), JSON.stringify(manifest, null, 1));
process.exit(errors && flag('--validate') ? 1 : 0);
export {};
