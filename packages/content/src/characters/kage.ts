import { defineCharacter } from '../define.ts';

export default defineCharacter({
  id: 'kage',
  nameKey: 'chars.kage.name',
  unlockLevel: 15,
  personality: { aggression: 0.8, lineBias: -0.4, risk: 0.8, consistency: 1.1, driftStyle: 'chain', itemHoarding: 0.2 },
});
