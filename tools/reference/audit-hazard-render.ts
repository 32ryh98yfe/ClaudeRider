/// <reference types="vite/client" />
// Actual renderer meshes under shared analytic poses, checked independently against contact primitives/ground.
// node tools/reference/audit-hazard-render.ts /absolute/report.json [--directory /path/to/bakes]
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Mesh, Object3D } from "three/webgpu";
import { loadContent } from "@cr/content";
import {
  CTRK_MAGIC,
  CTRK_VERSION,
  CVIS_MAGIC,
  CVIS_VERSION,
  loadCtrk,
  readContainer,
  toArrayBuffer,
  type HazardDefBaked,
  type HazardPose,
} from "@cr/sim";
import {
  TrackHazards,
  type HazardVisMeta,
} from "../../apps/client/src/render/track/hazards.ts";
import type { GpuParticles } from "../../apps/client/src/render/vfx/gpuParticles.ts";
import type { ThemeKit } from "../../apps/client/src/render/themes/kit.ts";
import {
  TriangleBVH,
  barycentricSamples,
  flattenTriangles,
  type Vec3,
} from "./contact-geometry.ts";
const requireClient = createRequire(
  new URL("../../apps/client/package.json", import.meta.url),
);
const THREE = (await import(
  pathToFileURL(requireClient.resolve("three/webgpu")).href
)) as typeof import("three/webgpu");
const content = loadContent();
const NO_PARTICLES = {
  rate: () => 0,
  burst: () => 0,
  spawn: () => {},
} as unknown as GpuParticles;

export function hazardShapeExcess(
  h: Pick<HazardDefBaked, "shape" | "kind" | "size" | "motion">,
  p: Vec3,
): number {
  const [x, y, z] = p,
    [a, b, c] = h.size;
  if (h.shape === "box")
    return Math.max(0, Math.abs(x) - b / 2, Math.abs(z) - a / 2, -y, y - c);
  if (h.shape === "sphere") return Math.max(0, Math.hypot(x, y, z) - a);
  if (
    h.kind === "swinger" ||
    h.motion?.type === "pendulum" ||
    h.motion?.type === "rotate"
  )
    return Math.max(0, Math.hypot(x, z, Math.max(0, Math.abs(y) - b / 2)) - a);
  return Math.max(0, Math.hypot(x, z) - a, -y, y - b);
}
export function thinSuspension(
  role: unknown,
  width: number,
  depth: number,
): boolean {
  return (
    role === "flexible-suspension" &&
    width >= 0 &&
    width <= 0.14 &&
    depth >= 0 &&
    depth <= 0.14
  );
}
interface FluidMaterial {
  transparent: boolean;
  opacity: number;
  depthWrite: boolean;
  metalness?: number;
}
/** A semantic tag alone cannot exempt an opaque iron ball from solid contact. */
export function fluidTrigger(
  role: unknown,
  materials: readonly FluidMaterial[],
): boolean {
  return (
    role === "fluid-trigger" &&
    materials.length > 0 &&
    materials.every(
      (material) =>
        material.transparent &&
        material.opacity > 0 &&
        material.opacity <= 0.8 &&
        !material.depthWrite &&
        (material.metalness ?? 0) === 0,
    )
  );
}
interface Finding {
  track: string;
  hazard: string;
  hazardId?: number;
  kind: string;
  detail: string;
  excessM?: number;
  point?: number[];
}
export async function auditHazardRender(
  directory = resolve(
    new URL("../../apps/client/public/tracks/", import.meta.url).pathname,
  ),
) {
  const rows: {
      track: string;
      hazard: string;
      hazardId: number;
      prop: string;
      kind: string;
      phase: number;
      active: number;
      telegraph: number;
      visible: boolean;
      vertices: number;
      maxShapeExcessM: number;
      grateSamples: number;
      maxGroundGapM: number;
      suspensions: number;
      fluidMeshes: number;
    }[] = [],
    findings: Finding[] = [],
    files: { track: string; ctrkSha256: string; visSha256: string }[] = [];
  for (const entry of content.tracks.all) {
    const a = readFileSync(resolve(directory, `${entry.id}.ctrk`)),
      b = readFileSync(resolve(directory, `${entry.id}.vis`));
    files.push({
      track: entry.id,
      ctrkSha256: createHash("sha256").update(a).digest("hex"),
      visSha256: createHash("sha256").update(b).digest("hex"),
    });
    const track = loadCtrk(toArrayBuffer(a)),
      physical = readContainer(toArrayBuffer(a), CTRK_MAGIC, CTRK_VERSION),
      visual = readContainer(toArrayBuffer(b), CVIS_MAGIC, CVIS_VERSION)
        .meta as { themeId: string; hazards?: HazardVisMeta[] };
    const kit = (
      await import(
        new URL(
          `../../apps/client/src/render/themes/${visual.themeId}/index.ts`,
          import.meta.url,
        ).href
      )
    ).default(content) as ThemeKit;
    const ground = new TriangleBVH(
      flattenTriangles(
        physical.arrays.get("g.pos")!,
        physical.arrays.get("g.idx")!,
      ),
    );
    for (const meta of visual.hazards ?? []) {
      const def = track.hazards[meta.id]!;
      if (
        meta.kind !== def.kind ||
        meta.shape !== def.shape ||
        meta.size.some((v, i) => v !== def.size[i])
      )
        findings.push({
          track: entry.id,
          hazard: def.name ?? String(meta.id),
          hazardId: meta.id,
          kind: "definition_mismatch",
          detail: "Renderer size/kind/shape differs from authority",
        });
      const custom = !!(
        kit.props[meta.prop] ??
        kit.props[`hazard_${meta.kind === "traffic" ? "car" : meta.kind}`]
      );
      const view = new TrackHazards([meta], track, kit);
      const phases = new Set([
        def.activeFrom - 1,
        def.activeFrom,
        Math.floor((def.activeFrom + def.activeTo) / 2),
        def.activeTo,
        Math.floor((def.activeTo + def.activeFrom + def.periodTicks) / 2),
      ]);
      for (const phase of phases) {
        const period = def.periodTicks || 1,
          tick =
            ((((phase - def.offsetTicks) % period) + period) % period) + period,
          pose: HazardPose = { x: 0, y: 0, z: 0, active: 0, telegraph: 0 };
        track.hazardPose(meta.id, tick, pose);
        view.update(tick, 0, 1 / 60, NO_PARTICLES, NO_PARTICLES);
        view.root.updateMatrixWorld(true);
        const f = new THREE.Vector3(pose.fx ?? 0, pose.fy ?? 0, pose.fz ?? 1),
          u = new THREE.Vector3(
            pose.ux ?? 0,
            pose.uy ?? 1,
            pose.uz ?? 0,
          ).normalize(),
          s = new THREE.Vector3().crossVectors(u, f).normalize();
        f.crossVectors(s, u).normalize();
        const inverse = new THREE.Matrix4()
            .makeBasis(s, u, f)
            .setPosition(pose.x, pose.y, pose.z)
            .invert(),
          root = view.root.children[0]!;
        const row = {
          track: entry.id,
          hazard: def.name ?? String(meta.id),
          hazardId: meta.id,
          prop: meta.prop,
          kind: def.kind,
          phase,
          active: pose.active,
          telegraph: pose.telegraph,
          visible: root.visible,
          vertices: 0,
          maxShapeExcessM: 0,
          grateSamples: 0,
          maxGroundGapM: 0,
          suspensions: 0,
          fluidMeshes: 0,
        };
        const visible = (o: Object3D): boolean => {
          for (let p: Object3D | null = o; p && p !== view.root; p = p.parent)
            if (!p.visible) return false;
          return true;
        };
        root.traverse((object) => {
          const mesh = object as Mesh;
          if (!mesh.geometry || !visible(object)) return;
          if (object.userData["fxColor"]) return; // Explicit telegraph ring: an area indicator, not a rigid object.
          if (object.name === "hazardSuspension") {
            mesh.geometry.computeBoundingBox();
            const size = mesh.geometry.boundingBox!.getSize(
              new THREE.Vector3(),
            );
            if (!thinSuspension(object.userData["contactRole"], size.x, size.z))
              findings.push({
                track: entry.id,
                hazard: row.hazard,
                kind: "unproved_suspension",
                detail: `Only explicitly tagged flexible cable/chain may be nonblocking; dimensions${size.toArray().join(",")}`,
              });
            row.suspensions++;
            return;
          }
          const supportedGrate =
            !custom && def.kind === "geyser" && object.name === "hazardBody";
          if (def.contact === "trigger" && !supportedGrate) {
            const materials = Array.isArray(mesh.material)
              ? mesh.material
              : [mesh.material];
            if (!fluidTrigger(object.userData["contactRole"], materials))
              findings.push({
                track: entry.id,
                hazard: row.hazard,
                hazardId: meta.id,
                kind: "rigid_body_without_solid_contact",
                detail:
                  "Trigger-only visible meshes must be explicitly fluid, transparent, nonmetallic, and not write depth; all rigid grates require ground proof",
              });
            row.fluidMeshes++;
          }
          const p = mesh.geometry.getAttribute("position"),
            ix = mesh.geometry.index;
          for (let i = 0; i < p.count; i++) {
            const point = new THREE.Vector3()
                .fromBufferAttribute(p, i)
                .applyMatrix4(object.matrixWorld)
                .applyMatrix4(inverse),
              excess = hazardShapeExcess(
                def,
                point.toArray() as [number, number, number],
              );
            row.vertices++;
            row.maxShapeExcessM = Math.max(row.maxShapeExcessM, excess);
          }
          // Built-in geyser metalwork is a supported grate, not a collision-free raised rigid rim.
          if (supportedGrate)
            for (let i = 0; i < (ix?.count ?? p.count); i += 3) {
              const pointAt = (k: number): Vec3 =>
                new THREE.Vector3()
                  .fromBufferAttribute(p, ix ? ix.getX(i + k) : i + k)
                  .applyMatrix4(object.matrixWorld)
                  .toArray();
              const tri: [Vec3, Vec3, Vec3] = [
                pointAt(0),
                pointAt(1),
                pointAt(2),
              ];
              for (const point of barycentricSamples(...tri, 0.25)) {
                const hit = ground.nearest(point, 0.02);
                row.grateSamples++;
                row.maxGroundGapM = Math.max(
                  row.maxGroundGapM,
                  hit?.distance ?? Infinity,
                );
              }
            }
        });
        if (row.maxShapeExcessM > 1e-5)
          findings.push({
            track: entry.id,
            hazard: row.hazard,
            kind: "visible_body_outside_proxy",
            detail: `Visible body/light mesh exceeds authority shape at integer phase${phase}`,
            excessM: row.maxShapeExcessM,
          });
        if (row.maxGroundGapM > 0.006)
          findings.push({
            track: entry.id,
            hazard: row.hazard,
            kind: "rigid_grate_without_ground",
            detail:
              "Every grate triangle must be within6mm of real ground; a cosmetic name is insufficient",
            excessM: row.maxGroundGapM,
          });
        if (
          def.kind === "train" &&
          root.visible !== !!(pose.active || pose.telegraph)
        )
          findings.push({
            track: entry.id,
            hazard: row.hazard,
            kind: "train_visibility_mismatch",
            detail:
              "Parked inactive train visibility differs from contact policy",
          });
        rows.push(row);
      }
      view.dispose();
    }
  }
  return {
    passed: findings.length === 0,
    method:
      "Actual TrackHazards meshes at integer shared analytic poses; independent convex containment and world-ground BVH triangle-interior distances",
    classifications: {
      steam: "cosmetic particles, no rigid geometry",
      fluidTrigger:
        "explicit fluid role plus transparent, nonmetallic material without depth writing; opacity at most 0.8",
      warningRing: "explicit telegraph area indicator",
      flexibleSuspension: "explicit contactRole plus width/depth≤0.14m only",
      geyserGrate: "rigid appearance supported by actual ground within0.006m",
    },
    files,
    rows,
    findings,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2),
    output = args[0];
  if (!output) throw new Error("Output JSON path required");
  const i = args.indexOf("--directory"),
    report = await auditHazardRender(i >= 0 ? args[i + 1] : undefined);
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify({
      passed: report.passed,
      tracks: report.files.length,
      poseCases: report.rows.length,
      findings: report.findings,
      vertices: report.rows.reduce((n, r) => n + r.vertices, 0),
      grateSamples: report.rows.reduce((n, r) => n + r.grateSamples, 0),
    }),
  );
  if (!report.passed) process.exitCode = 1;
}
