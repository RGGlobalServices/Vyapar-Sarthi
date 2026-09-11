'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Search, Check, ArrowRight, ArrowLeft, Loader2, Store, Truck, Users, Wrench, Factory, MoreHorizontal } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { getBusinessConfig, isBusinessTypeAllowedForPackage } from '@/lib/businessConfig';

type MetaType = 'retail' | 'wholesale' | 'distributor' | 'service' | 'manufacturing' | 'other';

const META_TYPES: { id: MetaType; label: string; desc: string; icon: any }[] = [
  { id: 'retail', label: 'Retail', desc: 'Shop-counter selling to end customers', icon: Store },
  { id: 'wholesale', label: 'Wholesale', desc: 'Bulk selling to other shops', icon: Truck },
  { id: 'distributor', label: 'Distributor', desc: 'Dealer/retailer network, area-wise', icon: Users },
  { id: 'service', label: 'Service', desc: 'Jobs, appointments, service charges', icon: Wrench },
  { id: 'manufacturing', label: 'Manufacturing', desc: 'Raw material to finished goods', icon: Factory },
  { id: 'other', label: 'Others', desc: 'Doesn’t fit the above', icon: MoreHorizontal },
];

const PACKAGE_LABELS: Record<string, string> = {
  dukan: 'Dukan Package',
  vyapar: 'Vyapar Package',
  wholesale: 'Udyog Package',
  badaudyog: 'Bada Udyog Package',
};

interface IndustryCategory {
  id: string;
  name: string;
  emoji: string | null;
  businessTypeMeta: string;
  mappedBusinessType: string | null;
}

/**
 * Profile's "Change Business Category" wizard — a friendlier 4-step front
 * end (Business Type -> Category -> Package confirm -> Summary) on top of
 * the shop's existing businessType/packageType, which stay the real source
 * of truth for product-field gating. See schema.prisma's IndustryCategory
 * model comment and the plan this was built from for the full reasoning.
 *
 * Never touches shop.business_type directly here — the caller (Profile
 * page) owns saving; this component just reports the picks via onConfirm
 * and lets the caller decide what to persist (same handleSave path as
 * every other Profile field).
 */
export default function IndustryOnboardingWizard({
  currentPackageType,
  onClose,
  onConfirm,
}: {
  currentPackageType: string;
  onClose: () => void;
  onConfirm: (result: { industryCategoryId: string; categoryName: string; mappedBusinessType: string | null }) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [meta, setMeta] = useState<MetaType | null>(null);
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState<IndustryCategory[]>([]);
  const [loadingCats, setLoadingCats] = useState(false);
  const [picked, setPicked] = useState<IndustryCategory | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (step !== 2 || !meta) return;
    let cancelled = false;
    setLoadingCats(true);
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ meta });
        if (search.trim()) params.set('search', search.trim());
        const res = await api.get(`/master-data/industry-categories?${params.toString()}`);
        if (!cancelled) setCategories(res.data?.categories || []);
      } catch {
        if (!cancelled) setCategories([]);
      } finally {
        if (!cancelled) setLoadingCats(false);
      }
    }, 250); // debounce the search box
    return () => { cancelled = true; clearTimeout(t); };
  }, [step, meta, search]);

  const metaMeta = META_TYPES.find(m => m.id === meta);

  // Whether the picked category's mapped businessType (if any) is actually
  // reachable under this shop's current package — reuses the exact same
  // gate the raw business-type dropdown above already respects, so the
  // wizard never silently assigns a type the shop's package doesn't unlock.
  const resolvedBusinessType = useMemo(() => {
    if (!picked?.mappedBusinessType) return null;
    if (!isBusinessTypeAllowedForPackage(picked.mappedBusinessType, currentPackageType)) return null;
    return picked.mappedBusinessType;
  }, [picked, currentPackageType]);

  const handleConfirm = async () => {
    if (!picked) return;
    setConfirming(true);
    try {
      onConfirm({ industryCategoryId: picked.id, categoryName: picked.name, mappedBusinessType: resolvedBusinessType });
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white">Change Business Category</h2>
            <p className="text-xs text-slate-500 mt-0.5">Step {step} of 4</p>
          </div>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>

        {/* Progress dots */}
        <div className="flex gap-1.5 px-6 pt-3 shrink-0">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className={cn('h-1.5 flex-1 rounded-full', n <= step ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-800')} />
          ))}
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">What kind of business is this?</p>
              <div className="grid grid-cols-2 gap-3">
                {META_TYPES.map(m => {
                  const Icon = m.icon;
                  const selected = meta === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => { setMeta(m.id); setPicked(null); setStep(2); }}
                      className={cn(
                        'text-left p-4 rounded-xl border-2 transition-colors',
                        selected ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      )}
                    >
                      <Icon size={20} className="text-emerald-600 dark:text-emerald-400 mb-2" />
                      <p className="font-bold text-sm text-slate-900 dark:text-white">{m.label}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{m.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                Pick a category {metaMeta && <span className="text-slate-400 font-normal">under {metaMeta.label}</span>}
              </p>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search categories..."
                  className="w-full h-10 pl-9 pr-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-sm"
                />
              </div>
              <div className="max-h-72 overflow-y-auto space-y-1.5">
                {loadingCats ? (
                  <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-slate-400" /></div>
                ) : categories.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-8">No categories match.</p>
                ) : (
                  categories.map(c => {
                    const selected = picked?.id === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { setPicked(c); setStep(3); }}
                        className={cn(
                          'w-full text-left px-4 py-2.5 rounded-lg border flex items-center gap-2.5 transition-colors',
                          selected ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                        )}
                      >
                        <span className="text-base">{c.emoji || '\u{1F4E6}'}</span>
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex-1">{c.name}</span>
                        {selected && <Check size={15} className="text-emerald-600 dark:text-emerald-400" />}
                      </button>
                    );
                  })
                )}
              </div>
              <button type="button" onClick={() => setStep(1)} className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                <ArrowLeft size={13} /> Back
              </button>
            </div>
          )}

          {step === 3 && picked && (
            <div className="space-y-4">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Confirm your package</p>
              <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 p-4">
                <p className="font-black text-lg text-slate-900 dark:text-white">{PACKAGE_LABELS[currentPackageType] || currentPackageType}</p>
                <p className="text-xs text-slate-500 mt-1">Your current package — chosen when you subscribed.</p>
              </div>
              <p className="text-xs text-slate-500">To change your package, contact support or go to Billing / Subscription.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setStep(2)} className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-2">
                  <ArrowLeft size={13} /> Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center justify-center gap-2"
                >
                  Continue <ArrowRight size={15} />
                </button>
              </div>
            </div>
          )}

          {step === 4 && picked && (
            <div className="space-y-4">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Summary</p>
              <div className="space-y-2.5 text-sm">
                <SummaryRow label="Business Type" value={metaMeta?.label || '-'} />
                <SummaryRow label="Business Category" value={`${picked.emoji || ''} ${picked.name}`} />
                <SummaryRow label="Package" value={PACKAGE_LABELS[currentPackageType] || currentPackageType} />
              </div>
              {resolvedBusinessType ? (
                <p className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg px-3 py-2">
                  Your product fields will switch to match <strong>{getBusinessConfig(resolvedBusinessType).label}</strong>.
                </p>
              ) : (
                <p className="text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2">
                  Category saved — your product fields still follow your current business type.
                </p>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => setStep(3)} className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-2">
                  <ArrowLeft size={13} /> Back
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={confirming}
                  className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg font-bold flex items-center justify-center gap-2"
                >
                  {confirming ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  Confirm
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-2">
      <span className="text-xs font-bold uppercase text-slate-400">{label}</span>
      <span className="text-slate-800 dark:text-slate-200 font-semibold text-right">{value}</span>
    </div>
  );
}
