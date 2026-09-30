import { defineCharacter } from '../define.ts';

export default defineCharacter({
  id: 'rune',
  nameKey: 'chars.rune.name',
  unlockLevel: 9,
  personality: { aggression: 0.3, lineBias: -0.3, risk: 0.5, consistency: 0.9, driftStyle: 'long', itemHoarding: 0.6 },
});
