// Bundle budget (ADR / 40-perf-budgets): initial JS ≤ 1.0 MB gzip. Run after `pnpm build`.
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
const dist = new URL('../apps/client/dist/', import.meta.url).pathname;
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const initial = [...html.matchAll(/(?:src|href)="\/?(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
let total = 0;
for (const f of initial) { const gz = gzipSync(readFileSync(join(dist, f))).length; total += gz; console.log(`  ${f}  ${(gz / 1024).toFixed(1)} KB gz`); }
const all = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.js'));
console.log(`initial JS ${(total / 1024).toFixed(1)} KB gzip (${initial.length} files; ${all.length} chunks total)`);
const LIMIT = 1024 * 1024;
if (total > LIMIT) { console.error(`✗ over budget (${(LIMIT / 1024).toFixed(0)} KB)`); process.exit(1); }
console.log('✓ within budget');
