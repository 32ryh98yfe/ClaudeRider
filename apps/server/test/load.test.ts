// Light CI version of the load test (apps/server/src/tools/loadtest.ts). LOADTEST_STRICT=1 runs the full 50 rooms and
// enforces 02-contracts E (room tick p99 ≤ 0.5 ms, server tick p99 ≤ 4 ms) on CPU time, which on a shared machine is
// the fair measure; the default run checks the network layer's overhead and that every peer stays connected.
import { describe, expect, it } from 'vitest';
import { loadContent } from '@cr/content';
import { runLoad } from '../src/tools/loadtest.ts';
import { memoryTracks } from './fixture.ts';

const strict = process.env['LOADTEST_STRICT'] === '1';

describe('load', () => {
  it(strict ? '50 rooms: room tick p99 ≤ 0.5 ms, server tick p99 ≤ 4 ms (CPU)' : '10 item rooms with peers run at full rate (sanity bound; the spec budget is checked in strict mode)', () => {
    const track = memoryTracks().get('proving_ring');
    const r = runLoad({ track, content: loadContent(), rooms: strict ? 50 : 10, ticks: strict ? 1800 : 300 });
    process.stdout.write(`[load] ${JSON.stringify(r)}\n`);
    // every peer kept receiving snapshots/relays (no kicks, no backpressure stalls): ≈ 9–14 KB/s payload each
    expect(r.bytesPerPeerPerSec).toBeGreaterThan(6 * 1024);
    expect(r.bytesPerPeerPerSec).toBeLessThan(24 * 1024);
    if (strict) {
      expect(r.cpuRoomTickP99).toBeLessThanOrEqual(0.5);
      expect(r.cpuTotalP99).toBeLessThanOrEqual(4);
    } else {
      // the sim + AI dominate (L1/L3 budgets); this bound only catches a network-layer regression on a busy CI box
      expect(r.cpuRoomTickP50).toBeLessThanOrEqual(2);
    }
  }, 600_000);
});
