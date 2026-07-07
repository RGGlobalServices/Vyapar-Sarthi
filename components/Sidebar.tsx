'use client';

import { useEffect, useState } from 'react';
import { Link, usePathname } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import {
  LayoutDashboard, IndianRupee, Package, Box, Users,
  BarChart3, LogOut, Languages, FolderUp, Settings, User, RotateCcw, Gift, Store, HelpCircle, Bell,
  Warehouse, ChevronDown, Plus, Check, CalendarDays, Sun, Moon, ShoppingCart, Briefcase
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SUPPORT_URL } from '@/lib/config';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { useBusinessStore } from '@/lib/businessStore';
import { BUSINESS_CONFIGS } from '@/lib/businessConfig';
import { isSubscriptionEnded, isAllowedWhenEnded } from '@/lib/subscriptionAccess';
import { canUseReferEarn, canUseManpower } from '@/lib/planGates';
import { useNotificationStore } from '@/lib/notificationStore';

const UsersThree = ({ size = 24, className = "" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    {/* Left person */}
    <circle cx="4.5" cy="6.5" r="2.25" />
    <path d="M1 17v-1a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1" />
    {/* Right person */}
    <circle cx="19.5" cy="6.5" r="2.25" />
    <path d="M16 17v-1a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1" />
    {/* Center person (front) */}
    <circle cx="12" cy="11.5" r="2.25" />
    <path d="M8.5 22v-1a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1" />
  </svg>
);

const UdharIcon = ({ size = 24, className = "" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    {/* Thumbs Up (done hand) on the left */}
    <g transform="translate(0, 4) scale(0.65)" strokeWidth="3.1">
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
    </g>
    
    {/* Indian Rupee Symbol with clear gap */}
    <path d="M17 4h5" />
    <path d="M17 8h5" />
    <path d="M17 12h1c3 0 3-8 0-8" />
    <path d="M17 12l3.5 5" />
  </svg>
);

export default function Sidebar({ 
  locale, 
  isMobileOpen, 
  setIsMobileOpen 
}: { 
  locale: string;
  isMobileOpen?: boolean;
  setIsMobileOpen?: (val: boolean) => void;
}) {
  const pathname = usePathname();
  const { user, loadFromStorage, logout, role, setRole } = useAuthStore();
  const { profile, fetchProfile, allShops, activeShopId, fetchAllShops, switchShop, createShop } = useBusinessStore();
  const t = useTranslations('Nav');
  const ended = isSubscriptionEnded(profile);
  const [showShopMenu, setShowShopMenu] = useState(false);
  const [showNewShop, setShowNewShop] = useState(false);
  const [creatingShop, setCreatingShop] = useState(false);
  const emptyShopForm = { name: '', businessType: 'kirana', address: '', mobile: '' };
  const [shopForm, setShopForm] = useState(emptyShopForm);

  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';
  const upcomingEventsCount = useNotificationStore(s => s.upcomingEventsCount);

  const [showAdminPinModal, setShowAdminPinModal] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [verifyingPin, setVerifyingPin] = useState(false);

  const handleRoleToggle = () => {
    if (role === 'admin') {
      setRole('staff');
    } else {
      setShowAdminPinModal(true);
      setAdminPinInput('');
      setPinError('');
    }
  };

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyingPin(true);
    setPinError('');
    try {
      await api.post('/auth/verify-pin', { pin: adminPinInput });
      setRole('admin');
      setShowAdminPinModal(false);
    } catch (err: any) {
      setPinError(err.response?.data?.detail || 'Incorrect Password/PIN');
    } finally {
      setVerifyingPin(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    loadFromStorage();
    fetchProfile();
    fetchAllShops();
  }, [loadFromStorage, fetchProfile, fetchAllShops]);

  async function handleCreateShop() {
    if (!shopForm.name.trim()) return;
    setCreatingShop(true);
    try {
      const shop = await createShop({
        name: shopForm.name.trim(),
        businessType: shopForm.businessType,
        address: shopForm.address.trim() || undefined,
        mobile: shopForm.mobile.trim() || undefined,
      });
      await switchShop(shop.id);
      setShowNewShop(false);
      setShopForm(emptyShopForm);
      setShowShopMenu(false);
    } catch { alert('Failed to create shop'); }
    finally { setCreatingShop(false); }
  }

  const menuItems = [
    { key: 'dashboard', icon: LayoutDashboard, href: '/' },
    { key: 'profile',   icon: User,            href: '/profile' },
    { key: 'billing',   icon: IndianRupee,     href: '/billing' },
    { key: 'products',  icon: Package,         href: '/products' },
    ...(profile.subscriptionPlan === 'wholesale' ? [
      { key: 'purchases', icon: ShoppingCart, href: '/purchases' },
      { key: 'suppliers', icon: Users,        href: '/suppliers' }
    ] : []),
    { key: 'stock',     icon: Box,             href: '/stock' },
    { key: 'staff',     icon: UsersThree,      href: '/staff' },
    { key: 'udhar',     icon: UdharIcon,       href: '/udhar' },
    { key: 'calendar',  icon: CalendarDays,    href: '/calendar', badge: upcomingEventsCount },
    { key: 'reports',   icon: BarChart3,       href: '/reports' },
    { key: 'import',    icon: FolderUp,        href: '/import' },
    { key: 'referral',  icon: Gift,            href: '/referral' },
    { key: 'dukandar',  icon: Store,            href: '/dukandar' },
    ...(profile.subscriptionPlan === 'wholesale' ? [{ key: 'godowns', icon: Warehouse, href: '/godowns' }] : []),
    { key: 'support',   icon: HelpCircle,      href: SUPPORT_URL, external: true },
    { key: 'settings',  icon: Settings,        href: '/settings' },
    { key: 'returns',   icon: RotateCcw,       href: '/returns' },
  ];
  const visibleMenuItems = ended
    ? menuItems.filter(item => item.external || isAllowedWhenEnded(item.href))
    : menuItems.filter(item => {
        if (role === 'staff') {
          return !['reports', 'import', 'godowns', 'suppliers', 'purchases'].includes(item.key);
        }
        return true;
      });

  return (
    <>
      {/* Mobile backdrop */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden" 
          onClick={() => setIsMobileOpen?.(false)} 
        />
      )}
      <aside className={cn(
        "w-64 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col h-screen z-50",
        "fixed inset-y-0 left-0 transform transition-transform duration-300 md:relative md:translate-x-0 md:sticky md:top-0",
        isMobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
      <div className="relative border-b border-slate-200 dark:border-slate-800">
        {/* Shop header + switcher */}
        <button
          onClick={() => setShowShopMenu(s => !s)}
          className="w-full p-4 flex flex-col gap-2 hover:bg-slate-200/50 dark:hover:bg-slate-800/40 transition-colors text-left"
        >
          {/* Main Business Identity */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm overflow-hidden flex-shrink-0 p-0.5 border border-slate-100 dark:border-slate-800">
              {profile.logoUrl ? (
                <img src={profile.logoUrl} alt="Logo" className="w-full h-full object-cover rounded-lg" />
              ) : (
                <img src="/icon.png" alt="App Icon" className="w-full h-full object-cover rounded-lg" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-[15px] font-black text-slate-900 dark:text-white truncate leading-tight tracking-tight">
                {user?.storeName || 'Vyapar Sarthi'}
              </h1>
              <div className="flex items-center mt-0.5">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest truncate">
                  {profile.subscriptionPlan === 'wholesale' ? 'Wholesale Distributor' : 'Retail Store'}
                </span>
              </div>
            </div>
          </div>

          {/* Location Selector */}
          <div className="w-full mt-2 flex items-center justify-between bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700/50 rounded-lg px-3 py-2 group transition-all hover:bg-emerald-50 dark:hover:bg-emerald-500/10 hover:border-emerald-200 dark:hover:border-emerald-500/30">
            <div className="flex items-center gap-2 truncate">
              <span className="text-sm">
                {profile.subscriptionPlan === 'wholesale' ? '📦' : '🏪'}
              </span>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 truncate">
                {profile.shopName || (profile.subscriptionPlan === 'wholesale' ? 'Main Warehouse' : 'Main Store')}
              </span>
            </div>
            <ChevronDown size={14} className={cn('text-slate-400 group-hover:text-emerald-500 flex-shrink-0 transition-transform', showShopMenu && 'rotate-180')} />
          </div>
        </button>

        {/* Shop dropdown */}
        {showShopMenu && (
          <div className="absolute top-full left-0 right-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-b-xl shadow-xl z-50 overflow-hidden">
            <p className="text-[9px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest px-4 pt-3 pb-1">Your Shops</p>
            {allShops.map(shop => (
              <button key={shop.id}
                onClick={() => { switchShop(shop.id); setShowShopMenu(false); }}
                className={cn('w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left',
                  (activeShopId === shop.id || (!activeShopId && shop.id === profile.id)) && 'bg-emerald-500/10'
                )}>
                <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                  {(shop.name || 'S').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-800 dark:text-white truncate">{shop.name}</p>
                  {shop.shopCode && <p className="text-[10px] text-slate-500 font-mono">{shop.shopCode}</p>}
                </div>
                {(activeShopId === shop.id || (!activeShopId && shop.id === profile.id)) && (
                  <Check size={13} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                )}
              </button>
            ))}

            {/* Add new shop — opens the full details modal */}
            <button onClick={() => { setShopForm(emptyShopForm); setShowNewShop(true); setShowShopMenu(false); }}
              className="w-full flex items-center gap-2 px-4 py-3 text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border-t border-slate-200 dark:border-slate-800 text-xs font-semibold">
              <Plus size={13} /> Add New Shop
            </button>
          </div>
        )}
      </div>


      {false && (
        <div className="px-4 py-3 mx-4 mt-4 bg-gradient-to-br from-emerald-500/20 to-teal-500/5 border border-emerald-500/30 rounded-xl">
          <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1">Free Plan</p>
          <p className="text-[11px] text-slate-300 leading-tight mb-2">Upgrade to Dukaan, Vyapar or Udyog for full features.</p>
          <a
            href={`/${locale}/payment?plan=shop`}
            className="block text-center py-1.5 bg-emerald-500 text-slate-900 text-[10px] font-black rounded-lg hover:bg-emerald-400 transition-colors"
          >
            UPGRADE NOW
          </a>
        </div>
      )}

      <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto custom-scrollbar">
        {visibleMenuItems.map((item) => {
          const Icon = item.icon;
          const isActive = !item.external && pathname === item.href;
          const linkClass = cn(
            'flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group active:scale-95',
            isActive
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'
          );
          if (item.external) {
            return (
              <a key={item.key} href={item.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                <Icon size={20} className="text-slate-500 group-hover:text-slate-800 dark:group-hover:text-slate-300 transition-colors" />
                <span className="text-sm">{t(item.key as any)}</span>
              </a>
            );
          }
          return (
            <Link key={item.key} href={item.href} className={linkClass} onClick={() => setIsMobileOpen?.(false)}>
              <div className="flex items-center gap-3 flex-1">
                <Icon size={20} className={cn('transition-colors', isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 group-hover:text-slate-800 dark:group-hover:text-slate-300')} />
                <span className="text-sm">{t(item.key as any)}</span>
              </div>
              {!!item.badge && item.badge > 0 && (
                <span className="bg-rose-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full min-w-[20px] text-center">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-4 bg-slate-50 dark:bg-slate-900/50">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2 text-slate-500">
            {isDark ? <Moon size={14} className="text-emerald-400" /> : <Sun size={14} className="text-amber-500" />}
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600">{t('theme') || 'Theme'}</span>
          </div>
          <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="w-12 h-6 rounded-full bg-slate-300 dark:bg-emerald-500 transition-colors relative flex items-center p-1"
          >
            <div 
              className="w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-300"
              style={{ transform: isDark ? 'translateX(24px)' : 'translateX(0px)' }}
            />
          </button>
        </div>

        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2 text-slate-500">
            <Languages size={14} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600">{t('language') || 'Language'}</span>
          </div>
          <div className="flex gap-2">
            {['en', 'hi', 'mr'].map((l) => (
              <Link
                key={l}
                href={pathname}
                locale={l}
                className={cn(
                  'text-[10px] font-black w-6 h-6 flex items-center justify-center rounded-md border transition-all',
                  locale === l 
                    ? 'bg-emerald-500 border-emerald-500 text-white dark:text-slate-950' 
                    : 'border-slate-300 dark:border-slate-800 text-slate-500 hover:border-slate-400 dark:hover:border-slate-600'
                )}
              >
                {l.toUpperCase()}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2 text-slate-500">
            <User size={14} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600">{t('accessRole') || 'Access Role'}</span>
          </div>
          <button
            onClick={handleRoleToggle}
            className={cn("px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors", 
              role === 'admin' ? "bg-purple-500/20 text-purple-600 dark:text-purple-400" : "bg-sky-500/20 text-sky-600 dark:text-sky-400"
            )}
          >
            {role}
          </button>
        </div>

        <button
          onClick={() => logout()}
          className="flex items-center gap-3 px-4 py-3 w-full text-slate-600 dark:text-slate-500 hover:bg-red-500/10 hover:text-red-500 dark:hover:text-red-400 rounded-xl transition-all border border-transparent hover:border-red-500/20"
        >
          <LogOut size={18} />
          <span className="text-sm font-semibold">{t('logout') || 'Logout'}</span>
        </button>
      </div>
      </aside>

      {/* Add New Shop — full details modal */}
      {showNewShop && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          onClick={() => !creatingShop && setShowNewShop(false)}>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                <Store size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Add New Shop</h2>
                <p className="text-xs text-slate-500">Enter your business details</p>
              </div>
            </div>

            {/* Shop name */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Shop / Store Name <span className="text-red-500 dark:text-red-400">*</span></label>
              <input autoFocus
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="e.g. Rahul Kirana Store"
                value={shopForm.name}
                onChange={e => setShopForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            {/* Business category */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Business Category <span className="text-red-500 dark:text-red-400">*</span></label>
              <select
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                value={shopForm.businessType}
                onChange={e => setShopForm(f => ({ ...f, businessType: e.target.value }))}
              >
                {Object.values(BUSINESS_CONFIGS).map(b => (
                  <option key={b.type} value={b.type}>{b.emoji} {b.label}</option>
                ))}
              </select>
            </div>

            {/* Address */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Shop Address</label>
              <textarea rows={2}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                placeholder="Shop no., street, area, city, pincode"
                value={shopForm.address}
                onChange={e => setShopForm(f => ({ ...f, address: e.target.value }))}
              />
            </div>

            {/* Contact mobile */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Contact Number</label>
              <input
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="10-digit mobile number"
                inputMode="numeric"
                value={shopForm.mobile}
                onChange={e => setShopForm(f => ({ ...f, mobile: e.target.value.replace(/[^0-9]/g, '').slice(0, 10) }))}
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => { setShowNewShop(false); setShopForm(emptyShopForm); }} disabled={creatingShop}
                className="flex-1 py-2.5 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-semibold hover:bg-slate-300 dark:hover:bg-slate-700 transition-all disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleCreateShop} disabled={!shopForm.name.trim() || creatingShop}
                className="flex-1 py-2.5 bg-emerald-500 text-white dark:text-slate-900 font-bold rounded-xl text-sm hover:bg-emerald-600 dark:hover:bg-emerald-400 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {creatingShop ? 'Creating…' : 'Create Shop'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdminPinModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm shadow-xl p-6">
            <h2 className="text-xl font-black text-slate-900 dark:text-white mb-2">Admin Access</h2>
            <p className="text-sm text-slate-500 mb-6">Enter Admin PIN or Login Password to switch to Admin role.</p>
            
            <form onSubmit={handleVerifyPin}>
              <input
                type="password"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Enter PIN / Password"
                value={adminPinInput}
                onChange={e => setAdminPinInput(e.target.value)}
                autoFocus
              />
              {pinError && <p className="text-red-500 text-xs font-medium mb-4">{pinError}</p>}
              
              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setShowAdminPinModal(false)}
                  className="flex-1 py-2.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!adminPinInput || verifyingPin}
                  className="flex-1 py-2.5 bg-emerald-500 text-slate-900 font-black rounded-xl hover:bg-emerald-400 transition-colors disabled:opacity-50"
                >
                  {verifyingPin ? 'Verifying...' : 'Unlock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
