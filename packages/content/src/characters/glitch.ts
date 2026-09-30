import { defineCharacter } from '../define.ts';

export default defineCharacter({
  id: 'glitch',
  nameKey: 'chars.glitch.name',
  unlockLevel: 25,
  personality: { aggression: 0.9, lineBias: 0.0, risk: 0.9, consistency: 0.7, driftStyle: 'chain', itemHoarding: 0.1 },
});
