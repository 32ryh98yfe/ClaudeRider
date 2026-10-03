// Bounded, reproducible calibration. Validation clips never participate in the objective.
// node tools/reference/calibrate.ts /tmp/calibration.json
import { writeFileSync } from 'node:fs';
import { REFERENCE_CLIPS } from '@cr/content/reference-driving.ts';
import type { KartParams } from '@cr/sim';
import { measureClip } from './measure.ts';

const output = process.argv[2];
if (!output) throw new Error('Usage: node tools/reference/calibrate.ts <output.json>');
const clips = REFERENCE_CLIPS.filter((clip) => clip.split === 'calibration');
// These four parameters are the complete physical difference from fb71b3f for this experiment.
const baselineProfile = { aStartMax: 30, startCapMul: 1, g0: 0.7, kCut: 36 };
const base = clips.map((clip) => measureClip(clip, baselineProfile, false));
const candidates: { overrides: Partial<KartParams>; score: number; errors: number[]; gaugeErrorSeconds: number | null }[] = [];
for (const aStartMax of [42, 43, 44, 45, 46]) for (const startCapMul of [1.06, 1.08, 1.1, 1.12, 1.14]) {
  for (const g0 of [0.95, 1, 1.05, 1.1, 1.15]) for (const kCut of [9, 12, 18, 24, 36]) {
    const overrides = { aStartMax, startCapMul, g0, kCut };
    const reports = clips.map((clip) => measureClip(clip, overrides, true));
    // Quantifiable launch dominates; continuation speed is a low-weight diagnostic due to unknown initial slip.
    let score = 0;
    for (let i = 0; i < clips.length; i++) {
      const eligible = clips[i]!.quantitativeEligible, error = reports[i]!.meanRelativeError;
      score += error * (eligible ? 1 : 0.08);
      // Reject a candidate that materially worsens even an uncertain maneuver, rather than hiding it in an average.
      score += Math.max(0, error - base[i]!.meanRelativeError - 0.01) * 2;
    }
    const launch = reports[0]!, observed = clips[0]!.events.find((event) => event.kind === 'gauge-full-visible');
    const gain = launch.events?.find((event) => event.t === 'gaugeFull');
    const gaugeErrorSeconds = observed && gain ? Math.abs(gain.tick / 60 - observed.frame / 30) : null;
    if (observed) score += gain ? gaugeErrorSeconds! * 0.05 : 1;
    candidates.push({ overrides, score, errors: reports.map((r) => r.meanRelativeError), gaugeErrorSeconds });
  }
}
candidates.sort((a, b) => a.score - b.score || a.overrides.aStartMax! - b.overrides.aStartMax!);
writeFileSync(output, JSON.stringify({ calibrationClips: clips.map((clip) => clip.id), baselineErrors: base.map((r) => r.meanRelativeError), objective: 'eligible MARE + 0.08 continuation MARE + 2x diagnostic regression above one percentage point + 0.05 gauge timing error seconds', candidates: candidates.slice(0, 25), evaluated: candidates.length }, null, 2) + '\n');
console.log(JSON.stringify(candidates.slice(0, 5), null, 2));
