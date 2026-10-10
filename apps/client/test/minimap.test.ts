import { describe, expect, it } from 'vitest';
import { minimapGeometry } from '../src/ui/hud/minimap.ts';

describe('course map topology', () => {
  it('closes only the circuit and retains branches in the same world coordinate transform', () => {
    const geo = minimapGeometry({ paths: [
      { id: 'main', closed: true, points: new Float32Array([0, 0, 100, 0, 100, 80, 0, 80]) },
      { id: 'branch', closed: false, points: new Float32Array([10, 0, 50, -30, 90, 0]) },
    ] })!;
    expect(geo.paths[0]!.d.endsWith('Z')).toBe(true);
    expect(geo.paths[1]!.d.endsWith('Z')).toBe(false);
    expect(geo.z0).toBeLessThan(-30); expect(geo.x0).toBeLessThan(0);
    expect(geo.paths[0]!.d).toContain(`${(-geo.x0).toFixed(2)} ${(-geo.z0).toFixed(2)}`);
  });
  it('never invents a finish-to-start connection for a point-to-point descent', () => {
    const geo = minimapGeometry({ paths: [{ id: 'descent', closed: false, points: new Float32Array([0, 0, 30, 300, -20, 600]) }] })!;
    expect(geo.paths[0]!.d).not.toContain('Z');
    expect(geo.w).toBeGreaterThan(0); expect(geo.h).toBeGreaterThan(geo.w);
    expect(minimapGeometry({ paths: [] })).toBeNull();
  });
});
