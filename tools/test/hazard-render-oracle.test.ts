import { describe, expect, it } from "vitest";
import {
  hazardShapeExcess,
  thinSuspension,
  fluidTrigger,
} from "../reference/audit-hazard-render.ts";

describe("independent visible hazard contracts", () => {
  it("catches rigid warning-pose displacement outside an otherwise fitted press head", () => {
    const h = {
      kind: "press" as const,
      shape: "box" as const,
      size: [5, 7, 3] as [number, number, number],
    };
    expect(hazardShapeExcess(h, [3.5, 1.5, 0])).toBe(0);
    expect(hazardShapeExcess(h, [3.55, 1.5, 0])).toBeCloseTo(0.05, 10);
    expect(hazardShapeExcess(h, [0, 8, 0])).toBe(5);
  });
  it("does not excuse an arbitrary rigid shaft just because its mesh is called suspension", () => {
    expect(thinSuspension(undefined, 0.07, 0.07)).toBe(false);
    expect(thinSuspension("flexible-suspension", 1.2, 1.2)).toBe(false);
    expect(thinSuspension("flexible-suspension", 0.07, 0.07)).toBe(true);
  });
  it("rejects opaque or metallic trigger bodies even if a fluid name is attached", () => {
    const foam = {
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      metalness: 0,
    };
    expect(fluidTrigger(undefined, [foam])).toBe(false);
    expect(
      fluidTrigger("fluid-trigger", [{ ...foam, transparent: false }]),
    ).toBe(false);
    expect(fluidTrigger("fluid-trigger", [{ ...foam, opacity: 1 }])).toBe(
      false,
    );
    expect(fluidTrigger("fluid-trigger", [{ ...foam, metalness: 0.6 }])).toBe(
      false,
    );
    expect(fluidTrigger("fluid-trigger", [foam])).toBe(true);
  });
});
