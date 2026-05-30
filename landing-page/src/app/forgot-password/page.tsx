'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(true);
  };

  return (
    <div className="min-h-screen pt-24 pb-16 px-4 flex items-center justify-center">
      <div className="w-full max-w-md p-8 rounded-2xl bg-slate-800/50 border border-slate-700">
        <h1 className="text-3xl font-bold text-white mb-2">Forgot Password</h1>
        <p className="text-slate-400 mb-6">Enter your email and we'll send you reset instructions.</p>
        {sent ? (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
            Reset link sent! Please check your email.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-slate-700/50 border border-slate-600 text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500" required />
            <button type="submit" className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 text-white font-semibold hover:opacity-90 transition">Send Reset Link</button>
          </form>
        )}
        <div className="mt-4 text-center">
          <Link href="/login" className="text-sm text-indigo-400 hover:text-indigo-300">Back to Login</Link>
        </div>
      </div>
    </div>
  );
}
