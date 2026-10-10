// Generate audited, renderer-independent contact data from the same local models used by the game.
// node tools/reference/generate-prop-contact-catalog.mjs [--check]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadContent } from '../../packages/content/src/index.ts';
import { PLACEHOLDER_PROP } from '../../apps/client/src/render/props/defaults.ts';
import { makeKit } from '../../apps/client/src/render/themes/kit.ts';

const root = new URL('../../', import.meta.url);
const output = new URL('packages/content/src/prop-contact/catalog.generated.json', root);
const policies = JSON.parse(readFileSync(new URL('packages/content/src/prop-contact/policies.json', root), 'utf8'));
const inventory = new Map();
function visit(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const path = new URL(item.name + (item.isDirectory() ? '/' : ''), dir);
    if (item.isDirectory()) visit(path);
    else if (item.name.endsWith('.ctd')) {
      const source = readFileSync(path, 'utf8'), theme = /\bTRACK\b[^\n]*\btheme=([\w-]+)/.exec(source)?.[1];
      if (!theme) continue;
      const kinds = inventory.get(theme) ?? new Set(['gantry', 'pillar', 'chevron', 'gore_cushion', 'rock', 'tree_round', 'tree_pine', 'tree', 'pine', 'house', 'fence', 'lamp', 'windmill_small', 'bush']); inventory.set(theme, kinds);
      for (const match of source.matchAll(/\bPROPS?\s+kind=([\w-]+)/g)) kinds.add(match[1]);
      for (const match of source.matchAll(/\bscatter=([\w,-]+)/g)) for (const kind of match[1].split(',')) if (kind !== 'none') kinds.add(kind);
    }
  }
}
visit(new URL('tracks/', root));
const content = loadContent(), entries = {}, geometries = {};
let faces = 0, sourceFaces = 0, cosmeticFaces = 0;
const hash = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const encode = (values) => {
  const bytes = []; let previous = 0;
  for (const v of values) {
    const delta = v - previous; previous = v;
    let n = delta >= 0 ? delta * 2 : -delta * 2 - 1;
    while (n >= 128) { bytes.push((n % 128) | 128); n = Math.floor(n / 128); }
    bytes.push(n);
  }
  return Buffer.from(bytes).toString('base64');
};
for (const [theme, kinds] of [...inventory].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
  const kit = content.themes.byId.has(theme) ? (await import(new URL(`../../apps/client/src/render/themes/${theme}/index.ts`, import.meta.url).href)).default(content) : makeKit(content.themes.all[0]);
  for (const kind of [...kinds].sort()) {
    const policy = policies[`${theme}/${kind}`] ?? policies[kind];
    if (!policy) throw new Error(`An explicit contact policy is required for ${theme}/${kind}`);
    const factory = kit.props[kind] ?? (policy.placeholder ? PLACEHOLDER_PROP : undefined); if (!factory) throw new Error(`Missing actual prop model ${theme}/${kind}`);
    const source = factory.build(kit.data.palette).geometry, pos = source.getAttribute('position'), ix = source.index;
    const range = source.userData.contactRanges ?? [];
    const vertices = [], indices = [], supportIndices = [], vertexIds = new Map(), seen = new Set();
    const bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    const roles = new Array(pos.count).fill(source.userData.contactRole ?? 'solid');
    if (!source.userData.contactRole) range.forEach((r) => { roles.fill(r.role, r.start, r.start + r.count); });
    let excluded = 0;
    const vertex = (i) => {
      const xyz = [pos.getX(i), pos.getY(i), pos.getZ(i)].map((v) => Math.round(v * 4096));
      if (!xyz.every(Number.isFinite)) throw new Error(`Nonfinite model ${theme}/${kind}`);
      const key = xyz.join(','); let id = vertexIds.get(key);
      if (id === undefined) { id = vertices.length / 3; vertexIds.set(key, id); vertices.push(...xyz); }
      return id;
    };
    // Bounds include cosmetic parts too: placement and visual clearance must account for the full silhouette.
    for (let i = 0; i < pos.count; i++) for (let axis = 0; axis < 3; axis++) {
      const v = Math.round(pos.array[i * 3 + axis] * 4096); bounds[axis] = Math.min(bounds[axis], v); bounds[axis + 3] = Math.max(bounds[axis + 3], v);
    }
    for (let i = 0; i < (ix?.count ?? pos.count); i += 3) {
      const tri = [0, 1, 2].map((d) => ix ? ix.getX(i + d) : i + d);
      if (policy.policy === 'cosmetic' || tri.some((v) => roles[v] === 'cosmetic')) { excluded++; continue; }
      const ids = tri.map(vertex); if (new Set(ids).size < 3) continue;
      const key = [...ids].sort((a, b) => a - b).join(','); if (seen.has(key)) continue; seen.add(key);
      let isSupport = tri.every((v) => roles[v] === 'support');
      if (policy.groundSurface) {
        const [a, b, c] = tri.map((v) => [pos.getX(v), pos.getY(v), pos.getZ(v)]);
        const u = b.map((x, j) => x - a[j]), v = c.map((x, j) => x - a[j]);
        const nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
        isSupport ||= Math.abs(ny) > 0.7 * Math.hypot(nx, ny, nz);
      }
      (isSupport ? supportIndices : indices).push(...ids);
    }
    sourceFaces += indices.length / 3;
    // Preserve every authored hard surface. Only duplicate vertices/faces are removed;
    // instancing controls the file size without approximating openings or thin parts.
    const compactVertices = [], ids = new Map();
    const compact = (list) => Array.from(list, (v) => {
      let id = ids.get(v);
      if (id === undefined) { id = ids.size; ids.set(v, id); compactVertices.push(vertices[v * 3], vertices[v * 3 + 1], vertices[v * 3 + 2]); }
      return id;
    });
    const kept = compact(indices), keptSupport = compact(supportIndices);
    const geometry = { vertices: compactVertices, indices: kept, supportIndices: keptSupport, bounds }, fingerprint = hash({ policy, geometry, excluded });
    const key = hash(geometry); geometries[key] ??= { vertices: encode(compactVertices), indices: encode(kept), supportIndices: encode(keptSupport), bounds };
    entries[`${theme}/${kind}`] = { ...policy, geometry: key, fingerprint, groundSurface: !!policy.groundSurface, cosmeticTriangles: excluded, proxyToleranceM: 0.03 };
    faces += kept.length / 3; cosmeticFaces += excluded;
  }
}
const result = JSON.stringify({ version: 1, entries, geometries }) + '\n';
if (process.argv.includes('--check')) {
  if (readFileSync(output, 'utf8') !== result) throw new Error('Prop contacts are stale; regenerate the shared catalog');
} else writeFileSync(output, result);
console.log(JSON.stringify({ entries: Object.keys(entries).length, uniqueGeometry: Object.keys(geometries).length, sourceFaces, solidFaces: faces, cosmeticFaces, bytes: result.length }));
