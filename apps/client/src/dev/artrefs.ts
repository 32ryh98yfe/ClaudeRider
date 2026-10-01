// `pnpm art:refs` (60-codex-pipeline): with ?artrefs=1 the page exposes every art slot's procedural fallback, so
// tools/art/refs.ts can save them as reference images to attach to Codex prompts. Loaded lazily, only with the flag.
import { artSlots } from '../art/slots.ts';

export interface ArtRefsApi {
  ids(): string[];
  /** The slot's procedural art as a PNG data URL at the slot size; null for an unknown id. */
  png(id: string): Promise<string | null>;
}

export function installArtRefs(): void {
  const api: ArtRefsApi = {
    ids: () => artSlots().map((s) => s.id),
    png: async (id) => {
      const slot = artSlots().find((s) => s.id === id);
      if (!slot) return null;
      const src = await slot.fallback();
      const c = document.createElement('canvas');
      c.width = slot.w; c.height = slot.h;
      c.getContext('2d')!.drawImage(src, 0, 0, slot.w, slot.h);
      return c.toDataURL('image/png');
    },
  };
  (window as unknown as { __crArt?: ArtRefsApi }).__crArt = api;
}
