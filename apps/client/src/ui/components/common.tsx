// Shared building blocks: screen header, confirm dialog, key hints, currency/profile chips, item icons, toasts.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { t } from '../../i18n/index.ts';
import { Audio } from '../../audio/engine.ts';
import { inputDevice } from '../../input/keyboard.ts';
import { keyLabel, padLabel } from '../../input/bindings.ts';
import { focusFirst } from '../../input/menuNav.ts';
import { save } from '../../meta/save.ts';
import { levelProgress } from '../../meta/progression.ts';
import { saveState } from '../store/profile.ts';
import { uiToasts } from '../store/uiToast.ts';
import { useBack } from '../hooks.ts';
import { Icon, SparkGlyph } from '../icons/Icon.tsx';
import { itemIconSvg, boosterSvg } from '../icons/itemIcons.ts';
import { Portrait } from './Portrait.tsx';

export function ScreenHead({ title, sub, onBack, right }: { title: string; sub?: ComponentChildren; onBack?: () => void; right?: ComponentChildren }) {
  return (
    <header class="screen-head">
      {onBack ? (
        <button class="btn ghost icon back-btn" type="button" aria-label={t('common.back')} onClick={() => { Audio.sfx('uiMove'); onBack(); }}><Icon name="back" /></button>
      ) : null}
      <div class="titles"><h1 class="display">{title}</h1>{sub ? <div class="sub">{sub}</div> : null}</div>
      <div class="grow" />
      {right}
    </header>
  );
}

export function Confirm({ title, body, okLabel, cancelLabel, onOk, onCancel, danger }: { title: string; body?: ComponentChildren; okLabel?: string; cancelLabel?: string; onOk: () => void; onCancel: () => void; danger?: boolean }) {
  useBack(onCancel);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setTimeout(() => focusFirst(), 0); }, []);
  return (
    <div class="modal-scrim" data-focus-scope onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div class="modal card" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <h2>{title}</h2>
        {body ? <div class="modal-body">{body}</div> : null}
        <div class="actions">
          <button class="btn quiet" type="button" onClick={onCancel}>{cancelLabel ?? t('common.cancel')}</button>
          <button class={`btn ${danger ? 'dark' : 'primary'}`} type="button" data-autofocus onClick={onOk}>{okLabel ?? t('common.ok')}</button>
        </div>
      </div>
    </div>
  );
}

/** Key / pad glyph for an action, following the last input device (31-ui-spec §7.2). */
export function KeyHint({ action, fallback }: { action: string; fallback?: string }) {
  const s = saveState.value.settings;
  if (inputDevice.value === 'pad') {
    const b = s.pad?.[action]?.[0];
    return <span class="kbd pad">{b !== undefined ? padLabel(b) : '—'}</span>;
  }
  const code = s.keys[action]?.[0];
  return <span class="kbd">{code ? keyLabel(code, t('common.key.space')) : (fallback ?? '—')}</span>;
}
/** Plain-text key label for an action (for HUD strings). */
export function keyText(action: string): string {
  const s = save.get().settings;
  if (inputDevice.value === 'pad') { const b = s.pad?.[action]?.[0]; return b !== undefined ? padLabel(b) : '—'; }
  const code = s.keys[action]?.[0];
  return code ? keyLabel(code, t('common.key.space')) : '—';
}

export function SparksChip({ amount }: { amount?: number }) {
  const v = amount ?? saveState.value.progress.sparks;
  return <span class="sparks-chip" title={t('common.sparks')}><SparkGlyph size={18} /><b class="num">{v.toLocaleString()}</b><span class="sr-only">{t('common.sparks')}</span></span>;
}

export function ProfileChip({ onClick }: { onClick?: () => void }) {
  const s = saveState.value;
  const lp = levelProgress(s.progress.xp);
  return (
    <button class="profile-chip" type="button" onClick={onClick} aria-label={`${s.profile.name} ${t('common.level', { n: lp.level })}`}>
      <Portrait id={s.profile.characterId} size={44} {...(s.profile.palette ? { palette: s.profile.palette } : {})} />
      <span class="pc-text">
        <span class="pc-name">{s.profile.name}{s.profile.title ? <em class="pc-title">{t(`garage.titleName.${s.profile.title}`)}</em> : null}</span>
        <span class="pc-lv"><b class="num">{t('common.level', { n: lp.level })}</b><span class="pc-bar"><i style={{ transform: `scaleX(${lp.frac})` }} /></span><small class="num">{lp.need ? `${Math.floor(lp.into)}/${lp.need}` : 'MAX'}</small></span>
      </span>
    </button>
  );
}

export function ItemIcon({ id, size, class: cls }: { id: string; size?: number; class?: string }) {
  const svg = id === 'booster' ? boosterSvg(false) : id === 'teamBooster' ? boosterSvg(true) : itemIconSvg(id);
  return <span class={`item-icon ${cls ?? ''}`} style={size ? { width: `${size}px`, height: `${size}px` } : undefined} aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function UiToasts() {
  return <div class="ui-toasts" aria-live="polite">{uiToasts.value.map((x) => <div key={x.id} class={`ui-toast ${x.kind}`}>{x.text}</div>)}</div>;
}

/** Bottom hint row: context-aware button hints (keyboard or pad glyphs). */
export function NavHints({ items }: { items: { key: string; pad: string; label: string }[] }) {
  const pad = inputDevice.value === 'pad';
  return (
    <div class="hint-row nav-hints">
      {items.map((x) => <span key={x.label}><span class={`kbd ${pad ? 'pad' : ''}`}>{pad ? x.pad : x.key}</span>{x.label}</span>)}
    </div>
  );
}
