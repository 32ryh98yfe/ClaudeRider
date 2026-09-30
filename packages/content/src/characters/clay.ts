import { defineCharacter } from '../define.ts';

export default defineCharacter({
  id: 'clay',
  nameKey: 'chars.clay.name',
  unlockLevel: 1,
  personality: { aggression: 0.4, lineBias: 0.0, risk: 0.4, consistency: 1.0, driftStyle: 'chain', itemHoarding: 0.3 },
});
