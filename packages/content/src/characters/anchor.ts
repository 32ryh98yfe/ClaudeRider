import { defineCharacter } from '../define.ts';

export default defineCharacter({
  id: 'anchor',
  nameKey: 'chars.anchor.name',
  unlockLevel: 6,
  personality: { aggression: 0.9, lineBias: 0.3, risk: 0.6, consistency: 0.8, driftStyle: 'long', itemHoarding: 0.4 },
});
