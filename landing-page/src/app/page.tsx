import HeroSection from "@/components/HeroSection";
import Features from "@/components/Features";
import HowItWorks from "@/components/HowItWorks";
import Testimonials from "@/components/Testimonials";
import Pricing from "@/components/Pricing";
import FAQ from "@/components/FAQ";
import FinalCTA from "@/components/FinalCTA";
import StatsSection from "@/components/StatsSection";

export default function Home() {
  return (
    <>
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <HeroSection />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-950/50 to-slate-950" />
        <div className="relative z-10 max-w-5xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-sm font-medium mb-6">
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
            India&apos;s #1 Kirana Management App
          </div>

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight mb-6">
            <span className="bg-gradient-to-r from-indigo-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
              Apni Dukan Ko Smart Banao
            </span>
          </h1>

          <p className="text-lg md:text-xl text-slate-300 max-w-2xl mx-auto mb-10">
            Billing, Inventory, Udhar — Sab Ek App Mein
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <a
              href="/register"
              className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 text-white font-semibold text-lg shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:scale-105 transition-all duration-300"
            >
              Start Free Trial
            </a>
            <a
              href="#how-it-works"
              className="px-8 py-3.5 rounded-xl border border-slate-600 text-slate-200 font-semibold text-lg hover:bg-slate-800/50 hover:border-slate-500 transition-all duration-300"
            >
              See How It Works
            </a>
          </div>

          <div className="flex items-center justify-center gap-4">
            <div className="flex -space-x-3">
              <span className="w-10 h-10 rounded-full bg-gradient-to-br from-red-400 to-rose-500 border-2 border-slate-900 flex items-center justify-center text-sm font-bold text-white shadow-lg" role="img" aria-label="user">RK</span>
              <span className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 border-2 border-slate-900 flex items-center justify-center text-sm font-bold text-white shadow-lg" role="img" aria-label="user">PM</span>
              <span className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 border-2 border-slate-900 flex items-center justify-center text-sm font-bold text-white shadow-lg" role="img" aria-label="user">AS</span>
              <span className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 border-2 border-slate-900 flex items-center justify-center text-sm font-bold text-white shadow-lg" role="img" aria-label="user">SJ</span>
              <span className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 border-2 border-slate-900 flex items-center justify-center text-sm font-bold text-white shadow-lg" role="img" aria-label="user">+</span>
            </div>
            <p className="text-slate-400 text-sm">
              <span className="text-slate-200 font-semibold">2,000+</span> Shop Owners Trust Us
            </p>
          </div>
        </div>
      </section>

      <StatsSection />

      <Features />
      <HowItWorks />
      <Testimonials />
      <Pricing />
      <FAQ />
      <FinalCTA />
    </>
  );
}
