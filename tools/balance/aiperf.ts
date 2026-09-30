// AI cost bench: one 8-bot race per track, timed apart — the one-off plan build (per track, cached), the bots'
// decide() calls, and step(). Cold by default (a fresh process, like tools/bench/race.ts); --warm runs one race
// first so the numbers are steady-state JIT. Times are main-thread CPU time (process.threadCpuUsage), so a loaded
// machine does not inflate them; --wall uses wall-clock time instead.
//   node tools/balance/aiperf.ts [--warm] [--wall] [--reps 1] [--tier pro] [--mode speed|item] [track ...]
// With --reps N (warm only) it reports the fastest of N races: the least disturbed by other load.
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { loadContent, type AiTier, type ModeId } from '@cr/content';
import { loadCtrk, toArrayBuffer } from '@cr/sim';
import { runRace } from '@cr/sim/ai/balance.ts';
import { planFor } from '../../packages/sim/src/ai/plan.ts';

const args = process.argv.slice(2);
const flag = (n: string): boolean => args.includes(n);
const opt = (n: string, d: string): string => { const i = args.indexOf(n); return i >= 0 ? args[i + 1]! : d; };
const tier = opt('--tier', 'pro') as AiTier, mode = opt('--mode', 'speed') as ModeId;
const ids = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && (args[i - 1] === '--tier' || args[i - 1] === '--mode' || args[i - 1] === '--reps')));
const cpuMs = (): number => { const u = process.threadCpuUsage(); return (u.user + u.system) / 1000; };
const clock = flag('--wall') ? (): number => performance.now() : cpuMs;
const content = loadContent();
const chars = ['clay', 'pixel', 'turbo', 'anchor', 'rune', 'nova', 'kage', 'bisque'] as const;
const bots = chars.map((c) => ({ tier, character: c }));
for (const id of ids.length ? ids : ['meadow_loop']) {
  const track = loadCtrk(toArrayBuffer(readFileSync(new URL(`../../apps/client/public/tracks/${id}.ctrk`, import.meta.url))));
  const t0 = clock();
  planFor(track);
  const planMs = clock() - t0;
  if (flag('--warm')) runRace({ track, content, seed: 2, lookahead: 8, mode, bots });
  const reps = flag('--warm') ? Number(opt('--reps', '1')) : 1;
  let ai = 1e9, st = 1e9, ticks = 0;
  for (let k = 0; k < reps; k++) {
    const r = runRace({ track, content, seed: 1, lookahead: 8, mode, bots, now: clock });
    ai = Math.min(ai, r.aiMs * 1000 / r.decides); st = Math.min(st, r.stepMs * 1000 / r.decides); ticks = r.ticks;
  }
  const kartTicks = ticks * bots.length;
  console.log(`${id} ${mode} ${tier}${flag('--warm') ? ' warm' : ' cold'}${flag('--wall') ? ' wall' : ' cpu'}: AI ${ai.toFixed(2)} µs/bot-tick, step ${st.toFixed(2)} µs/kart-tick, plan build ${planMs.toFixed(0)} ms (${(planMs * 1000 / kartTicks).toFixed(2)} µs/kart-tick amortised over the race), ${ticks} ticks`);
}
