// Browser determinism selftest: runs the shared scenario and publishes hashes on window.__selftest
// (e2e compares them with the Node run, ADR-003 "Node vs Chromium").
import { loadContent } from '@cr/content';
import { loadCtrk } from '@cr/sim';
import { determinismScenario } from '@cr/sim/testing/scenario.ts';

declare global { interface Window { __selftest?: { speed: string[]; item: string[]; ms: number } | { error: string } } }

async function main(): Promise<void> {
  const out = document.getElementById('out')!;
  try {
    const id = new URLSearchParams(location.search).get('track') ?? 'meadow_loop';
    const res = await fetch(`tracks/${id}.ctrk`);
    if (!res.ok) throw new Error(`tracks/${id}.ctrk: HTTP ${res.status}`);
    const track = loadCtrk(await res.arrayBuffer());
    const content = loadContent();
    const t0 = performance.now();
    const speed = determinismScenario(track, content, 'speed');
    const item = determinismScenario(track, content, 'item');
    const ms = performance.now() - t0;
    window.__selftest = { speed, item, ms };
    out.textContent = `track ${id}\nspeed ${speed.join(' ')}\nitem  ${item.join(' ')}\n${ms.toFixed(0)} ms`;
  } catch (e) {
    window.__selftest = { error: String((e as Error)?.stack ?? e) };
    out.textContent = `error: ${String(e)}`;
  }
}
void main();
