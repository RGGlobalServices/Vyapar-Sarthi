"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { register, isLoggedIn, redirectAfterAuth, getRedirectParam } from "@/lib/auth";

const businessTypes = ["Kirana", "Pharmacy", "Clothing", "Electronics", "Cosmetics", "General Store"];
const languages = ["EN", "HI", "MR"];

export default function RegisterPage() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    shopName: "",
    shopAddress: "",
    businessType: "",
    city: "",
    language: "EN",
    referralCode: "",
    agreedToTerms: false,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [redirect, setRedirect] = useState("");

  useEffect(() => {
    setRedirect(getRedirectParam());
    if (isLoggedIn()) {
      redirectAfterAuth("/");
    }
  }, []);

  const update = (field: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const canProceed = () => {
    if (step === 1) return form.fullName && form.email && form.phone && form.password;
    if (step === 2) return form.shopName && form.shopAddress && form.businessType && form.city;
    if (step === 3) return form.agreedToTerms;
    return false;
  };

  const nextStep = () => {
    setError("");
    if (canProceed() && step < 3) setStep((s) => s + 1);
  };

  const prevStep = () => {
    setError("");
    if (step > 1) setStep((s) => s - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register({
        email: form.email,
        password: form.password,
        name: form.fullName.split(" ")[0],
        fullName: form.fullName,
        mobile: form.phone,
        storeName: form.shopName,
        businessType: form.businessType,
      });
      redirectAfterAuth("/");
    } catch (err: any) {
      setError(err.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-20">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
            Create Your Account
          </h1>
          <p className="text-slate-400 mt-2">Join 2,000+ shop owners managing smarter</p>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-8 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-8">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                    s === step
                      ? "bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-lg shadow-indigo-500/25"
                      : s < step
                        ? "bg-emerald-500 text-white"
                        : "bg-slate-700 text-slate-400"
                  }`}
                >
                  {s < step ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    s
                  )}
                </div>
                {s < 3 && (
                  <div className={`w-16 sm:w-24 h-1 mx-2 rounded transition-all duration-300 ${s < step ? "bg-emerald-500" : "bg-slate-700"}`} />
                )}
              </div>
            ))}
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {step === 1 && (
              <>
                <h2 className="text-lg font-semibold text-slate-200">Personal Details</h2>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Full Name</label>
                  <input
                    type="text"
                    value={form.fullName}
                    onChange={(e) => update("fullName", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                    placeholder="Ramesh Kumar"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Email Address</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                    placeholder="ramesh@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Phone Number</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                    placeholder="+91 98765 43210"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => update("password", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                    placeholder="Min. 8 characters"
                  />
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <h2 className="text-lg font-semibold text-slate-200">Shop Details</h2>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Shop Name</label>
                  <input
                    type="text"
                    value={form.shopName}
                    onChange={(e) => update("shopName", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                    placeholder="Ramesh Kirana Store"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Shop Address</label>
                  <textarea
                    value={form.shopAddress}
                    onChange={(e) => update("shopAddress", e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition resize-none"
                    placeholder="123, Main Road, Near Bus Stand..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Business Type</label>
                  <select
                    value={form.businessType}
                    onChange={(e) => update("businessType", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  >
                    <option value="">Select business type</option>
                    {businessTypes.map((bt) => (
                      <option key={bt} value={bt}>{bt}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">City</label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => update("city", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                    placeholder="Mumbai"
                  />
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <h2 className="text-lg font-semibold text-slate-200">Preferences</h2>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Preferred Language</label>
                  <div className="flex gap-3">
                    {languages.map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => update("language", lang)}
                        className={`flex-1 py-3 rounded-xl border font-medium transition ${
                          form.language === lang
                            ? "border-indigo-500 bg-indigo-500/20 text-indigo-300"
                            : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600"
                        }`}
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Referral Code (optional)</label>
                  <input
                    type="text"
                    value={form.referralCode}
                    onChange={(e) => update("referralCode", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                    placeholder="Enter referral code"
                  />
                </div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.agreedToTerms}
                    onChange={(e) => update("agreedToTerms", e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-slate-700 bg-slate-900 accent-indigo-500"
                  />
                  <span className="text-sm text-slate-400">
                    I agree to the{" "}
                    <Link href="/terms" className="text-indigo-400 hover:text-indigo-300">Terms of Service</Link> and{" "}
                    <Link href="/privacy" className="text-indigo-400 hover:text-indigo-300">Privacy Policy</Link>
                  </span>
                </label>
              </>
            )}

            <div className="flex gap-3 pt-2">
              {step > 1 && (
                <button
                  type="button"
                  onClick={prevStep}
                  className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-200 font-medium hover:bg-slate-700/50 transition"
                >
                  Back
                </button>
              )}
              {step < 3 ? (
                <button
                  type="button"
                  onClick={nextStep}
                  disabled={!canProceed()}
                  className={`flex-1 py-3.5 rounded-xl font-semibold transition-all duration-300 ${
                    canProceed()
                      ? "bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-lg hover:shadow-indigo-500/25"
                      : "bg-slate-700 text-slate-500 cursor-not-allowed"
                  }`}
                >
                  Continue
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!canProceed() || loading}
                  className={`flex-1 py-3.5 rounded-xl font-semibold transition-all duration-300 ${
                    canProceed() && !loading
                      ? "bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-lg hover:shadow-indigo-500/25"
                      : "bg-slate-700 text-slate-500 cursor-not-allowed"
                  }`}
                >
                  {loading ? "Creating Account..." : "Create Account"}
                </button>
              )}
            </div>
          </form>

          <p className="mt-6 text-center text-sm text-slate-400">
            Already have an account?{" "}
            <Link href={`/login${redirect ? `?redirect=${redirect}` : ''}`} className="text-indigo-400 hover:text-indigo-300 font-medium transition">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
