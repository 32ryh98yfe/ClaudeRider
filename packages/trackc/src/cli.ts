// trackc CLI:
//   node packages/trackc/src/cli.ts build <ids|all> [--validate] [--ghost] [--preview] [--png] [--strict]
//        [--no-ao] [--no-pvs] [--jobs N] [--no-cache] [--out dir]
// Builds run in up to N worker threads (default 1: the machine is shared). Results are cached under .cache/trackc,
// keyed by a content hash of the source, the options and the compiler itself (trackc, the sim track runtime and the
// content package), so an unchanged track is copied instead of rebuilt. `all` skips tracks/_test and tracks/_fixtures.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { basename, join } from 'node:path';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { gzipSync } from 'node:zlib';
import { COMPILER_VERSION, buildTrack, type BuildOptions } from './build.ts';
import { CTRK_MAX_BYTES, CVIS_GZIP_MAX_BYTES } from './budgets.ts';

const ROOT = new URL('../../..', import.meta.url).pathname;

interface Job { id: string; file: string; opts: BuildOptions; ghost: boolean }
interface Report { meta: unknown; stats: Record<string, number>; findings: { severity: string; rule: string; s?: number; path?: string; msg: string }[]; timings: Record<string, number> }
interface Done { id: string; ok: boolean; err?: string; ctrk?: Uint8Array; vis?: Uint8Array; svg?: string; ghostNote?: string; report?: Report; ms: number; cached?: boolean }

async function runJob(j: Job): Promise<Done> {
  const t0 = Date.now();
  try {
    const src = readFileSync(j.file, 'utf8');
    let r = buildTrack(src, j.file, j.opts);
    let ghostNote: string | undefined;
    if (j.ghost) {
      const { ghostLap } = await import('./ghost.ts');
      const g = ghostLap(r.track);
      r = buildTrack(src, j.file, { ...j.opts, refLapTicks: g.lapTicks });
      ghostNote = `${(g.lapTicks / 60).toFixed(2)} s/lap (${g.note})`;
    }
    const ms = Date.now() - t0;
    // budgets (v10 amendment): bake ≤ 20 s, exact-contact .ctrk ≤ 5 MiB, .vis ≤ 3 MiB gzip
    const stats = { ...r.stats, visGzBytes: gzipSync(r.vis, { level: 9 }).byteLength, bakeMs: ms };
    const findings = [...r.findings];
    const over = (what: string): void => { findings.push({ rule: 'V20', severity: 'warn', msg: `budget: ${what}` }); };
    if (r.ctrk.byteLength > CTRK_MAX_BYTES) over(`.ctrk ${(r.ctrk.byteLength / 1048576).toFixed(2)} MiB > ${CTRK_MAX_BYTES / 1048576} MiB`);
    if (stats.visGzBytes > CVIS_GZIP_MAX_BYTES) over(`.vis ${(stats.visGzBytes / 1048576).toFixed(2)} MiB gzip > ${CVIS_GZIP_MAX_BYTES / 1048576} MiB`);
    if (ms > 20000) over(`bake ${(ms / 1000).toFixed(1)} s > 20 s`);
    return {
      id: r.id, ok: true, ctrk: r.ctrk, vis: r.vis, svg: r.previewSvg, ghostNote, ms,
      report: { meta: r.meta, stats, findings, timings: r.timings },
    };
  } catch (e) { return { id: j.id, ok: false, err: (e as Error).message, ms: Date.now() - t0 }; }
}

if (!isMainThread) {
  parentPort!.on('message', (j: Job) => { void runJob(j).then((d) => parentPort!.postMessage(d)); });
} else await main();

// ------------------------------------------------------------------------------------------------ main thread
function findTracks(): Map<string, string> {
  const m = new Map<string, string>();
  const walk = (d: string): void => {
    for (const e of readdirSync(d).sort()) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) { if (!e.startsWith('_') || e === '_test') walk(p); }
      else if (e.endsWith('.ctd')) m.set(basename(e, '.ctd'), p);
    }
  };
  walk(join(ROOT, 'tracks'));
  return m;
}

/** Hash of every file the bake output depends on besides the track source. */
function compilerFingerprint(): string {
  const h = createHash('sha256').update(COMPILER_VERSION);
  const walk = (d: string): void => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d).sort()) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) { if (e !== 'node_modules' && e !== 'test') walk(p); }
      else if (/\.(ts|json)$/.test(e)) h.update(p.slice(ROOT.length)).update(readFileSync(p));
    }
  };
  for (const d of ['packages/trackc/src', 'packages/sim/src/track', 'packages/sim/src/core', 'packages/content/src']) walk(join(ROOT, d));
  // aibake reads the shared braking value; a recalibrated kart model must invalidate cached AI speed tables.
  h.update('packages/sim/src/kart/params.ts').update(readFileSync(join(ROOT, 'packages/sim/src/kart/params.ts')));
  return h.digest('hex');
}

interface PwPage { setContent(s: string): Promise<void>; screenshot(o: { path: string; fullPage: boolean }): Promise<unknown> }
interface PwBrowser { newPage(o: { viewport: { width: number; height: number } }): Promise<PwPage>; close(): Promise<void> }

async function toPng(svg: string, file: string): Promise<void> {
  try {
    const pw = (await import('@playwright/test' as string)) as { chromium: { launch(): Promise<PwBrowser> } };
    const vb = /viewBox="([\d.\s-]+)"/.exec(svg)?.[1]?.trim().split(/\s+/).map(Number) ?? [0, 0, 1400, 900];
    const W = 1400, H = Math.ceil((W * vb[3]!) / vb[2]!);
    const browser = await pw.chromium.launch();
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await page.setContent(`<html><body style="margin:0;background:#000">${svg.replace(/width="[\d.]+"/, `width="${W}"`)}</body></html>`);
    await page.screenshot({ path: file, fullPage: true });
    await browser.close();
  } catch (e) { console.warn(`  (--png skipped: ${(e as Error).message.split('\n')[0]})`); }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (f: string): boolean => args.includes(f);
  const opt = (f: string, def: string): string => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1]! : def; };
  if (args[0] !== 'build') {
    console.error('usage: cli.ts build <ids|all> [--validate] [--ghost] [--preview] [--png] [--strict] [--no-ao] [--no-pvs] [--jobs N] [--no-cache] [--out dir]');
    process.exit(2);
  }
  const all = findTracks();
  const want = (args[1] ?? 'all') === 'all' ? [...all.keys()].filter((k) => !all.get(k)!.includes('/_test/')) : args[1]!.split(',');
  const out = opt('--out', join(ROOT, 'apps/client/public/tracks'));
  mkdirSync(out, { recursive: true });
  const cacheDir = join(ROOT, '.cache/trackc');
  const useCache = !flag('--no-cache');
  if (useCache) mkdirSync(cacheDir, { recursive: true });
  const jobsN = Math.max(1, Math.min(Number(opt('--jobs', '1')) || 1, availableParallelism()));
  const opts: BuildOptions = { ao: !flag('--no-ao'), pvs: !flag('--no-pvs') };
  if (flag('--strict')) opts.strict = true;
  const ghost = flag('--ghost');
  const fp = useCache ? compilerFingerprint() : '';

  let errors = 0;
  const manifest: Record<string, unknown> = {};
  const jobs: (Job & { key: string })[] = [];
  const results = new Map<string, Done>();
  for (const id of [...want].sort()) {
    const file = all.get(id) ?? (id.endsWith('.ctd') ? id : undefined);
    if (!file || !existsSync(file)) { console.error(`✗ ${id}: no tracks/**/${id}.ctd`); errors++; continue; }
    const key = createHash('sha256').update(fp).update(JSON.stringify({ opts, ghost })).update(readFileSync(file)).digest('hex').slice(0, 32);
    const hit = join(cacheDir, `${key}.json`);
    if (useCache && existsSync(hit)) {
      const rep = JSON.parse(readFileSync(hit, 'utf8')) as Report & { id: string; ghostNote?: string };
      results.set(id, {
        id: rep.id, ok: true, cached: true, ms: 0, report: rep, ghostNote: rep.ghostNote,
        ctrk: readFileSync(join(cacheDir, `${key}.ctrk`)), vis: readFileSync(join(cacheDir, `${key}.vis`)), svg: readFileSync(join(cacheDir, `${key}.svg`), 'utf8'),
      });
    } else jobs.push({ id, file, opts, ghost, key });
  }

  // build the misses, jobsN at a time
  const nW = Math.min(jobsN, jobs.length);
  if (nW <= 1) for (const j of jobs) results.set(j.id, await runJob(j));
  else {
    await new Promise<void>((resolve) => {
      let next = 0, live = nW;
      const feed = (w: Worker): void => {
        if (next >= jobs.length) { void w.terminate(); if (--live === 0) resolve(); return; }
        const j = jobs[next++]!;
        w.once('message', (d: Done) => { results.set(j.id, d); feed(w); });
        w.postMessage({ id: j.id, file: j.file, opts: j.opts, ghost: j.ghost } satisfies Job);
      };
      for (let k = 0; k < nW; k++) feed(new Worker(new URL(import.meta.url)));
    });
  }
  if (useCache) for (const j of jobs) {
    const d = results.get(j.id)!;
    if (!d.ok) continue;
    writeFileSync(join(cacheDir, `${j.key}.ctrk`), d.ctrk!);
    writeFileSync(join(cacheDir, `${j.key}.vis`), d.vis!);
    writeFileSync(join(cacheDir, `${j.key}.svg`), d.svg!);
    writeFileSync(join(cacheDir, `${j.key}.json`), JSON.stringify({ id: d.id, ghostNote: d.ghostNote, ...d.report }));
  }

  for (const id of [...want].sort()) {
    const d = results.get(id);
    if (!d) continue;
    if (!d.ok) { console.error(`✗ ${id}: ${d.err}`); errors++; continue; }
    const rep = d.report!;
    const meta = rep.meta as { hash: string; lapLength: number; laps: number; refLapTicks: number; themeId: string };
    writeFileSync(join(out, `${d.id}.ctrk`), d.ctrk!);
    writeFileSync(join(out, `${d.id}.vis`), d.vis!);
    writeFileSync(join(out, `${d.id}.meta.json`), JSON.stringify({ meta: rep.meta, stats: rep.stats, findings: rep.findings, timings: rep.timings }, null, 1));
    if (flag('--preview') || flag('--png')) writeFileSync(join(out, `${d.id}.svg`), d.svg!);
    if (flag('--png')) await toPng(d.svg!, join(out, `${d.id}.png`));
    manifest[d.id] = { hash: meta.hash, lapLength: meta.lapLength, laps: meta.laps, refLapTicks: meta.refLapTicks, theme: meta.themeId };
    if (d.ghostNote) console.log(`  ghost: ${d.ghostNote}`);
    const errs = rep.findings.filter((f) => f.severity === 'error');
    if (flag('--validate') && errs.length) errors += errs.length;
    const s = rep.stats;
    console.log(`${errs.length ? '✗' : '✓'} ${d.id}: ${s.lapLength!.toFixed(0)} m, ${s.paths} paths, minR ${s.minR!.toFixed(0)}, minW ${s.minW!.toFixed(0)}, ${s.groundTris} ground / ${s.wallTris} wall tris, ctrk ${(s.ctrkBytes! / 1024).toFixed(0)} KB, vis ${(s.visBytes! / 1024).toFixed(0)} KB (${((s.visGzBytes ?? 0) / 1024).toFixed(0)} KB gz), ${d.cached ? 'cached' : `${d.ms} ms`}`);
    for (const f of rep.findings) console.log(`    ${f.severity === 'error' ? 'ERROR' : 'warn '} ${f.rule}${f.s !== undefined ? ` @${f.s.toFixed(0)}` : ''}${f.path && f.path !== 'main' ? ` [${f.path}]` : ''}: ${f.msg}`);
  }
  writeFileSync(join(out, 'index.json'), JSON.stringify(manifest, null, 1));
  process.exit(errors && flag('--validate') ? 1 : 0);
}
