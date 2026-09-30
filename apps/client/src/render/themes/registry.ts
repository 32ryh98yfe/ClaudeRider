// Theme registry: per-theme folders export a ThemeKit factory; unknown themes use the default kit with the content palette.
import type { ContentTables } from '@cr/content';
import { makeKit, type ThemeKit } from './kit.ts';

const mods = import.meta.glob<{ default: (c: ContentTables) => ThemeKit }>('./*/index.ts', { eager: true });
const factories = new Map<string, (c: ContentTables) => ThemeKit>();
for (const [path, m] of Object.entries(mods)) factories.set(path.split('/')[1]!, m.default);

export function getThemeKit(id: string, content: ContentTables): ThemeKit {
  const f = factories.get(id);
  if (f) return f(content);
  const data = content.themes.byId.get(id) ?? content.themes.all[0]!;
  if (import.meta.env.DEV) console.warn(`[themes] no kit for ${id}; using default look`);
  return makeKit(data);
}
