'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getToken, getUser, isLoggedIn, apiGet } from '@/lib/auth';
import { config } from '@/lib/config';

// ── helpers ─────────────────────────────────────────────────────────────
async function apiPatch(path: string, body: object, token: string) {
  const res = await fetch(`${config.API_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Request failed');
  return data;
}

async function apiPost(path: string, body: object, token: string) {
  const res = await fetch(`${config.API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Request failed');
  return data;
}

const TOOL_LABELS: Record<string, string> = {
  billing: '🧾 Billing', stock: '📦 Stock', udhar: '📒 Udhar',
  ai: '🤖 Vyapar Guru', calendar: '📅 Calendar', reports: '📊 Reports',
  products: '🏷️ Products', returns: '↩️ Returns', customers: '👥 Customers',
  dukandar: '🤝 Dukandar', settings: '⚙️ Settings',
};

function planBadge(plan: string) {
  if (plan === 'udyog') return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
  if (plan === 'vyapar') return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
  return 'bg-slate-700/50 text-slate-300 border-slate-600';
}

// ── component ────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const router = useRouter();
  const token  = typeof window !== 'undefined' ? getToken() : null;

  const [loading, setLoading]   = useState(true);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [shop, setShop]         = useState<any>(null);
  const [toolUsages, setToolUsages] = useState<any[]>([]);

  // Change password
  const [cpCurrent, setCpCurrent]   = useState('');
  const [cpNew, setCpNew]           = useState('');
  const [cpConfirm, setCpConfirm]   = useState('');
  const [cpLoading, setCpLoading]   = useState(false);
  const [cpError, setCpError]       = useState('');
  const [cpOk, setCpOk]             = useState(false);
  const [showCpCurrent, setShowCpCurrent] = useState(false);
  const [showCpNew, setShowCpNew]         = useState(false);
  const [showCpConfirm, setShowCpConfirm] = useState(false);

  // Profit password
  const [ppCurrent, setPpCurrent]   = useState('');
  const [ppNew, setPpNew]           = useState('');
  const [ppLoading, setPpLoading]   = useState(false);
  const [ppError, setPpError]       = useState('');
  const [ppOk, setPpOk]             = useState(false);
  const [hasPP, setHasPP]           = useState(false);
  const [showPpCurrent, setShowPpCurrent] = useState(false);
  const [showPpNew, setShowPpNew]         = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) { router.push('/login'); return; }
    const tok = getToken()!;
    (async () => {
      try {
        const [ui, sh, tu] = await Promise.all([
          apiGet('/user/profile', tok),
          apiGet('/shop/profile', tok),
          apiGet('/user/tool-usage', tok),
        ]);
        setUserInfo(ui);
        setShop(sh);
        setToolUsages(tu || []);
        setHasPP(!!ui.hasProfitPassword);
      } catch {}
      setLoading(false);
    })();
  }, [router]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault(); setCpError('');
    if (!cpCurrent) { setCpError('Enter your current password.'); return; }
    if (cpNew.length < 6) { setCpError('New password must be at least 6 characters.'); return; }
    if (cpNew !== cpConfirm) { setCpError('Passwords do not match.'); return; }
    setCpLoading(true);
    try {
      await apiPatch('/user/profile', { currentPassword: cpCurrent, newPassword: cpNew }, token!);
      setCpOk(true); setCpCurrent(''); setCpNew(''); setCpConfirm('');
    } catch (err: any) { setCpError(err.message || 'Failed to change password.'); }
    finally { setCpLoading(false); }
  };

  const handleSetProfitPwd = async (e: React.FormEvent) => {
    e.preventDefault(); setPpError('');
    if (!ppCurrent) { setPpError('Enter your current login password.'); return; }
    if (ppNew.length < 4) { setPpError('Profit password must be at least 4 characters.'); return; }
    setPpLoading(true);
    try {
      await apiPatch('/user/profile', { currentPassword: ppCurrent, profitViewPassword: ppNew }, token!);
      setPpOk(true); setHasPP(true); setPpCurrent(''); setPpNew('');
      setTimeout(() => setPpOk(false), 3000);
    } catch (err: any) { setPpError(err.message || 'Failed to set profit password.'); }
    finally { setPpLoading(false); }
  };

  const handleRemoveProfitPwd = async () => {
    if (!ppCurrent) { setPpError('Enter your current login password first.'); return; }
    setPpLoading(true); setPpError('');
    try {
      await apiPatch('/user/profile', { currentPassword: ppCurrent, removeProfitPassword: true }, token!);
      setHasPP(false); setPpCurrent(''); setPpNew(''); setPpOk(true);
      setTimeout(() => setPpOk(false), 3000);
    } catch (err: any) { setPpError(err.message || 'Failed to remove profit password.'); }
    finally { setPpLoading(false); }
  };

  const inputCls = "w-full px-4 py-2.5 pr-11 rounded-xl bg-slate-700/40 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm transition-colors";
  const cardCls  = "rounded-2xl bg-slate-800/50 border border-slate-700 p-6 backdrop-blur-sm";
  const labelCls = "block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5";

  const EyeIcon = ({ show, onToggle }: { show: boolean; onToggle: () => void }) => (
    <button type="button" tabIndex={-1} onClick={onToggle}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition">
      {show ? (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9-4-9-7s4-7 9-7a9.97 9.97 0 014.9 1.275M15 12a3 3 0 11-4.5-2.598M3 3l18 18" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      )}
    </button>
  );

  if (loading) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center">
        <div className="text-slate-400 text-sm animate-pulse">Loading your account…</div>
      </div>
    );
  }

  const planName = shop?.subscriptionPlan || shop?.subscription_plan || 'starter';
  const planStatus = shop?.subscriptionStatus || shop?.subscription_status || 'active';
  const planExpiry = shop?.subscriptionExpiry || shop?.subscription_expiry;
  const topTool = toolUsages[0];

  return (
    <div className="min-h-screen pt-24 pb-20 px-4">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/"
            className="p-2.5 rounded-xl bg-slate-800/70 border border-slate-700 text-slate-400 hover:text-white transition-all">
            ← Back
          </Link>
          <div>
            <h1 className="text-2xl font-black text-white">My Account</h1>
            <p className="text-slate-400 text-sm">Manage your profile, security &amp; preferences</p>
          </div>
        </div>

        {/* User Info + Plan */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className={cardCls}>
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Account Info</h2>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-xl font-black text-white flex-shrink-0">
                {(userInfo?.name || getUser()?.name || '?').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-white truncate">{userInfo?.name || getUser()?.name || '—'}</p>
                <p className="text-slate-400 text-sm truncate">{userInfo?.email || getUser()?.email || '—'}</p>
                {userInfo?.mobile && <p className="text-slate-500 text-xs mt-0.5">{userInfo.mobile}</p>}
              </div>
            </div>
            {shop?.name && (
              <div className="mt-4 pt-4 border-t border-slate-700">
                <p className="text-xs text-slate-500">Shop</p>
                <p className="font-semibold text-slate-200 text-sm">{shop.name || shop.shop_name}</p>
              </div>
            )}
          </div>

          <div className={cardCls}>
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Current Plan</h2>
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold capitalize border ${planBadge(planName)}`}>
              {planName === 'udyog' ? '👑' : planName === 'vyapar' ? '🚀' : '🌱'} {planName}
            </div>
            <div className="mt-3 space-y-1">
              <p className="text-xs text-slate-500">Status: <span className={`font-medium ${planStatus === 'active' ? 'text-emerald-400' : 'text-amber-400'}`}>{planStatus}</span></p>
              {planExpiry && (
                <p className="text-xs text-slate-500">
                  Expires: <span className="text-slate-300">{new Date(planExpiry).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </p>
              )}
            </div>
            <a href="/#pricing"
              className="mt-4 block text-center py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 text-white text-xs font-semibold hover:opacity-90 transition">
              Upgrade Plan
            </a>
          </div>
        </div>

        {/* Tool Usage */}
        {toolUsages.length > 0 && (
          <div className={cardCls}>
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Tool Usage</h2>
            {topTool && (
              <div className="mb-4 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center gap-3">
                <span className="text-2xl">{TOOL_LABELS[topTool.tool]?.split(' ')[0] || '🔧'}</span>
                <div>
                  <p className="text-xs text-slate-500">Most Used</p>
                  <p className="font-bold text-indigo-300">{TOOL_LABELS[topTool.tool] || topTool.tool}</p>
                  <p className="text-xs text-slate-500">{topTool.count} {topTool.count === 1 ? 'time' : 'times'}</p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {toolUsages.map((u: any) => (
                <div key={u.tool} className="flex items-center gap-2 p-2.5 bg-slate-700/30 rounded-xl">
                  <span className="text-base">{TOOL_LABELS[u.tool]?.split(' ')[0] || '🔧'}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-300 truncate">{TOOL_LABELS[u.tool]?.replace(/^[^ ]+ /, '') || u.tool}</p>
                    <p className="text-[10px] text-slate-500">{u.count}× used</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Change Password */}
        <div className={cardCls}>
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">🔑 Change Password</h2>
          {cpOk ? (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm">
              ✅ Password changed successfully!
            </div>
          ) : (
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className={labelCls}>Current Password</label>
                <div className="relative">
                  <input type={showCpCurrent ? 'text' : 'password'} value={cpCurrent} onChange={e => { setCpCurrent(e.target.value); setCpError(''); }}
                    placeholder="Your current password" className={inputCls} />
                  <EyeIcon show={showCpCurrent} onToggle={() => setShowCpCurrent(v => !v)} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>New Password</label>
                  <div className="relative">
                    <input type={showCpNew ? 'text' : 'password'} value={cpNew} onChange={e => { setCpNew(e.target.value); setCpError(''); }}
                      placeholder="Min 6 characters" className={inputCls} />
                    <EyeIcon show={showCpNew} onToggle={() => setShowCpNew(v => !v)} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Confirm New Password</label>
                  <div className="relative">
                    <input type={showCpConfirm ? 'text' : 'password'} value={cpConfirm} onChange={e => { setCpConfirm(e.target.value); setCpError(''); }}
                      placeholder="Repeat new password" className={inputCls} />
                    <EyeIcon show={showCpConfirm} onToggle={() => setShowCpConfirm(v => !v)} />
                  </div>
                </div>
              </div>
              {cpError && <p className="text-red-400 text-sm">⚠️ {cpError}</p>}
              <button type="submit" disabled={cpLoading}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 text-white font-semibold text-sm hover:opacity-90 transition disabled:opacity-50">
                {cpLoading ? 'Saving…' : 'Update Password'}
              </button>
            </form>
          )}
        </div>

        {/* Profit View Password */}
        <div className={cardCls}>
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">🔒 Today&apos;s Profit Password</h2>
          <p className="text-slate-500 text-xs mb-4">
            Set a separate PIN / password to unlock today&apos;s profit in the app.
            {hasPP ? ' A password is currently set.' : ' No password is set yet.'}
          </p>
          {ppOk && (
            <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm">
              ✅ Profit password {hasPP ? 'updated' : 'removed'} successfully!
            </div>
          )}
          <form onSubmit={handleSetProfitPwd} className="space-y-4">
            <div>
              <label className={labelCls}>Your Current Login Password <span className="text-red-400">*</span></label>
              <div className="relative">
                <input type={showPpCurrent ? 'text' : 'password'} value={ppCurrent} onChange={e => { setPpCurrent(e.target.value); setPpError(''); }}
                  placeholder="Verify your identity" className={inputCls} />
                <EyeIcon show={showPpCurrent} onToggle={() => setShowPpCurrent(v => !v)} />
              </div>
            </div>
            <div>
              <label className={labelCls}>{hasPP ? 'New Profit Password' : 'Set Profit Password'}</label>
              <div className="relative">
                <input type={showPpNew ? 'text' : 'password'} value={ppNew} onChange={e => { setPpNew(e.target.value); setPpError(''); }}
                  placeholder="Min 4 characters (can be a PIN)" className={inputCls} />
                <EyeIcon show={showPpNew} onToggle={() => setShowPpNew(v => !v)} />
              </div>
            </div>
            {ppError && <p className="text-red-400 text-sm">⚠️ {ppError}</p>}
            <div className="flex items-center gap-3">
              <button type="submit" disabled={ppLoading}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 text-white font-semibold text-sm hover:opacity-90 transition disabled:opacity-50">
                {ppLoading ? 'Saving…' : hasPP ? 'Update Profit Password' : 'Set Profit Password'}
              </button>
              {hasPP && (
                <button type="button" onClick={handleRemoveProfitPwd} disabled={ppLoading}
                  className="px-4 py-2.5 rounded-xl border border-red-500/30 text-red-400 text-sm hover:bg-red-500/10 transition disabled:opacity-50">
                  Remove Password
                </button>
              )}
            </div>
          </form>
        </div>

      </div>
    </div>
  );
}
