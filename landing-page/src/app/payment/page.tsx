'use client';
import { useState, useEffect } from 'react';
import { isLoggedIn, getToken, getUser, apiPost } from '@/lib/auth';
import { config } from '@/lib/config';

const plans = [
  {
    name: 'Shop',
    key: 'shop',
    desc: 'For retail Kirana & general stores',
    features: ['Unlimited products', 'Smart billing & GST invoices', 'Udhar book with WhatsApp reminders', 'AI insights', 'Sales reports', 'Multi-language support'],
    popular: true,
  },
  {
    name: 'Wholesale',
    key: 'wholesale',
    desc: 'For wholesale & distribution businesses',
    features: ['Everything in Shop', 'Dukandar (retailer) management', 'Wholesale pricing tiers', 'Bulk import/export', 'Priority support'],
    popular: false,
  },
];

export default function Payment() {
  const [checking, setChecking] = useState(true);
  const [activatedPlan, setActivatedPlan] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoggedIn()) {
      window.location.href = `/login?redirect=/payment`;
    } else {
      setChecking(false);
    }
  }, []);

  const handlePlanSelect = async (planKey: string, planName: string) => {
    setChecking(true);
    setError('');
    try {
      const token = getToken();
      const user = getUser();
      const payload = {
        plan: planKey,
        amount: 0,
        email: user?.email || '',
        firstname: user?.name || 'Customer',
        phone: user?.mobile || '',
      };
      const data = await apiPost('/payments/create-order', payload, token || undefined);
      await apiPost('/payments/activate-plan', { plan: planKey, txnid: data.txnid || '' }, token || undefined);
      setActivatedPlan(planKey);
    } catch (err) {
      console.error('Payment error:', err);
      setError(err instanceof Error ? err.message : 'Activation failed. Please try again.');
      setChecking(false);
    }
  };

  if (activatedPlan) {
    const plan = plans.find(p => p.key === activatedPlan);
    const appUrl = config.FRONTEND_URL || '';
    return (
      <div className="min-h-screen pt-24 pb-16 px-4 flex items-center justify-center">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">{plan?.name || activatedPlan} Plan Activated!</h1>
          <p className="text-slate-400 mb-8">Your plan has been updated successfully. Open the app to start using new features.</p>
          {appUrl ? (
            <a href={appUrl}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white font-bold rounded-xl hover:opacity-90 transition-all">
              Go to Dashboard
            </a>
          ) : (
            <p className="text-slate-500 text-sm">Switch to your app tab and refresh to see the updated plan.</p>
          )}
        </div>
      </div>
    );
  }

  if (checking) {
    return (
      <div className="min-h-screen pt-24 pb-16 px-4 flex items-center justify-center">
        <div className="text-slate-400 text-lg">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen pt-24 pb-16 px-4 flex items-center justify-center">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Activation Failed</h1>
          <p className="text-red-400 mb-4">{error}</p>
          <button onClick={() => { setError(''); setChecking(false); }}
            className="px-6 py-3 bg-slate-700 text-white font-bold rounded-xl hover:bg-slate-600 transition-all">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-16 px-4 max-w-4xl mx-auto">
      <h1 className="text-4xl font-bold mb-4 text-center bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">Choose Your Plan</h1>
      <p className="text-slate-400 text-center mb-8">All plans are free during testing. Pick the one that suits your business.</p>

      <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
        {plans.map((p) => (
          <div key={p.name} className={`relative p-6 rounded-2xl border ${p.popular ? 'border-indigo-500 bg-indigo-500/5 shadow-lg shadow-indigo-500/10' : 'border-slate-700 bg-slate-800/50'} transition hover:scale-[1.02]`}>
            <h3 className="text-xl font-semibold text-white mb-1">{p.name}</h3>
            <p className="text-sm text-slate-400 mb-2">{p.desc}</p>
            <p className="text-3xl font-bold text-emerald-400 mb-4">Free</p>
            <ul className="space-y-3 mb-8">
              {p.features.map(f => (
                <li key={f} className="flex items-center gap-2 text-slate-300 text-sm">
                  <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => handlePlanSelect(p.key, p.name)}
              disabled={checking}
              className={`w-full py-3 rounded-xl font-semibold transition disabled:opacity-50 ${
                p.popular
                  ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white hover:opacity-90'
                  : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
              }`}
            >
              {checking ? 'Processing...' : 'Activate Plan'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
