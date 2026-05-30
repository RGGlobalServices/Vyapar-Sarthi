'use client';

import { useState } from 'react';
import { Eye, EyeOff, Shield, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { LANDING_URL } from '@/lib/config';

export default function AdminLoginPage() {
  const [form, setForm]       = useState({ email: '', password: '' });
  const [show, setShow]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email || !form.password) { setError('Please enter email and password.'); return; }
    setLoading(true);
    setError('');

    try {
      const resp = await api.post('/admin/login', {
        email: form.email,
        password: form.password,
      });

      const { access_token, admin } = resp.data;

      if (access_token && admin) {
        localStorage.setItem('ks_admin_auth', JSON.stringify({
          access_token,
          admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
        }));
        window.location.href = `/en/admin`;
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex-col items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute w-96 h-96 rounded-full bg-indigo-500/5 -top-20 -left-20" />
        <div className="absolute w-64 h-64 rounded-full bg-indigo-500/10 bottom-10 right-10" />
        <div className="relative z-10 text-center space-y-6 max-w-md">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-14 h-14 bg-indigo-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-500/30">
              <Shield size={28} className="text-slate-900" />
            </div>
            <div className="text-left">
              <h1 className="text-2xl font-black text-slate-50">Vyapar Sarthi</h1>
              <p className="text-indigo-400 text-sm font-medium">Admin Panel</p>
            </div>
          </div>
          <h2 className="text-3xl font-bold text-slate-100 leading-tight">
            Admin Dashboard<br /><span className="text-indigo-400">control center</span>
          </h2>
          <p className="text-slate-400 text-base leading-relaxed">
            Manage users, monitor analytics, and oversee the entire platform.
          </p>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-950">
        <div className="w-full max-w-sm space-y-8">

          <div className="flex items-center gap-3 lg:hidden">
            <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center">
              <Shield size={20} className="text-slate-900" />
            </div>
            <span className="text-xl font-black text-slate-50">Vyapar Sarthi</span>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-slate-50">Admin sign in</h2>
            <p className="text-slate-400 text-sm mt-1">Access the admin control panel</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</label>
              <input name="email" type="email" value={form.email} onChange={e => { setForm(f => ({ ...f, email: e.target.value })); setError(''); }}
                placeholder="admin@example.com" autoComplete="email"
                className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 placeholder:text-slate-600 transition-colors" />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Password</label>
              <div className="relative">
                <input name="password" type={show ? 'text' : 'password'} value={form.password}
                  onChange={e => { setForm(f => ({ ...f, password: e.target.value })); setError(''); }}
                  placeholder="••••••••" autoComplete="current-password"
                  className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 placeholder:text-slate-600 transition-colors" />
                <button type="button" onClick={() => setShow(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm">
                <AlertCircle size={15} className="flex-shrink-0" />{error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className={cn('w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2',
                loading ? 'bg-indigo-600/50 text-indigo-300 cursor-not-allowed' : 'bg-indigo-500 hover:bg-indigo-400 text-slate-900 shadow-lg shadow-indigo-500/20')}>
              {loading ? <><Loader2 size={16} className="animate-spin" /> Signing in…</> : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500">
            <button onClick={() => window.location.href = LANDING_URL}
              className="text-slate-400 hover:text-slate-200 font-semibold transition-colors">
              &larr; Back to home
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
