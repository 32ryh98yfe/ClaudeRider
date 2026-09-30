// Verifies FROZEN contract files against contracts.lock (sha256). `--update` rewrites the lock (orchestrator only).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const ROOT = new URL('..', import.meta.url).pathname;
const LOCK = ROOT + 'contracts.lock';
const sha = (p) => createHash('sha256').update(readFileSync(ROOT + p)).digest('hex');
if (!existsSync(LOCK)) { console.log('check-frozen: no contracts.lock yet (pre-M1)'); process.exit(0); }
const lock = JSON.parse(readFileSync(LOCK, 'utf8'));
if (process.argv.includes('--update')) {
  for (const p of Object.keys(lock.files)) lock.files[p] = existsSync(ROOT + p) ? sha(p) : 'MISSING';
  writeFileSync(LOCK, JSON.stringify(lock, null, 2) + '\n');
  console.log('check-frozen: lock updated'); process.exit(0);
}
let bad = 0;
for (const [p, h] of Object.entries(lock.files)) {
  if (!existsSync(ROOT + p)) { console.error(`FROZEN file missing: ${p}`); bad++; continue; }
  if (sha(p) !== h) { console.error(`FROZEN file changed: ${p} (file a request in docs/design/contract-requests/)`); bad++; }
}
console.log(`check-frozen: ${Object.keys(lock.files).length} files, ${bad} violations`);
process.exit(bad ? 1 : 0);
