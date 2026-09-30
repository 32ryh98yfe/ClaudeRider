// Screenshot/demo fixtures behind query flags (visual review without a server or a full race):
//   ?demo=results   — a finished race with rewards   ?mock=queue|stage|room|roulette — lobby store states
import { signal } from '@preact/signals';
import type { RaceResult } from '@cr/room';
import { lobby } from '../../net/lobby.ts';
import { setLastResult } from '../screens/results/lastResult.ts';
import { emptyStats, type RaceSummary } from '../../meta/progression.ts';
import { applyRaceTo } from '../../meta/rewards.ts';
import { save } from '../../meta/save.ts';

/** True while a mock lobby is active: screens skip connect() so the fixture stays. */
export const mockLobby = signal(false);

const NAMES = ['클로드', '스파크-42', '토큰-17', '프롬프트-88', '벡터-23', '임베딩-61', '어텐션-35', '로짓-90'];
const CHARS = ['clay', 'turbo', 'nova', 'rune', 'kage', 'glitch', 'bolt', 'duke'];
const KARTS = ['pebble', 'arrowhead', 'clay_comet', 'neon_blade', 'glacier_sled', 'tugboat', 'jet_kettle', 'crown_cruiser'];

export function applyDemo(q: URLSearchParams): void {
  const demo = q.get('demo'), mock = q.get('mock');
  if (demo === 'results') {
    const rank = Number(q.get('rank') ?? 2);
    const order = [0, 1, 2, 3, 4, 5, 6, 7].sort((a, b) => (a === 0 ? rank - 1 : a < rank ? a - 1 : a) - (b === 0 ? rank - 1 : b < rank ? b - 1 : b));
    const rows = order.map((slot, i) => ({ slot, rank: i + 1, name: NAMES[slot]!, team: 0, finished: i < 7, raceTicks: 5400 + i * 83 + slot * 7, bestLapTicks: 1740 + i * 21, kind: (slot === 0 ? 'human' : 'bot') as 'human' | 'bot', points: 0 }));
    const r: RaceResult = { trackId: 'meadow_loop', mode: q.get('mode') ?? 'speed', rows, winnerTeam: 0, endTick: 9000 };
    const summary: RaceSummary = {
      mode: (q.get('mode') as 'speed') ?? 'speed', teams: 'solo', trackId: 'meadow_loop', themeId: 'clayhill_village', laps: 3, finished: true, rank, field: 8, teamWon: false, oneTwo: false, online: false,
      raceTicks: rows.find((x) => x.slot === 0)!.raceTicks, bestLapTicks: 1760, lapTicks: [1850, 1780, 1760], splits: [],
      stats: { ...emptyStats(), driftMeters: 1400, perfectStarts: 1, instantBoosts: 6, boostersUsed: 7, draftActivations: 2, cleanLaps: 1 }, ghostOn: false, mid: { id: 'mid_draft_2', done: true },
    };
    const s = structuredClone(save.get());
    s.progress.xp = Math.max(s.progress.xp, 180);
    const report = applyRaceTo(s, summary);
    setLastResult(r, NAMES, { slots: CHARS.map((c, i) => ({ characterId: c, kartBodyId: KARTS[i]! })), summary, report, again: { track: 'meadow_loop', mode: 'speed', tier: 'racer' } });
  }
  if (mock) {
    mockLobby.value = true;
    const now = Date.now();
    lobby.conn.value = 'online';
    lobby.error.value = null;
    if (mock === 'queue') lobby.queue.value = { phase: 'search', endsAt: now + 13_000, humans: 3 };
    if (mock === 'stage') lobby.queue.value = { phase: 'stage', endsAt: now + 11_000, humans: 5, trackId: 'meadow_loop' };
    if (mock === 'room' || mock === 'roulette') {
      lobby.room.value = {
        code: 'K7PX4M', hostSession: 's0', phase: mock === 'roulette' ? 'roulette' : 'waiting', ...(mock === 'roulette' ? { endsAt: now + 14_000 } : {}),
        settings: { mode: 'item', teams: 'solo', track: 'roulette', laps: 'default', fillBots: true, botTier: 'racer', isPrivate: false, maxHumans: 8 },
        slots: Array.from({ length: 8 }, (_, i) => i < 4
          ? { slot: i, state: 'human' as const, team: i % 2, name: NAMES[i]!, ready: i !== 2, host: i === 0, you: i === 0, pingMs: [18, 42, 96, 160][i]!, loadout: { characterId: CHARS[i] as 'clay', kartBodyId: KARTS[i] as 'pebble', livery: { primary: '#d97757', secondary: '#faf9f5', pattern: 0, number: 7 } } }
          : i < 6 ? { slot: i, state: 'bot' as const, team: i % 2, name: NAMES[i]!, tier: 'pro' as const, loadout: { characterId: CHARS[i] as 'clay', kartBodyId: KARTS[i] as 'pebble', livery: { primary: '#6a9bcc', secondary: '#faf9f5', pattern: 1, number: i } } }
            : { slot: i, state: i === 7 ? 'closed' as const : 'open' as const, team: i % 2 }),
      };
      lobby.chat.value = [{ from: NAMES[1]!, text: '안녕하세요! 잘 부탁해요', at: now - 30_000 }, { from: NAMES[0]!, text: '아이템전 한 판 가죠!', at: now - 12_000 }];
      if (mock === 'roulette') lobby.roulette.value = { endsAt: now + 14_000, votes: { meadow_loop: 2, proving_ring: 1 } };
    }
  }
}
