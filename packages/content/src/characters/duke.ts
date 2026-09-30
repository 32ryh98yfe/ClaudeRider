import { defineCharacter } from '../define.ts';

export default defineCharacter({
  id: 'duke',
  nameKey: 'chars.duke.name',
  unlockLevel: 35,
  personality: { aggression: 0.6, lineBias: 0.1, risk: 0.5, consistency: 1.0, driftStyle: 'long', itemHoarding: 0.8 },
});
