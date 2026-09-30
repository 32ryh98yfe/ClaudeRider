import { defineCharacter } from '../define.ts';

export default defineCharacter({
  id: 'bisque',
  nameKey: 'chars.bisque.name',
  unlockLevel: 18,
  personality: { aggression: 0.2, lineBias: 0.1, risk: 0.2, consistency: 1.0, driftStyle: 'long', itemHoarding: 0.7 },
});
