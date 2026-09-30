// Dev overlay (?debug): live BudgetTracker counters vs the tier budget (red when over), frame timings,
// dynamic-resolution scale and audio voices. Reads window.__cr.budget / __cr.audio at 4 Hz; never in hot paths.
import { t } from '../i18n/index.ts';
import type { BudgetSnapshot } from '../render/engine/budget.ts';

export function installOverlay(): void {
  const el = document.createElement('div');
  el.className = 'fx-debug';
  el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:50;font:11px/1.35 ui-monospace,Menlo,monospace;color:#faf9f5;background:rgba(20,20,19,.72);padding:6px 8px;border-radius:6px;pointer-events:none;white-space:pre;min-width:190px';
  document.body.appendChild(el);
  const fmt = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n)));
  const row = (label: string, v: string, over = false): string => `${over ? '⚠ ' : '  '}${label.padEnd(9)} ${v}`;
  setInterval(() => {
    const cr = (window as unknown as { __cr?: { budget?: BudgetSnapshot; backend?: string; tier?: string; audio?: { state?: () => { voices: number; song: { id: string; variant: string } | null } } } }).__cr;
    const b = cr?.budget;
    if (!b) { el.textContent = `${cr?.backend ?? '…'} · ${cr?.tier ?? ''}`; return; }
    const a = cr?.audio?.state?.();
    el.textContent = [
      `${cr?.backend ?? ''} · ${b.tier} · ${b.fps} fps`,
      row(t('fx.debug.draws'), `${b.drawCalls} / ${b.budget.draws} (max ${b.maxDrawCalls})`, b.over.draws),
      row(t('fx.debug.tris'), `${fmt(b.triangles)} / ${fmt(b.budget.tris)}`, b.over.tris),
      row(t('fx.debug.materials'), `${b.uniqueMaterials} / ${b.budget.materials} (lib ${b.libraryMaterials})`, b.over.materials),
      row(t('fx.debug.frame'), `${b.frameMs.p50.toFixed(1)} / ${b.frameMs.p95.toFixed(1)} ms`),
      row(t('fx.debug.update'), `${b.jsUpdateMs.p95.toFixed(2)} ms p95`),
      row(t('fx.debug.submit'), `${b.renderSubmitMs.p95.toFixed(2)} ms p95`),
      row(t('fx.debug.scale'), `${(b.resScale * 100).toFixed(0)} %`),
      row(t('fx.debug.memory'), `${b.textures} tex · ${b.geometries} geo`),
      a ? row(t('fx.debug.audio'), `${a.voices} ${t('fx.debug.voices')}${a.song ? ` · ${a.song.id}/${a.song.variant}` : ''}`) : '',
    ].filter(Boolean).join('\n');
    const over = b.over.draws || b.over.tris || b.over.materials;
    el.style.outline = over ? '1px solid #E5484D' : 'none';
  }, 250);
}
