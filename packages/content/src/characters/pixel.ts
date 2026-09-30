import { defineCharacter } from '../define.ts';

export default defineCharacter({
  id: 'pixel',
  nameKey: 'chars.pixel.name',
  unlockLevel: 1,
  personality: { aggression: 0.6, lineBias: -0.2, risk: 0.5, consistency: 0.9, driftStyle: 'chain', itemHoarding: 0.2 },
});
