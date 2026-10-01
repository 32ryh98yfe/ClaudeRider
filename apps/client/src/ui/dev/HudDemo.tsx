// ?demo=hud[&v=speed|item|events|ta|drag|reverse] — the race HUD over the showcase with fixture signals, for screenshot
// review of every HUD element without driving a race. Never used in normal play.
import { useEffect, useState } from 'preact/hooks';
import { ITEM_IDS, codeOf } from '@cr/content';
import { hud } from '../store/hud.ts';
import { hudX } from '../store/hudExtra.ts';
import { banner } from '../store/banner.ts';
import { Hud } from '../hud/Hud.tsx';
import { Stage } from '../../game/Stage.ts';
import { save } from '../../meta/save.ts';
import { nameTags, slotInfo } from '../../game/HudPresenter.ts';
import { lastSplit, mission } from '../../meta/raceStats.ts';
import { t } from '../../i18n/index.ts';

const NAMES = ['클로드', '스파크-42', '토큰-17', '프롬프트-88', '벡터-23', '임베딩-61', '어텐션-35', '로짓-90'];
const CHARS = ['clay', 'turbo', 'nova', 'rune', 'kage', 'glitch', 'bolt', 'duke'];

export function HudDemo() {
  const v = new URLSearchParams(location.search).get('v') ?? 'speed';
  const [map] = useState(demoMap);
  useEffect(() => {
    const p = save.get().profile;
    Stage.showShowcase(p.characterId, p.kartBodyId);
    if (Stage.showcase) Stage.showcase.offsetX = 0;
    const item = v === 'item' || v === 'events';
    const now = performance.now();
    slotInfo.length = 0;
    for (let i = 0; i < 8; i++) slotInfo.push({ characterId: CHARS[i]!, kartBodyId: 'pebble', name: NAMES[i]!, bot: i > 0, team: i % 2 });
    nameTags.length = 0;
    nameTags.push({ slot: 1, x: 0.42, y: 0.5, visible: true, dist: 14, name: NAMES[1]!, rank: 2, me: false, team: 1 }, { slot: 3, x: 0.61, y: 0.46, visible: true, dist: 30, name: NAMES[3]!, rank: 4, me: false, team: 1 });
    hud.visible.value = true;
    hud.rank.value = 3; hud.total.value = 8; hud.lap.value = v === 'ta' ? 2 : 3; hud.laps.value = 3; hud.finalLap.value = v !== 'ta';
    hud.lapMs.value = 21_345; hud.raceMs.value = 98_765; hud.bestMs.value = v === 'events' ? 0 : 37_120;
    hud.kmh.value = 187; hud.gauge.value = 0.68; hud.boosting.value = v === 'speed'; hud.draft.value = v === 'speed' ? 1 : 0.4;
    hud.itemMode.value = item; hud.teamMode.value = v === 'events';
    hud.slots.value = item ? [codeOf(ITEM_IDS, 'prompt_missile'), codeOf(ITEM_IDS, 'context_shield')] : [0, 0];
    hud.boosters.value = 2; hud.teamBoosters.value = 0; hud.teamGauge.value = 0.4;
    hud.auto.value = v === 'speed' && save.get().settings.autoBoost;
    hud.wrongWay.value = false; hud.countdown.value = null; hud.retireLeft.value = v === 'events' ? 7 : null;
    hud.standings.value = NAMES.map((n, i) => ({ slot: i, rank: i === 0 ? 3 : i < 3 ? i : i + 1, name: n, me: i === 0, bot: i > 0, team: i % 2, boosters: (i * 5) % 3, finished: v === 'events' && i === 1, retired: false, gapMs: 0 })).sort((a, b) => a.rank - b.rank);
    hud.minimap.value = [{ x: 120, z: 0, me: true, rank: 3 }, { x: -60, z: 60, me: false, rank: 1 }, { x: 40, z: -80, me: false, rank: 2 }];
    hudX.rail.value = NAMES.map((_, i) => ({ p: i === 0 ? 0.62 : 0.5 + ((i * 37) % 30) / 100, me: i === 0, rank: i + 1, team: i % 2 }));
    hudX.timeAttack.value = v === 'ta';
    hudX.instantWindow.value = v === 'speed';
    hudX.lapPopup.value = v === 'ta' ? { lapTicks: 2235, deltaTicks: -42, best: false, at: now + 60_000 } : null;
    if (v === 'ta') lastSplit.value = { deltaTicks: -37, at: now + 60_000, index: 3 };
    hud.toasts.value = [{ id: 1, text: t('hud.mission', { text: t('challenges.mid_draft_2') }), kind: 'challenge', until: now + 600_000 }];
    if (item) {
      hudX.feed.value = [
        { id: 1, attacker: NAMES[2]!, victim: NAMES[0]!, itemId: 'token_bomb', result: 'blocked', mine: true, until: now + 600_000 },
        { id: 2, attacker: NAMES[4]!, victim: NAMES[1]!, itemId: 'bug_report', result: 'hit', mine: false, until: now + 600_000 },
        { id: 3, attacker: NAMES[0]!, victim: NAMES[3]!, itemId: 'prompt_missile', result: 'hit', mine: true, until: now + 600_000 },
      ];
      hud.incoming.value = v === 'item' ? { dir: -2.4, etaTicks: 70 } : null;
      hudX.alert.value = v === 'item' ? -2.4 : null;
    }
    if (v === 'events') { hud.mash.value = 5; hudX.slotLock.value = true; banner.show(t('hud.finalLap'), 'final', 600_000); }
    if (v === 'speed') banner.show(t('hud.lapBanner', { lap: 3, laps: 3 }), 'info', 600_000);
    if (v === 'countdown') hud.countdown.value = 2;
    if (v === 'go') { hud.countdown.value = 0; hudX.perfect.value = true; }
    if (v === 'wrong') hud.wrongWay.value = true;
    if (v === 'finish') { banner.show(t('hud.finish'), 'finish', 600_000); hudX.finishAt.value = now; }
    // driving techniques: drag at 296 km/h with a 2-tap streak and its pop; reversing at 42 km/h
    hudX.gear.value = v === 'reverse' ? 'R' : 'D';
    if (v === 'drag') { hud.kmh.value = 296; hud.boosting.value = true; hudX.drag.value = { on: true, streak: 2 }; hudX.technique.value = { kind: 'tap', streak: 2, at: now + 600_000 }; }
    if (v === 'reverse') { hud.kmh.value = 42; hud.boosting.value = false; hud.draft.value = 0; hudX.drag.value = { on: false, streak: 0 }; }
    mission.value = null;
  }, []);
  return <Hud minimap={map} />;
}

function demoMap(): Float32Array {
  const pts: number[] = [];
  for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2; pts.push(Math.cos(a) * 120 + Math.cos(a * 3) * 20, Math.sin(a) * 70 + Math.sin(a * 2) * 25); }
  return new Float32Array(pts);
}
