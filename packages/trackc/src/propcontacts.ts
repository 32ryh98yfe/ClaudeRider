// Shared final scenery transforms and physical contacts. A .vis instance and its .ctrk triangles always use the
// same stored matrix; graphics tiers cannot remove solid instances. The catalog is data-only and generated from
// explicitly labelled hard model parts, never imported from the browser renderer at bake/runtime.
import { getPropContact } from '@cr/content/prop-contact/catalog.ts';
import { TFLAG, type BakedTrack } from '@cr/sim';
import { canonicalF32 } from './canonical.ts';
import { DrivingClearance } from './clearance.ts';
import type { PropSet } from './props.ts';
import { TriSoup } from './soup.ts';
import type { TerrainField } from './terrain.ts';

export interface PreparedPropSet extends PropSet { matrices: number[]; policy: 'solid' | 'cosmetic'; fingerprint: string; contacts: number[]; support: number[]; geometry: number[]; flags: number[] }
export interface PropContactGeometry { prefix: string; pos: number[]; idx: number[] }
export interface PropContactResult { sets: PreparedPropSet[]; geometries: PropContactGeometry[]; moved: number; fitted: number; collisionTriangles: number }
const OPENING = /^(gantry|stone_arch|sandstone_arch|crystal_arch|timber_arch|lantern_arch|hollow_log|tunnel|footbridge|bridge_span|bridge_deck|crypt_vault|giant_table|ballroom)$/;
const FRAME = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 1, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 };
const HIT = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, surf: 0, tri: 0, flags: 0 };
function matrix(x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number): number[] {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [c * sx, 0, -s * sx, 0, 0, sy, 0, 0, s * sz, 0, c * sz, 0, x, y, z, 1].map(canonicalF32);
}
const vertex = (p: readonly number[], i: number, m: readonly number[]): number[] => [canonicalF32(m[0]! * p[i]! + m[4]! * p[i + 1]! + m[8]! * p[i + 2]! + m[12]!), canonicalF32(m[1]! * p[i]! + m[5]! * p[i + 1]! + m[9]! * p[i + 2]! + m[13]!), canonicalF32(m[2]! * p[i]! + m[6]! * p[i + 1]! + m[10]! * p[i + 2]! + m[14]!)];

function inverseVertex(p: readonly number[], m: readonly number[]): number[] {
  const a = m[0]!, b = m[4]!, c = m[8]!, d = m[1]!, e = m[5]!, f = m[9]!, g = m[2]!, h = m[6]!, i = m[10]!;
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(determinant) < 1e-12) throw new Error('Singular prop transform');
  const x = p[0]! - m[12]!, y = p[1]! - m[13]!, z = p[2]! - m[14]!;
  return [((e * i - f * h) * x + (c * h - b * i) * y + (b * f - c * e) * z) / determinant, ((f * g - d * i) * x + (a * i - c * g) * y + (c * d - a * f) * z) / determinant, ((d * h - e * g) * x + (b * g - a * h) * y + (a * e - b * d) * z) / determinant].map(canonicalF32);
}

export function preparePropContacts(theme: string, props: PropSet[], track: BakedTrack, clearance: DrivingClearance, supportClearance: DrivingClearance, deckClearance: DrivingClearance, terrain: TerrainField | null, walls: TriSoup): PropContactResult {
  const sets: PreparedPropSet[] = [], geometries: PropContactGeometry[] = [];
  const geometryKeys = new Map<string, number>();
  const geometryId = (triangles: number[]): number => {
    if (!triangles.length) return 0xffffffff;
    const key = triangles.join(','), old = geometryKeys.get(key); if (old !== undefined) return old;
    const pos: number[] = [], idx: number[] = [], vertices = new Map<string, number>();
    for (let i = 0; i < triangles.length; i += 3) {
      const k = `${triangles[i]},${triangles[i + 1]},${triangles[i + 2]}`;
      let index = vertices.get(k); if (index === undefined) { index = pos.length / 3; vertices.set(k, index); pos.push(triangles[i]!, triangles[i + 1]!, triangles[i + 2]!); }
      idx.push(index);
    }
    const id = geometries.length; geometries.push({ prefix: `pcg${id}`, pos, idx }); geometryKeys.set(key, id); return id;
  };
  let nextTriangle = walls.count;
  let moved = 0, fitted = 0, collisionTriangles = 0;
  for (const prop of props) {
    const definition = getPropContact(theme, prop.kind);
    if (!definition) throw new Error(`Missing explicit prop contact policy for ${theme}/${prop.kind}; regenerate the audited catalog`);
    const set: PreparedPropSet = { ...prop, matrices: [], policy: definition.policy, fingerprint: definition.fingerprint, contacts: [], support: [], geometry: [], flags: [] };
    sets.push(set);
    for (let i = 0; i < prop.xf.length; i += 6) {
      const originalX = prop.xf[i]!, originalY = prop.xf[i + 1]!, originalZ = prop.xf[i + 2]!;
      let x = originalX, y = originalY, z = originalZ;
      const yaw = prop.xf[i + 3]!, scale = prop.xf[i + 4]!, variant = prop.xf[i + 5]!;
      let sx = prop.kind === 'chevron' && variant === 1 ? -scale : scale, sy = prop.kind === 'pillar' ? scale * (1 + variant) : scale;
      if (prop.kind === 'pillar') {
        const top = definition.bounds[4]!, height = top * sy;
        if (top > 0 && track.groundRay(x, y + height + 2, z, 0, -1, 0, height + 2, HIT)) {
          const fittedY = (HIT.y - y - 0.35) / top;
          if (fittedY > 0 && fittedY < sy) { sy = fittedY; fitted++; }
        }
      }
      let m = matrix(x, y, z, yaw, sx, sy, scale);
      const conflict = () => {
        for (const [ts, supporting] of [[definition.triangles, false], [definition.supportTriangles, true]] as const) for (let k = 0; k < ts.length; k += 9) {
          const triangle = [vertex(ts, k, m), vertex(ts, k + 3, m), vertex(ts, k + 6, m)];
          if (!clearance.conflict(triangle)) continue;
          for (const deckPart of supporting ? deckClearance.clip(triangle) : [triangle]) for (const part of supportClearance.clip(deckPart)) { const c = clearance.conflict(part); if (c) return c; }
        }
        return null;
      };
      if (definition.policy === 'solid' && prop.kind !== 'gore_cushion') {
        let bad = conflict();
        if (bad && OPENING.test(prop.kind)) {
          const before = sx;
          for (let attempt = 0; attempt < 16 && bad; attempt++) { sx *= 1.075; m = matrix(x, y, z, yaw, sx, sy, scale); bad = conflict(); }
          if (!bad) fitted++;
          else { sx = before; m = matrix(x, y, z, yaw, sx, sy, scale); bad = conflict(); }
        }
        if (bad) {
          track.frameAt(bad.path, bad.s, FRAME);
          const sign = (x - FRAME.px) * FRAME.rx + (y - FRAME.py) * FRAME.ry + (z - FRAME.pz) * FRAME.rz < 0 ? -1 : 1;
          const oldGround = terrain?.height(originalX, originalZ);
          const anchored = oldGround !== undefined && Math.abs(originalY - oldGround) < 3;
          const directions = [[FRAME.rx * sign, FRAME.rz * sign], [FRAME.rx * sign + FRAME.tx, FRAME.rz * sign + FRAME.tz], [FRAME.rx * sign - FRAME.tx, FRAME.rz * sign - FRAME.tz], [FRAME.tx, FRAME.tz], [-FRAME.tx, -FRAME.tz], [-FRAME.rx * sign + FRAME.tx, -FRAME.rz * sign + FRAME.tz], [-FRAME.rx * sign - FRAME.tx, -FRAME.rz * sign - FRAME.tz], [-FRAME.rx * sign, -FRAME.rz * sign]].map(v => { const l = Math.hypot(v[0]!, v[1]!) || 1; return [v[0]! / l, v[1]! / l]; });
          for (let attempt = 1; attempt <= 160 && bad; attempt++) for (const direction of directions) {
            x = originalX + direction[0]! * attempt * 0.5; z = originalZ + direction[1]! * attempt * 0.5;
            y = anchored && terrain ? originalY + terrain.height(x, z) - oldGround! : originalY;
            m = matrix(x, y, z, yaw, sx, sy, scale); bad = conflict();
            if (!bad) break;
          }
          if (bad) throw new Error(`Unresolved solid prop ${theme}/${prop.kind} #${i / 6} overlaps path ${bad.path} s=${bad.s.toFixed(2)}; author a clear placement`);
          moved++;
        }
      }
      set.matrices.push(...m);
      set.xf[i] = m[12]!; set.xf[i + 1] = m[13]!; set.xf[i + 2] = m[14]!;
      const local: number[] = [];
      let represented = 0, clipped = 0;
      if (definition.policy === 'solid') {
        for (const [ts, supporting] of [[definition.triangles, false], [definition.supportTriangles, true]] as const) for (let k = 0; k < ts.length; k += 9) {
          const triangle = [vertex(ts, k, m), vertex(ts, k + 3, m), vertex(ts, k + 6, m)];
          // Support decks are clipped by the actual ground band, including triangle interiors whose vertices
          // lie outside the road (wide bridge planks). Only those portions are represented by drivable ground.
          const deckParts = supporting ? deckClearance.clip(triangle) : [triangle];
          if (deckParts.length !== 1 || deckParts[0] !== triangle) represented++;
          const parts = deckParts.flatMap(part => supportClearance.clip(part));
          if (parts.length !== deckParts.length || parts.some((part, n) => part !== deckParts[n])) clipped++;
          if (parts.length === 1 && parts[0] === triangle) {
            // Exact source-local coordinates preserve sharing across thousands of transforms.
            for (let n = k; n < k + 9; n++) local.push(ts[n]!);
          } else for (const polygon of parts) for (let n = 1; n + 1 < polygon.length; n++) {
            const a = inverseVertex(polygon[0]!, m), b = inverseVertex(polygon[n]!, m), c = inverseVertex(polygon[n + 1]!, m);
            const ax = b[0]! - a[0]!, ay = b[1]! - a[1]!, az = b[2]! - a[2]!, bx = c[0]! - a[0]!, by = c[1]! - a[1]!, bz = c[2]! - a[2]!;
            if ((ay * bz - az * by) ** 2 + (az * bx - ax * bz) ** 2 + (ax * by - ay * bx) ** 2 > 1e-14) local.push(...a, ...b, ...c);
          }
        }
      }
      const id = geometryId(local), count = local.length / 9;
      set.geometry.push(id); set.flags.push(count ? TFLAG.PROP | (prop.kind === 'gore_cushion' ? TFLAG.SOFT | TFLAG.GORE : 0) : 0);
      set.contacts.push(nextTriangle, count); set.support.push(represented, clipped);
      nextTriangle += count; collisionTriangles += count;
    }
  }
  return { sets, geometries, moved, fitted, collisionTriangles };
}
