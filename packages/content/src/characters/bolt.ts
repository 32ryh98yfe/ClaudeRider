import { defineCharacter } from '../define.ts';

export default defineCharacter({
  id: 'bolt',
  nameKey: 'chars.bolt.name',
  unlockLevel: 30,
  personality: { aggression: 0.5, lineBias: 0.2, risk: 0.3, consistency: 1.3, driftStyle: 'chain', itemHoarding: 0.5 },
});
