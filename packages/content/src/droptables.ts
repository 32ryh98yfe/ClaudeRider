// Item drop tables by KRD rank bucket (1 / 2–3 / 4–6 / 7–8). Each bucket sums to 100. Owned by lane L2 (ITEMS).
import type { DropTable } from './schema/index.ts';

export const DROP_SOLO: DropTable = {
  format: 'solo',
  buckets: {
    top: [['context_shield', 48], ['glitch_puddle', 22], ['interrupt_pulse', 13], ['redaction_cloud', 12], ['turbo_token', 5]],
    high: [['prompt_missile', 20], ['context_shield', 18], ['bug_report', 15], ['token_bomb', 10], ['turbo_token', 10], ['glitch_puddle', 8],
      ['throttle_drone', 5], ['attention_tether', 5], ['firewall', 4], ['interrupt_pulse', 3], ['mirror_mode', 2]],
    mid: [['turbo_token', 26], ['prompt_missile', 18], ['token_bomb', 14], ['attention_tether', 14], ['bug_report', 10], ['throttle_drone', 5],
      ['firewall', 5], ['top1_missile', 3], ['mirror_mode', 3], ['overclock_aura', 2]],
    low: [['turbo_token', 45], ['attention_tether', 22], ['overclock_aura', 8], ['broadcast_bolt', 6], ['throttle_drone', 6], ['top1_missile', 5],
      ['token_bomb', 4], ['firewall', 4]],
  },
};

export const DROP_TEAM: DropTable = {
  format: 'team',
  buckets: {
    top: [['context_shield', 40], ['glitch_puddle', 20], ['interrupt_pulse', 13], ['interpretability_lens', 12], ['redaction_cloud', 10], ['turbo_token', 5]],
    high: [['prompt_missile', 20], ['context_shield', 15], ['bug_report', 15], ['turbo_token', 12], ['token_bomb', 8], ['glitch_puddle', 8],
      ['alignment_halo', 5], ['throttle_drone', 5], ['attention_tether', 5], ['interrupt_pulse', 3], ['mutex_lock', 2], ['mirror_mode', 2]],
    mid: [['turbo_token', 26], ['prompt_missile', 15], ['attention_tether', 12], ['bug_report', 12], ['token_bomb', 10], ['throttle_drone', 5],
      ['alignment_halo', 5], ['interrupt_pulse', 5], ['firewall', 4], ['top1_missile', 2], ['mutex_lock', 2], ['mirror_mode', 2]],
    low: [['turbo_token', 42], ['attention_tether', 20], ['throttle_drone', 8], ['overclock_aura', 7], ['broadcast_bolt', 5], ['alignment_halo', 5],
      ['interrupt_pulse', 5], ['top1_missile', 4], ['firewall', 4]],
  },
};
