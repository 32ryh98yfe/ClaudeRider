// Dev/test hook: runs the shared determinism scenario inside the authority Worker (M9 "Node and Worker equal").
export async function workerSelftest(trackId: string): Promise<{ speed: string[]; item: string[] } | { error: string }> {
  const r = await fetch(`tracks/${trackId}.ctrk`);
  if (!r.ok) return { error: `tracks/${trackId}.ctrk: HTTP ${r.status}` };
  const buf = await r.arrayBuffer();
  const w = new Worker(new URL('../workers/authority.worker.ts', import.meta.url), { type: 'module', name: 'authority-selftest' });
  try {
    return await new Promise((resolve) => {
      w.onmessage = (e: MessageEvent) => {
        const m = e.data as { t: string; speed?: string[]; item?: string[]; message?: string };
        if (m.t === 'selftest') resolve({ speed: m.speed!, item: m.item! });
        else if (m.t === 'error') resolve({ error: m.message ?? 'error' });
      };
      w.onerror = (e) => resolve({ error: e.message });
      w.postMessage({ t: 'selftest', ctrk: buf }, [buf]);
    });
  } finally { w.terminate(); }
}
