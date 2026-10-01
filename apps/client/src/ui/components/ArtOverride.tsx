import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { artUrl, invalidateArt } from '../../art/loader.ts';

const revision = signal(0);
const decoded = new Map<string, Promise<string | null>>();

/** One subscription refreshes every mounted art consumer, including replaced files with the same name. */
export function refreshArtOverrides(): void {
  invalidateArt();
  decoded.clear();
  revision.value++;
}
if (import.meta.hot) import.meta.hot.on('art-overrides:update', refreshArtOverrides);

function decodedUrl(url: string): Promise<string | null> {
  let result = decoded.get(url);
  if (!result) {
    const image = new Image();
    image.src = url;
    result = image.decode().then(() => url, () => null);
    decoded.set(url, result);
  }
  return result;
}

/** Keep the existing UI fallback visible until an override has actually decoded. */
export function useArtOverride(id: string | null): { url: string | null; pending: boolean; onError(): void } {
  const version = revision.value;
  const [loaded, setLoaded] = useState<{ id: string | null; version: number; url: string | null } | null>(null);
  useEffect(() => {
    let active = true;
    if (id) void artUrl(id).then((url) => url ? decodedUrl(version ? `${url}?artv=${version}` : url) : null)
      .catch(() => null)
      .then((url) => { if (active) setLoaded({ id, version, url }); });
    return () => { active = false; };
  }, [id, version]);
  const current = loaded?.id === id && loaded.version === version;
  return {
    url: id && current ? loaded.url : null,
    pending: !!id && !current,
    onError: () => setLoaded({ id, version, url: null }),
  };
}

export function ArtOverride({ id, class: cls, children }: { id: string; class?: string; children?: ComponentChildren }) {
  const { url, onError } = useArtOverride(id);
  return url ? <img class={cls} src={url} data-art-slot={id} alt="" draggable={false} onError={onError} /> : <>{children}</>;
}

/** Repeating paper stays behind panel content; an unavailable texture leaves the panel's original surface. */
export function ArtPaper() {
  const { url } = useArtOverride('ui.pattern_parchment');
  return url ? <span class="art-paper-texture" data-art-slot="ui.pattern_parchment" aria-hidden="true" style={{ backgroundImage: `url("${url}")` }} /> : null;
}
