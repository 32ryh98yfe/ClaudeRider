// Runs tsc -p for every workspace project (no emit). Usage: node tools/typecheck.mjs [project...]
import { spawnSync } from 'node:child_process';
const all = ['packages/content', 'packages/sim', 'packages/trackc', 'packages/net', 'packages/room', 'apps/server', 'apps/client', '.'];
const want = process.argv.slice(2);
const projects = want.length ? all.filter((p) => want.some((w) => p.includes(w))) : all;
let failed = 0;
for (const p of projects) {
  const cfg = p === '.' ? 'tsconfig.tools.json' : `${p}/tsconfig.json`;
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', cfg, '--pretty'], { stdio: 'inherit' });
  console.log(`${r.status === 0 ? 'ok  ' : 'FAIL'} ${cfg} (${Date.now() - t0} ms)`);
  if (r.status !== 0) failed++;
}
process.exit(failed ? 1 : 0);
