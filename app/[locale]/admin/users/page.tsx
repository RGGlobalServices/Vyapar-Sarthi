'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import api from '@/lib/api';
import { Shield, Users, RefreshCw, Search, ChevronLeft, ChevronRight, X, Ban, CheckCircle, Trash2, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

function getAdminAuth() {
  if (typeof window === 'undefined') return null;
  try { const raw = localStorage.getItem('ks_admin_auth'); if (!raw) return null; return JSON.parse(raw); } catch { return null; }
}

interface User {
  id: number;
  email: string;
  name: string;
  storeName: string;
  mobile: string;
  isActive: boolean;
  createdAt: string;
  shop: any;
  referralCode: string | null;
  referralCount: number;
  maxShops?: number | null;
}

export default function AdminUsersPage() {
  const locale = useLocale();
  const [auth, setAuth] = useState<any>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const perPage = 20;

  useEffect(() => {
    const a = getAdminAuth();
    if (!a) { window.location.href = `/${locale}/admin/login`; return; }
    setAuth(a);
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await api.get('/admin/users');
      setUsers(res.data || []);
    } catch (err: any) {
      if (err.response?.status === 401) {
        localStorage.removeItem('ks_admin_auth');
        window.location.href = `/${locale}/admin/login`;
      }
    } finally {
      setLoading(false);
    }
  }

  async function toggleStatus(userId: number, current: boolean) {
    try {
      await api.patch(`/admin/users/${userId}/status`, { isActive: !current });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, isActive: !current } : u));
    } catch { alert('Failed to update status'); }
  }

  async function deleteUser(userId: number) {
    if (!confirm('Are you sure you want to permanently delete this user and all their data?')) return;
    try {
      await api.delete(`/admin/users/${userId}`);
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch { alert('Failed to delete user'); }
  }

  async function updateMaxShops(userId: number, currentMax: number | null) {
    const newVal = window.prompt(
      'Enter new max shops limit for this user (leave blank for plan default):',
      currentMax !== null && currentMax !== undefined ? String(currentMax) : ''
    );
    if (newVal === null) return; // cancelled
    
    const maxShops = newVal.trim() === '' ? null : parseInt(newVal, 10);
    if (newVal.trim() !== '' && (isNaN(maxShops as number) || (maxShops as number) < 1)) {
      alert('Please enter a valid positive number or leave blank.');
      return;
    }

    try {
      await api.patch(`/admin/users/${userId}`, { maxShops });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, maxShops } : u));
    } catch {
      alert('Failed to update shop limit');
    }
  }

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.mobile.includes(search) ||
    (u.storeName || '').toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice(page * perPage, (page + 1) * perPage);

  if (loading && users.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <RefreshCw className="animate-spin text-indigo-500" size={40} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <a href={`/${locale}/admin`}
              className="p-2 bg-slate-900 border border-slate-700 text-slate-400 hover:text-white rounded-xl transition-colors">
              <ArrowLeft size={18} />
            </a>
            <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center">
              <Users size={20} className="text-slate-900" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-50">Users</h1>
              <p className="text-slate-500 text-xs font-medium">{filtered.length} total users</p>
            </div>
          </div>
          <div className="relative w-full max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
              placeholder="Search by name, email, mobile..."
              className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 placeholder:text-slate-600" />
          </div>
        </div>

        {/* Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-800/50 text-slate-400 text-xs uppercase sticky top-0">
                <tr>
                  <th className="px-6 py-4 font-black">User</th>
                  <th className="px-6 py-4 font-black">Store</th>
                  <th className="px-6 py-4 font-black">Plan</th>
                  <th className="px-6 py-4 font-black">Limit</th>
                  <th className="px-6 py-4 font-black">Status</th>
                  <th className="px-6 py-4 font-black">Referrals</th>
                  <th className="px-6 py-4 font-black">Joined</th>
                  <th className="px-6 py-4 font-black text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {paged.map(user => (
                  <tr key={user.id} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="px-6 py-4">
                      <a href={`/${locale}/admin/users/${user.id}`} className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                          <span className="text-xs font-black text-indigo-400">{user.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-100 group-hover:text-indigo-400 transition-colors">{user.name}</p>
                          <p className="text-xs text-slate-500">{user.email}</p>
                        </div>
                      </a>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-slate-200">{user.storeName || '-'}</p>
                      <p className="text-xs text-slate-500">{user.mobile || '-'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-bold text-slate-300 capitalize">{user.shop?.subscriptionPlan || '-'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => updateMaxShops(user.id, user.maxShops ?? null)}
                        className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 rounded"
                      >
                        {user.maxShops !== null && user.maxShops !== undefined ? user.maxShops : 'Default'}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn('text-xs font-black px-2.5 py-1 rounded-full', user.isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20')}>
                        {user.isActive ? 'Active' : 'Blocked'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-slate-300">{user.referralCount}</td>
                    <td className="px-6 py-4 text-xs text-slate-500">{new Date(user.createdAt).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => toggleStatus(user.id, user.isActive)}
                          className={cn('p-2 rounded-lg text-xs font-bold transition-all', user.isActive ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20')}
                          title={user.isActive ? 'Block' : 'Activate'}>
                          {user.isActive ? <Ban size={14} /> : <CheckCircle size={14} />}
                        </button>
                        <button onClick={() => deleteUser(user.id)}
                          className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
                          title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && (
            <div className="py-20 text-center">
              <Users size={48} className="text-slate-800 mx-auto mb-4" />
              <p className="text-lg text-slate-300 font-bold">No users found</p>
              <p className="text-sm text-slate-500 font-medium mt-1">{search ? 'Try a different search' : 'No users registered yet'}</p>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800">
              <p className="text-sm text-slate-500">Page {page + 1} of {totalPages}</p>
              <div className="flex items-center gap-2">
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                  className="p-2 bg-slate-800 text-slate-400 hover:text-white rounded-lg disabled:opacity-30 transition-all">
                  <ChevronLeft size={16} />
                </button>
                <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
                  className="p-2 bg-slate-800 text-slate-400 hover:text-white rounded-lg disabled:opacity-30 transition-all">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
