// Lazy registry of render/systems/*.system.ts (see types.ts). Vite turns each match into its own chunk, so the
// initial bundle grows by this file only, and tiers without `ts.systems` never download a system.
import type { FrameContext, FrameSystem, SystemFactory } from './types.ts';

const MODULES = import.meta.glob<{ default: SystemFactory }>('./*.system.ts');

/** Loads, creates and initialises every applicable system, sorted by `order`. A failing system logs once and is skipped. */
export async function loadSystems(c: FrameContext): Promise<FrameSystem[]> {
  if (!c.ts.systems) return [];
  const out: FrameSystem[] = [];
  for (const [path, load] of Object.entries(MODULES).sort(([a], [b]) => a.localeCompare(b))) {
    try {
      const mod = await load();
      const sys = await mod.default(c);
      if (!sys) continue;
      await sys.init?.(c);
      out.push(sys);
    } catch (e) {
      // a broken optional system must not take the race down; the tier simply renders without it
      console.warn(`[systems] ${path} failed:`, e);
    }
  }
  return out.sort((a, b) => a.order - b.order);
}

/** Number of system modules present (tests: Low must load none). */
export function systemModuleCount(): number { return Object.keys(MODULES).length; }
