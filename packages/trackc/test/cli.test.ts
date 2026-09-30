// CLI: worker-thread builds (--jobs) and the content-hash cache give the same bytes as an in-process build.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const CLI = new URL('../src/cli.ts', import.meta.url).pathname;
const dirs: string[] = [];
const tmp = (): string => { const d = mkdtempSync(join(tmpdir(), 'trackc-cli-')); dirs.push(d); return d; };
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

function cli(...args: string[]): { out: string; code: number } {
  const r = spawnSync(process.execPath, [CLI, 'build', ...args], { encoding: 'utf8', timeout: 170_000 });
  return { out: (r.stdout ?? '') + (r.stderr ?? ''), code: r.status ?? -1 };
}

describe('trackc CLI', () => {
  it('--jobs 2 builds in workers; a rerun is served from the cache; both match a --no-cache in-process build', () => {
    const a = tmp(), b = tmp();
    const ids = 'f5_hazards,drag_oval';
    const first = cli(ids, '--jobs', '2', '--no-ao', '--no-pvs', '--out', a);
    expect(first.code).toBe(0);
    expect(first.out).toMatch(/✓ f5_hazards/);
    const again = cli(ids, '--jobs', '2', '--no-ao', '--no-pvs', '--out', a);
    expect(again.out).toMatch(/✓ drag_oval: .* cached/);
    expect(again.out).toMatch(/✓ f5_hazards: .* cached/);
    const fresh = cli(ids, '--no-cache', '--no-ao', '--no-pvs', '--out', b);
    expect(fresh.code).toBe(0);
    for (const id of ['f5_hazards', 'drag_oval']) for (const ext of ['ctrk', 'vis']) {
      expect(Buffer.compare(readFileSync(join(a, `${id}.${ext}`)), readFileSync(join(b, `${id}.${ext}`))), `${id}.${ext}`).toBe(0);
    }
    const index = JSON.parse(readFileSync(join(a, 'index.json'), 'utf8')) as Record<string, { hash: string }>;
    expect(Object.keys(index).sort()).toEqual(['drag_oval', 'f5_hazards']);
  });

  it('reports unknown ids and exits non-zero under --validate', () => {
    const r = cli('no_such_track', '--validate', '--out', tmp());
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/✗ no_such_track: no tracks/);
  });
});
