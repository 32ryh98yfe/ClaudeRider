// Per-race stat collector for the local kart (13-modes-rules §10.4, §11.3). game/HudPresenter feeds it every sim event
// and a 20 Hz frame; ui/screens/race turns it into a RaceSummary when the race ends. Also runs the mid-race mission.
import { signal } from '@preact/signals';
import { loadContent, type ChallengeDef, type ThemeId, type TrackId } from '@cr/content';
import { Attach, Boost, type RaceConfig, type SimEvent, type WorldState } from '@cr/sim';
import { emptyStats, type RaceStatBlock, type RaceSummary } from './progression.ts';
import { hash32 } from './challenges.ts';


export interface MissionState { id: string; state: 'active' | 'done' | 'failed'; progress: number; target: number }
/** The live mid-race mission (HUD toast, results panel). */
export const mission = signal<MissionState | null>(null);
/** The latest split delta vs PB in ticks (Time Attack), with the wall-clock time it was set. */
export const lastSplit = signal<{ deltaTicks: number; at: number; index: number } | null>(null);

export interface CollectorOptions {
  cfg: RaceConfig; me: number; lapLength: number; keyGates: readonly number[]; pathKinds: readonly string[];
  level: number; pbSplits: readonly number[] | null; online?: boolean; forceMission?: boolean;
}

export class RaceStatsCollector {
  readonly stats: RaceStatBlock = emptyStats();
  readonly lapTicks: number[] = [];
  readonly splits: number[] = [];
  finished = false;
  private opts: CollectorOptions;
  private dirtyLap = false;
  private prevPath = 0;
  private prevAttach = 0;
  private prevKeyMask = 0;
  private prevLap = 0;
  // mission bookkeeping
  private def: ChallengeDef | null = null;
  private windowOpen = false;
  private overtakeTicks: number[] = [];
  private instantChain = 0;
  private driftPending = false;
  private lastBoostStart = -1e9;
  private missionDirty = false;
  private missionCount = 0;

  constructor(o: CollectorOptions) {
    this.opts = o;
    mission.value = null;
    lastSplit.value = null;
    this.pickMission();
  }

  private pickMission(): void {
    const o = this.opts;
    if (o.cfg.mode === 'timeAttack') return;
    const roll = (hash32(`mid:${o.cfg.seed}:${o.me}`) % 1000) / 1000;
    if (!o.forceMission && (o.level < 3 || roll >= 0.15)) return;
    const pool = loadContent().challenges.filter((c) => c.scope === 'midRace' && (!c.filter?.mode || c.filter.mode === o.cfg.mode));
    if (!pool.length) return;
    this.def = pool[hash32(`midpick:${o.cfg.seed}`) % pool.length]!;
  }

  private setMission(state: MissionState['state'], progress: number): void {
    if (!this.def) return;
    const cur = mission.value;
    if (cur && cur.state !== 'active') return;
    mission.value = { id: this.def.id, state, progress: Math.min(progress, this.def.target), target: this.def.target };
  }

  private missionProgress(metric: string, amount = 1): void {
    if (!this.def || !this.windowOpen || this.def.metric !== metric || mission.value?.state !== 'active') return;
    this.missionCount += amount;
    this.setMission(this.missionCount >= this.def.target ? 'done' : 'active', this.missionCount);
  }

  onEvent(e: SimEvent, w: Readonly<WorldState>): void {
    const me = this.opts.me, s = this.stats;
    switch (e.t) {
      case 'countdown':
        if (e.n === 0 && this.def) { this.windowOpen = true; this.setMission('active', 0); }
        break;
      case 'startBoost': if (e.kart === me && e.tier === 'perfect') s.perfectStarts++; break;
      case 'instantBoost':
        if (e.kart !== me) break;
        s.instantBoosts++;
        if (this.driftPending) { this.instantChain++; this.driftPending = false; if (this.def?.metric === 'instantChain' && this.windowOpen && this.instantChain >= 3) this.setMission('done', 3); else if (this.def?.metric === 'instantChain') this.setMission('active', this.instantChain); }
        break;
      case 'driftStart': if (e.kart === me && this.driftPending) { this.instantChain = 0; this.driftPending = false; } break;
      case 'driftEnd': if (e.kart === me) this.driftPending = true; break;
      case 'boostStart':
        if (e.kart !== me) break;
        if (e.kind === Boost.NORMAL) {
          s.boostersUsed++;
          const left = this.lastBoostStart + 180 - e.tick;
          if (left > 0 && left < 15) this.missionProgress('boosterChain');
          this.lastBoostStart = e.tick;
        } else if (e.kind === Boost.TEAM) s.teamBoostersUsed++;
        break;
      case 'draft': if (e.kart === me && e.on) { s.draftActivations++; this.missionProgress('draftActivations'); } break;
      case 'wall':
        if (e.kart === me && e.severity >= 1) { s.wallHits++; this.dirtyLap = true; this.missionDirty = true; }
        break;
      case 'lap':
        if (e.kart !== me) break;
        this.lapTicks.push(e.lapTicks);
        if (!this.dirtyLap) s.cleanLaps++;
        if (this.def && this.windowOpen && mission.value?.state === 'active') {
          const m = this.def.metric;
          if (m === 'cleanLap') this.setMission(this.missionDirty ? 'failed' : 'done', this.missionDirty ? 0 : 1);
          else if (m === 'top3LapEnd') this.setMission(w.karts[me]!.race.rank <= 3 ? 'done' : 'failed', w.karts[me]!.race.rank <= 3 ? 1 : 0);
          else if (m !== 'finishNoReset') this.setMission('failed', this.missionCount);
          if (m !== 'finishNoReset') this.windowOpen = false;
        }
        this.dirtyLap = false;
        break;
      case 'rank':
        if (e.kart === me && e.to < e.from) {
          s.overtakes += e.from - e.to;
          if (this.def?.metric === 'overtakesIn600' && this.windowOpen) {
            for (let i = 0; i < e.from - e.to; i++) this.overtakeTicks.push(e.tick);
            this.overtakeTicks = this.overtakeTicks.filter((t) => e.tick - t <= 600);
            this.setMission(this.overtakeTicks.length >= 2 ? 'done' : 'active', this.overtakeTicks.length);
          }
        }
        break;
      case 'box': if (e.kart === me) s.itemBoxes++; break;
      case 'land': if (e.kart === me) s.jumpsLanded++; break;
      case 'respawn':
        if (e.kart === me && e.phase === 'out') { s.respawns++; if (this.def?.metric === 'finishNoReset' && this.windowOpen) this.setMission('failed', 0); }
        break;
      case 'effect':
        if (e.victim === me && e.result === 'hit') s.hitsTaken++;
        if (e.victim === me && e.result === 'shielded') { s.attacksBlocked++; this.missionProgress('attacksBlocked'); }
        if (e.source === me && e.victim !== me && e.result === 'hit') { s.attacksLanded++; this.missionProgress('attacksLanded'); }
        break;
      case 'escape': if (e.kart === me && e.fast) s.trapsEscapedFast++; break;
      case 'finish':
        if (e.kart === me) {
          this.finished = true;
          if (this.def?.metric === 'finishNoReset' && mission.value?.state === 'active') this.setMission(this.stats.respawns === 0 ? 'done' : 'failed', this.stats.respawns === 0 ? 1 : 0);
        }
        break;
      default: break;
    }
  }

  /** ~20 Hz: branch/rail entries and key-gate splits. */
  onFrame(w: Readonly<WorldState>): void {
    const k = w.karts[this.opts.me]!;
    const path = k.race.loc.path;
    if (path !== this.prevPath) {
      if (path > 0 && this.opts.pathKinds[path] === 'branch') { this.stats.shortcutsTaken++; this.missionProgress('shortcutsTaken'); }
      this.prevPath = path;
    }
    const att = k.body.attachKind;
    if (att !== this.prevAttach) { if (att === Attach.RAIL) this.stats.railsRidden++; this.prevAttach = att; }
    // key-gate splits
    const G = this.opts.keyGates.length;
    if (G > 0 && w.tick >= w.goTick) {
      if (k.race.lap !== this.prevLap) { this.prevKeyMask = 0; this.prevLap = k.race.lap; }
      const mask = k.race.keyMask;
      const fresh = mask & ~this.prevKeyMask;
      if (fresh) {
        for (let g = 0; g < G; g++) {
          if (!(fresh & (1 << g))) continue;
          const idx = k.race.lap * G + g;
          const ticks = w.tick - w.goTick;
          this.splits[idx] = ticks;
          const pb = this.opts.pbSplits?.[idx];
          if (pb !== undefined && pb > 0) lastSplit.value = { deltaTicks: ticks - pb, at: performance.now(), index: idx };
        }
      }
      this.prevKeyMask = mask;
    }
  }

  /** Builds the RaceSummary from the authority's result and the final world. */
  summary(result: { rows: { slot: number; rank: number; team: number; finished: boolean; raceTicks: number; bestLapTicks: number }[]; winnerTeam: number }, w: Readonly<WorldState>, themeId: ThemeId | '', trackId: TrackId, ghostOn: boolean): RaceSummary {
    const o = this.opts, me = o.me;
    const row = result.rows.find((r) => r.slot === me);
    const ws = w.karts[me]!.stats;
    // world stats are authoritative where they exist; events fill the rest
    const stats: RaceStatBlock = { ...this.stats, driftMeters: Math.round(ws.driftMeters), instantBoosts: Math.max(this.stats.instantBoosts, ws.instantBoosts), attacksLanded: Math.max(this.stats.attacksLanded, ws.attacksLanded), attacksBlocked: Math.max(this.stats.attacksBlocked, ws.attacksBlocked), hitsTaken: Math.max(this.stats.hitsTaken, ws.hitsTaken), respawns: Math.max(this.stats.respawns, ws.respawns), draftActivations: Math.max(this.stats.draftActivations, ws.draftBursts) };
    const team = row?.team ?? 0;
    const teamRows = result.rows.filter((r) => r.team === team).map((r) => r.rank).sort((a, b) => a - b);
    const field = result.rows.length;
    return {
      mode: o.cfg.mode, teams: o.cfg.teams, trackId, themeId, laps: o.cfg.laps,
      finished: !!row?.finished, rank: row?.rank ?? field, field,
      teamWon: o.cfg.teams !== 'solo' && result.winnerTeam === team,
      oneTwo: o.cfg.teams !== 'solo' && o.cfg.mode === 'speed' && teamRows[0] === 1 && teamRows[1] === 2,
      online: !!o.online,
      raceTicks: row?.finished ? Math.round(row.raceTicks) : null, bestLapTicks: row && row.bestLapTicks > 0 ? row.bestLapTicks : null,
      lapTicks: [...this.lapTicks], splits: [...this.splits], stats, ghostOn,
      mid: mission.value ? { id: mission.value.id, done: mission.value.state === 'done' } : null,
    };
  }
}

/** The collector of the race in progress (null outside races). */
export let currentRace: RaceStatsCollector | null = null;
export function setCurrentRace(c: RaceStatsCollector | null): void { currentRace = c; }
