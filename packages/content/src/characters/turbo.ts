import { defineCharacter } from '../define.ts';

export default defineCharacter({
  id: 'turbo',
  nameKey: 'chars.turbo.name',
  unlockLevel: 3,
  personality: { aggression: 0.7, lineBias: 0.2, risk: 0.7, consistency: 1.0, driftStyle: 'long', itemHoarding: 0.1 },
});
