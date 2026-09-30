// Garage (31-ui-spec §2.1): character / kart / livery / palette / emote tabs driving the 3D showcase, kart stat bars,
// level locks and Sparks purchases (13-modes-rules §12). Cosmetic only.
import { useEffect, useState } from 'preact/hooks';
import { loadContent, type CharacterId, type KartBodyId, type KartSpec } from '@cr/content';
import { navigate, route } from '../../store/route.ts';
import { t, locale } from '../../../i18n/index.ts';
import { Stage } from '../../../game/Stage.ts';
import { Audio } from '../../../audio/engine.ts';
import { save } from '../../../meta/save.ts';
import { allUnlocks, buy, canBuy, isOwned, isUnlocked, unlockDef, LIVERY_PATTERNS, PALETTES, FLAMES, type UnlockDef } from '../../../meta/unlocks.ts';
import { useBack } from '../../hooks.ts';
import { saveState } from '../../store/profile.ts';
import { toast } from '../../store/uiToast.ts';
import { ScreenHead, SparksChip, Confirm } from '../../components/common.tsx';
import { Tabs } from '../../components/controls.tsx';
import { Portrait } from '../../components/Portrait.tsx';
import { Icon, SparkGlyph } from '../../icons/Icon.tsx';
import './garage.css';

type Tab = 'character' | 'kart' | 'livery' | 'palette' | 'emotes';
const TABS: readonly Tab[] = ['character', 'kart', 'livery', 'palette', 'emotes'];
const PRIMARY = ['#d97757', '#c96442', '#e8b04b', '#788c5d', '#6a9bcc', '#8a5cff', '#e5484d', '#30302e', '#faf9f5', '#3fb8af'];
const SECONDARY = ['#faf9f5', '#141413', '#f2a65a', '#9fd3f5', '#ffd23f', '#b0aea5'];
const EMOTES = ['win', 'podium', 'lose', 'attackLanded', 'gotHit', 'lobby'] as const;

/** Kart stat bars on a 1–10 scale from KartSpec (ADR-004 archetypes). */
export function kartStats(k: KartSpec): { id: string; v: number }[] {
  const n = (x: number, lo: number, hi: number): number => Math.max(1, Math.min(10, Math.round(3 + ((x - lo) / (hi - lo)) * 7)));
  return [
    { id: 'topSpeed', v: n(k.vGrip + (k.vBoost - 44.4) * 0.5, 33.4, 34.5) },
    { id: 'accel', v: n(k.a0, 16, 20) },
    { id: 'drift', v: n(k.kLatIn - (k.cBeta - 0.8) * 4, 2.7, 3.5) },
    { id: 'gauge', v: n(k.g0, 0.62, 0.8) },
    { id: 'weight', v: n(k.weight, 0.9, 1.2) },
  ];
}

function PatternSwatch({ i, primary, secondary }: { i: number; primary: string; secondary: string }) {
  const pats = [
    `<rect width="40" height="24" fill="${primary}"/><path d="M0 9h40M0 15h40" stroke="${secondary}" stroke-width="3"/>`,
    `<rect width="40" height="24" fill="${primary}"/><path d="M9 6l1.2 3 3 .4-2.3 2 .6 3-2.5-1.5-2.5 1.5.6-3-2.3-2 3-.4zM28 11l1 2.4 2.4.3-1.8 1.6.5 2.4-2.1-1.2-2.1 1.2.5-2.4-1.8-1.6 2.4-.3z" fill="${secondary}"/>`,
    `<rect width="40" height="24" fill="${primary}"/>${[0, 1, 2, 3, 4].map((x) => [0, 1, 2].map((y) => ((x + y) % 2 ? `<rect x="${x * 8}" y="${y * 8}" width="8" height="8" fill="${secondary}"/>` : '')).join('')).join('')}`,
    `<rect width="40" height="24" fill="${primary}"/><path d="M0 24c6-8 4-14 10-18 0 5 4 7 6 10 1-6 5-9 9-12-1 6 3 9 4 14 3-4 5-6 11-7v13z" fill="${secondary}"/>`,
    `<rect width="40" height="24" fill="${primary}"/><path d="M4 4h10v8h8v8M18 4v4h14v12M36 4v6" fill="none" stroke="${secondary}" stroke-width="1.6"/><circle cx="22" cy="12" r="1.6" fill="${secondary}"/><circle cx="36" cy="10" r="1.6" fill="${secondary}"/>`,
    `<rect width="40" height="24" fill="${primary}"/><path d="M0 14c5-5 10 5 15 0s10 5 15 0 10 5 15 0" fill="none" stroke="${secondary}" stroke-width="3"/>`,
    `<rect width="40" height="24" fill="${primary}"/><path d="M8 12c0-5 6-5 6 0s6 5 6 0 6-5 6 0 6 5 6 0" fill="none" stroke="#f2c14e" stroke-width="1.6"/><circle cx="20" cy="5" r="1.4" fill="#f2c14e"/><circle cx="20" cy="19" r="1.4" fill="#f2c14e"/>`,
    `<defs><linearGradient id="au" x1="0" x2="1"><stop offset="0" stop-color="#7de2fc"/><stop offset=".5" stop-color="#8a5cff"/><stop offset="1" stop-color="${primary}"/></linearGradient></defs><rect width="40" height="24" fill="url(#au)"/>`,
    `<defs><linearGradient id="gc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".45" stop-color="#e8b04b"/><stop offset="1" stop-color="#8c5626"/></linearGradient></defs><rect width="40" height="24" fill="url(#gc)"/>`,
    `<rect width="40" height="24" fill="#141413"/><path d="M0 24L40 0" stroke="#f2c14e" stroke-width="4"/><path d="M-4 20L36 -4" stroke="${primary}" stroke-width="2"/>`,
  ];
  return <svg viewBox="0 0 40 24" class="pat-swatch" aria-hidden="true" dangerouslySetInnerHTML={{ __html: pats[i] ?? pats[0]! }} />;
}

export function GarageScreen() {
  const s = saveState.value;
  void locale.value;
  const c = loadContent();
  const [tab, setTab] = useState<Tab>((route.value.params?.['tab'] as Tab) || 'character');
  const [selChar, setSelChar] = useState<CharacterId>(s.profile.characterId);
  const [selKart, setSelKart] = useState<KartBodyId>(s.profile.kartBodyId);
  const [selUnlock, setSelUnlock] = useState<string | null>(null);
  const [buying, setBuying] = useState<UnlockDef | null>(null);
  const [name, setName] = useState(s.profile.name);
  useBack(() => navigate('lobby'));
  // showcase follows the selection; restore the equipped loadout on exit
  useEffect(() => { Stage.showShowcase(selChar, selKart); if (Stage.showcase) Stage.showcase.offsetX = 0.28; }, [selChar, selKart, s.profile.livery]);
  useEffect(() => () => { const p = save.get().profile; Stage.showShowcase(p.characterId, p.kartBodyId); }, []);
  // viewing a tab clears its NEW badges
  useEffect(() => {
    const kind = tab === 'emotes' ? 'emote' : tab;
    if ((s.progress.fresh ?? []).some((id) => id.startsWith(`${kind}.`))) save.update((d) => { d.progress.fresh = (d.progress.fresh ?? []).filter((id) => !id.startsWith(`${kind}.`)); });
  }, [tab]);
  const fresh = new Set(s.progress.fresh ?? []);
  const click = (fn: () => void) => () => { Audio.sfx('uiMove'); fn(); };
  const tabBadge = (k: string): boolean => [...fresh].some((id) => id.startsWith(`${k}.`));

  const doBuy = (u: UnlockDef): void => {
    let r = 'ok';
    save.update((d) => { r = buy(u, d); });
    if (r === 'ok') { Audio.sfx('uiOk'); toast(t('garage.bought', { name: t(u.nameKey) }), 'good'); applyUnlock(u); }
    else if (r === 'notEnough') toast(t('garage.notEnough'), 'bad');
    setBuying(null);
  };
  const applyUnlock = (u: UnlockDef): void => {
    save.update((d) => {
      if (u.kind === 'livery') d.profile.livery.pattern = Number(u.ref);
      if (u.kind === 'palette') { if (u.ref === 'classic') delete d.profile.palette; else d.profile.palette = u.ref; }
      if (u.kind === 'flame') d.profile.livery.flame = u.ref;
      if (u.kind === 'title') d.profile.title = u.ref;
    });
  };
  const tryUse = (u: UnlockDef): void => {
    setSelUnlock(u.id);
    const st = canBuy(u, s);
    if (st === 'owned') { Audio.sfx('uiMove'); applyUnlock(u); }
    else if (st === 'ok' || st === 'notEnough') setBuying(u);
    else Audio.sfx('uiMove');
  };
  const lockTag = (u: UnlockDef | undefined): preact.JSX.Element | null => {
    if (!u) return null;
    if (!isUnlocked(u, s)) return <span class="badge lock"><Icon name="lock" size={11} />{t('common.level', { n: u.level })}</span>;
    if (!isOwned(u, s)) return <span class="badge price"><SparkGlyph size={11} />{u.price.toLocaleString()}</span>;
    return null;
  };

  // ----- detail panel
  let detail: preact.JSX.Element;
  if (tab === 'character') {
    const u = unlockDef(`character.${selChar}`)!;
    const owned = isOwned(u, s), equipped = s.profile.characterId === selChar;
    detail = (
      <>
        <div class="gd-hero"><Portrait id={selChar} size={96} {...(s.profile.palette ? { palette: s.profile.palette } : {})} /></div>
        <h2 class="gd-name display">{t(`chars.${selChar}.name`)}</h2>
        <p class="gd-desc">{t(`garage.charDesc.${selChar}`)}</p>
        <p class="gd-note">{t('garage.cosmeticNote')}</p>
        <label class="gd-field"><span class="eyebrow">{t('garage.name')}</span>
          <input class="field" value={name} maxLength={12} placeholder={t('garage.nameHint')} onInput={(e) => setName((e.target as HTMLInputElement).value)}
            onChange={() => { const v = name.trim().slice(0, 12); if (v) save.update((d) => { d.profile.name = v; }); }} />
        </label>
        <div class="grow" />
        {owned ? <button class={`btn ${equipped ? 'quiet' : 'primary'} gd-act`} type="button" disabled={equipped} data-autofocus onClick={click(() => save.update((d) => { d.profile.characterId = selChar; }))}>{equipped ? <><Icon name="check" size={16} />{t('garage.equipped')}</> : t('garage.equip')}</button>
          : <div class="gd-lock"><Icon name="lock" size={16} />{t('garage.locked', { n: u.level })}</div>}
      </>
    );
  } else if (tab === 'kart') {
    const k = c.karts.get(selKart);
    const u = unlockDef(`kart.${selKart}`)!;
    const owned = isOwned(u, s), equipped = s.profile.kartBodyId === selKart;
    detail = (
      <>
        <span class={`badge arch-${k.archetype}`}>{t(`garage.archetype.${k.archetype}`)}</span>
        <h2 class="gd-name display">{t(`karts.${selKart}.name`)}</h2>
        <p class="gd-desc">{t(`garage.kartDesc.${selKart}`)}</p>
        <h3 class="eyebrow gd-sub">{t('garage.statsOf')}</h3>
        <ul class="stat-bars">
          {kartStats(k).map((x) => (
            <li key={x.id}><span>{t(`garage.stat.${x.id}`)}</span><span class="sb" aria-label={`${x.v}/10`}>{Array.from({ length: 10 }, (_, i) => <i key={i} class={i < x.v ? 'on' : ''} />)}</span><b class="num">{x.v}</b></li>
          ))}
        </ul>
        <div class="grow" />
        {owned ? <button class={`btn ${equipped ? 'quiet' : 'primary'} gd-act`} type="button" disabled={equipped} data-autofocus onClick={click(() => save.update((d) => { d.profile.kartBodyId = selKart; }))}>{equipped ? <><Icon name="check" size={16} />{t('garage.equipped')}</> : t('garage.equip')}</button>
          : <div class="gd-lock"><Icon name="lock" size={16} />{t('garage.locked', { n: u.level })}</div>}
      </>
    );
  } else {
    const u = selUnlock ? unlockDef(selUnlock) : undefined;
    detail = u ? (
      <>
        {u.color ? <div class="gd-swatch" style={{ background: u.color }} /> : u.kind === 'livery' ? <PatternSwatch i={Number(u.ref)} primary={s.profile.livery.primary} secondary={s.profile.livery.secondary} /> : <div class="gd-hero"><Icon name={u.kind === 'emote' ? 'smile' : 'star'} size={64} /></div>}
        <h2 class="gd-name display">{t(u.nameKey)}</h2>
        {u.kind === 'flame' ? <p class="gd-note">{t('garage.teamFlameNote')}</p> : null}
        <div class="grow" />
        {isOwned(u, s) ? <div class="gd-owned"><Icon name="check" size={16} />{t('garage.owned')}</div>
          : !isUnlocked(u, s) ? <div class="gd-lock"><Icon name="lock" size={16} />{t('garage.locked', { n: u.level })}</div>
            : <button class="btn primary gd-act" type="button" onClick={() => setBuying(u)}><SparkGlyph size={16} />{t('garage.buy', { price: u.price.toLocaleString() })}</button>}
      </>
    ) : <p class="gd-desc">{t('garage.sub')}</p>;
  }

  return (
    <div class="screen garage fade-in">
      <div class="scrim-top" /><div class="scrim-left" />
      <ScreenHead title={t('garage.title')} sub={t('garage.sub')} onBack={() => navigate('lobby')} right={<SparksChip />} />
      <section class="gar-left card" aria-label={t('garage.title')}>
        <Tabs label={t('garage.title')} value={tab} onChange={(v) => { setTab(v); setSelUnlock(null); }}
          tabs={TABS.map((id) => ({ id, label: <>{t(`garage.${id}`)}{tabBadge(id === 'emotes' ? 'emote' : id) ? <i class="dot-new" /> : null}</> }))} />
        <div class="gar-list">
          {tab === 'character' && (
            <div class="char-grid">
              {c.characters.all.map((ch) => {
                const u = unlockDef(`character.${ch.id}`)!;
                const eq = s.profile.characterId === ch.id;
                return (
                  <button key={ch.id} type="button" class={`gtile ${selChar === ch.id ? 'sel' : ''} ${isUnlocked(u, s) ? '' : 'locked'}`} onClick={click(() => setSelChar(ch.id))}>
                    <Portrait id={ch.id} size={56} {...(s.profile.palette ? { palette: s.profile.palette } : {})} />
                    <span class="gt-name">{t(`chars.${ch.id}.name`)}</span>
                    {eq ? <span class="badge coral gt-tag">{t('garage.equipped')}</span> : lockTag(u)}
                    {fresh.has(u.id) ? <span class="badge new gt-new">{t('common.new')}</span> : null}
                  </button>
                );
              })}
            </div>
          )}
          {tab === 'kart' && (
            <div class="kart-grid">
              {c.karts.all.map((k) => {
                const u = unlockDef(`kart.${k.id}`)!;
                const eq = s.profile.kartBodyId === k.id;
                return (
                  <button key={k.id} type="button" class={`ktile ${selKart === k.id ? 'sel' : ''} ${isUnlocked(u, s) ? '' : 'locked'}`} onClick={click(() => setSelKart(k.id))}>
                    <span class="kt-top"><span class={`badge arch-${k.archetype}`}>{t(`garage.archetype.${k.archetype}`)}</span>{eq ? <span class="badge coral">{t('garage.equipped')}</span> : lockTag(u)}</span>
                    <span class="kt-name">{t(`karts.${k.id}.name`)}</span>
                    <span class="kt-mini">{kartStats(k).slice(0, 3).map((x) => <i key={x.id} style={{ width: `${x.v * 10}%` }} />)}</span>
                    {fresh.has(u.id) ? <span class="badge new gt-new">{t('common.new')}</span> : null}
                  </button>
                );
              })}
            </div>
          )}
          {tab === 'livery' && (
            <div class="livery">
              <h3 class="eyebrow">{t('garage.pattern')}</h3>
              <div class="pat-grid">
                {LIVERY_PATTERNS.map((p, i) => {
                  const u = unlockDef(`livery.${p.id}`)!;
                  return (
                    <button key={p.id} type="button" class={`ptile ${s.profile.livery.pattern === i ? 'sel' : ''} ${isUnlocked(u, s) ? '' : 'locked'}`} onClick={() => tryUse(u)} aria-label={t(u.nameKey)}>
                      <PatternSwatch i={i} primary={s.profile.livery.primary} secondary={s.profile.livery.secondary} />
                      <span class="pt-name">{t(u.nameKey)}</span>
                      {lockTag(u)}
                    </button>
                  );
                })}
              </div>
              <div class="color-rows">
                <div><h3 class="eyebrow">{t('garage.primary')}</h3><div class="swatches">{PRIMARY.map((col) => <button key={col} type="button" class={`sw ${s.profile.livery.primary === col ? 'sel' : ''}`} style={{ background: col }} aria-label={col} onClick={click(() => save.update((d) => { d.profile.livery.primary = col; }))} />)}</div></div>
                <div><h3 class="eyebrow">{t('garage.secondary')}</h3><div class="swatches">{SECONDARY.map((col) => <button key={col} type="button" class={`sw ${s.profile.livery.secondary === col ? 'sel' : ''}`} style={{ background: col }} aria-label={col} onClick={click(() => save.update((d) => { d.profile.livery.secondary = col; }))} />)}</div></div>
              </div>
              <div class="num-row">
                <label><span class="eyebrow">{t('garage.number')}</span>
                  <span class="stepper">
                    <button type="button" class="btn quiet small" aria-label="-" onClick={click(() => save.update((d) => { d.profile.livery.number = (d.profile.livery.number + 99) % 100; }))}><Icon name="minus" size={16} /></button>
                    <b class="num">{String(s.profile.livery.number).padStart(2, '0')}</b>
                    <button type="button" class="btn quiet small" aria-label="+" onClick={click(() => save.update((d) => { d.profile.livery.number = (d.profile.livery.number + 1) % 100; }))}><Icon name="plus" size={16} /></button>
                  </span>
                </label>
                <label><span class="eyebrow">{t('garage.plateText')}</span>
                  <input class="field plate" maxLength={8} value={s.profile.livery.plate ?? ''} placeholder="CLAWD" onChange={(e) => { const v = (e.target as HTMLInputElement).value.toUpperCase().slice(0, 8); save.update((d) => { d.profile.livery.plate = v; }); }} />
                </label>
              </div>
              <h3 class="eyebrow">{t('garage.flame')}</h3>
              <div class="flame-row">
                {FLAMES.map((f) => {
                  const u = unlockDef(`flame.${f.id}`)!;
                  const on = (s.profile.livery.flame ?? 'coral') === f.id;
                  return (
                    <button key={f.id} type="button" class={`ftile ${on ? 'sel' : ''} ${isUnlocked(u, s) ? '' : 'locked'}`} onClick={() => tryUse(u)}>
                      <i class="flame" style={{ background: `radial-gradient(circle at 50% 70%, #fff, ${f.color} 55%, transparent 72%)` }} />
                      <span>{t(u.nameKey)}</span>{lockTag(u)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {tab === 'palette' && (
            <div class="pal-grid">
              {PALETTES.map((p) => {
                const u = unlockDef(`palette.${p.id}`)!;
                const on = (s.profile.palette ?? 'classic') === p.id;
                return (
                  <button key={p.id} type="button" class={`paltile ${on ? 'sel' : ''} ${isUnlocked(u, s) ? '' : 'locked'}`} onClick={() => tryUse(u)}>
                    <Portrait id={s.profile.characterId} size={64} palette={p.id} />
                    <span class="pt-name"><i class="swatch" style={{ background: p.color }} />{t(u.nameKey)}</span>
                    {on ? <span class="badge coral">{t('garage.equipped')}</span> : lockTag(u)}
                  </button>
                );
              })}
            </div>
          )}
          {tab === 'emotes' && (
            <div class="emote-list">
              <p class="gd-note">{t('garage.emoteNote')}</p>
              <div class="emote-grid">
                {EMOTES.map((e, i) => (
                  <button key={e} type="button" class="etile" onClick={click(() => Stage.showcase?.emote())}>
                    <span class="kbd">{i < 4 ? i + 1 : '·'}</span><span>{t(`garage.emote.${e}`)}</span><Icon name="play" size={14} />
                  </button>
                ))}
              </div>
              {allUnlocks().filter((u) => u.kind === 'emote' || u.kind === 'title').map((u) => (
                <button key={u.id} type="button" class={`ptile wide ${isUnlocked(u, s) ? '' : 'locked'}`} onClick={() => tryUse(u)}>
                  <Icon name={u.kind === 'title' ? 'crown' : 'smile'} size={22} /><span class="pt-name">{t(u.nameKey)}</span>{isOwned(u, s) ? <span class="badge coral">{t('garage.owned')}</span> : lockTag(u)}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
      <aside class="gar-right card">{detail}</aside>
      {buying ? (
        <Confirm title={t('garage.buyTitle')}
          body={<p>{t('garage.buyBody', { name: t(buying.nameKey), price: buying.price.toLocaleString() })}{canBuy(buying, s) === 'notEnough' ? <><br /><b class="gd-warn">{t('garage.notEnough')}</b></> : null}</p>}
          okLabel={canBuy(buying, s) === 'notEnough' ? t('common.ok') : t('garage.buy', { price: buying.price.toLocaleString() })}
          onOk={() => (canBuy(buying, s) === 'ok' ? doBuy(buying) : setBuying(null))} onCancel={() => setBuying(null)} />
      ) : null}
    </div>
  );
}
