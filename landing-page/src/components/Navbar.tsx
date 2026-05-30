'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { isLoggedIn, getUser, logout, getToken, apiGet } from '@/lib/auth';
import { config } from '@/lib/config';

const navLinks = [
  { label: 'Home', href: '/' },
  { label: 'Features', href: '/#features' },
  { label: 'How it Works', href: '/#how-it-works' },
  { label: 'Benefits', href: '/#benefits' },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'Blog', href: '/blog' },
  { label: 'Support', href: '/contact' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [plan, setPlan] = useState('Free');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const check = () => {
      const ok = isLoggedIn();
      setLoggedIn(ok);
      if (ok) setUser(getUser());
    };
    check();
    window.addEventListener('storage', check);
    return () => window.removeEventListener('storage', check);
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    const token = getToken();
    if (!token) return;
    (async () => {
      try {
        const shop = await apiGet('/shop/profile', token);
        if (shop?.subscriptionPlan) setPlan(shop.subscriptionPlan);
      } catch {}
    })();
  }, [loggedIn]);

  const handleLogout = () => {
    logout();
    setLoggedIn(false);
    setUser(null);
    setProfileOpen(false);
    window.location.href = '/';
  };

  const initials = user?.name
    ? user.name.split(' ').map(s => s[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  const dropdownItems = [
    { label: 'Dashboard', href: config.FRONTEND_URL },
    { label: 'View Profile', href: `${config.FRONTEND_URL}/en/profile` },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-indigo-500/5'
          : 'bg-transparent'
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 text-sm font-bold text-white">
            VS
          </div>
          <span className="text-lg font-bold text-white">Vyapar Sarthi</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-slate-300 transition-colors hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-4 md:flex">
          {loggedIn ? (
            <div className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2 rounded-full bg-slate-800/80 border border-slate-700 p-1.5 pr-3 hover:bg-slate-700/50 transition"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-sm font-bold text-white">
                  {initials}
                </div>
                <span className="text-sm text-slate-200 hidden lg:block">{user?.name?.split(' ')[0]}</span>
                <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              <AnimatePresence>
                {profileOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 w-60 z-50 rounded-2xl border border-slate-700 bg-slate-900/95 backdrop-blur-xl shadow-2xl shadow-black/50 overflow-hidden"
                    >
                      <div className="px-4 py-3 border-b border-slate-700">
                        <p className="text-sm font-medium text-white truncate">{user?.name || 'User'}</p>
                        <p className="text-xs text-slate-400 truncate">{user?.email || ''}</p>
                      </div>
                      <div className="px-4 py-2 border-b border-slate-700">
                        <span className="text-xs text-slate-400">Current Plan</span>
                        <p className="text-sm font-semibold text-emerald-400 capitalize">{plan}</p>
                      </div>
                      <div className="py-1">
                        {dropdownItems.map((item) => (
                          <a
                            key={item.label}
                            href={item.href}
                            onClick={() => setProfileOpen(false)}
                            className="block px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition"
                          >
                            {item.label}
                          </a>
                        ))}
                        <button
                          onClick={handleLogout}
                          className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-slate-800 hover:text-red-300 transition"
                        >
                          Logout
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:text-white"
              >
                Login
              </Link>
              <Link
                href="/register"
                className="rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-transform hover:scale-105"
              >
                Start Free Trial
              </Link>
            </>
          )}
        </div>

        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="relative z-50 flex h-10 w-10 flex-col items-center justify-center gap-1.5 md:hidden"
          aria-label="Toggle menu"
        >
          <motion.span
            animate={menuOpen ? { rotate: 45, y: 6 } : { rotate: 0, y: 0 }}
            className="h-0.5 w-6 rounded-full bg-white"
          />
          <motion.span
            animate={menuOpen ? { opacity: 0 } : { opacity: 1 }}
            className="h-0.5 w-6 rounded-full bg-white"
          />
          <motion.span
            animate={menuOpen ? { rotate: -45, y: -6 } : { rotate: 0, y: 0 }}
            className="h-0.5 w-6 rounded-full bg-white"
          />
        </button>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 right-0 z-40 flex w-72 flex-col bg-slate-900/95 backdrop-blur-2xl md:hidden"
          >
            <div className="flex flex-col gap-2 px-6 pt-28">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-xl px-4 py-3 text-base text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                >
                  {link.label}
                </a>
              ))}
              <hr className="my-4 border-slate-700" />
              {loggedIn ? (
                <>
                  <div className="px-4 py-2">
                    <p className="text-sm font-medium text-white">{user?.name || 'User'}</p>
                    <p className="text-xs text-slate-400">{user?.email || ''}</p>
                    <p className="text-xs text-emerald-400 mt-1 capitalize">Plan: {plan}</p>
                  </div>
                  {dropdownItems.map((item) => (
                    <a
                      key={item.label}
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      className="rounded-xl px-4 py-3 text-base text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                    >
                      {item.label}
                    </a>
                  ))}
                  <button
                    onClick={() => { handleLogout(); setMenuOpen(false); }}
                    className="rounded-xl px-4 py-3 text-base text-red-400 text-left hover:bg-white/5 hover:text-red-300 transition"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setMenuOpen(false)}
                    className="rounded-xl px-4 py-3 text-base text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    Login
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setMenuOpen(false)}
                    className="mt-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-4 py-3 text-center text-base font-semibold text-white"
                  >
                    Start Free Trial
                  </Link>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {menuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}
    </nav>
  );
}
