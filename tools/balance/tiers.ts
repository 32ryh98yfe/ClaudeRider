// Tier pace report (14-ai §2, ADR-009): pace of each tier vs the noise-free Legend ghost, per track, across
// characters and seeds, driven through the same 8-tick lookahead a RaceRoom uses.
//   node tools/balance/tiers.ts [--tracks a,b] [--seeds 3] [--lookahead 8] [--chars all|clay,pixel] [--tiers rookie,pro]
//                               [--field] [--json out.json] [--verbose] [--set rookie.vMul=0.95,pro.cornerSpeedMul=0.98]
// --set patches AI_TIERS / AI_EXECUTION (tier.key) or AI_TUNING (tuning.key) in this process only (tuning experiments; commit the winners to the tables).
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { loadContent, CHARACTER_IDS, type AiTier, type CharacterId } from '@cr/content';
import { loadCtrk, toArrayBuffer, type BakedTrack } from '@cr/sim';
import { runRace, ghostRaceSec, soloPace, PACE_BANDS } from '@cr/sim/ai/balance.ts';
import { AI_TIERS } from '@cr/sim';
import { AI_EXECUTION } from '@cr/sim';
import { AI_TUNING } from '@cr/sim/ai/driver.ts';
import { buildTrack } from '@cr/trackc/build.ts';

export const PACE_TARGETS = PACE_BANDS;
const TIERS: readonly AiTier[] = ['rookie', 'racer', 'pro', 'legend'];
const ROOT = new URL('../../', import.meta.url);

export function loadBalanceTracks(filter?: readonly string[]): { id: string; track: BakedTrack }[] {
  const out: { id: string; track: BakedTrack }[] = [];
  const pub = new URL('apps/client/public/tracks/', ROOT);
  const idx = new URL('index.json', pub);
  if (existsSync(idx)) {
    for (const id of Object.keys(JSON.parse(readFileSync(idx, 'utf8')) as Record<string, unknown>)) {
      if (filter && !filter.includes(id)) continue;
      out.push({ id, track: loadCtrk(toArrayBuffer(readFileSync(new URL(`${id}.ctrk`, pub)))) });
    }
  }
  const fx = new URL('tools/balance/tracks/', ROOT);
  for (const f of readdirSync(fx).filter((x) => x.endsWith('.ctd')).sort()) {
    const id = f.replace(/\.ctd$/, '');
    if (filter && !filter.includes(id)) continue;
    const file = new URL(f, fx);
    const r = buildTrack(readFileSync(file, 'utf8'), file.pathname);
    out.push({ id, track: loadCtrk(toArrayBuffer(r.ctrk)) });
  }
  return out;
}

interface TierRow { tier: AiTier; mean: number; sd: number; min: number; max: number; n: number; pass: boolean; byChar: Record<string, number>; secMean: number }

function stats(xs: number[]): { mean: number; sd: number; min: number; max: number } {
  const n = xs.length || 1;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n);
  return { mean, sd, min: Math.min(...xs), max: Math.max(...xs) };
}

function main(): void {
  const args = process.argv.slice(2);
  const opt = (f: string, d: string): string => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1]! : d; };
  const flag = (f: string): boolean => args.includes(f);
  const trackFilter = opt('--tracks', '') ? opt('--tracks', '').split(',') : undefined;
  const seeds = Number(opt('--seeds', '3'));
  const LA = Number(opt('--lookahead', '8'));
  const charsArg = opt('--chars', 'all');
  const chars: CharacterId[] = charsArg === 'all' ? [...CHARACTER_IDS] : (charsArg.split(',') as CharacterId[]);
  const tiers = opt('--tiers', '') ? (opt('--tiers', '').split(',') as AiTier[]) : TIERS;
  for (const kv of opt('--set', '').split(',').filter(Boolean)) {
    const [path, val] = kv.split('=');
    const [tier, key] = (path ?? '').split('.') as [AiTier, string];
    const v = val!.includes(':') ? val!.split(':').map(Number) : Number(val);
    if ((tier as string) === 'tuning') { const t = AI_TUNING as unknown as Record<string, unknown>; if (!(key in t)) throw new Error(`--set: unknown key ${path}`); t[key] = v; continue; }
    const prof = AI_TIERS[tier] as unknown as Record<string, unknown>, ex = AI_EXECUTION[tier] as unknown as Record<string, unknown>;
    if (key in prof) prof[key] = v; else if (key in ex) ex[key] = v; else throw new Error(`--set: unknown key ${path}`);
  }
  const content = loadContent();
  const tracks = loadBalanceTracks(trackFilter);
  const report: Record<string, unknown> = {};
  let fails = 0;
  for (const { id, track } of tracks) {
    const t0 = performance.now();
    const ref = ghostRaceSec(track, content, undefined, LA);
    console.log(`\n${id}: ${track.laps} laps × ${track.lapLength.toFixed(0)} m, ghost ${ref.toFixed(2)} s (lookahead ${LA})`);
    console.log('  tier    pace   ±sd    min    max    target      race s   verdict   per character');
    const rows: TierRow[] = [];
    for (const tier of tiers) {
      const paces: number[] = [], secs: number[] = [];
      const byChar: Record<string, number[]> = {};
      const extra = { drifts: 0, inst: 0, boosts: 0, walls: 0, hard: 0, resp: 0, start: 0, mistakes: 0, grip: 0, sloppy: 0, n: 0 };
      for (const c of chars) for (let sd = 0; sd < seeds; sd++) {
        const r = soloPace(track, content, tier, c, 1000 + sd * 31 + chars.indexOf(c), ref, undefined, LA);
        paces.push(r.pace); secs.push(r.sec);
        (byChar[c] ??= []).push(r.pace);
        const k = r.kart;
        extra.drifts += k.drifts; extra.inst += k.instantBoosts; extra.boosts += k.boostsUsed; extra.walls += k.wallHits; extra.hard += k.hardHits;
        extra.resp += k.respawns; extra.start += k.startTier; extra.mistakes += k.ai.mistakes; extra.grip += k.ai.plans[2]; extra.sloppy += k.ai.plans[1]; extra.n++;
      }
      const st = stats(paces);
      const tgt = PACE_TARGETS[tier];
      const pass = tier === 'legend' ? st.mean >= tgt.lo : st.mean >= tgt.lo && st.mean <= tgt.hi;
      if (!pass) fails++;
      const bc: Record<string, number> = {};
      for (const [c, v] of Object.entries(byChar)) bc[c] = v.reduce((a, b) => a + b, 0) / v.length;
      rows.push({ tier, ...st, n: paces.length, pass, byChar: bc, secMean: stats(secs).mean });
      const pc = Object.entries(bc).map(([c, v]) => `${c} ${(v * 100).toFixed(1)}`).join(', ');
      console.log(`  ${tier.padEnd(7)} ${(st.mean * 100).toFixed(1).padStart(5)}% ${(st.sd * 100).toFixed(1).padStart(4)}  ${(st.min * 100).toFixed(1).padStart(5)}  ${(st.max * 100).toFixed(1).padStart(5)}   ${tgt.target.padEnd(10)} ${stats(secs).mean.toFixed(1).padStart(7)}   ${pass ? 'PASS' : 'FAIL'}      ${flag('--verbose') ? pc : ''}`);
      if (flag('--verbose')) {
        const n = extra.n;
        console.log(`          per race: drifts ${(extra.drifts / n).toFixed(1)} inst ${(extra.inst / n).toFixed(1)} boosts ${(extra.boosts / n).toFixed(1)} walls ${(extra.walls / n).toFixed(1)} hard ${(extra.hard / n).toFixed(2)} respawns ${(extra.resp / n).toFixed(2)} startTier ${(extra.start / n).toFixed(2)} mistakes ${(extra.mistakes / n).toFixed(1)} sloppy ${(extra.sloppy / n).toFixed(1)} grip ${(extra.grip / n).toFixed(1)}`);
      }
    }
    const field: Record<string, unknown> = {};
    if (flag('--field')) {
      console.log('  8-bot same-tier field (mixed karts and characters):');
      const karts = ['pebble', 'clay_comet', 'arrowhead', 'tugboat', 'glacier_sled', 'neon_blade', 'jet_kettle', 'crown_cruiser'] as const;
      for (const tier of tiers) {
        const r = runRace({ track, content, seed: 4242, lookahead: LA, now: () => performance.now(), bots: chars.slice(0, 8).map((c, i) => ({ tier, character: c, kart: karts[i % 8] })) });
        const fin = r.karts.filter((k) => k.finished);
        const times = fin.map((k) => k.raceTicks / 60);
        const laps = track.laps * 8;
        const hard = r.karts.reduce((a, k) => a + k.hardHits, 0), resp = r.karts.reduce((a, k) => a + k.respawns, 0);
        const stuck = Math.max(...r.karts.map((k) => k.maxStuckTicks));
        const drafts = r.karts.reduce((a, k) => a + k.draftBursts, 0), ovt = r.karts.reduce((a, k) => a + k.ai.overtakeLanes, 0);
        const us = (r.aiMs * 1000) / r.decides;
        console.log(`    ${tier.padEnd(7)} finish ${fin.length}/8, winner ${Math.min(...times).toFixed(1)} s (${((ref / Math.min(...times)) * 100).toFixed(1)}%), mean ${(times.reduce((a, b) => a + b, 0) / (times.length || 1)).toFixed(1)} s, bumps/bot-lap ${(r.bumps / laps).toFixed(2)}, hard/bot-lap ${(hard / laps).toFixed(2)}, respawns ${resp}, maxStuck ${stuck} t, drafts ${drafts}, overtake lanes ${ovt}, AI ${us.toFixed(2)} µs/bot-tick`);
        field[tier] = { finishers: fin.length, winner: Math.min(...times), bumpsPerBotLap: r.bumps / laps, hardPerBotLap: hard / laps, respawns: resp, maxStuck: stuck, drafts, aiMicros: us };
      }
    }
    report[id] = { ref, rows, field };
    console.log(`  (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  }
  if (opt('--json', '')) writeFileSync(opt('--json', ''), JSON.stringify(report, null, 1));
  console.log(fails ? `\n${fails} tier rows outside their band` : '\nall tiers inside their pace bands');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
