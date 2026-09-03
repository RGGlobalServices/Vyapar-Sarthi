'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Save, Printer, Ruler, RotateCcw, Trash2, Check, Sparkles, AlertTriangle, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslations } from 'next-intl';
import {
  PrinterProfile,
  LABEL_PRESETS,
  LabelSizePresetKey,
  DEFAULT_PROFILE,
  DEFAULT_SHEET,
  profileFromPreset,
  recommendedForPreset,
  listProfiles,
  saveProfile,
  deleteProfile,
  setActiveProfileId,
  getActiveProfileId,
  autoFitBarcode,
  normalizeProfile,
  duplicateProfile,
  PrintType,
  Rotation,
  A4SheetConfig,
  A4_SHEET_PRESETS,
  fitSheetLabels,
  computeSheetGeometry,
} from '@/lib/printProfiles';
import { validateBarcode } from '@/lib/barcodeValidation';
import { printTestLabel, printCalibrationSheet } from '@/lib/printLabels';
import { computeLabelLayout } from '@/lib/labelRenderer';

/**
 * The "Barcode & QR Print Settings" panel. Groups every setting from
 * the client spec into six labelled sections + a live preview so a
 * shopkeeper never has to scroll through 40 fields flat. Every dimension
 * is in millimetres (physical), every field is optional (safe defaults
 * come from the selected preset), and calibration is per-axis %.
 *
 * Save & Use writes the profile to per-shop localStorage and marks it as
 * the active profile so subsequent prints (Print button in the parent
 * BarcodeQRModal, bulk import prints, etc.) pick it up automatically.
 *
 * This is a configuration screen — never edits product data.
 */
export interface BarcodePrintSettingsProps {
  shopId: string;
  /** Barcode value the preview should render — usually the product's real
   *  barcode. If empty, the preview uses a sample. */
  sampleBarcode?: string;
  sampleName?: string;
  sampleVariant?: string;
  samplePrice?: number;
  sampleMrp?: number;
  /** Product's own SKU, if it has one — powers the "SKU" field toggle's
   *  live preview (and the hint shown when a product has none set). */
  sampleSku?: string;
  /** Product's own Other Code, if it has one — powers the "Other Code"
   *  field toggle's live preview (and the hint shown when unset). */
  sampleOtherCode?: string;
  /** Called when the shopkeeper hits Save & Use — parent typically closes
   *  the settings modal and re-triggers Print with the new profile. */
  onSaved: (profile: PrinterProfile) => void;
  onClose: () => void;
  /** Optional starting profile — passed when the parent is editing an
   *  existing saved profile. Otherwise starts from the last-used or
   *  the built-in default. */
  initialProfile?: PrinterProfile;
}

type SectionKey = 'paper' | 'barcode' | 'text' | 'qr' | 'position' | 'calibration';
type T = ReturnType<typeof useTranslations>;

export default function BarcodePrintSettings({
  shopId,
  sampleBarcode,
  sampleName,
  sampleVariant,
  samplePrice,
  sampleMrp,
  sampleSku,
  sampleOtherCode,
  onSaved,
  onClose,
  initialProfile,
}: BarcodePrintSettingsProps) {
  const t = useTranslations('BarcodePrintSettings');
  const [profile, setProfile] = useState<PrinterProfile>(() => {
    // Always normalize so older saved profiles gain printType/rotation/sheet
    // before the UI reads them.
    if (initialProfile) return normalizeProfile({ ...initialProfile });
    // If there are any saved profiles, seed from the latest — otherwise
    // from the default.
    if (shopId) {
      const all = listProfiles(shopId);
      if (all.length) return normalizeProfile({ ...[...all].sort((a, b) => b.updatedAt - a.updatedAt)[0] });
    }
    return normalizeProfile({ ...DEFAULT_PROFILE, id: `prof-${Date.now().toString(36)}` });
  });
  const [profiles, setProfiles] = useState<PrinterProfile[]>(() => listProfiles(shopId));
  const [activeId, setActiveId] = useState<string | null>(() => (shopId ? getActiveProfileId(shopId) : null));
  const [section, setSection] = useState<SectionKey>('paper');

  useEffect(() => { setProfiles(listProfiles(shopId)); setActiveId(shopId ? getActiveProfileId(shopId) : null); }, [shopId]);

  function patch(update: Partial<PrinterProfile>) {
    setProfile(prev => ({ ...prev, ...update }));
  }

  function onPickPreset(key: LabelSizePresetKey) {
    const rec = recommendedForPreset(key);
    const p = LABEL_PRESETS.find(x => x.key === key)!;
    // Auto-update the profile name too when it still matches the
    // previous preset's default label — otherwise a shopkeeper flipping
    // from 50×30 to 60×30 keeps seeing "Default (50 × 30 mm)" even
    // though the actual dimensions changed. Only rewrites when the name
    // is still a default-style "<preset label> Printer" or "Default (…)"
    // string, so a hand-picked name ("Ashok's barcode printer") never
    // gets clobbered. Fixes the stale-name UX bug the client called out.
    const currentIsDefault = /^Default \(/i.test(profile.name) || / Printer$/i.test(profile.name);
    const nextName = currentIsDefault ? `${p.label} Printer` : profile.name;
    patch({
      preset: key,
      name: nextName,
      labelWidthMm: p.widthMm,
      labelHeightMm: p.heightMm,
      ...rec,
    });
  }

  // Switching the top-level Print Type picks a sensible default size preset
  // for that mode so the shopkeeper isn't left with, say, a 50×30 sticker
  // size while in "A4 Label Sheet" mode.
  function onPickPrintType(pt: PrintType) {
    if (pt === 'a4-sheet' || pt === 'a4-plain') {
      patch({
        printType: pt,
        preset: 'a4',
        sheet: profile.sheet ?? { ...DEFAULT_SHEET },
      });
    } else if (pt === 'thermal-roll') {
      const rec = recommendedForPreset('thermal58');
      patch({ printType: pt, preset: 'thermal58', ...rec });
    } else {
      const rec = recommendedForPreset('label50x30');
      patch({ printType: pt, preset: 'label50x30', ...rec });
    }
  }

  // Patch the A4 sheet config. Changes to count/margins/gaps re-fit the label
  // cell size so labels always tile the page without overflow.
  function patchSheet(update: Partial<A4SheetConfig>, refit = false) {
    const base = profile.sheet ?? { ...DEFAULT_SHEET };
    const next = { ...base, ...update };
    patch({ sheet: refit ? fitSheetLabels(next) : next });
  }

  function onPickSheetPreset(key: string) {
    const p = A4_SHEET_PRESETS.find(x => x.key === key);
    if (!p) return;
    const base = profile.sheet ?? { ...DEFAULT_SHEET };
    patch({ sheet: fitSheetLabels({ ...base, columns: p.columns, rows: p.rows, orientation: p.orientation }) });
  }

  function onSave() {
    if (!shopId) { toast.error(t('toast.noShopSelected')); return; }
    if (!profile.name.trim()) { toast.error(t('toast.giveProfileName')); return; }
    const saved = saveProfile(shopId, { ...profile });
    setActiveProfileId(shopId, saved.id);
    setActiveId(saved.id);
    setProfiles(listProfiles(shopId));
    toast.success(t('toast.profileSaved'));
    onSaved(saved);
  }

  function onDelete(id: string) {
    if (!confirm(t('toast.confirmDeleteProfile'))) return;
    deleteProfile(shopId, id);
    setProfiles(listProfiles(shopId));
    if (profile.id === id) setProfile({ ...DEFAULT_PROFILE, id: `prof-${Date.now().toString(36)}` });
  }

  function onDuplicate(p: PrinterProfile) {
    if (!shopId) { toast.error(t('toast.noShopSelected')); return; }
    const copy = duplicateProfile(p);
    saveProfile(shopId, copy);
    setProfiles(listProfiles(shopId));
    setProfile(copy);
    toast.success(t('toast.profileDuplicated'));
  }

  function onSetDefault(id: string) {
    if (!shopId) return;
    setActiveProfileId(shopId, id);
    setActiveId(id);
    setProfiles(listProfiles(shopId));
    toast.success(t('toast.setAsDefault'));
  }

  function onResetToRecommended() {
    const rec = recommendedForPreset(profile.preset);
    patch({ ...rec, scaleH: 100, scaleV: 100, offsetXMm: 0, offsetYMm: 0, margins: { top: 1, right: 1, bottom: 1, left: 1 } });
    toast.success(t('toast.resetToRecommended', { preset: profile.preset }));
  }

  const validation = useMemo(() => {
    const val = sampleBarcode || '123456789012';
    const fit = profile.autoFit ? autoFitBarcode(profile, val) : { widthMm: profile.barcodeWidthMm, heightMm: profile.barcodeHeightMm };
    return validateBarcode(val, profile.barcodeType, fit.widthMm, fit.heightMm);
  }, [profile, sampleBarcode]);

  const sections: Array<{ key: SectionKey; label: string; icon: string }> = [
    { key: 'paper', label: t('section.paper'), icon: '📄' },
    { key: 'barcode', label: t('section.barcode'), icon: '▮' },
    { key: 'text', label: t('section.text'), icon: '𝐀' },
    { key: 'qr', label: t('section.qr'), icon: '▨' },
    { key: 'position', label: t('section.position'), icon: '⤢' },
    { key: 'calibration', label: t('section.calibration'), icon: '📏' },
  ];

  return (
    <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-0 sm:p-3">
      {/* Full-screen on mobile (no radii, no gaps) so every pixel of a
          360×640 phone is usable; centered card on tablet+. h-[100dvh] uses
          the dynamic viewport height so mobile browser chrome (URL bar,
          keyboard) doesn't push the modal off-screen. */}
      <div className="bg-slate-900 border-0 sm:border sm:border-slate-700 rounded-none sm:rounded-2xl w-full max-w-5xl h-[100dvh] sm:h-[92vh] sm:max-h-[92vh] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-3 sm:px-5 py-2.5 sm:py-3 border-b border-slate-800 bg-slate-800/40 shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-2">
              <Printer size={17} className="text-emerald-400 shrink-0" />
              <span className="truncate">{t('title')}</span>
            </h2>
            <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 hidden sm:block">{t('subtitle')}</p>
          </div>
          <button onClick={onClose} aria-label={t('close')} className="text-slate-400 hover:text-slate-200 p-1.5 shrink-0"><X size={20} /></button>
        </div>

        {/* Section chip bar — visible on mobile ONLY (md+ gets the left
            rail). Horizontally scrollable so all 6 sections stay reachable
            on 320px screens. */}
        <div className="md:hidden border-b border-slate-800 bg-slate-800/20 shrink-0 overflow-x-auto">
          <div className="flex gap-1 p-2 min-w-max">
            {sections.map(s => (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 shrink-0 transition ${section === s.key ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}
              >
                <span>{s.icon}</span>{s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile row-sizing: previously the settings row was a bare "auto"
            track and the preview row (holding the live label preview AND
            the Save & Use button) was a bare "1fr" — "auto" claims content
            height first, so settings ate almost everything and left preview
            with whatever pixels were left over (observed: as little as
            ~30px on a 700px-wide viewport), making the primary action
            nearly unreachable without hunting for a tiny internal
            scrollbar. Now both rows get a floor AND a ceiling: settings
            (minmax(160px,1fr)) always keeps at least 160px and can grow
            into leftover space; preview (minmax(260px,42vh)) always gets
            at least 260px but is capped so it can't crowd settings out
            entirely either — whichever row's content exceeds its share
            just scrolls internally (both already have overflow-y-auto). */}
        <div className="flex-1 min-h-0 grid grid-rows-[auto_minmax(160px,1fr)_minmax(260px,42vh)] md:grid-rows-none md:grid-cols-[minmax(140px,180px)_minmax(0,1fr)_minmax(240px,320px)]">
          {/* Left rail — hidden on mobile (chip bar above replaces it);
              desktop-only. Saved profiles moved into its own drawer below
              on mobile so the middle pane stays usable. */}
          <div className="hidden md:block border-r border-slate-800 bg-slate-800/20 overflow-y-auto">
            <div className="p-2 space-y-1">
              {sections.map(s => (
                <button
                  key={s.key}
                  onClick={() => setSection(s.key)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition ${section === s.key ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
                >
                  <span className="w-4 text-center">{s.icon}</span>{s.label}
                </button>
              ))}
            </div>

            <div className="p-2 border-t border-slate-800 mt-2">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-1 mb-1">{t('savedProfiles.title')}</p>
              {profiles.length === 0 && <p className="text-[11px] text-slate-500 px-1 py-2">{t('savedProfiles.empty')}</p>}
              {profiles.map(p => (
                <div key={p.id} className={`group px-2 py-1.5 rounded-lg text-[11px] flex items-center gap-1 ${p.id === profile.id ? 'bg-slate-700/50 text-slate-100' : 'text-slate-400 hover:bg-slate-800'}`}>
                  <button className="flex-1 min-w-0 text-left truncate flex items-center gap-1" onClick={() => setProfile(normalizeProfile({ ...p }))} title={p.name}>
                    {activeId === p.id && <span className="text-emerald-400 shrink-0" title={t('savedProfiles.defaultTitle')}>★</span>}
                    <span className="truncate">{p.name}</span>
                  </button>
                  <button onClick={() => onSetDefault(p.id)} title={t('savedProfiles.setDefaultTitle')} className={`opacity-0 group-hover:opacity-100 shrink-0 ${activeId === p.id ? 'text-emerald-400' : 'text-slate-500 hover:text-emerald-400'}`}>★</button>
                  <button onClick={() => onDuplicate(p)} title={t('savedProfiles.duplicateTitle')} className="opacity-0 group-hover:opacity-100 shrink-0 text-slate-500 hover:text-slate-200"><Copy size={12} /></button>
                  <button onClick={() => onDelete(p.id)} title={t('savedProfiles.deleteTitle')} className="opacity-0 group-hover:opacity-100 shrink-0 text-red-400 hover:text-red-300"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          </div>

          {/* Saved profiles row — mobile only. Compact horizontal scroller
              so touch users can flip between saved printer profiles
              without needing the desktop left rail. */}
          {profiles.length > 0 && (
            <div className="md:hidden border-b border-slate-800 bg-slate-800/10 shrink-0 overflow-x-auto">
              <div className="flex gap-1 p-2 min-w-max">
                <span className="text-[10px] font-bold text-slate-500 uppercase self-center px-2">{t('savedProfiles.mobilePrefix')}</span>
                {profiles.map(p => (
                  <div key={p.id} className={`px-2.5 py-1 rounded-full text-[11px] flex items-center gap-1.5 shrink-0 ${p.id === profile.id ? 'bg-slate-700 text-slate-100' : 'bg-slate-800 text-slate-400'}`}>
                    <button onClick={() => setProfile(normalizeProfile({ ...p }))} className="max-w-[120px] truncate">{activeId === p.id ? '★ ' : ''}{p.name}</button>
                    <button onClick={() => onDuplicate(p)} className="text-slate-400 hover:text-slate-200"><Copy size={11} /></button>
                    <button onClick={() => onDelete(p.id)} className="text-red-400 hover:text-red-300"><Trash2 size={11} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Middle — section content. On mobile, this scrolls the whole
              remaining viewport; on desktop, it's the centre column of the
              three-column grid. */}
          <div className="[grid-row:2] md:[grid-row:auto] overflow-y-auto p-3 sm:p-4 space-y-3 min-h-0">
            {/* Name + Reset row — visible in every section */}
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('profileName.label')}</label>
                <input
                  type="text"
                  value={profile.name}
                  onChange={e => patch({ name: e.target.value })}
                  placeholder={t('profileName.placeholder')}
                  className="w-full h-9 px-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <button onClick={onResetToRecommended} className="h-9 px-3 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold hover:border-emerald-500 flex items-center gap-1.5">
                <RotateCcw size={13} /> {t('reset')}
              </button>
            </div>

            {section === 'paper' && <PaperSection t={t} profile={profile} patch={patch} onPickPreset={onPickPreset} onPickPrintType={onPickPrintType} patchSheet={patchSheet} onPickSheetPreset={onPickSheetPreset} />}
            {section === 'barcode' && <BarcodeSection t={t} profile={profile} patch={patch} validation={validation} />}
            {section === 'text' && <TextSection t={t} profile={profile} patch={patch} sampleSku={sampleSku} sampleOtherCode={sampleOtherCode} />}
            {section === 'qr' && <QRSection t={t} profile={profile} patch={patch} />}
            {section === 'position' && <PositionSection t={t} profile={profile} patch={patch} />}
            {section === 'calibration' && <CalibrationSection t={t} profile={profile} patch={patch} onPrintRuler={() => printCalibrationSheet(profile)} />}
          </div>

          {/* Right — live preview + validation + actions. On mobile, this
              is a bottom sheet-like sticky footer (preview collapses to a
              small strip) so shopkeepers can still tap Save/Print without
              scrolling the whole modal. On desktop it's the right column. */}
          <div className="[grid-row:3] md:[grid-row:auto] border-t md:border-t-0 md:border-l border-slate-800 bg-slate-950/30 overflow-y-auto p-3 sm:p-4 space-y-3 md:max-h-none">
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('livePreview')}</p>
              <LabelPreview t={t} profile={profile} sampleName={sampleName} sampleVariant={sampleVariant} sampleBarcode={sampleBarcode} samplePrice={samplePrice} sampleMrp={sampleMrp} sampleSku={sampleSku} sampleOtherCode={sampleOtherCode} />
              {(profile.printType === 'a4-sheet' || profile.printType === 'a4-plain') ? (
                <p className="text-[10px] text-slate-500 mt-1.5 text-center">
                  {t('pageInfo.page')} <b className="text-slate-300">A4 {(profile.sheet ?? DEFAULT_SHEET).orientation === 'portrait' ? t('common.portrait') : t('common.landscape')}</b>
                  {' · '}<b className="text-slate-300">{(profile.sheet ?? DEFAULT_SHEET).columns} × {(profile.sheet ?? DEFAULT_SHEET).rows}</b>
                  <br />{t('pageInfo.label')} <b className="text-slate-300">{(profile.sheet ?? DEFAULT_SHEET).labelWidthMm} × {(profile.sheet ?? DEFAULT_SHEET).labelHeightMm} mm</b>
                  {' · '}{t('pageInfo.perPage', { count: computeSheetGeometry(profile.sheet ?? DEFAULT_SHEET).perPage })}
                </p>
              ) : (
                <p className="text-[10px] text-slate-500 mt-1.5 text-center">
                  {t('pageInfo.label')} <b className="text-slate-300">{profile.labelWidthMm} × {profile.labelHeightMm > 0 ? profile.labelHeightMm : 'auto'} mm</b>
                  {(profile.rotation ?? 0) !== 0 && <> · <b className="text-slate-300">{profile.rotation}°</b></>}
                  <br />{t('pageInfo.barcode')}
                  {' '}<b className="text-slate-300">
                    {(profile.autoFit ? autoFitBarcode(profile, sampleBarcode || '123456789012').widthMm : profile.barcodeWidthMm).toFixed(1)}
                    {' × '}
                    {(profile.autoFit ? autoFitBarcode(profile, sampleBarcode || '123456789012').heightMm : profile.barcodeHeightMm).toFixed(1)} mm
                  </b>
                </p>
              )}
            </div>

            {(validation.errors.length > 0 || validation.warnings.length > 0) && (
              <div className={`rounded-lg border p-2 ${validation.errors.length ? 'border-red-500/40 bg-red-500/10' : 'border-amber-500/40 bg-amber-500/10'}`}>
                {validation.errors.map((e, i) => (
                  <p key={`e${i}`} className="text-[11px] text-red-300 flex items-start gap-1"><AlertTriangle size={11} className="mt-0.5 shrink-0" />{e}</p>
                ))}
                {validation.warnings.map((w, i) => (
                  <p key={`w${i}`} className="text-[11px] text-amber-300 flex items-start gap-1"><AlertTriangle size={11} className="mt-0.5 shrink-0" />{w}</p>
                ))}
                {validation.warnings.length > 0 && !profile.autoFit && (
                  <button
                    onClick={() => patch({ autoFit: true })}
                    className="mt-1 text-[11px] font-bold text-emerald-400 hover:text-emerald-300"
                  >
                    → {t('barcodeSection.autoFitTitle')}
                  </button>
                )}
              </div>
            )}

            <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 p-2.5 space-y-1.5">
              <p className="text-[10px] font-bold text-blue-300 uppercase tracking-wider">{t('printScale.title')}</p>
              <p className="text-[11px] text-blue-200 leading-snug">
                {t('printScale.body1')}
              </p>
              <p className="text-[11px] text-blue-200 leading-snug">
                {t('printScale.body2')}
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => printTestLabel(profile)}
                className="w-full h-9 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 hover:border-emerald-500"
              >
                <Printer size={13} /> {t('printTestLabel')}
              </button>
              <button
                onClick={onSave}
                disabled={validation.errors.length > 0}
                className="w-full h-10 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-black flex items-center justify-center gap-1.5"
              >
                <Save size={14} /> {t('saveAndUse')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Section components ────────────────────────────────────────────────────

function PaperSection({ t, profile, patch, onPickPreset, onPickPrintType, patchSheet, onPickSheetPreset }: {
  t: T;
  profile: PrinterProfile;
  patch: (u: Partial<PrinterProfile>) => void;
  onPickPreset: (k: LabelSizePresetKey) => void;
  onPickPrintType: (pt: PrintType) => void;
  patchSheet: (u: Partial<A4SheetConfig>, refit?: boolean) => void;
  onPickSheetPreset: (key: string) => void;
}) {
  const printType = profile.printType ?? 'thermal-sticker';
  const isSheet = printType === 'a4-sheet' || printType === 'a4-plain';

  const PRINT_TYPES: Array<{ key: PrintType; label: string; hint: string; icon: string }> = [
    { key: 'a4-sheet',        label: t('printType.a4Sheet.label'),        hint: t('printType.a4Sheet.hint'),        icon: '▦' },
    { key: 'a4-plain',        label: t('printType.a4Plain.label'),        hint: t('printType.a4Plain.hint'),        icon: '▤' },
    { key: 'thermal-sticker', label: t('printType.thermalSticker.label'), hint: t('printType.thermalSticker.hint'), icon: '🏷' },
    { key: 'thermal-roll',    label: t('printType.thermalRoll.label'),    hint: t('printType.thermalRoll.hint'),    icon: '🧾' },
  ];

  // Size-preset picker for the thermal modes (label rolls / receipt rolls).
  const presetGroup = (g: string, label: string) => (
    <div key={g}>
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{label}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {LABEL_PRESETS.filter(p => p.group === g).map(p => (
          <button
            key={p.key}
            onClick={() => onPickPreset(p.key)}
            className={`px-2.5 py-2 rounded-lg text-xs font-bold text-left border transition ${profile.preset === p.key ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-800/40 text-slate-300 hover:border-slate-500'}`}
          >
            {p.label}
            <span className="block text-[10px] font-medium text-slate-500">{p.widthMm} × {p.heightMm > 0 ? p.heightMm : 'auto'} mm</span>
          </button>
        ))}
      </div>
    </div>
  );

  const sheet = profile.sheet ?? DEFAULT_SHEET;
  const geo = computeSheetGeometry(sheet);

  return (
    <div className="space-y-4">
      {/* Print Type — the primary decision (spec section 1A). Decides which
          physical renderer runs. */}
      <div>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('printType.title')}</p>
        <div className="grid grid-cols-2 gap-1.5">
          {PRINT_TYPES.map(pt => (
            <button
              key={pt.key}
              onClick={() => onPickPrintType(pt.key)}
              className={`px-2.5 py-2 rounded-lg text-xs font-bold text-left border transition ${printType === pt.key ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-800/40 text-slate-300 hover:border-slate-500'}`}
            >
              <span className="flex items-center gap-1.5">{pt.icon} {pt.label}</span>
              <span className="block text-[10px] font-medium text-slate-500 mt-0.5">{pt.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {isSheet ? (
        <div className="space-y-3">
          {/* Orientation */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('paper.pageOrientation')}</p>
            <div className="flex gap-1 bg-slate-900 p-1 rounded-lg">
              {(['portrait', 'landscape'] as const).map(o => (
                <button key={o} onClick={() => patchSheet({ orientation: o }, true)} className={`flex-1 py-1.5 rounded-md text-xs font-bold ${sheet.orientation === o ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}>A4 {o === 'portrait' ? t('common.portrait') : t('common.landscape')}</button>
              ))}
            </div>
          </div>

          {/* Grid presets */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('paper.layoutPreset')}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {A4_SHEET_PRESETS.map(p => {
                const active = sheet.columns === p.columns && sheet.rows === p.rows;
                return (
                  <button key={p.key} onClick={() => onPickSheetPreset(p.key)}
                    className={`px-2.5 py-2 rounded-lg text-xs font-bold text-left border transition ${active ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-800/40 text-slate-300 hover:border-slate-500'}`}>
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Columns / rows */}
          <div className="rounded-xl border border-slate-700 p-3 space-y-2 bg-slate-800/30">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('paper.gridTitle')}</p>
            <div className="grid grid-cols-2 gap-2">
              <NumberInput label={t('paper.columns')} value={sheet.columns} onChange={v => patchSheet({ columns: Math.max(1, Math.round(v)) }, true)} min={1} max={8} step={1} />
              <NumberInput label={t('paper.rows')} value={sheet.rows} onChange={v => patchSheet({ rows: Math.max(1, Math.round(v)) }, true)} min={1} max={20} step={1} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumberInput label={t('paper.labelWidth')} value={sheet.labelWidthMm} onChange={v => patchSheet({ labelWidthMm: v })} min={10} max={210} step={0.5} suffix="mm" />
              <NumberInput label={t('paper.labelHeight')} value={sheet.labelHeightMm} onChange={v => patchSheet({ labelHeightMm: v })} min={8} max={297} step={0.5} suffix="mm" />
            </div>
            <button onClick={() => patchSheet({}, true)} className="w-full h-8 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 text-[11px] font-bold hover:border-emerald-500">{t('paper.autoFitGrid')}</button>
          </div>

          {/* Gaps + page margins */}
          <div className="rounded-xl border border-slate-700 p-3 space-y-2 bg-slate-800/30">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('paper.gapsTitle')}</p>
            <div className="grid grid-cols-2 gap-2">
              <NumberInput label={t('paper.horizontalGap')} value={sheet.gapXMm} onChange={v => patchSheet({ gapXMm: v }, true)} min={0} max={30} step={0.5} suffix="mm" />
              <NumberInput label={t('paper.verticalGap')} value={sheet.gapYMm} onChange={v => patchSheet({ gapYMm: v }, true)} min={0} max={30} step={0.5} suffix="mm" />
            </div>
          </div>
          <div className="rounded-xl border border-slate-700 p-3 space-y-2 bg-slate-800/30">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('paper.pageMarginsTitle')}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <NumberInput label={t('common.top')} value={sheet.marginTopMm} onChange={v => patchSheet({ marginTopMm: v }, true)} min={0} max={40} step={0.5} suffix="mm" />
              <NumberInput label={t('common.bottom')} value={sheet.marginBottomMm} onChange={v => patchSheet({ marginBottomMm: v }, true)} min={0} max={40} step={0.5} suffix="mm" />
              <NumberInput label={t('common.left')} value={sheet.marginLeftMm} onChange={v => patchSheet({ marginLeftMm: v }, true)} min={0} max={40} step={0.5} suffix="mm" />
              <NumberInput label={t('common.right')} value={sheet.marginRightMm} onChange={v => patchSheet({ marginRightMm: v }, true)} min={0} max={40} step={0.5} suffix="mm" />
            </div>
          </div>

          <p className="text-[11px] text-slate-400 bg-slate-800/40 rounded-lg px-3 py-2 border border-slate-700/50">
            {t('paper.perPageSummary', { count: geo.perPage, width: sheet.labelWidthMm, height: sheet.labelHeightMm })}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {printType === 'thermal-sticker' && presetGroup('label', t('paper.dieCutSizes'))}
          {printType === 'thermal-roll' && presetGroup('thermal', t('paper.continuousRollWidths'))}
          {presetGroup('custom', t('paper.customSize'))}

          {profile.preset === 'custom' && (
            <div className="rounded-xl border border-slate-700 p-3 space-y-2 bg-slate-800/30">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('paper.customWidthHeight')}</p>
              <div className="grid grid-cols-2 gap-2">
                <NumberInput label={t('paper.customWidth')} value={profile.labelWidthMm} onChange={v => patch({ labelWidthMm: v })} min={10} max={500} step={1} suffix="mm" />
                <NumberInput label={t('paper.customHeight')} value={profile.labelHeightMm} onChange={v => patch({ labelHeightMm: v })} min={0} max={500} step={1} suffix="mm" />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-700 p-3 space-y-2 bg-slate-800/30">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{t('resolution.title')}</p>
        <div className="flex gap-1 bg-slate-900 p-1 rounded-lg">
          {([[0, t('common.auto')], [203, '203 DPI'], [300, '300 DPI'], [600, '600 DPI']] as const).map(([v, l]) => (
            <button key={v} onClick={() => patch({ dpi: v as any })} className={`flex-1 py-1.5 rounded-md text-xs font-bold ${profile.dpi === v ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}>{l}</button>
          ))}
        </div>
        <p className="text-[10px] text-slate-500">{t('resolution.hint')}</p>
      </div>
    </div>
  );
}

function BarcodeSection({ t, profile, patch, validation }: { t: T; profile: PrinterProfile; patch: (u: Partial<PrinterProfile>) => void; validation: ReturnType<typeof validateBarcode> }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-700 p-3 space-y-2 bg-slate-800/30">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('barcodeSection.typeTitle')}</p>
        <div className="grid grid-cols-3 gap-1">
          {(['auto', 'CODE128', 'EAN13', 'EAN8', 'UPC', 'CODE39'] as const).map(bt => (
            <button key={bt} onClick={() => patch({ barcodeType: bt })} className={`py-1.5 rounded-md text-xs font-bold ${profile.barcodeType === bt ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-slate-400 hover:text-slate-200'}`}>{bt === 'auto' ? t('common.auto') : bt}</button>
          ))}
        </div>
        <p className="text-[10px] text-slate-500">
          {t('barcodeSection.autoHint')}
          {validation.resolvedFormat && t('barcodeSection.autoHintFormat', { format: validation.resolvedFormat })}
        </p>
      </div>

      <div className="rounded-xl border border-slate-700 p-3 space-y-2 bg-slate-800/30">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('barcodeSection.autoFitTitle')}</p>
          <button onClick={() => patch({ autoFit: !profile.autoFit })} className={`w-9 h-5 rounded-full relative ${profile.autoFit ? 'bg-emerald-500' : 'bg-slate-700'}`}>
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${profile.autoFit ? 'translate-x-4' : ''}`} />
          </button>
        </div>
        <p className="text-[10px] text-slate-500">{t('barcodeSection.autoFitHint')}</p>
      </div>

      {!profile.autoFit && (
        <div className="grid grid-cols-2 gap-2">
          <NumberInput label={t('barcodeSection.barcodeWidth')} value={profile.barcodeWidthMm} onChange={v => patch({ barcodeWidthMm: v })} min={6} max={200} step={0.5} suffix="mm" />
          <NumberInput label={t('barcodeSection.barcodeHeight')} value={profile.barcodeHeightMm} onChange={v => patch({ barcodeHeightMm: v })} min={4} max={100} step={0.5} suffix="mm" />
        </div>
      )}

      <NumberInput label={t('barcodeSection.quietZone')} value={profile.quietZoneMm} onChange={v => patch({ quietZoneMm: v })} min={0} max={10} step={0.5} suffix="mm" hint={t('barcodeSection.quietZoneHint')} />
    </div>
  );
}

function TextSection({ t, profile, patch, sampleSku, sampleOtherCode }: { t: T; profile: PrinterProfile; patch: (u: Partial<PrinterProfile>) => void; sampleSku?: string; sampleOtherCode?: string }) {
  const fieldToggle = (k: keyof PrinterProfile['fields'], label: string) => (
    <button key={k} onClick={() => patch({ fields: { ...profile.fields, [k]: !profile.fields[k] } })}
      className={`px-2 py-1.5 rounded-md text-[11px] font-bold border ${profile.fields[k] ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
      {profile.fields[k] ? <Check size={11} className="inline mr-1" /> : null}{label}
    </button>
  );
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-700 p-3 bg-slate-800/30">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{t('text.showOnLabel')}</p>
        {/* 2-col on phones so the "Product Name" / "Barcode #" chips
            don't wrap onto two ugly lines each; 3-col from sm+. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {fieldToggle('shopName', t('text.field.shopName'))}
          {fieldToggle('productName', t('text.field.productName'))}
          {fieldToggle('sku', t('text.field.sku'))}
          {fieldToggle('otherCode', t('text.field.otherCode'))}
          {fieldToggle('barcodeNumber', t('text.field.barcodeNumber'))}
          {fieldToggle('sellingPrice', t('text.field.sellPrice'))}
          {fieldToggle('mrp', t('text.field.mrp'))}
          {fieldToggle('variant', t('text.field.variant'))}
          {fieldToggle('size', t('text.field.size'))}
          {fieldToggle('colour', t('text.field.colour'))}
          {fieldToggle('customText', t('text.field.customText'))}
        </div>
        {profile.fields.sellingPrice && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('text.sellingCaptionBefore')}</label>
              <input
                type="text"
                value={profile.sellingPriceLabel ?? ''}
                onChange={e => patch({ sellingPriceLabel: e.target.value })}
                placeholder={t('text.sellingCaptionPlaceholder')}
                maxLength={12}
                className="w-full h-9 px-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('text.sellingSuffixAfter')}</label>
              <input
                type="text"
                value={profile.sellingPriceSuffix ?? ''}
                onChange={e => patch({ sellingPriceSuffix: e.target.value })}
                placeholder={t('text.sellingSuffixPlaceholder')}
                maxLength={12}
                className="w-full h-9 px-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <p className="col-span-2 text-[10px] text-slate-500 -mt-0.5">
              {t('text.sellingHint')}
            </p>
          </div>
        )}
        <div className="mt-2">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('text.currencySymbol')}</label>
          <div className="flex gap-1 bg-slate-900 p-1 rounded-lg">
            {([['', t('common.none')], ['Rs.', 'Rs.'], ['₹', '₹']] as const).map(([v, lbl]) => (
              <button key={lbl} onClick={() => patch({ currencyPrefix: v })} className={`flex-1 py-1 rounded-md text-[11px] font-bold ${(profile.currencyPrefix ?? '') === v ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}>{lbl}</button>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 mt-1">{t('text.currencyHint')}</p>
        </div>
        <div className="mt-2">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('text.numberFormat')}</label>
          <div className="flex gap-1 bg-slate-900 p-1 rounded-lg">
            {([['comma', t('text.numberFormatComma'), '3,899'], ['plain', t('text.numberFormatPlain'), '3899'], ['decimal', t('text.numberFormatDecimal'), '3899.00']] as const).map(([v, lbl, ex]) => (
              <button key={v} onClick={() => patch({ priceNumberFormat: v })} className={`flex-1 py-1.5 rounded-md text-[11px] font-bold ${(profile.priceNumberFormat ?? 'comma') === v ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                {lbl}<span className="block text-[9px] font-medium opacity-80">{ex}</span>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 mt-1">{t('text.numberFormatHint')}</p>
        </div>
      </div>

      {/* MRP size — independent of the selling/offer price size. */}
      {profile.fields.mrp && (
        <div className="rounded-xl border border-slate-700 p-3 space-y-2 bg-slate-800/30">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('text.mrpTitle')}</p>
            <button
              type="button"
              onClick={() => patch({ mrpStrikethrough: !(profile.mrpStrikethrough ?? true) })}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold border ${(profile.mrpStrikethrough ?? true) ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300' : 'bg-slate-900 border-slate-700 text-slate-400'}`}
            >
              <span className={(profile.mrpStrikethrough ?? true) ? 'line-through' : ''}>{t('text.cutPriceLine')}</span>
              <span className={`w-7 h-4 rounded-full relative shrink-0 ${(profile.mrpStrikethrough ?? true) ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${(profile.mrpStrikethrough ?? true) ? 'translate-x-3' : ''}`} />
              </span>
            </button>
          </div>
          <p className="text-[10px] text-slate-500 -mt-1">{t('text.cutPriceHint')}</p>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('text.mrpTextSize')}</label>
            <select value={profile.mrpFontSizePt ?? Math.max(6, profile.fontSizePt - 1)} onChange={e => patch({ mrpFontSizePt: Number(e.target.value) })} className="w-full h-9 px-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200">
              {[6, 7, 8, 9, 10, 11, 12, 14, 16, 18].map(n => <option key={n} value={n}>{n}pt</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Offer / selling price size + position — make the offer rate big and
          place it above or below the barcode. */}
      {profile.fields.sellingPrice && (
        <div className="rounded-xl border border-slate-700 p-3 space-y-2 bg-slate-800/30">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('text.offerPriceTitle')}</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('text.priceSize')}</label>
              <select value={profile.priceFontSizePt ?? (profile.fontSizePt + 2)} onChange={e => patch({ priceFontSizePt: Number(e.target.value) })} className="w-full h-9 px-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200">
                {[7, 8, 9, 10, 11, 12, 14, 16, 18, 20].map(n => <option key={n} value={n}>{n}pt</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('text.pricePosition')}</label>
              <div className="flex gap-1 bg-slate-900 p-1 rounded-lg">
                {(['above', 'below'] as const).map(v => (
                  <button key={v} onClick={() => patch({ pricePosition: v })} className={`flex-1 py-1 rounded-md text-[11px] font-bold ${(profile.pricePosition ?? 'below') === v ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}>{v === 'above' ? t('text.aboveBarcode') : t('text.belowBarcode')}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Per-row text sizes — Shop name / Product name / Variant / Barcode # */}
      <div className="rounded-xl border border-slate-700 p-3 space-y-2 bg-slate-800/30">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('text.otherRowSizes')}</p>
        <div className="grid grid-cols-2 gap-2">
          {profile.fields.shopName && (
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('text.shopNameSize')}</label>
              <select value={profile.headerFontSizePt ?? (profile.fontSizePt + 1)} onChange={e => patch({ headerFontSizePt: Number(e.target.value) })} className="w-full h-9 px-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200">
                {[6, 7, 8, 9, 10, 11, 12, 14, 16, 18].map(n => <option key={n} value={n}>{n}pt</option>)}
              </select>
            </div>
          )}
          {profile.fields.productName && (
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('text.productNameSize')}</label>
              <select value={profile.productNameFontSizePt ?? profile.fontSizePt} onChange={e => patch({ productNameFontSizePt: Number(e.target.value) })} className="w-full h-9 px-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200">
                {[6, 7, 8, 9, 10, 11, 12, 14, 16, 18].map(n => <option key={n} value={n}>{n}pt</option>)}
              </select>
            </div>
          )}
          {(profile.fields.variant || profile.fields.size || profile.fields.colour) && (
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('text.variantSize')}</label>
              <select value={profile.variantFontSizePt ?? Math.max(6, profile.fontSizePt - 1)} onChange={e => patch({ variantFontSizePt: Number(e.target.value) })} className="w-full h-9 px-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200">
                {[6, 7, 8, 9, 10, 11, 12, 14, 16].map(n => <option key={n} value={n}>{n}pt</option>)}
              </select>
            </div>
          )}
          {profile.fields.barcodeNumber && (
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('text.barcodeNumberSize')}</label>
              <select value={profile.barcodeNumberFontSizePt ?? Math.max(6, profile.fontSizePt - 1)} onChange={e => patch({ barcodeNumberFontSizePt: Number(e.target.value) })} className="w-full h-9 px-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200">
                {[6, 7, 8, 9, 10, 11, 12, 14, 16].map(n => <option key={n} value={n}>{n}pt</option>)}
              </select>
            </div>
          )}
          {profile.fields.sku && (
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('text.skuSize')}</label>
              <select value={profile.skuFontSizePt ?? Math.max(6, profile.fontSizePt - 1)} onChange={e => patch({ skuFontSizePt: Number(e.target.value) })} className="w-full h-9 px-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200">
                {[6, 7, 8, 9, 10, 11, 12, 14, 16].map(n => <option key={n} value={n}>{n}pt</option>)}
              </select>
            </div>
          )}
          {profile.fields.otherCode && (
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('text.otherCodeSize')}</label>
              <select value={profile.otherCodeFontSizePt ?? Math.max(6, profile.fontSizePt - 1)} onChange={e => patch({ otherCodeFontSizePt: Number(e.target.value) })} className="w-full h-9 px-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200">
                {[6, 7, 8, 9, 10, 11, 12, 14, 16].map(n => <option key={n} value={n}>{n}pt</option>)}
              </select>
            </div>
          )}
        </div>
        {profile.fields.sku && !sampleSku?.trim() && (
          <p className="text-[10px] text-amber-400/90 flex items-start gap-1"><AlertTriangle size={11} className="mt-0.5 shrink-0" />{t('text.skuMissingWarning')}</p>
        )}
        {profile.fields.otherCode && !sampleOtherCode?.trim() && (
          <p className="text-[10px] text-amber-400/90 flex items-start gap-1"><AlertTriangle size={11} className="mt-0.5 shrink-0" />{t('text.otherCodeMissingWarning')}</p>
        )}
      </div>

      {/* Custom text — independent size / bold / alignment / position. */}
      {profile.fields.customText && (
        <div className="rounded-xl border border-slate-700 p-3 space-y-2 bg-slate-800/30">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('text.customTextTitle')}</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('text.customTextSize')}</label>
              <select value={profile.customTextFontSizePt ?? profile.fontSizePt} onChange={e => patch({ customTextFontSizePt: Number(e.target.value) })} className="w-full h-9 px-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200">
                {[6, 7, 8, 9, 10, 11, 12, 14, 16].map(n => <option key={n} value={n}>{n}pt</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('text.thickness')}</label>
              <div className="flex gap-1 bg-slate-900 p-1 rounded-lg">
                {([[t('common.normal'), false], [t('common.bold'), true]] as const).map(([lbl, v]) => (
                  <button key={String(v)} onClick={() => patch({ customTextBold: v })} className={`flex-1 py-1 rounded-md text-[11px] font-bold ${!!profile.customTextBold === v ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}>{lbl}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('text.alignment')}</label>
              <div className="flex gap-1 bg-slate-900 p-1 rounded-lg">
                {(['left', 'center', 'right'] as const).map(v => (
                  <button key={v} onClick={() => patch({ customTextAlign: v })} className={`flex-1 py-1 rounded-md text-[11px] font-bold ${(profile.customTextAlign ?? 'center') === v ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}>{t(`common.${v}`)}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('text.position')}</label>
              <div className="flex gap-1 bg-slate-900 p-1 rounded-lg">
                {(['above', 'below'] as const).map(v => (
                  <button key={v} onClick={() => patch({ customTextPosition: v })} className={`flex-1 py-1 rounded-md text-[11px] font-bold ${(profile.customTextPosition ?? 'below') === v ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}>{v === 'above' ? t('text.aboveBarcode') : t('text.belowBarcode')}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('text.fontSize')}</label>
          <select value={profile.fontSizePt} onChange={e => patch({ fontSizePt: Number(e.target.value) })} className="w-full h-9 px-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200">
            {[6, 7, 8, 9, 10, 11, 12].map(n => <option key={n} value={n}>{n}pt</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('text.fontWeight')}</label>
          <select value={profile.fontWeight} onChange={e => patch({ fontWeight: e.target.value as any })} className="w-full h-9 px-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200">
            <option value="normal">{t('common.normal')}</option>
            <option value="medium">{t('common.medium')}</option>
            <option value="bold">{t('common.bold')}</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('text.alignment')}</label>
          <div className="flex gap-1 bg-slate-900 p-1 rounded-lg">
            {(['left', 'center', 'right'] as const).map(v => (
              <button key={v} onClick={() => patch({ textAlign: v })} className={`flex-1 py-1 rounded-md text-[11px] font-bold ${profile.textAlign === v ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}>{t(`common.${v}`)}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('text.textPosition')}</label>
          <div className="flex gap-1 bg-slate-900 p-1 rounded-lg">
            {(['above', 'below'] as const).map(v => (
              <button key={v} onClick={() => patch({ textPosition: v })} className={`flex-1 py-1 rounded-md text-[11px] font-bold ${profile.textPosition === v ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}>{v === 'above' ? t('text.aboveBarcode') : t('text.belowBarcode')}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function QRSection({ t, profile, patch }: { t: T; profile: PrinterProfile; patch: (u: Partial<PrinterProfile>) => void }) {
  return (
    <div className="space-y-3">
      <NumberInput label={t('qr.size')} value={profile.qrSizeMm} onChange={v => patch({ qrSizeMm: v })} min={8} max={100} step={0.5} suffix="mm" />
      <div>
        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('qr.errorCorrection')}</label>
        <div className="grid grid-cols-4 gap-1 bg-slate-900 p-1 rounded-lg">
          {(['L', 'M', 'Q', 'H'] as const).map(v => (
            <button key={v} onClick={() => patch({ qrErrorLevel: v })} className={`py-1.5 rounded-md text-[11px] font-bold ${profile.qrErrorLevel === v ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              {v === 'L' ? t('common.low') : v === 'M' ? t('common.medium') : v === 'Q' ? t('common.quartile') : t('common.high')}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-500 mt-1">{t('qr.hint')}</p>
      </div>
    </div>
  );
}

function PositionSection({ t, profile, patch }: { t: T; profile: PrinterProfile; patch: (u: Partial<PrinterProfile>) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('position.horizontal')}</label>
          <div className="flex gap-1 bg-slate-900 p-1 rounded-lg">
            {(['left', 'center', 'right'] as const).map(v => (
              <button key={v} onClick={() => patch({ positionH: v })} className={`flex-1 py-1 rounded-md text-[11px] font-bold ${profile.positionH === v ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}>{t(`common.${v}`)}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('position.vertical')}</label>
          <div className="flex gap-1 bg-slate-900 p-1 rounded-lg">
            {(['top', 'center', 'bottom'] as const).map(v => (
              <button key={v} onClick={() => patch({ positionV: v })} className={`flex-1 py-1 rounded-md text-[11px] font-bold ${profile.positionV === v ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}>{t(`common.${v}`)}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 p-3 space-y-2 bg-slate-800/30">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('position.margins')}</p>
        {/* Four ~30px number inputs across a 320px phone screen leave zero
            room for the "mm" suffix and get comically thin — 2×2 grid on
            mobile stays readable, 4-across on sm+. */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <NumberInput label={t('common.top')} value={profile.margins.top} onChange={v => patch({ margins: { ...profile.margins, top: v } })} min={0} max={20} step={0.5} suffix="mm" />
          <NumberInput label={t('common.right')} value={profile.margins.right} onChange={v => patch({ margins: { ...profile.margins, right: v } })} min={0} max={20} step={0.5} suffix="mm" />
          <NumberInput label={t('common.bottom')} value={profile.margins.bottom} onChange={v => patch({ margins: { ...profile.margins, bottom: v } })} min={0} max={20} step={0.5} suffix="mm" />
          <NumberInput label={t('common.left')} value={profile.margins.left} onChange={v => patch({ margins: { ...profile.margins, left: v } })} min={0} max={20} step={0.5} suffix="mm" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberInput label={t('position.textToBarcodeGap')} value={profile.spacingMm} onChange={v => patch({ spacingMm: v })} min={0} max={10} step={0.5} suffix="mm" />
      </div>

      <div className="rounded-xl border border-slate-700 p-3 space-y-2 bg-slate-800/30">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('position.rotationTitle')}</p>
        <div className="grid grid-cols-4 gap-1 bg-slate-900 p-1 rounded-lg">
          {([0, 90, 180, 270] as const).map(r => (
            <button key={r} onClick={() => patch({ rotation: r as Rotation })} className={`py-1.5 rounded-md text-[11px] font-bold ${(profile.rotation ?? 0) === r ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}>{r}°</button>
          ))}
        </div>
        <p className="text-[10px] text-slate-500">{t('position.rotationHint')}</p>
      </div>
    </div>
  );
}

function CalibrationSection({ t, profile, patch, onPrintRuler }: { t: T; profile: PrinterProfile; patch: (u: Partial<PrinterProfile>) => void; onPrintRuler: () => void }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-700 p-3 bg-slate-800/30 text-[11px] text-slate-300 leading-relaxed">
        {t('calibration.intro')}
      </div>

      <button onClick={onPrintRuler} className="w-full h-10 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm font-bold flex items-center justify-center gap-2 hover:border-emerald-500">
        <Ruler size={14} /> {t('calibration.printRuler')}
      </button>

      <div className="grid grid-cols-2 gap-2">
        <NumberInput label={t('calibration.horizontalScale')} value={profile.scaleH} onChange={v => patch({ scaleH: v })} min={90} max={110} step={0.5} suffix="%" />
        <NumberInput label={t('calibration.verticalScale')} value={profile.scaleV} onChange={v => patch({ scaleV: v })} min={90} max={110} step={0.5} suffix="%" />
      </div>

      <div className="rounded-xl border border-slate-700 p-3 space-y-2 bg-slate-800/30">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('calibration.printOffsetTitle')}</p>
        <div className="grid grid-cols-2 gap-2">
          <NumberInput label={t('calibration.horizontalOffset')} value={profile.offsetXMm} onChange={v => patch({ offsetXMm: v })} min={-20} max={20} step={0.1} suffix="mm" />
          <NumberInput label={t('calibration.verticalOffset')} value={profile.offsetYMm} onChange={v => patch({ offsetYMm: v })} min={-20} max={20} step={0.1} suffix="mm" />
        </div>
        <p className="text-[10px] text-slate-500">{t('calibration.offsetHint')}</p>
      </div>

      <p className="text-[10px] text-slate-500">{t('calibration.footerNote')}</p>
    </div>
  );
}

// ─── Reusable small controls ───────────────────────────────────────────────

function NumberInput({ label, value, onChange, min, max, step, suffix, hint }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string; hint?: string }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={e => onChange(Number(e.target.value) || 0)}
          min={min}
          max={max}
          step={step}
          className="w-full h-9 px-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 outline-none focus:ring-1 focus:ring-emerald-500"
        />
        {suffix && <span className="text-[10px] font-bold text-slate-500 shrink-0">{suffix}</span>}
      </div>
      {hint && <p className="text-[10px] text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

/**
 * Live preview — mimics the label at its actual mm dimensions, scaled to
 * fit the preview area. Not a raster, just a DOM box the same shape/rules
 * the print engine uses, so what the shopkeeper sees IS what prints.
 */
function LabelPreview({ t, profile, sampleName, sampleVariant, sampleBarcode, samplePrice, sampleMrp, sampleSku, sampleOtherCode }: { t: T; profile: PrinterProfile; sampleName?: string; sampleVariant?: string; sampleBarcode?: string; samplePrice?: number; sampleMrp?: number; sampleSku?: string; sampleOtherCode?: string }) {
  const isSheet = profile.printType === 'a4-sheet' || profile.printType === 'a4-plain';
  if (isSheet) {
    return <SheetPreview t={t} profile={profile} sampleName={sampleName} sampleVariant={sampleVariant} sampleBarcode={sampleBarcode} samplePrice={samplePrice} sampleMrp={sampleMrp} sampleSku={sampleSku} sampleOtherCode={sampleOtherCode} />;
  }

  const targetPreviewWidth = 260; // px — width of the right-column preview
  const targetPreviewMax = 240;   // px — max height so tall labels shrink to fit
  const rotation = profile.rotation ?? 0;
  const rotated = rotation === 90 || rotation === 270;
  const heightMm = profile.labelHeightMm > 0 ? profile.labelHeightMm : Math.max(20, profile.labelWidthMm * 0.6);
  // For a rotated label the on-screen footprint swaps width/height.
  const footW = rotated ? heightMm : profile.labelWidthMm;
  const footH = rotated ? profile.labelWidthMm : heightMm;
  const s = Math.min(targetPreviewWidth / footW, targetPreviewMax / footH);

  return (
    <div className="bg-white rounded-md mx-auto shadow-lg flex items-center justify-center" style={{ width: footW * s, height: footH * s }}>
      <div style={{ transform: `rotate(${rotation}deg)` }}>
        <SingleLabelBox t={t} profile={profile} widthMm={profile.labelWidthMm} heightMm={heightMm} scale={s} sampleName={sampleName} sampleVariant={sampleVariant} sampleBarcode={sampleBarcode} samplePrice={samplePrice} sampleMrp={sampleMrp} sampleSku={sampleSku} sampleOtherCode={sampleOtherCode} />
      </div>
    </div>
  );
}

/** The A4 page + tiled label grid preview. Positions come straight from
 *  computeSheetGeometry — exactly the same math the PDF renderer uses. */
function SheetPreview({ t, profile, sampleName, sampleVariant, sampleBarcode, samplePrice, sampleMrp, sampleSku, sampleOtherCode }: { t: T; profile: PrinterProfile; sampleName?: string; sampleVariant?: string; sampleBarcode?: string; samplePrice?: number; sampleMrp?: number; sampleSku?: string; sampleOtherCode?: string }) {
  const sheet = profile.sheet ?? DEFAULT_SHEET;
  const { page, cells } = computeSheetGeometry(sheet);
  const targetW = 260, targetH = 320;
  const s = Math.min(targetW / page.widthMm, targetH / page.heightMm);
  return (
    <div className="bg-white rounded-md mx-auto shadow-lg relative overflow-hidden" style={{ width: page.widthMm * s, height: page.heightMm * s }}>
      {cells.map((cell, i) => (
        <div key={i} style={{ position: 'absolute', left: cell.x * s, top: cell.y * s, width: sheet.labelWidthMm * s, height: sheet.labelHeightMm * s, outline: profile.printType === 'a4-plain' ? '0.5px solid #cbd5e1' : 'none', overflow: 'hidden' }}>
          <SingleLabelBox t={t} profile={{ ...profile, labelWidthMm: sheet.labelWidthMm, labelHeightMm: sheet.labelHeightMm, rotation: 0 }} widthMm={sheet.labelWidthMm} heightMm={sheet.labelHeightMm} scale={s} sampleName={sampleName} sampleVariant={sampleVariant} sampleBarcode={sampleBarcode} samplePrice={samplePrice} sampleMrp={sampleMrp} sampleSku={sampleSku} sampleOtherCode={sampleOtherCode} compact />
        </div>
      ))}
    </div>
  );
}

/**
 * One label's content, laid out in real mm and scaled to `scale` px/mm.
 * Shared by the single-sticker preview and every A4 grid cell so the two
 * previews are visually consistent.
 *
 * Renders DIRECTLY from `computeLabelLayout()` — the exact same function
 * `generateLabelPdf` uses — instead of a separate hand-rolled flex layout.
 * The old hand-rolled version duplicated the layout math and had silently
 * drifted from it: when a label had too many fields on for its size, the
 * real PDF (fixed this session) now shrinks font/spacing to keep everything
 * visible, but this preview just clipped the overflow via `overflow:hidden`
 * — so the settings screen looked broken ("part of the content hidden")
 * for a label that would actually print fine. Rendering from the shared
 * layout function makes that class of preview/print mismatch structurally
 * impossible: whatever the PDF will draw, the preview shows.
 */
function SingleLabelBox({ t, profile, widthMm, heightMm, scale, sampleName, sampleVariant, sampleBarcode, samplePrice, sampleMrp, sampleSku, sampleOtherCode, compact }: { t: T; profile: PrinterProfile; widthMm: number; heightMm: number; scale: number; sampleName?: string; sampleVariant?: string; sampleBarcode?: string; samplePrice?: number; sampleMrp?: number; sampleSku?: string; sampleOtherCode?: string; compact?: boolean }) {
  const subProfile = { ...profile, labelWidthMm: widthMm, labelHeightMm: heightMm };
  const barcode = sampleBarcode || '123456789012';
  const name = sampleName || t('sample.productName');
  const variant = sampleVariant || t('sample.variant');
  const sellVal = samplePrice && samplePrice > 0 ? samplePrice : 0;
  // MRP sample: use the real MRP if given; else show a plausible MRP above the
  // selling price so the "both prices" layout is visible in the preview.
  const mrpVal = sampleMrp && sampleMrp > 0 ? sampleMrp : (sellVal > 0 ? Math.round(sellVal * 1.2) : 0);
  // SKU sample: real SKU if the product has one; else a placeholder so the
  // "SKU" toggle actually shows something when previewing, not a blank row.
  const skuVal = sampleSku?.trim() || t('sample.sku');
  // Other Code sample: real value if the product has one; else a placeholder
  // so the toggle actually shows something when previewing, not a blank row.
  const otherCodeVal = sampleOtherCode?.trim() || t('sample.otherCode');

  // A4 grid cells skip the shop-name header (compact) to avoid repeating it
  // on every single cell of a sheet — same placeholder text the header would
  // show for a real print (the actual shop name is threaded in by the
  // parent BarcodeQRModal at print time, not known to this settings screen).
  const layout = computeLabelLayout(
    subProfile,
    { name, variantKey: variant, barcode, sellingPrice: sellVal, mrp: mrpVal, sku: skuVal, otherCode: otherCodeVal },
    {
      labelLine1: profile.fields.shopName && !compact ? t('sample.shopName') : undefined,
      labelText: profile.fields.customText ? t('sample.customText') : undefined,
    },
  );

  const fontWeightCss = (w: 'normal' | 'medium' | 'bold') => w === 'bold' ? 800 : w === 'medium' ? 600 : 400;

  return (
    <div style={{ width: widthMm * scale, height: layout.heightMm * scale, overflow: 'hidden' }}>
      <div
        style={{
          position: 'relative',
          width: widthMm + 'mm',
          height: layout.heightMm + 'mm',
          // 1mm = 3.7795 CSS px at 96 DPI; scale the intrinsic mm box down to
          // `scale` px/mm.
          transform: `scale(${scale / 3.7795})`,
          transformOrigin: 'top left',
          fontFamily: 'Arial, sans-serif',
          background: '#fff',
        }}
      >
        {layout.lines.map((line, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: line.y + 'mm',
              left: profile.margins.left + 'mm',
              right: profile.margins.right + 'mm',
              textAlign: line.align,
              fontSize: line.fontSizePt + 'pt',
              fontWeight: fontWeightCss(line.fontWeight),
              color: line.color,
              textDecoration: line.strikethrough ? 'line-through' : 'none',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              lineHeight: 1.15,
            }}
          >
            {line.text}
          </div>
        ))}
        {layout.barcode && (
          <div
            style={{
              position: 'absolute',
              left: layout.barcode.x + 'mm',
              top: layout.barcode.y + 'mm',
              width: layout.barcode.width + 'mm',
              height: layout.barcode.height + 'mm',
              background: 'repeating-linear-gradient(90deg, #000 0, #000 0.35mm, #fff 0.35mm, #fff 0.7mm)',
            }}
          />
        )}
      </div>
    </div>
  );
}
