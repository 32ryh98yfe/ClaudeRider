// Enforces workspace dependency rules (ADR / 02-contracts §A) on package.json manifests.
import { readFileSync } from 'node:fs';
const ROOT = new URL('..', import.meta.url).pathname;
const RULES = {
  'packages/content': [],
  'packages/sim': ['@cr/content'],
  'packages/trackc': ['@cr/content', '@cr/sim', 'three', 'three-mesh-bvh', 'polygon-clipping', 'simplex-noise'],
  'packages/net': ['@cr/content', '@cr/sim'],
  'packages/room': ['@cr/content', '@cr/sim', '@cr/net'],
  'apps/server': ['@cr/content', '@cr/sim', '@cr/net', '@cr/room', 'ws'],
  'apps/client': ['@cr/content', '@cr/sim', '@cr/net', '@cr/room', 'three', 'three-mesh-bvh', 'preact', '@preact/signals', 'tone', 'pretendard', '@fontsource/barlow-condensed', '@fontsource/black-han-sans'],
};
let bad = 0;
for (const [dir, allowed] of Object.entries(RULES)) {
  const pj = JSON.parse(readFileSync(`${ROOT}${dir}/package.json`, 'utf8'));
  for (const d of Object.keys(pj.dependencies ?? {})) if (!allowed.includes(d)) { console.error(`${dir}: dependency ${d} not allowed`); bad++; }
}
console.log(`check-deps: ${Object.keys(RULES).length} packages, ${bad} violations`);
process.exit(bad ? 1 : 0);
