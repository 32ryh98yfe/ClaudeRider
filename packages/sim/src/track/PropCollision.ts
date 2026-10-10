// Instanced static contacts: each local model is stored once. BVHs reject distant instances and triangles;
// candidate triangles are transformed back to world space for exact sphere contact under nonuniform scales.
import type { TypedArray } from './container.ts';
import type { Contact } from './BakedTrack.ts';
import { closestPointTri } from './closest.ts';
import { TFLAG } from './format.ts';

interface Node { box: number[]; left: number; right: number; begin: number; end: number }
interface Tree { nodes: Node[]; order: number[] }
interface Geometry { positions: ArrayLike<number>; indices: ArrayLike<number>; tree: Tree; bounds: number[] }
interface Instance { geometry: Geometry; matrix: number[]; inverse: number[]; bounds: number[]; first: number; flags: number }
export interface PropCollisionMeta {
  sets: { n: number; kind: string; policy: 'solid' | 'cosmetic' }[];
  geometries: { prefix: string }[];
}
const emptyBox = (): number[] => [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];

function makeTree(boxes: number[][]): Tree {
  const tree: Tree = { nodes: [], order: boxes.map((_b, i) => i) };
  const build = (begin: number, end: number): number => {
    const box = emptyBox();
    for (let j = begin; j < end; j++) {
      const b = boxes[tree.order[j]!]!;
      for (let axis = 0; axis < 3; axis++) { box[axis] = Math.min(box[axis]!, b[axis]!); box[axis + 3] = Math.max(box[axis + 3]!, b[axis + 3]!); }
    }
    const index = tree.nodes.length, node: Node = { box, left: -1, right: -1, begin, end }; tree.nodes.push(node);
    if (end - begin > 8) {
      let axis = 0;
      for (let k = 1; k < 3; k++) if (box[k + 3]! - box[k]! > box[axis + 3]! - box[axis]!) axis = k;
      const sorted = tree.order.slice(begin, end).sort((a, b) => (boxes[a]![axis]! + boxes[a]![axis + 3]!) - (boxes[b]![axis]! + boxes[b]![axis + 3]!) || a - b);
      for (let i = 0; i < sorted.length; i++) tree.order[begin + i] = sorted[i]!;
      const middle = (begin + end) >>> 1;
      node.left = build(begin, middle); node.right = build(middle, end);
    }
    return index;
  };
  if (boxes.length) build(0, boxes.length);
  return tree;
}

const intersects = (b: number[], x: number, y: number, z: number, rx: number, ry: number, rz: number): boolean =>
  b[0]! <= x + rx && b[3]! >= x - rx && b[1]! <= y + ry && b[4]! >= y - ry && b[2]! <= z + rz && b[5]! >= z - rz;

export class PropCollision {
  private readonly instances: Instance[] = [];
  private readonly tree: Tree;
  private readonly stack: Int32Array;
  private readonly localStack: Int32Array;
  private readonly point = { x: 0, y: 0, z: 0 };
  private readonly triangle = new Float64Array(9);

  constructor(meta: PropCollisionMeta, arrays: Map<string, TypedArray>, firstTriangle: number) {
    const geometries: Geometry[] = meta.geometries.map(({ prefix }) => {
      const positions = arrays.get(`${prefix}.pos`) ?? new Float64Array(0), indices = arrays.get(`${prefix}.idx`) ?? new Uint32Array(0);
      const boxes: number[][] = [];
      for (let i = 0; i + 2 < indices.length; i += 3) {
        const box = emptyBox();
        for (let v = 0; v < 3; v++) for (let axis = 0; axis < 3; axis++) {
          const value = positions[indices[i + v]! * 3 + axis]!;
          if (!Number.isFinite(value)) throw new Error(`Invalid static contact geometry ${prefix}`);
          box[axis] = Math.min(box[axis]!, value); box[axis + 3] = Math.max(box[axis + 3]!, value);
        }
        boxes.push(box);
      }
      const tree = makeTree(boxes);
      return { positions, indices, tree, bounds: tree.nodes[0]?.box ?? emptyBox() };
    });
    let first = firstTriangle;
    for (let s = 0; s < meta.sets.length; s++) {
      const set = meta.sets[s]!; if (set.policy !== 'solid') continue;
      const matrices = arrays.get(`prop${s}.mat`), ids = arrays.get(`prop${s}.geo`), flags = arrays.get(`prop${s}.flags`), contacts = arrays.get(`prop${s}.contacts`);
      if (!matrices || !ids) throw new Error(`Missing static prop matrices ${set.kind}`);
      for (let i = 0; i < set.n; i++) {
        if (ids[i] === 0xffffffff && (contacts?.[i * 2 + 1] ?? 0) === 0) continue;
        const geometry = geometries[ids[i]!];
        if (!geometry) throw new Error(`Missing static prop geometry ${set.kind}`);
        const firstId = contacts?.[i * 2] ?? first; first = firstId + geometry.indices.length / 3;
        if (!geometry.tree.nodes.length) continue;
        const m = Array.from({ length: 16 }, (_, j) => matrices[i * 16 + j]!);
        if (!m.every(Number.isFinite)) throw new Error(`Nonfinite prop contact matrix ${set.kind}`);
        const det = m[0]! * (m[5]! * m[10]! - m[9]! * m[6]!) - m[4]! * (m[1]! * m[10]! - m[9]! * m[2]!) + m[8]! * (m[1]! * m[6]! - m[5]! * m[2]!);
        if (!Number.isFinite(det) || Math.abs(det) < 1e-12) throw new Error(`Singular prop contact ${set.kind}`);
        const inverse = [m[5]! * m[10]! - m[9]! * m[6]!, m[8]! * m[6]! - m[4]! * m[10]!, m[4]! * m[9]! - m[8]! * m[5]!,
          m[9]! * m[2]! - m[1]! * m[10]!, m[0]! * m[10]! - m[8]! * m[2]!, m[8]! * m[1]! - m[0]! * m[9]!,
          m[1]! * m[6]! - m[5]! * m[2]!, m[4]! * m[2]! - m[0]! * m[6]!, m[0]! * m[5]! - m[4]! * m[1]!].map((x) => x / det);
        const b = geometry.bounds, bounds = emptyBox();
        for (let corner = 0; corner < 8; corner++) {
          const x = b[corner & 1 ? 3 : 0]!, y = b[corner & 2 ? 4 : 1]!, z = b[corner & 4 ? 5 : 2]!;
          for (let axis = 0; axis < 3; axis++) {
            const value = m[axis]! * x + m[axis + 4]! * y + m[axis + 8]! * z + m[axis + 12]!;
            bounds[axis] = Math.min(bounds[axis]!, value); bounds[axis + 3] = Math.max(bounds[axis + 3]!, value);
          }
        }
        this.instances.push({ geometry, matrix: m, inverse, bounds, first: firstId, flags: flags?.[i] ?? TFLAG.PROP });
      }
    }
    this.tree = makeTree(this.instances.map((i) => i.bounds));
    // Reuse traversal storage; these pushes warm its maximum depth at load, not during physics ticks.
    this.stack = new Int32Array(this.tree.nodes.length + 1);
    this.localStack = new Int32Array(Math.max(0, ...geometries.map((g) => g.tree.nodes.length)) + 1);
  }

  sphere(cx: number, cy: number, cz: number, radius: number, out: Contact[], max: number, count: number): number {
    if (!this.tree.nodes.length || !(radius >= 0 && radius < 1e6 && max > 0)) return count;
    let pending = 1; this.stack[0] = 0;
    while (pending) {
      const node = this.tree.nodes[this.stack[--pending]!]!;
      if (!intersects(node.box, cx, cy, cz, radius, radius, radius)) continue;
      if (node.left >= 0) { this.stack[pending++] = node.right; this.stack[pending++] = node.left; continue; }
      for (let entry = node.begin; entry < node.end; entry++) {
        const instance = this.instances[this.tree.order[entry]!]!, m = instance.matrix, inv = instance.inverse, g = instance.geometry;
        if (!intersects(instance.bounds, cx, cy, cz, radius, radius, radius)) continue;
        const dx = cx - m[12]!, dy = cy - m[13]!, dz = cz - m[14]!;
        const x = inv[0]! * dx + inv[1]! * dy + inv[2]! * dz, y = inv[3]! * dx + inv[4]! * dy + inv[5]! * dz, z = inv[6]! * dx + inv[7]! * dy + inv[8]! * dz;
        const rx = radius * Math.sqrt(inv[0]! * inv[0]! + inv[1]! * inv[1]! + inv[2]! * inv[2]!);
        const ry = radius * Math.sqrt(inv[3]! * inv[3]! + inv[4]! * inv[4]! + inv[5]! * inv[5]!);
        const rz = radius * Math.sqrt(inv[6]! * inv[6]! + inv[7]! * inv[7]! + inv[8]! * inv[8]!);
        let localPending = 1; this.localStack[0] = 0;
        while (localPending) {
          const local = g.tree.nodes[this.localStack[--localPending]!]!;
          if (!intersects(local.box, x, y, z, rx, ry, rz)) continue;
          if (local.left >= 0) { this.localStack[localPending++] = local.right; this.localStack[localPending++] = local.left; continue; }
          for (let at = local.begin; at < local.end; at++) {
            const id = g.tree.order[at]!, tri = this.triangle;
            for (let v = 0; v < 3; v++) {
              const index = g.indices[id * 3 + v]! * 3, px = g.positions[index]!, py = g.positions[index + 1]!, pz = g.positions[index + 2]!;
              for (let axis = 0; axis < 3; axis++) tri[v * 3 + axis] = m[axis]! * px + m[axis + 4]! * py + m[axis + 8]! * pz + m[axis + 12]!;
            }
            const p = this.point;
            closestPointTri(cx, cy, cz, tri[0]!, tri[1]!, tri[2]!, tri[3]!, tri[4]!, tri[5]!, tri[6]!, tri[7]!, tri[8]!, p);
            const ex = cx - p.x, ey = cy - p.y, ez = cz - p.z, d2 = ex * ex + ey * ey + ez * ez;
            if (!(d2 >= 0 && d2 < radius * radius)) continue;
            const distance = Math.sqrt(d2), depth = radius - distance, triangleId = instance.first + id;
            let slot = count;
            if (count >= max) {
              slot = 0;
              for (let i = 1; i < count; i++) if (out[i]!.depth < out[slot]!.depth || out[i]!.depth === out[slot]!.depth && out[i]!.tri > out[slot]!.tri) slot = i;
              if (depth < out[slot]!.depth || depth === out[slot]!.depth && triangleId >= out[slot]!.tri) continue;
            } else count++;
            let nx = ex, ny = ey, nz = ez;
            if (distance > 1e-9) { nx /= distance; ny /= distance; nz /= distance; }
            else {
              const ax = tri[3]! - tri[0]!, ay = tri[4]! - tri[1]!, az = tri[5]! - tri[2]!, bx = tri[6]! - tri[0]!, by = tri[7]! - tri[1]!, bz = tri[8]! - tri[2]!;
              nx = ay * bz - az * by; ny = az * bx - ax * bz; nz = ax * by - ay * bx;
              const length = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= length; ny /= length; nz /= length;
            }
            const contact = out[slot]!;
            contact.x = p.x; contact.y = p.y; contact.z = p.z; contact.nx = nx; contact.ny = ny; contact.nz = nz;
            contact.depth = depth; contact.flags = instance.flags; contact.tri = triangleId;
          }
        }
      }
    }
    return count;
  }
}
