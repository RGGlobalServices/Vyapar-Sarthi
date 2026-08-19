'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Save, Printer, Ruler, RotateCcw, Trash2, Check, Sparkles, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  PrinterProfile,
  LABEL_PRESETS,
  LabelSizePresetKey,
  DEFAULT_PROFILE,
  profileFromPreset,
  recommendedForPreset,
  listProfiles,
  saveProfile,
  deleteProfile,
  setActiveProfileId,
  autoFitBarcode,
} from '@/lib/printProfiles';
import { validateBarcode } from '@/lib/barcodeValidation';
import { printTestLabel, printCalibrationSheet } from '@/lib/printLabels';

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

export default function BarcodePrintSettings({
  shopId,
  sampleBarcode,
  sampleName,
  sampleVariant,
  samplePrice,
  onSaved,
  onClose,
  initialProfile,
}: BarcodePrintSettingsProps) {
  const [profile, setProfile] = useState<PrinterProfile>(() => {
    if (initialProfile) return { ...initialProfile };
    // If there are any saved profiles, seed from the latest — otherwise
    // from the default.
    if (shopId) {
      const all = listProfiles(shopId);
      if (all.length) return { ...[...all].sort((a, b) => b.updatedAt - a.updatedAt)[0] };
    }
    return { ...DEFAULT_PROFILE, id: `prof-${Date.now().toString(36)}` };
  });
  const [profiles, setProfiles] = useState<PrinterProfile[]>(() => listProfiles(shopId));
  const [section, setSection] = useState<SectionKey>('paper');

  useEffect(() => { setProfiles(listProfiles(shopId)); }, [shopId]);

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

  function onSave() {
    if (!shopId) { toast.error('No shop selected'); return; }
    if (!profile.name.trim()) { toast.error('Give this profile a name'); return; }
    const saved = saveProfile(shopId, { ...profile });
    setActiveProfileId(shopId, saved.id);
    setProfiles(listProfiles(shopId));
    toast.success('Print profile saved');
    onSaved(saved);
  }

  function onDelete(id: string) {
    if (!confirm('Delete this printer profile?')) return;
    deleteProfile(shopId, id);
    setProfiles(listProfiles(shopId));
    if (profile.id === id) setProfile({ ...DEFAULT_PROFILE, id: `prof-${Date.now().toString(36)}` });
  }

  function onResetToRecommended() {
    const rec = recommendedForPreset(profile.preset);
    patch({ ...rec, scaleH: 100, scaleV: 100, offsetXMm: 0, offsetYMm: 0, margins: { top: 1, right: 1, bottom: 1, left: 1 } });
    toast.success('Reset to recommended for ' + profile.preset);
  }

  const validation = useMemo(() => {
    const val = sampleBarcode || '123456789012';
    const fit = profile.autoFit ? autoFitBarcode(profile) : { widthMm: profile.barcodeWidthMm, heightMm: profile.barcodeHeightMm };
    return validateBarcode(val, profile.barcodeType, fit.widthMm, fit.heightMm);
  }, [profile, sampleBarcode]);

  const sections: Array<{ key: SectionKey; label: string; icon: string }> = [
    { key: 'paper', label: 'Printer & Paper', icon: '📄' },
    { key: 'barcode', label: 'Barcode', icon: '▮' },
    { key: 'text', label: 'Text', icon: '𝐀' },
    { key: 'qr', label: 'QR', icon: '▨' },
    { key: 'position', label: 'Position', icon: '⤢' },
    { key: 'calibration', label: 'Calibration', icon: '📏' },
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
              <span className="truncate">Barcode & QR Print Settings</span>
            </h2>
            <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 hidden sm:block">Set your label size and printer once — Vyapar Sarthii handles the rest.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1.5 shrink-0"><X size={20} /></button>
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

        <div className="flex-1 min-h-0 grid grid-rows-[auto_auto_1fr] md:grid-rows-none md:grid-cols-[minmax(140px,180px)_minmax(0,1fr)_minmax(240px,320px)]">
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
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-1 mb-1">Saved profiles</p>
              {profiles.length === 0 && <p className="text-[11px] text-slate-500 px-1 py-2">No saved profiles yet.</p>}
              {profiles.map(p => (
                <div key={p.id} className={`group px-2 py-1.5 rounded-lg text-[11px] flex items-center gap-1 ${p.id === profile.id ? 'bg-slate-700/50 text-slate-100' : 'text-slate-400 hover:bg-slate-800'}`}>
                  <button className="flex-1 min-w-0 text-left truncate" onClick={() => setProfile({ ...p })} title={p.name}>{p.name}</button>
                  <button onClick={() => onDelete(p.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300"><Trash2 size={12} /></button>
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
                <span className="text-[10px] font-bold text-slate-500 uppercase self-center px-2">Profiles:</span>
                {profiles.map(p => (
                  <div key={p.id} className={`px-2.5 py-1 rounded-full text-[11px] flex items-center gap-1.5 shrink-0 ${p.id === profile.id ? 'bg-slate-700 text-slate-100' : 'bg-slate-800 text-slate-400'}`}>
                    <button onClick={() => setProfile({ ...p })} className="max-w-[120px] truncate">{p.name}</button>
                    <button onClick={() => onDelete(p.id)} className="text-red-400 hover:text-red-300"><Trash2 size={11} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Middle — section content. On mobile, this scrolls the whole
              remaining viewport; on desktop, it's the centre column of the
              three-column grid. */}
          <div className="overflow-y-auto p-3 sm:p-4 space-y-3 min-h-0">
            {/* Name + Reset row — visible in every section */}
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Profile name</label>
                <input
                  type="text"
                  value={profile.name}
                  onChange={e => patch({ name: e.target.value })}
                  placeholder="e.g. Rahul Footwear Barcode Printer"
                  className="w-full h-9 px-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <button onClick={onResetToRecommended} className="h-9 px-3 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold hover:border-emerald-500 flex items-center gap-1.5">
                <RotateCcw size={13} /> Reset
              </button>
            </div>

            {section === 'paper' && <PaperSection profile={profile} patch={patch} onPickPreset={onPickPreset} />}
            {section === 'barcode' && <BarcodeSection profile={profile} patch={patch} validation={validation} />}
            {section === 'text' && <TextSection profile={profile} patch={patch} />}
            {section === 'qr' && <QRSection profile={profile} patch={patch} />}
            {section === 'position' && <PositionSection profile={profile} patch={patch} />}
            {section === 'calibration' && <CalibrationSection profile={profile} patch={patch} onPrintRuler={() => printCalibrationSheet(profile)} />}
          </div>

          {/* Right — live preview + validation + actions. On mobile, this
              is a bottom sheet-like sticky footer (preview collapses to a
              small strip) so shopkeepers can still tap Save/Print without
              scrolling the whole modal. On desktop it's the right column. */}
          <div className="border-t md:border-t-0 md:border-l border-slate-800 bg-slate-950/30 overflow-y-auto p-3 sm:p-4 space-y-3 max-h-[42vh] md:max-h-none">
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Live preview</p>
              <LabelPreview profile={profile} sampleName={sampleName} sampleVariant={sampleVariant} sampleBarcode={sampleBarcode} samplePrice={samplePrice} />
              <p className="text-[10px] text-slate-500 mt-1.5 text-center">
                Label: <b className="text-slate-300">{profile.labelWidthMm} × {profile.labelHeightMm > 0 ? profile.labelHeightMm : 'auto'} mm</b>
                <br />Barcode:
                {' '}<b className="text-slate-300">
                  {(profile.autoFit ? autoFitBarcode(profile).widthMm : profile.barcodeWidthMm).toFixed(1)}
                  {' × '}
                  {(profile.autoFit ? autoFitBarcode(profile).heightMm : profile.barcodeHeightMm).toFixed(1)} mm
                </b>
              </p>
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
                    → Turn on Auto-Fit
                  </button>
                )}
              </div>
            )}

            <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 p-2.5 space-y-1.5">
              <p className="text-[10px] font-bold text-blue-300 uppercase tracking-wider">Print Scale: 100%</p>
              <p className="text-[11px] text-blue-200 leading-snug">
                In the browser print dialog: <b>Destination = your label printer</b>, <b>Paper size = same as this label</b>, <b>Scale = 100% / Actual Size</b>. Do NOT use "Fit to Page".
              </p>
              <p className="text-[11px] text-blue-200 leading-snug">
                ⚠ Testing with <b>Save as PDF / Microsoft Print to PDF</b>? Change that PDF printer's paper size to match this label — otherwise Chrome will rotate/scale to A4 and it will look wrong even though the real label printer will print correctly.
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => printTestLabel(profile)}
                className="w-full h-9 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 hover:border-emerald-500"
              >
                <Printer size={13} /> Print Test Label
              </button>
              <button
                onClick={onSave}
                disabled={validation.errors.length > 0}
                className="w-full h-10 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-black flex items-center justify-center gap-1.5"
              >
                <Save size={14} /> Save & Use This Profile
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Section components ────────────────────────────────────────────────────

function PaperSection({ profile, patch, onPickPreset }: { profile: PrinterProfile; patch: (u: Partial<PrinterProfile>) => void; onPickPreset: (k: LabelSizePresetKey) => void; }) {
  const group = (g: string, label: string) => (
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
  return (
    <div className="space-y-4">
      {group('label', 'Barcode label rolls')}
      {group('thermal', 'Thermal receipt (roll)')}
      {group('a4', 'Office paper')}
      {group('custom', 'Custom')}

      {profile.preset === 'custom' && (
        <div className="rounded-xl border border-slate-700 p-3 space-y-2 bg-slate-800/30">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Custom size (mm)</p>
          <div className="grid grid-cols-2 gap-2">
            <NumberInput label="Width" value={profile.labelWidthMm} onChange={v => patch({ labelWidthMm: v })} min={10} max={500} step={1} suffix="mm" />
            <NumberInput label="Height (0 = roll paper)" value={profile.labelHeightMm} onChange={v => patch({ labelHeightMm: v })} min={0} max={500} step={1} suffix="mm" />
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-700 p-3 space-y-2 bg-slate-800/30">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Printer resolution</p>
        <div className="flex gap-1 bg-slate-900 p-1 rounded-lg">
          {([[0, 'Auto'], [203, '203 DPI'], [300, '300 DPI'], [600, '600 DPI']] as const).map(([v, l]) => (
            <button key={v} onClick={() => patch({ dpi: v as any })} className={`flex-1 py-1.5 rounded-md text-xs font-bold ${profile.dpi === v ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}>{l}</button>
          ))}
        </div>
        <p className="text-[10px] text-slate-500">Most thermal-label printers are <b>203 DPI</b>. Office laser/inkjet = 600. Leave on Auto if unsure.</p>
      </div>
    </div>
  );
}

function BarcodeSection({ profile, patch, validation }: { profile: PrinterProfile; patch: (u: Partial<PrinterProfile>) => void; validation: ReturnType<typeof validateBarcode> }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-700 p-3 space-y-2 bg-slate-800/30">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Barcode type</p>
        <div className="grid grid-cols-3 gap-1">
          {(['auto', 'CODE128', 'EAN13', 'EAN8', 'UPC', 'CODE39'] as const).map(t => (
            <button key={t} onClick={() => patch({ barcodeType: t })} className={`py-1.5 rounded-md text-xs font-bold ${profile.barcodeType === t ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-slate-400 hover:text-slate-200'}`}>{t === 'auto' ? 'Auto' : t}</button>
          ))}
        </div>
        <p className="text-[10px] text-slate-500">
          Auto picks the right symbology from the barcode value.
          {validation.resolvedFormat && ` Currently: ${validation.resolvedFormat}.`}
        </p>
      </div>

      <div className="rounded-xl border border-slate-700 p-3 space-y-2 bg-slate-800/30">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Auto-Fit Size</p>
          <button onClick={() => patch({ autoFit: !profile.autoFit })} className={`w-9 h-5 rounded-full relative ${profile.autoFit ? 'bg-emerald-500' : 'bg-slate-700'}`}>
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${profile.autoFit ? 'translate-x-4' : ''}`} />
          </button>
        </div>
        <p className="text-[10px] text-slate-500">Vyapar calculates the biggest barcode that fits inside the label with a safe quiet zone.</p>
      </div>

      {!profile.autoFit && (
        <div className="grid grid-cols-2 gap-2">
          <NumberInput label="Barcode width" value={profile.barcodeWidthMm} onChange={v => patch({ barcodeWidthMm: v })} min={6} max={200} step={0.5} suffix="mm" />
          <NumberInput label="Barcode height" value={profile.barcodeHeightMm} onChange={v => patch({ barcodeHeightMm: v })} min={4} max={100} step={0.5} suffix="mm" />
        </div>
      )}

      <NumberInput label="Quiet zone (silent margin)" value={profile.quietZoneMm} onChange={v => patch({ quietZoneMm: v })} min={0} max={10} step={0.5} suffix="mm" hint="Required white space around the barcode. 2 mm safe for Code128; 3+ mm for EAN/UPC." />
    </div>
  );
}

function TextSection({ profile, patch }: { profile: PrinterProfile; patch: (u: Partial<PrinterProfile>) => void }) {
  const fieldToggle = (k: keyof PrinterProfile['fields'], label: string) => (
    <button key={k} onClick={() => patch({ fields: { ...profile.fields, [k]: !profile.fields[k] } })}
      className={`px-2 py-1.5 rounded-md text-[11px] font-bold border ${profile.fields[k] ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
      {profile.fields[k] ? <Check size={11} className="inline mr-1" /> : null}{label}
    </button>
  );
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-700 p-3 bg-slate-800/30">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Show on label</p>
        {/* 2-col on phones so the "Product Name" / "Barcode #" chips
            don't wrap onto two ugly lines each; 3-col from sm+. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {fieldToggle('shopName', 'Shop Name')}
          {fieldToggle('productName', 'Product Name')}
          {fieldToggle('sku', 'SKU')}
          {fieldToggle('barcodeNumber', 'Barcode #')}
          {fieldToggle('sellingPrice', 'Sell Price')}
          {fieldToggle('mrp', 'MRP')}
          {fieldToggle('variant', 'Variant')}
          {fieldToggle('size', 'Size')}
          {fieldToggle('colour', 'Colour')}
          {fieldToggle('customText', 'Custom Text')}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Font size</label>
          <select value={profile.fontSizePt} onChange={e => patch({ fontSizePt: Number(e.target.value) })} className="w-full h-9 px-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200">
            {[6, 7, 8, 9, 10, 11, 12].map(n => <option key={n} value={n}>{n}pt</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Font weight</label>
          <select value={profile.fontWeight} onChange={e => patch({ fontWeight: e.target.value as any })} className="w-full h-9 px-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200">
            <option value="normal">Normal</option>
            <option value="medium">Medium</option>
            <option value="bold">Bold</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Alignment</label>
          <div className="flex gap-1 bg-slate-900 p-1 rounded-lg">
            {(['left', 'center', 'right'] as const).map(v => (
              <button key={v} onClick={() => patch({ textAlign: v })} className={`flex-1 py-1 rounded-md text-[11px] font-bold ${profile.textAlign === v ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}>{v}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Text position</label>
          <div className="flex gap-1 bg-slate-900 p-1 rounded-lg">
            {(['above', 'below'] as const).map(v => (
              <button key={v} onClick={() => patch({ textPosition: v })} className={`flex-1 py-1 rounded-md text-[11px] font-bold ${profile.textPosition === v ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}>{v} barcode</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function QRSection({ profile, patch }: { profile: PrinterProfile; patch: (u: Partial<PrinterProfile>) => void }) {
  return (
    <div className="space-y-3">
      <NumberInput label="QR size (always square)" value={profile.qrSizeMm} onChange={v => patch({ qrSizeMm: v })} min={8} max={100} step={0.5} suffix="mm" />
      <div>
        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Error correction</label>
        <div className="grid grid-cols-4 gap-1 bg-slate-900 p-1 rounded-lg">
          {(['L', 'M', 'Q', 'H'] as const).map(v => (
            <button key={v} onClick={() => patch({ qrErrorLevel: v })} className={`py-1.5 rounded-md text-[11px] font-bold ${profile.qrErrorLevel === v ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              {v === 'L' ? 'Low' : v === 'M' ? 'Medium' : v === 'Q' ? 'Quartile' : 'High'}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-500 mt-1">Higher = more damage-tolerant but larger QR pattern. Medium is a safe default.</p>
      </div>
    </div>
  );
}

function PositionSection({ profile, patch }: { profile: PrinterProfile; patch: (u: Partial<PrinterProfile>) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Horizontal</label>
          <div className="flex gap-1 bg-slate-900 p-1 rounded-lg">
            {(['left', 'center', 'right'] as const).map(v => (
              <button key={v} onClick={() => patch({ positionH: v })} className={`flex-1 py-1 rounded-md text-[11px] font-bold ${profile.positionH === v ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}>{v}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Vertical</label>
          <div className="flex gap-1 bg-slate-900 p-1 rounded-lg">
            {(['top', 'center', 'bottom'] as const).map(v => (
              <button key={v} onClick={() => patch({ positionV: v })} className={`flex-1 py-1 rounded-md text-[11px] font-bold ${profile.positionV === v ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}>{v}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 p-3 space-y-2 bg-slate-800/30">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Margins (mm)</p>
        {/* Four ~30px number inputs across a 320px phone screen leave zero
            room for the "mm" suffix and get comically thin — 2×2 grid on
            mobile stays readable, 4-across on sm+. */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <NumberInput label="Top" value={profile.margins.top} onChange={v => patch({ margins: { ...profile.margins, top: v } })} min={0} max={20} step={0.5} suffix="mm" />
          <NumberInput label="Right" value={profile.margins.right} onChange={v => patch({ margins: { ...profile.margins, right: v } })} min={0} max={20} step={0.5} suffix="mm" />
          <NumberInput label="Bottom" value={profile.margins.bottom} onChange={v => patch({ margins: { ...profile.margins, bottom: v } })} min={0} max={20} step={0.5} suffix="mm" />
          <NumberInput label="Left" value={profile.margins.left} onChange={v => patch({ margins: { ...profile.margins, left: v } })} min={0} max={20} step={0.5} suffix="mm" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberInput label="Text-to-barcode gap" value={profile.spacingMm} onChange={v => patch({ spacingMm: v })} min={0} max={10} step={0.5} suffix="mm" />
      </div>
    </div>
  );
}

function CalibrationSection({ profile, patch, onPrintRuler }: { profile: PrinterProfile; patch: (u: Partial<PrinterProfile>) => void; onPrintRuler: () => void }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-700 p-3 bg-slate-800/30 text-[11px] text-slate-300 leading-relaxed">
        Print a calibration ruler, measure with a real ruler, then adjust below.
        Example: if the printed 100 mm mark measures 98 mm on your ruler, set Horizontal to <b>102%</b>.
      </div>

      <button onClick={onPrintRuler} className="w-full h-10 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm font-bold flex items-center justify-center gap-2 hover:border-emerald-500">
        <Ruler size={14} /> Print Calibration Ruler
      </button>

      <div className="grid grid-cols-2 gap-2">
        <NumberInput label="Horizontal scale" value={profile.scaleH} onChange={v => patch({ scaleH: v })} min={90} max={110} step={0.5} suffix="%" />
        <NumberInput label="Vertical scale" value={profile.scaleV} onChange={v => patch({ scaleV: v })} min={90} max={110} step={0.5} suffix="%" />
      </div>
      <p className="text-[10px] text-slate-500">Applied only to barcode labels — invoices and other prints are never touched.</p>
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
function LabelPreview({ profile, sampleName, sampleVariant, sampleBarcode, samplePrice }: { profile: PrinterProfile; sampleName?: string; sampleVariant?: string; sampleBarcode?: string; samplePrice?: number }) {
  const targetPreviewWidth = 260; // px — width of the right-column preview
  const targetPreviewMax = 240;   // px — max height so tall labels shrink to fit
  // Scale so `labelWidthMm × previewScale = targetPreviewWidth` (in css px).
  const previewScale = targetPreviewWidth / profile.labelWidthMm;
  const heightMm = profile.labelHeightMm > 0 ? profile.labelHeightMm : Math.max(20, profile.labelWidthMm * 0.6);
  const previewHeightScale = Math.min(previewScale, targetPreviewMax / heightMm);
  const s = Math.min(previewScale, previewHeightScale);
  const fit = profile.autoFit ? autoFitBarcode(profile) : { widthMm: profile.barcodeWidthMm, heightMm: profile.barcodeHeightMm };
  const name = sampleName || 'Sample Product';
  const variant = sampleVariant || 'Black / M';
  const barcode = sampleBarcode || '123456789012';
  const price = samplePrice && samplePrice > 0 ? `₹${samplePrice.toLocaleString('en-IN')}` : '';

  const alignCss = profile.textAlign;
  const justifyCss = profile.positionH === 'left' ? 'flex-start' : profile.positionH === 'right' ? 'flex-end' : 'center';
  const alignVCss = profile.positionV === 'top' ? 'flex-start' : profile.positionV === 'bottom' ? 'flex-end' : 'center';

  return (
    <div className="bg-white rounded-md overflow-hidden mx-auto shadow-lg" style={{ width: profile.labelWidthMm * s, height: heightMm * s }}>
      <div
        style={{
          width: profile.labelWidthMm + 'mm',
          height: heightMm + 'mm',
          padding: `${profile.margins.top}mm ${profile.margins.right}mm ${profile.margins.bottom}mm ${profile.margins.left}mm`,
          // Inner box uses `mm` — 1mm = 3.7795 CSS px at the browser default
          // 96 DPI. To fit its intrinsic mm-size into a container of
          // (labelWidthMm × s) pixels we scale by (s / 3.7795), NOT (s ×
          // 3.7795) which was 14× too big and made the whole preview
          // overflow out of view (looked blank).
          transform: `scale(${s / 3.7795})`,
          transformOrigin: 'top left',
          display: 'flex', flexDirection: 'column',
          alignItems: justifyCss as any, justifyContent: alignVCss as any,
          textAlign: alignCss as any,
          color: '#000', fontFamily: 'Arial, sans-serif',
          gap: profile.spacingMm + 'mm',
          boxSizing: 'border-box',
        }}
      >
        {profile.fields.shopName && <div style={{ fontSize: (profile.fontSizePt + 1) + 'pt', fontWeight: 800, textTransform: 'uppercase' }}>Shop Name</div>}
        {profile.textPosition === 'above' && profile.fields.productName && <div style={{ fontSize: profile.fontSizePt + 'pt', fontWeight: 800 }}>{name}</div>}
        {profile.textPosition === 'above' && (profile.fields.variant || profile.fields.size || profile.fields.colour) && <div style={{ fontSize: Math.max(6, profile.fontSizePt - 1) + 'pt', fontWeight: 700, color: '#4338ca' }}>{variant}</div>}
        <div style={{ padding: profile.quietZoneMm + 'mm', background: '#fff' }}>
          {/* Fake "barcode" — vertical stripes at approx the right density. */}
          <div style={{ width: fit.widthMm + 'mm', height: fit.heightMm + 'mm', background: 'repeating-linear-gradient(90deg, #000 0, #000 0.35mm, #fff 0.35mm, #fff 0.7mm)' }} />
        </div>
        {/* Barcode digits rendered as a single continuous string below the
            bars — matches labelRenderer.ts's real output (not the EAN-13
            split default). Fixes client feedback about the number looking
            "divided". */}
        {profile.fields.barcodeNumber && <div style={{ fontSize: Math.max(6, profile.fontSizePt - 1) + 'pt', textAlign: 'center', letterSpacing: '0.5px' }}>{barcode}</div>}
        {profile.textPosition === 'below' && profile.fields.productName && <div style={{ fontSize: profile.fontSizePt + 'pt', fontWeight: 800 }}>{name}</div>}
        {profile.textPosition === 'below' && (profile.fields.variant || profile.fields.size || profile.fields.colour) && <div style={{ fontSize: Math.max(6, profile.fontSizePt - 1) + 'pt', fontWeight: 700, color: '#4338ca' }}>{variant}</div>}
        {price && (profile.fields.sellingPrice || profile.fields.mrp) && <div style={{ fontSize: profile.fontSizePt + 'pt', fontWeight: 800 }}>{price}</div>}
      </div>
    </div>
  );
}
