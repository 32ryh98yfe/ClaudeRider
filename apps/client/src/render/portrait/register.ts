// Plugs L8's studio portrait renders into the art-slot system (art/slots.ts `registerRenderFallback`), so
// `getArt('portrait.<characterId>')` returns a real head render whenever no Codex override image exists.
// Side-effect module: imported once by the Showcase (which boots with the Stage).
import { registerRenderFallback } from '../../art/loader.ts';
import { getPortrait } from './portrait.ts';

let done = false;
export function registerPortraitFallback(): void {
  if (done || typeof document === 'undefined') return;
  done = true;
  registerRenderFallback('portrait', async (slot) => {
    const id = slot.id.startsWith('portrait.') ? slot.id.slice('portrait.'.length) : null;
    if (!id) return null;
    return getPortrait(id, Math.min(slot.w, slot.h));
  });
}
registerPortraitFallback();
