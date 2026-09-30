// FROZEN (contracts.lock). Screen routing via signals.
import { signal } from '@preact/signals';

export type Screen = 'title' | 'lobby' | 'modeSelect' | 'queue' | 'room' | 'garage' | 'loading' | 'race' | 'results' | 'settings' | 'timeAttack';
export const route = signal<{ screen: Screen; params?: Record<string, string> }>({ screen: 'title' });
export function navigate(screen: Screen, params?: Record<string, string>): void {
  route.value = params ? { screen, params } : { screen };
}
