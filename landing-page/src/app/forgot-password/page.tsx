'use client';

import { useState } from 'react';
import Link from 'next/link';
import { config } from '@/lib/config';

type Step = 'email' | 'otp' | 'reset' | 'done';

async function apiFetch(path: string, body: object) {
  const res = await fetch(`${config.API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Request failed');
  return data;
}

export default function ForgotPasswordPage() {
  const [step, setStep]           = useState<Step>('email');
  const [email, setEmail]         = useState('');
  const [otp, setOtp]             = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPwd, setNewPwd]       = useState('');
  const [showPwd, setShowPwd]     = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  // Step 1: send OTP
  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { setError('Please enter your email.'); return; }
    setLoading(true); setError('');
    try {
      await apiFetch('/auth/forgot-password', { email: email.trim() });
      setStep('otp');
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP. Please try again.');
    } finally { setLoading(false); }
  }

  // Step 2: verify OTP
  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!otp || otp.length !== 6) { setError('Enter the 6-digit OTP from your email.'); return; }
    setLoading(true); setError('');
    try {
      const data = await apiFetch('/auth/verify-otp', { email, otp });
      setResetToken(data.resetToken);
      setStep('reset');
    } catch (err: any) {
      setError(err.message || 'Incorrect OTP. Please try again.');
    } finally { setLoading(false); }
  }

  // Step 3: reset password
  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (!newPwd || newPwd.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true); setError('');
    try {
      await apiFetch('/auth/reset-password', { resetToken, newPassword: newPwd });
      setStep('done');
    } catch (err: any) {
      setError(err.message || 'Failed to reset password. Please try again.');
    } finally { setLoading(false); }
  }

  const inputCls = "w-full px-4 py-3 rounded-xl bg-slate-700/50 border border-slate-600 text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition-colors text-sm";
  const btnCls   = "w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 text-white font-semibold hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="min-h-screen pt-24 pb-16 px-4 flex items-center justify-center">
      <div className="w-full max-w-md p-8 rounded-2xl bg-slate-800/50 border border-slate-700 backdrop-blur-sm">

        {/* Step indicators */}
        <div className="flex items-center gap-2 mb-6">
          {(['email', 'otp', 'reset'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${
                step === s ? 'bg-indigo-500 text-white' :
                (['otp', 'reset', 'done'].indexOf(step) > i || step === 'done') ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-400'
              }`}>{i + 1}</div>
              {i < 2 && <div className={`h-0.5 flex-1 ${(['otp', 'reset', 'done'].indexOf(step) > i) ? 'bg-emerald-500' : 'bg-slate-700'}`} />}
            </div>
          ))}
        </div>

        {/* Done */}
        {step === 'done' && (
          <div className="text-center space-y-6">
            <div className="w-16 h-16 bg-emerald-500/15 rounded-full flex items-center justify-center mx-auto">
              <span className="text-3xl">✅</span>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Password Reset!</h2>
              <p className="text-slate-400 text-sm mt-2">Your password has been changed. You can now sign in.</p>
            </div>
            <Link href="/login"
              className="block w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 text-white font-semibold text-center hover:opacity-90 transition">
              Go to Login
            </Link>
          </div>
        )}

        {/* Step 1: Email */}
        {step === 'email' && (
          <>
            <h1 className="text-2xl font-bold text-white mb-1">Forgot Password</h1>
            <p className="text-slate-400 text-sm mb-6">Enter your email and we&apos;ll send a 6-digit OTP to reset your password.</p>
            <form onSubmit={handleSendOtp} className="space-y-4">
              <input type="email" placeholder="Email address" value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                className={inputCls} required />
              {error && <p className="text-red-400 text-sm flex items-center gap-1">⚠️ {error}</p>}
              <button type="submit" disabled={loading} className={btnCls}>
                {loading ? 'Sending OTP…' : 'Send OTP'}
              </button>
            </form>
          </>
        )}

        {/* Step 2: OTP */}
        {step === 'otp' && (
          <>
            <h1 className="text-2xl font-bold text-white mb-1">Enter OTP</h1>
            <p className="text-slate-400 text-sm mb-6">
              We sent a 6-digit code to <span className="text-indigo-400 font-semibold">{email}</span>. It expires in 10 minutes.
            </p>
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <input
                type="text" inputMode="numeric" maxLength={6}
                placeholder="______"
                value={otp}
                onChange={e => { setOtp(e.target.value.replace(/\D/g, '')); setError(''); }}
                className={`${inputCls} text-center tracking-[0.5em] text-2xl font-mono`} />
              {error && <p className="text-red-400 text-sm flex items-center gap-1">⚠️ {error}</p>}
              <button type="submit" disabled={loading} className={btnCls}>
                {loading ? 'Verifying…' : 'Verify OTP'}
              </button>
              <p className="text-center text-xs text-slate-500">
                Didn&apos;t receive it?{' '}
                <button type="button" onClick={() => { setStep('email'); setOtp(''); setError(''); }}
                  className="text-indigo-400 hover:text-indigo-300 transition-colors">Resend</button>
              </p>
            </form>
          </>
        )}

        {/* Step 3: New password */}
        {step === 'reset' && (
          <>
            <h1 className="text-2xl font-bold text-white mb-1">Set New Password</h1>
            <p className="text-slate-400 text-sm mb-6">Choose a strong password for your account.</p>
            <form onSubmit={handleReset} className="space-y-4">
              <div className="relative">
                <input type={showPwd ? 'text' : 'password'} placeholder="New password (min 6 chars)" value={newPwd}
                  onChange={e => { setNewPwd(e.target.value); setError(''); }}
                  className={`${inputCls} pr-12`} />
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors text-xs">
                  {showPwd ? 'Hide' : 'Show'}
                </button>
              </div>
              {error && <p className="text-red-400 text-sm flex items-center gap-1">⚠️ {error}</p>}
              <button type="submit" disabled={loading} className={btnCls}>
                {loading ? 'Resetting…' : 'Reset Password'}
              </button>
            </form>
          </>
        )}

        {step !== 'done' && (
          <div className="mt-5 text-center">
            <Link href="/login" className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
              ← Back to Login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
