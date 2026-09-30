// Settings (31-ui-spec §9): graphics, audio buses, controls (rebinding with conflict detection, gamepad mapping,
// Keyboard Lock), gameplay, HUD, accessibility, language, data (export/import/reset) and About (disclaimer).
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { navigate, route, type Screen } from '../../store/route.ts';
import { t, locale, setLocale, type Locale } from '../../../i18n/index.ts';
import { Audio } from '../../../audio/engine.ts';
import { stageInfo } from '../../../game/Stage.ts';
import { save, type SettingsV1 } from '../../../meta/save.ts';
import { ACTIONS, bindKey, unbindKey, findConflict, presetKeys, defaultKeys, defaultPad, bindPad, findPadConflict, keyLabel, padLabel, unbound, RESERVED, MAX_KEYS, type ActionGroup } from '../../../input/bindings.ts';
import { captureKey } from '../../../input/keyboard.ts';
import { capturePadButton, padInfo } from '../../../input/gamepad.ts';
import { enterFullscreen, keyboardLockSupported, keyboardLocked, fullscreen } from '../../../input/fullscreen.ts';
import { useBack, useTabs } from '../../hooks.ts';
import { saveState } from '../../store/profile.ts';
import { toast } from '../../store/uiToast.ts';
import { ScreenHead, Confirm } from '../../components/common.tsx';
import { Toggle, Slider, Seg } from '../../components/controls.tsx';
import { Icon } from '../../icons/Icon.tsx';
import { Logo } from '../../components/Logo.tsx';
import './settings.css';

type Tab = 'graphics' | 'audio' | 'controls' | 'gameplay' | 'hud' | 'access' | 'language' | 'data' | 'about';
const TABS: readonly { id: Tab; icon: string }[] = [
  { id: 'graphics', icon: 'monitor' }, { id: 'audio', icon: 'volume' }, { id: 'controls', icon: 'keyboard' }, { id: 'gameplay', icon: 'kart' },
  { id: 'hud', icon: 'target' }, { id: 'access', icon: 'eye' }, { id: 'language', icon: 'globe' }, { id: 'data', icon: 'download' }, { id: 'about', icon: 'info' },
];
const VERSION = '0.2.0';

const set = (fn: (s: SettingsV1) => void): void => save.update((d) => fn(d.settings));

function Row({ label, desc, children, id }: { label: string; desc?: ComponentChildren; children: ComponentChildren; id?: string }) {
  return (
    <div class="srow">
      <div class="srow-text"><label class="srow-label" for={id}>{label}</label>{desc ? <p class="srow-desc">{desc}</p> : null}</div>
      <div class="srow-ctl">{children}</div>
    </div>
  );
}

/** Settings screen; with `onClose` it renders as an overlay (pause menu) instead of routing back. */
export function SettingsScreen({ onClose }: { onClose?: () => void } = {}) {
  const s = saveState.value.settings;
  void locale.value;
  const from = (route.value.params?.['from'] as Screen | undefined) ?? 'lobby';
  const [tab, setTab] = useState<Tab>((!onClose && (route.value.params?.['tab'] as Tab)) || 'graphics');
  const back = (): void => { if (onClose) onClose(); else navigate(from === 'settings' ? 'lobby' : from); };
  useBack(back);
  useTabs(TABS.map((x) => x.id), tab, setTab);
  return (
    <div class={`screen settings fade-in ${onClose ? 'overlay' : ''}`} {...(onClose ? { 'data-focus-scope': true } : {})}>
      <div class="set-scrim" />
      <ScreenHead title={t('settings.title')} onBack={back} />
      <div class="set-body">
        <nav class="set-nav" aria-label={t('settings.title')} role="tablist" aria-orientation="vertical">
          {TABS.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={tab === x.id ? 'true' : 'false'} class={tab === x.id ? 'on' : ''} onClick={() => { Audio.sfx('uiMove'); setTab(x.id); }}>
              <Icon name={x.icon} size={18} /><span>{t(`settings.${x.id}`)}</span>
            </button>
          ))}
        </nav>
        <section class="set-panel card" role="tabpanel" aria-label={t(`settings.${tab}`)} key={tab}>
          {tab === 'graphics' && <Graphics s={s} />}
          {tab === 'audio' && <AudioTab s={s} />}
          {tab === 'controls' && <Controls s={s} />}
          {tab === 'gameplay' && <Gameplay s={s} />}
          {tab === 'hud' && <HudTab s={s} />}
          {tab === 'access' && <Access s={s} />}
          {tab === 'language' && <Language />}
          {tab === 'data' && <Data />}
          {tab === 'about' && <About />}
        </section>
      </div>
    </div>
  );
}

function Graphics({ s }: { s: Readonly<SettingsV1> }) {
  const info = stageInfo.value;
  const tier3 = (): { value: string; label: string }[] => [{ value: 'tier', label: t('settings.opt.tier') }, { value: 'off', label: t('settings.opt.off') }, { value: 'on', label: t('settings.opt.on') }];
  return (
    <>
      <h2 class="set-h">{t('settings.graphics')}</h2>
      <Row label={t('settings.quality')} desc={<>{t('settings.restartNote')} · {t('settings.current', { v: info.tier.toUpperCase() })}</>}>
        <Seg label={t('settings.quality')} value={s.quality} onChange={(v) => set((x) => { x.quality = v; })}
          options={(['auto', 'low', 'medium', 'high', 'ultra'] as const).map((q) => ({ value: q, label: t(`settings.quality.${q}`) }))} />
      </Row>
      <Row label={t('settings.backend')} desc={<>{t('settings.restartNote')} · {t('settings.current', { v: String(info.backend).toUpperCase() })}</>}>
        <Seg label={t('settings.backend')} value={s.renderer} onChange={(v) => set((x) => { x.renderer = v; })}
          options={[{ value: 'auto', label: t('settings.quality.auto') }, { value: 'webgpu', label: 'WebGPU' }, { value: 'webgl2', label: 'WebGL2' }] as const} />
      </Row>
      <Row label={t('settings.renderScale')} desc={`${Math.round((s.renderScale ?? 1) * 100)}%`}>
        <Slider label={t('settings.renderScale')} value={s.renderScale ?? 1} min={0.5} max={1} step={0.05} onInput={(v) => set((x) => { x.renderScale = v; })} />
      </Row>
      <Row label={t('settings.fpsCap')}>
        <Seg label={t('settings.fpsCap')} value={s.fpsCap ?? 60} onChange={(v) => set((x) => { x.fpsCap = v; })}
          options={[{ value: 30, label: '30' }, { value: 60, label: '60' }, { value: 120, label: '120' }, { value: 0, label: t('settings.unlimited') }] as const} />
      </Row>
      <Row label={t('settings.shadows')}><Seg label={t('settings.shadows')} value={s.shadows ?? 'tier'} onChange={(v) => set((x) => { x.shadows = v as 'tier'; })} options={tier3()} /></Row>
      <Row label={t('settings.bloom')}><Seg label={t('settings.bloom')} value={s.bloom ?? 'tier'} onChange={(v) => set((x) => { x.bloom = v as 'tier'; })} options={tier3()} /></Row>
      <Row label={t('settings.particles')}>
        <Seg label={t('settings.particles')} value={s.particles ?? 'tier'} onChange={(v) => set((x) => { x.particles = v; })}
          options={[{ value: 'tier', label: t('settings.opt.tier') }, { value: 'low', label: t('settings.opt.low') }, { value: 'high', label: t('settings.opt.high') }] as const} />
      </Row>
      <Row label={t('settings.motionBlur')}><Toggle label={t('settings.motionBlur')} on={!!s.motionBlur} onChange={(v) => set((x) => { x.motionBlur = v; })} /></Row>
      <div class="set-actions"><button class="btn small" type="button" onClick={() => location.reload()}><Icon name="refresh" size={16} />{t('settings.reload')}</button></div>
    </>
  );
}

function AudioTab({ s }: { s: Readonly<SettingsV1> }) {
  const buses = ['master', 'music', 'sfx', 'engine', 'ui', 'voice'] as const;
  return (
    <>
      <h2 class="set-h">{t('settings.audio')}</h2>
      {buses.map((b) => {
        const v = (s.volume as Record<string, number | undefined>)[b] ?? 0.7;
        return (
          <Row key={b} label={t(`settings.volume.${b}`)} desc={<span class="num vol-num">{Math.round(v * 100)}</span>}>
            <Slider label={t(`settings.volume.${b}`)} value={v} min={0} max={1} step={0.05} onInput={(x) => set((d) => { (d.volume as Record<string, number>)[b] = x; })} />
          </Row>
        );
      })}
      <Row label={t('settings.muteUnfocused')}><Toggle label={t('settings.muteUnfocused')} on={s.muteUnfocused !== false} onChange={(v) => set((x) => { x.muteUnfocused = v; })} /></Row>
      <p class="set-note">{t('settings.audioNote')}</p>
    </>
  );
}

function Controls({ s }: { s: Readonly<SettingsV1> }) {
  const [dev, setDev] = useState<'keyboard' | 'gamepad'>('keyboard');
  const [capture, setCapture] = useState<{ action: string; index: number; pad?: boolean } | null>(null);
  const [conflict, setConflict] = useState<{ action: string; index: number; code: string; other: string } | null>(null);
  const [padConflict, setPadConflict] = useState<{ action: string; index: number; button: number; other: string } | null>(null);
  useEffect(() => {
    if (!capture) return;
    if (capture.pad) return capturePadButton((b) => {
      setCapture(null);
      const other = findPadConflict(save.get().settings.pad ?? {}, capture.action, b);
      if (other) setPadConflict({ action: capture.action, index: capture.index, button: b, other });
      else set((x) => { x.pad = bindPad(x.pad ?? {}, capture.action, capture.index, b); });
    });
    return captureKey((code) => {
      setCapture(null);
      if (code === 'Escape' && capture.action !== 'pause') return;
      if (RESERVED.has(code)) return;
      const other = findConflict(save.get().settings.keys, capture.action, code);
      if (other) setConflict({ action: capture.action, index: capture.index, code, other });
      else { Audio.sfx('uiOk'); set((x) => { x.keys = bindKey(x.keys, capture.action, capture.index, code); }); }
    });
  }, [capture]);
  const space = t('common.key.space');
  const missing = unbound(s.keys);
  const groups: ActionGroup[] = ['drive', 'race', 'system'];
  const pad = padInfo.value;
  return (
    <>
      <div class="set-h-row">
        <h2 class="set-h">{t('settings.controls')}</h2>
        <Seg label={t('settings.controls')} value={dev} onChange={setDev} options={[{ value: 'keyboard', label: <><Icon name="keyboard" size={16} />{t('settings.keyboard')}</> }, { value: 'gamepad', label: <><Icon name="pad" size={16} />{t('settings.gamepad')}</> }]} />
      </div>
      {dev === 'keyboard' ? (
        <>
          <Row label={t('settings.layout')}>
            <div class="btn-row">
              <button class="btn small" type="button" onClick={() => set((x) => { x.keys = presetKeys('arrows'); })}>{t('settings.layout.arrows')}</button>
              <button class="btn small" type="button" onClick={() => set((x) => { x.keys = presetKeys('wasd'); })}>{t('settings.layout.wasd')}</button>
            </div>
          </Row>
          {missing.length ? <p class="set-warn"><Icon name="info" size={16} />{t('settings.unbound', { list: missing.map((a) => t(`settings.action.${a}`)).join(', ') })}</p> : null}
          {groups.map((g) => (
            <div class="bind-group" key={g}>
              <h3 class="eyebrow">{t(`settings.group.${g}`)}</h3>
              {ACTIONS.filter((a) => a.group === g).map((a) => {
                const codes = s.keys[a.id] ?? [];
                return (
                  <div class="bind-row" key={a.id}>
                    <span class="bind-name">{t(`settings.action.${a.id}`)}</span>
                    <span class="bind-keys">
                      {codes.map((c, i) => (
                        <span class="bind-chip" key={c}>
                          <button type="button" class={`kbd-btn ${capture?.action === a.id && capture.index === i && !capture.pad ? 'capturing' : ''}`} aria-label={`${t('settings.rebind')} ${t(`settings.action.${a.id}`)} ${keyLabel(c, space)}`} onClick={() => setCapture({ action: a.id, index: i })}>{keyLabel(c, space)}</button>
                          <button type="button" class="bind-x" aria-label={t('settings.removeKey')} onClick={() => set((x) => { x.keys = unbindKey(x.keys, a.id, i); })}><Icon name="x" size={12} /></button>
                        </span>
                      ))}
                      {codes.length < MAX_KEYS ? <button type="button" class="kbd-btn add" aria-label={`${t('settings.addKey')} ${t(`settings.action.${a.id}`)}`} onClick={() => setCapture({ action: a.id, index: codes.length })}><Icon name="plus" size={14} /></button> : null}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
          <Row label={t('settings.keyboardLock')} desc={keyboardLockSupported() ? t('settings.keyboardLockDesc') : t('settings.keyboardLockNa')}>
            <button class="btn small" type="button" disabled={fullscreen.value && keyboardLocked.value} onClick={() => void enterFullscreen()}><Icon name="fullscreen" size={16} />{t('settings.fullscreenBtn')}</button>
          </Row>
          <ul class="tips"><li>{t('settings.firstRunTip')}</li><li>{t('settings.stickyTip')}</li></ul>
          <div class="set-actions"><button class="btn small" type="button" onClick={() => set((x) => { x.keys = defaultKeys(); })}><Icon name="refresh" size={16} />{t('settings.resetDefaults')}</button></div>
        </>
      ) : (
        <>
          <div class={`pad-status ${pad.connected ? 'on' : ''}`}><Icon name="pad" size={22} /><span>{pad.connected ? t('settings.padConnected', { id: pad.id.slice(0, 48) }) : <>{t('settings.padNone')} · {t('settings.gamepadHint')}</>}</span></div>
          <div class="bind-group">
            {ACTIONS.filter((a) => a.pad).map((a) => {
              const btns = s.pad?.[a.id] ?? [];
              return (
                <div class="bind-row" key={a.id}>
                  <span class="bind-name">{t(`settings.action.${a.id}`)}</span>
                  <span class="bind-keys">
                    {btns.map((b, i) => <button key={b} type="button" class={`kbd-btn pad ${capture?.pad && capture.action === a.id && capture.index === i ? 'capturing' : ''}`} onClick={() => setCapture({ action: a.id, index: i, pad: true })}>{padLabel(b)}</button>)}
                    {btns.length < 2 ? <button type="button" class="kbd-btn add" aria-label={t('settings.addKey')} onClick={() => setCapture({ action: a.id, index: btns.length, pad: true })}><Icon name="plus" size={14} /></button> : null}
                  </span>
                </div>
              );
            })}
          </div>
          <Row label={t('settings.deadzone')} desc={(s.deadzone ?? 0.15).toFixed(2)}>
            <Slider label={t('settings.deadzone')} value={s.deadzone ?? 0.15} min={0.05} max={0.3} step={0.01} onInput={(v) => set((x) => { x.deadzone = v; })} />
          </Row>
          <p class="set-note">{t('settings.padTip')}</p>
          <div class="set-actions"><button class="btn small" type="button" onClick={() => set((x) => { x.pad = defaultPad(); })}><Icon name="refresh" size={16} />{t('settings.resetDefaults')}</button></div>
        </>
      )}
      {capture ? (
        <div class="modal-scrim" data-focus-scope>
          <div class="modal card capture" role="dialog" aria-modal="true" aria-label={t('settings.pressKey')}>
            <Icon name={capture.pad ? 'pad' : 'keyboard'} size={40} />
            <h2>{capture.pad ? t('settings.pressButton') : t('settings.pressKey')}</h2>
            <p>{t(`settings.action.${capture.action}`)}</p>
            <div class="actions"><span class="set-note">{t('settings.cancelHint')}</span><button class="btn quiet small" type="button" onClick={() => setCapture(null)}>{t('common.cancel')}</button></div>
          </div>
        </div>
      ) : null}
      {conflict ? (
        <Confirm title={t('settings.conflictTitle')} body={<p>{t('settings.conflict', { key: keyLabel(conflict.code, space), action: t(`settings.action.${conflict.other}`) })}</p>} okLabel={t('settings.move')}
          onOk={() => { const c = conflict; setConflict(null); set((x) => { x.keys = bindKey(x.keys, c.action, c.index, c.code); }); }} onCancel={() => setConflict(null)} />
      ) : null}
      {padConflict ? (
        <Confirm title={t('settings.conflictTitle')} body={<p>{t('settings.conflict', { key: padLabel(padConflict.button), action: t(`settings.action.${padConflict.other}`) })}</p>} okLabel={t('settings.move')}
          onOk={() => { const c = padConflict; setPadConflict(null); set((x) => { x.pad = bindPad(x.pad ?? {}, c.action, c.index, c.button); }); }} onCancel={() => setPadConflict(null)} />
      ) : null}
    </>
  );
}

function Gameplay({ s }: { s: Readonly<SettingsV1> }) {
  return (
    <>
      <h2 class="set-h">{t('settings.gameplay')}</h2>
      <Row label={t('settings.autoBoost')} desc={t('settings.autoBoostDesc')}><Toggle label={t('settings.autoBoost')} on={s.autoBoost} onChange={(v) => set((x) => { x.autoBoost = v; })} /></Row>
      <Row label={t('settings.instantHint')} desc={t('settings.instantHintDesc')}><Toggle label={t('settings.instantHint')} on={s.instantHint !== false} onChange={(v) => set((x) => { x.instantHint = v; })} /></Row>
      <Row label={t('settings.cameraDistance')}>
        <Seg label={t('settings.cameraDistance')} value={s.cameraDistance ?? 'normal'} onChange={(v) => set((x) => { x.cameraDistance = v; })}
          options={(['near', 'normal', 'far'] as const).map((c) => ({ value: c, label: t(`settings.camera.${c}`) }))} />
      </Row>
      <Row label={t('settings.cameraShake')}><Toggle label={t('settings.cameraShake')} on={s.cameraShake} onChange={(v) => set((x) => { x.cameraShake = v; })} /></Row>
      <Row label={t('settings.units')}><Seg label={t('settings.units')} value={s.units} onChange={(v) => set((x) => { x.units = v; })} options={[{ value: 'kmh', label: 'km/h' }, { value: 'mph', label: 'mph' }] as const} /></Row>
      <Row label={t('settings.racingLine')}><Toggle label={t('settings.racingLine')} on={!!s.racingLine} onChange={(v) => set((x) => { x.racingLine = v; })} /></Row>
      <Row label={t('settings.driftAssist')}><Toggle label={t('settings.driftAssist')} on={s.driftAssist} onChange={(v) => set((x) => { x.driftAssist = v; })} /></Row>
    </>
  );
}

function HudTab({ s }: { s: Readonly<SettingsV1> }) {
  return (
    <>
      <h2 class="set-h">{t('settings.hud')}</h2>
      <Row label={t('settings.hudScale')} desc={<>{t('settings.hudScaleDesc')} · <b class="num">{Math.round(s.hudScale * 100)}%</b></>}>
        <Slider label={t('settings.hudScale')} value={s.hudScale} min={0.8} max={1.2} step={0.05} onInput={(v) => set((x) => { x.hudScale = Math.round(v * 100) / 100; })} />
      </Row>
      <Row label={t('settings.minimapSpeed')} desc={t('settings.minimapSpeedDesc')}><Toggle label={t('settings.minimapSpeed')} on={!!s.minimapInSpeed} onChange={(v) => set((x) => { x.minimapInSpeed = v; })} /></Row>
      <Row label={t('settings.nameTags')}><Toggle label={t('settings.nameTags')} on={s.nameTags !== false} onChange={(v) => set((x) => { x.nameTags = v; })} /></Row>
      <Row label={t('settings.itemFeed')}><Toggle label={t('settings.itemFeed')} on={s.itemFeed !== false} onChange={(v) => set((x) => { x.itemFeed = v; })} /></Row>
      <div class="hud-preview" style={{ '--hud-scale': String(s.hudScale) } as Record<string, string>} aria-hidden="true">
        <span class="hp-rank num">3<small>/8</small></span>
        <span class="hp-speed num">187<small>{t('hud.kmh')}</small></span>
        <span class="hp-gauge"><i /></span>
      </div>
    </>
  );
}

function Access({ s }: { s: Readonly<SettingsV1> }) {
  return (
    <>
      <h2 class="set-h">{t('settings.access')}</h2>
      <Row label={t('settings.colorBlind')} desc={<>{t('settings.colorBlindDesc')}<span class={`gauge-demo ${s.colorBlind ? 'cb' : ''}`} /></>}><Toggle label={t('settings.colorBlind')} on={!!s.colorBlind} onChange={(v) => set((x) => { x.colorBlind = v; })} /></Row>
      <Row label={t('settings.reducedMotion')} desc={t('settings.reducedMotionDesc')}><Toggle label={t('settings.reducedMotion')} on={s.reducedMotion} onChange={(v) => set((x) => { x.reducedMotion = v; })} /></Row>
      <Row label={t('settings.highContrast')} desc={t('settings.highContrastDesc')}><Toggle label={t('settings.highContrast')} on={!!s.highContrast} onChange={(v) => set((x) => { x.highContrast = v; })} /></Row>
      <Row label={t('settings.textScale')}>
        <Seg label={t('settings.textScale')} value={Math.round((s.textScale ?? 1) * 100)} onChange={(v) => set((x) => { x.textScale = v / 100; })}
          options={[90, 100, 110, 120, 130].map((p) => ({ value: p, label: `${p}%` }))} />
      </Row>
    </>
  );
}

function Language() {
  const cur = locale.value;
  const pick = (l: Locale): void => { Audio.sfx('uiOk'); setLocale(l); };
  return (
    <>
      <h2 class="set-h">{t('settings.language')}</h2>
      <p class="set-note">{t('settings.languageDesc')}</p>
      <div class="lang-grid">
        {(['ko', 'en'] as const).map((l) => (
          <button key={l} type="button" class={`lang-card ${cur === l ? 'on' : ''}`} aria-pressed={cur === l} onClick={() => pick(l)}>
            <span class="lc-big">{l === 'ko' ? '가' : 'Aa'}</span><span class="lc-name">{t(`settings.lang.${l}`)}</span>{cur === l ? <Icon name="check" size={18} /> : null}
          </button>
        ))}
      </div>
    </>
  );
}

function Data() {
  const [confirm, setConfirm] = useState(false);
  const exportSave = (): void => {
    const blob = new Blob([save.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `clauderider-save-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(t('settings.exported'), 'good');
  };
  const importSave = (e: Event): void => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    void f.text().then((txt) => {
      try { save.importJson(txt); toast(t('settings.imported'), 'good'); } catch (err) { toast(t(`errors.${(err as Error).message === 'save_version' ? 'save_version' : 'save_corrupt'}`), 'bad'); }
    });
    (e.target as HTMLInputElement).value = '';
  };
  return (
    <>
      <h2 class="set-h">{t('settings.data')}</h2>
      <Row label={t('settings.exportSave')} desc={t('settings.exportDesc')}><button class="btn small" type="button" onClick={exportSave}><Icon name="download" size={16} />{t('settings.exportSave')}</button></Row>
      <Row label={t('settings.importSave')} desc={t('settings.importDesc')}>
        <label class="btn small file-btn"><Icon name="upload" size={16} />{t('settings.importSave')}<input type="file" accept="application/json,.json" onChange={importSave} /></label>
      </Row>
      <Row label={t('settings.resetProgress')} desc={t('settings.resetDesc')}><button class="btn small dark" type="button" onClick={() => setConfirm(true)}><Icon name="refresh" size={16} />{t('settings.resetAll')}</button></Row>
      {confirm ? <Confirm danger title={t('settings.resetConfirmTitle')} body={<p>{t('settings.resetConfirmBody')}</p>} okLabel={t('settings.resetAll')} onOk={() => { setConfirm(false); save.reset(true); toast(t('settings.resetDone')); }} onCancel={() => setConfirm(false)} /> : null}
    </>
  );
}

function About() {
  const info = stageInfo.value;
  return (
    <>
      <div class="about-head"><Logo size={0.5} /></div>
      <div class="about-disclaimer"><h3 class="eyebrow">{t('settings.disclaimerTitle')}</h3><p>{t('common.disclaimer')}</p></div>
      <Row label={t('settings.credits')} desc={t('settings.creditsBody')}><span /></Row>
      <Row label={t('settings.fonts')} desc={t('settings.fontsBody')}><span /></Row>
      <Row label={t('settings.libraries')} desc={t('settings.librariesBody')}><span /></Row>
      <Row label={t('settings.version')}><b class="num about-v">{VERSION}</b></Row>
      <Row label={t('settings.renderer')}><b class="num about-v">{String(info.backend).toUpperCase()} · {info.tier.toUpperCase()}</b></Row>
    </>
  );
}
