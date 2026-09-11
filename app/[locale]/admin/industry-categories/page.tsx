'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import api from '@/lib/api';
import { Tags, Plus, X, Loader2, Check, Ban, Pencil, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

function getAdminAuth() {
  if (typeof window === 'undefined') return null;
  try { const raw = localStorage.getItem('ks_admin_auth'); if (!raw) return null; return JSON.parse(raw); } catch { return null; }
}

interface IndustryCategory {
  id: string;
  name: string;
  nameHi: string | null;
  nameMr: string | null;
  emoji: string | null;
  businessTypeMeta: string;
  mappedBusinessType: string | null;
  active: boolean;
  sortOrder: number;
}

const META_OPTIONS = ['retail', 'wholesale', 'distributor', 'service', 'manufacturing', 'other'];

/**
 * Admin CRUD for the platform-wide IndustryCategory master list — lets an
 * admin add/edit/deactivate categories and set which existing businessType
 * (lib/businessConfig.ts) a category maps to, with no code deploy needed.
 * See schema.prisma's IndustryCategory model comment for the full picture.
 */
export default function AdminIndustryCategoriesPage() {
  const locale = useLocale();
  const [categories, setCategories] = useState<IndustryCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<IndustryCategory | 'new' | null>(null);

  useEffect(() => {
    const a = getAdminAuth();
    if (!a) { window.location.href = `/${locale}/admin/login`; return; }
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get('/admin/industry-categories');
      setCategories(res.data?.categories || []);
    } catch (err: any) {
      if (err.response?.status === 401) {
        localStorage.removeItem('ks_admin_auth');
        window.location.href = `/${locale}/admin/login`;
      }
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(cat: IndustryCategory) {
    try {
      await api.patch(`/admin/industry-categories/${cat.id}`, { active: !cat.active });
      setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, active: !c.active } : c));
    } catch { alert('Failed to update category'); }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link href={`/${locale}/admin`} className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 mb-2">
              <ArrowLeft size={12} /> Back to Admin
            </Link>
            <h1 className="text-2xl font-black flex items-center gap-2">
              <Tags size={22} className="text-emerald-400" /> Industry Categories
            </h1>
            <p className="text-sm text-slate-400 mt-1">The category list shopkeepers pick from in Profile's "Change Business Category" wizard.</p>
          </div>
          <button
            onClick={() => setEditing('new')}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2"
          >
            <Plus size={16} /> Add Category
          </button>
        </div>

        {loading ? (
          <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-slate-500" size={24} /></div>
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/40 text-[10px] uppercase tracking-wider text-slate-400">
                  <th className="text-left px-4 py-2.5 font-bold">Category</th>
                  <th className="text-left px-3 py-2.5 font-bold">Business Type</th>
                  <th className="text-left px-3 py-2.5 font-bold">Mapped businessType</th>
                  <th className="text-center px-3 py-2.5 font-bold">Status</th>
                  <th className="text-right px-4 py-2.5 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {categories.map(c => (
                  <tr key={c.id} className={cn('hover:bg-slate-800/40 transition-colors', !c.active && 'opacity-50')}>
                    <td className="px-4 py-2.5 font-bold whitespace-nowrap">{c.emoji} {c.name}</td>
                    <td className="px-3 py-2.5 text-slate-400 capitalize">{c.businessTypeMeta}</td>
                    <td className="px-3 py-2.5 text-slate-400 font-mono text-xs">{c.mappedBusinessType || '—'}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded-full', c.active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-700/50 text-slate-400')}>
                        {c.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setEditing(c)} title="Edit" className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => toggleActive(c)} title={c.active ? 'Deactivate' : 'Activate'} className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors">
                          {c.active ? <Ban size={15} /> : <Check size={15} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {categories.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">No categories yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <CategoryEditModal
          category={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setCategories(prev => editing === 'new'
              ? [...prev, saved]
              : prev.map(c => c.id === saved.id ? saved : c));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function CategoryEditModal({ category, onClose, onSaved }: {
  category: IndustryCategory | null;
  onClose: () => void;
  onSaved: (c: IndustryCategory) => void;
}) {
  const [name, setName] = useState(category?.name || '');
  const [emoji, setEmoji] = useState(category?.emoji || '');
  const [businessTypeMeta, setBusinessTypeMeta] = useState(category?.businessTypeMeta || 'retail');
  const [mappedBusinessType, setMappedBusinessType] = useState(category?.mappedBusinessType || '');
  const [sortOrder, setSortOrder] = useState(String(category?.sortOrder ?? 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const payload = {
        name: name.trim(),
        emoji: emoji.trim() || null,
        businessTypeMeta,
        mappedBusinessType: mappedBusinessType.trim() || null,
        sortOrder: Number(sortOrder) || 0,
      };
      const res = category
        ? await api.patch(`/admin/industry-categories/${category.id}`, payload)
        : await api.post('/admin/industry-categories', payload);
      onSaved(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || 'Failed to save category');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-black">{category ? 'Edit Category' : 'Add Category'}</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <Field label="Name">
            <input autoFocus required value={name} onChange={e => setName(e.target.value)}
              className="w-full h-10 px-3 border border-slate-700 rounded-lg bg-slate-950 text-sm text-white" placeholder="e.g. Kirana / General Merchant" />
          </Field>
          <Field label="Emoji (optional)">
            <input value={emoji} onChange={e => setEmoji(e.target.value)}
              className="w-full h-10 px-3 border border-slate-700 rounded-lg bg-slate-950 text-sm text-white" placeholder="🛒" />
          </Field>
          <Field label="Business Type (meta)">
            <select value={businessTypeMeta} onChange={e => setBusinessTypeMeta(e.target.value)}
              className="w-full h-10 px-3 border border-slate-700 rounded-lg bg-slate-950 text-sm text-white capitalize">
              {META_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Mapped businessType (optional)">
            <input value={mappedBusinessType} onChange={e => setMappedBusinessType(e.target.value)}
              className="w-full h-10 px-3 border border-slate-700 rounded-lg bg-slate-950 text-sm text-white font-mono" placeholder="e.g. millprocessing" />
            <p className="text-[10px] text-slate-500 mt-1">
              Must exactly match a BusinessType id from lib/businessConfig.ts. Leave blank if this category has no existing equivalent — it still saves fine, it just won't change the shop's product fields.
            </p>
          </Field>
          <Field label="Sort Order">
            <input type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)}
              className="w-full h-10 px-3 border border-slate-700 rounded-lg bg-slate-950 text-sm text-white" />
          </Field>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" disabled={saving || !name.trim()}
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            Save
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold uppercase text-slate-400 mb-1">{label}</span>
      {children}
    </label>
  );
}
