// Form controls with keyboard/pad support: switch, slider, segmented choice, tab bar, stars, progress bar.
import type { ComponentChildren } from 'preact';
import { Audio } from '../../audio/engine.ts';
import { inputDevice } from '../../input/keyboard.ts';
import { useTabs } from '../hooks.ts';

const tick = (): void => { Audio.sfx('uiMove'); };

export function Toggle({ on, onChange, label, id }: { on: boolean; onChange: (v: boolean) => void; label: string; id?: string }) {
  return <button id={id} type="button" class="switch" role="switch" aria-checked={on ? 'true' : 'false'} aria-label={label} onClick={() => { tick(); onChange(!on); }} />;
}

export function Slider({ value, min, max, step, onInput, label, id }: { value: number; min: number; max: number; step: number; onInput: (v: number) => void; label: string; id?: string }) {
  const fill = `${((value - min) / (max - min)) * 100}%`;
  return (
    <input id={id} type="range" class="slider" min={min} max={max} step={step} value={value} aria-label={label} style={{ '--fill': fill } as Record<string, string>}
      onInput={(e) => onInput(Number((e.target as HTMLInputElement).value))} />
  );
}

export interface SegOpt<T extends string | number> { value: T; label: ComponentChildren; disabled?: boolean; title?: string }
export function Seg<T extends string | number>({ value, options, onChange, label, class: cls }: { value: T; options: readonly SegOpt<T>[]; onChange: (v: T) => void; label: string; class?: string }) {
  return (
    <div class={`seg ${cls ?? ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value ? 'true' : 'false'} class={o.value === value ? 'on' : ''} disabled={o.disabled} title={o.title}
          onClick={() => { if (o.value !== value) { tick(); onChange(o.value); } }}>{o.label}</button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, tabs, onChange, label }: { value: T; tabs: readonly { id: T; label: ComponentChildren }[]; onChange: (v: T) => void; label: string }) {
  useTabs(tabs.map((x) => x.id), value, (v) => { tick(); onChange(v); });
  const pad = inputDevice.value === 'pad';
  return (
    <div class="tabs" role="tablist" aria-label={label}>
      {pad ? <span class="pad-hint kbd pad">LB</span> : null}
      {tabs.map((x) => (
        <button key={x.id} type="button" role="tab" aria-selected={x.id === value ? 'true' : 'false'} class={x.id === value ? 'on' : ''} onClick={() => { if (x.id !== value) { tick(); onChange(x.id); } }}>{x.label}</button>
      ))}
      {pad ? <span class="pad-hint kbd pad">RB</span> : null}
    </div>
  );
}

export function Stars({ n, of = 5 }: { n: number; of?: number }) {
  return <span class="stars" aria-label={`${n}/${of}`}>{Array.from({ length: of }, (_, i) => <span key={i} class={i < n ? '' : 'off'}>★</span>)}</span>;
}

export function Bar({ frac, done, class: cls }: { frac: number; done?: boolean; class?: string }) {
  return <div class={`bar ${done ? 'done' : ''} ${cls ?? ''}`}><i style={{ transform: `scaleX(${Math.max(0, Math.min(1, frac))})` }} /></div>;
}
