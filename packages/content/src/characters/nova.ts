import { defineCharacter } from '../define.ts';

export default defineCharacter({
  id: 'nova',
  nameKey: 'chars.nova.name',
  unlockLevel: 12,
  personality: { aggression: 0.4, lineBias: 0.0, risk: 0.3, consistency: 1.1, driftStyle: 'chain', itemHoarding: 0.3 },
});
