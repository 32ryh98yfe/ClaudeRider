// Bot item logic (lane L2, 14-ai-spec §6). Single call site: the AI driver, after it filled the frame for this tick:
//   const brain = createItemBrain(slot, profile, personality, seed);   // once, in createAiDriver
//   decideItem(brain, w, env, out);                                     // at the end of decide(w, out)
// `env` is { track, content, cfg } (a StepContext satisfies it).
export { createItemBrain, decideItem, type ItemBrain, type ItemEnv } from './decide.ts';
export { blockableThreatEta, droneOrTetherThreat, teamThreat, PERCEIVE_ETA } from './perception.ts';
