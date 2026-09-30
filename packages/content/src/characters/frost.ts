import { defineCharacter } from '../define.ts';

export default defineCharacter({
  id: 'frost',
  nameKey: 'chars.frost.name',
  unlockLevel: 21,
  personality: { aggression: 0.3, lineBias: 0.4, risk: 0.4, consistency: 1.2, driftStyle: 'long', itemHoarding: 0.4 },
});
