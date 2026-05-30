'use client';
import { useState, useEffect } from 'react';
import { isLoggedIn, getToken, getUser, apiPost } from '@/lib/auth';

export default function Payment() {
  const [plan, setPlan] = useState('monthly');
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) {
      window.location.href = `/login?redirect=/payment`;
    } else {
      setChecking(false);
    }
  }, []);

  const handlePlanSelect = async (planKey: string, planName: string, price: number) => {
    setChecking(true);
    try {
      const token = getToken();
      const user = getUser();
      const payload = {
        plan: planKey,
        amount: price,
        email: user?.email || '',
        firstname: user?.name || 'Customer',
        phone: user?.mobile || '',
      };
      const data = await apiPost('/payments/create-order', payload, token || undefined);

      if (data.test_mode) {
        window.location.href = '/login?upgraded=1';
        return;
      }

      if (!data.paymentUrl || !data.hash) {
        console.error('Missing paymentUrl or hash in response:', data);
        alert('Payment gateway configuration error. Please contact support.');
        setChecking(false);
        return;
      }

      // Submit form to PayU
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = data.paymentUrl;
      form.style.display = 'none';
      const fields: Record<string, string> = {
        key: data.key,
        txnid: data.txnid,
        amount: data.amount?.toString() || price.toString(),
        productinfo: data.productinfo,
        firstname: data.firstname,
        email: data.email,
        phone: data.phone || '',
        surl: data.surl,
        furl: data.furl,
        hash: data.hash,
        udf1: data.udf1 || planKey,
        udf2: data.udf2 || '',
        udf3: data.udf3 || '',
        udf4: data.udf4 || '',
        udf5: data.udf5 || '',
      };
      for (const [name, value] of Object.entries(fields)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      console.error('Payment error:', err);
      alert(err instanceof Error ? err.message : 'Payment initiation failed. Please try again.');
      setChecking(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen pt-24 pb-16 px-4 flex items-center justify-center">
        <div className="text-slate-400 text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-16 px-4 max-w-4xl mx-auto">
      <h1 className="text-4xl font-bold mb-4 text-center bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">Choose Your Plan</h1>
      <p className="text-slate-400 text-center mb-8">Upgrade to unlock all features</p>

      <div className="flex justify-center mb-10">
        <div className="inline-flex p-1 rounded-xl bg-slate-800 border border-slate-700">
          <button onClick={() => setPlan('monthly')} className={`px-6 py-2 rounded-lg text-sm font-medium transition ${plan === 'monthly' ? 'bg-indigo-500 text-white' : 'text-slate-300'}`}>Monthly</button>
          <button onClick={() => setPlan('yearly')} className={`px-6 py-2 rounded-lg text-sm font-medium transition ${plan === 'yearly' ? 'bg-indigo-500 text-white' : 'text-slate-300'}`}>Yearly <span className="text-emerald-400 text-xs">Save 20%</span></button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {[
          { name: 'Small Store', key: 'basic', price: plan === 'monthly' ? 599 : 5990, features: ['Up to 500 products', 'Basic billing', 'Inventory tracking', 'Email support'] },
          { name: 'Big Store', key: 'professional', price: plan === 'monthly' ? 999 : 9990, popular: true, features: ['Unlimited products', 'Advanced billing', 'AI insights', 'Priority support', 'Multi-language', 'Reports & analytics'] },
          { name: 'Wholesale', key: 'business', price: plan === 'monthly' ? 1499 : 14990, features: ['Everything in Big Store', 'Bulk import/export', 'Dukandar management', 'API access', 'Dedicated account manager'] },
        ].map((p) => (
          <div key={p.name} className={`relative p-6 rounded-2xl border ${p.popular ? 'border-indigo-500 bg-indigo-500/5 shadow-lg shadow-indigo-500/10' : 'border-slate-700 bg-slate-800/50'} transition hover:scale-[1.02]`}>
            {p.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500 text-white text-xs font-semibold">Most Popular</span>}
            <h3 className="text-xl font-semibold text-white mb-1">{p.name}</h3>
            <p className="text-3xl font-bold text-white mb-1">₹{p.price.toLocaleString('en-IN')}<span className="text-lg text-slate-400 font-normal">/{plan === 'monthly' ? 'mo' : 'yr'}</span></p>
            <p className="text-slate-400 text-sm mb-6">billed {plan === 'monthly' ? 'monthly' : 'annually'}</p>
            <ul className="space-y-3 mb-8">
              {p.features.map(f => (
                <li key={f} className="flex items-center gap-2 text-slate-300 text-sm">
                  <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => handlePlanSelect(p.key, p.name, p.price)}
              disabled={checking}
              className={`w-full py-3 rounded-xl font-semibold transition ${p.popular ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white hover:opacity-90' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'} disabled:opacity-50`}
            >
              {checking ? 'Processing...' : p.popular ? 'Start Free Trial' : 'Choose Plan'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
