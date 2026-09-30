// Codex pack (60-codex-pipeline §8): exactly 110 unique slots whose subjects resolve to content ids, sizes per kind.
import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS, KART_BODY_IDS, TRACK_IDS, THEME_IDS, ITEM_IDS } from '@cr/content';

const root = new URL('../../art/codex/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8')) as { slots: { id: string; kind: string; w: number; h: number; alpha: boolean; prompt: string; subject: Record<string, string> }[] };
const SIZES: Record<string, [number, number]> = { portrait: [512, 512], hero: [1024, 1536], kart: [1024, 640], thumb: [640, 360], loading: [1920, 1080], card: [768, 1024], icon: [256, 256], logo: [2048, 768] };

describe('codex pack', () => {
  it('has 110 unique slots with prompt files', () => {
    expect(manifest.slots.length).toBe(110);
    expect(new Set(manifest.slots.map((s) => s.id)).size).toBe(110);
    for (const s of manifest.slots) expect(existsSync(new URL(s.prompt, root)), s.id).toBe(true);
  });
  it('sizes follow the kind table', () => {
    for (const s of manifest.slots) { const want = SIZES[s.kind]; if (want) expect([s.w, s.h], s.id).toEqual(want); }
  });
  it('subjects resolve to content ids', () => {
    const sets: Record<string, readonly string[]> = { characterId: CHARACTER_IDS, kartBodyId: KART_BODY_IDS, trackId: TRACK_IDS, themeId: THEME_IDS, itemId: ITEM_IDS };
    for (const s of manifest.slots) for (const [k, v] of Object.entries(s.subject)) if (sets[k]) expect(sets[k], `${s.id}.${k}`).toContain(v);
    expect(manifest.slots.filter((s) => s.kind === 'portrait').length).toBe(CHARACTER_IDS.length);
    expect(manifest.slots.filter((s) => s.kind === 'icon').length).toBe(ITEM_IDS.length);
  });
});
