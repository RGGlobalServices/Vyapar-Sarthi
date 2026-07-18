'use client';

import { useEffect, useState } from 'react';
import { Link, usePathname } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import {
  LayoutDashboard, IndianRupee, Package, Box, Users,
  BarChart3, LogOut, Languages, FolderUp, Settings, User, RotateCcw, Gift, Store, HelpCircle, Bell,
  Warehouse, ChevronDown, Plus, Check, CalendarDays, Sun, Moon, ShoppingCart, Briefcase, ArrowLeftRight, ClipboardList, BookOpen, Loader2, Trash2, Receipt
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SUPPORT_URL } from '@/lib/config';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { useBusinessStore } from '@/lib/businessStore';
import { getBusinessConfig, BUSINESS_CONFIGS } from '@/lib/businessConfig';
import { getPackageConfig } from '@/lib/config/packageConfig';
import { preload } from 'swr';
import { fetchJson, fetchProductsMapped } from '@/lib/fetchers';
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

// Warm a section's data while the pointer is still on its sidebar link, so the
// screen has it by the time the click lands.
//
// Only sections whose page reads these exact SWR keys are listed, and each key
// is paired with the fetcher that page uses — SWR caches by key alone, so
// prefetching with a different fetcher would leave the wrong data shape behind.
// The other sections fetch via useEffect and read no SWR cache, so there is
// nothing to warm for them until they are converted.
function prefetchForSection(sectionKey: string, activeShopId: string | null) {
  switch (sectionKey) {
    case 'products':
      preload('/products', fetchProductsMapped);
      break;
    case 'party':
      if (activeShopId) {
        preload(`/crm/customers?type=party&_shop=${activeShopId}`, fetchJson);
      }
      break;
    case 'purchases':
      preload('/purchases', fetchJson);
      preload('/suppliers', fetchJson);
      break;
  }
}

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
  const { profile, fetchProfile, allShops, activeShopId, fetchAllShops, switchShop, createShop, loading, deleteShop } = useBusinessStore();
  const t = useTranslations('Nav');
  const ended = isSubscriptionEnded(profile);
  const [showShopMenu, setShowShopMenu] = useState(false);
  const [showNewShop, setShowNewShop] = useState(false);
  const [creatingShop, setCreatingShop] = useState(false);
  const emptyShopForm = { 
    name: '', 
    businessType: 'kirana', 
    address: '', 
    mobile: '',
    gst: ''
  };
  const [shopForm, setShopForm] = useState(emptyShopForm);
  const [isSwitchingShop, setIsSwitchingShop] = useState(false);
  const [switchingToName, setSwitchingToName] = useState('');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';
  const upcomingEventsCount = useNotificationStore(s => s.upcomingEventsCount);

  const [showAdminPinModal, setShowAdminPinModal] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [verifyingPin, setVerifyingPin] = useState(false);
  const [shopToDelete, setShopToDelete] = useState<string | null>(null);

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
      if (shopToDelete) {
        await deleteShop(shopToDelete);
        setShopToDelete(null);
      } else {
        setRole('admin');
      }
      setShowAdminPinModal(false);
    } catch (err: any) {
      setPinError(err.response?.data?.detail || err.response?.data?.error || err.message || 'Incorrect Password/PIN');
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
        gst: shopForm.gst.trim() || undefined,
      });
      await switchShop(shop.id);
      setShowNewShop(false);
      setShopForm(emptyShopForm);
      setShowShopMenu(false);
    } catch (err: any) {
      alert(err.response?.data?.detail || err.response?.data?.error || err.message || 'Failed to create shop');
    }
    finally { setCreatingShop(false); }
  }

  const handleSwitchShop = async (shop: any) => {
    if (activeShopId === shop.id) {
      setShowShopMenu(false);
      return;
    }
    setSwitchingToName(shop.name);
    setIsSwitchingShop(true);
    setShowShopMenu(false);
    
    // Slight artificial delay so user sees the loading state
    await new Promise(r => setTimeout(r, 400));
    
    try {
      await switchShop(shop.id, true);
    } catch {
      // error handled inside store
    } finally {
      setIsSwitchingShop(false);
      setSwitchingToName('');
    }
  };

  const masterMenuItems = [
    { key: 'dashboard', icon: LayoutDashboard, href: '/' },
    { key: 'profile',   icon: User,            href: '/profile' },
    { key: 'orders',    icon: ClipboardList,   href: '/orders' },
    { key: 'billing',   icon: IndianRupee,     href: '/billing' },
    { key: 'products',  icon: Package,         href: '/products' },
    { key: 'party',     icon: Users,           href: '/party' },
    { key: 'purchases', icon: ShoppingCart,    href: '/purchases' },
    { key: 'suppliers', icon: Users,           href: '/suppliers' },
    { key: 'warehouses',icon: Warehouse,       href: '/godowns' },
    { key: 'stock',     icon: Box,             href: '/stock' },
    { key: 'expenses',  icon: Receipt,         href: '/expenses' },
    { key: 'staff',     icon: UsersThree,      href: '/staff' },
    { key: 'udhar',     icon: UdharIcon,       href: '/udhar' },
    { key: 'customers', icon: Users,           href: '/customers' },
    { key: 'calendar',  icon: CalendarDays,    href: '/calendar', badge: upcomingEventsCount },
    { key: 'reports',   icon: BarChart3,       href: '/reports' },
    { key: 'import',    icon: FolderUp,        href: '/import' },
    { key: 'referral',  icon: Gift,            href: '/referral' },
    { key: 'dukandar',  icon: Store,           href: '/dukandar' },
    { key: 'settings',  icon: Settings,        href: '/settings' },
    { key: 'returns',   icon: RotateCcw,       href: '/returns' },
    { key: 'support',   icon: HelpCircle,      href: SUPPORT_URL, external: true },
  ];
  
  const currentPackageConfig = getPackageConfig(profile.packageType);
  const currentBusinessConfig = getBusinessConfig(profile.businessType);

  // Filter master list based on allowed modules for this shop's package
  const baseMenuItems = masterMenuItems.filter(item => 
    item.external || currentPackageConfig.modules.includes(item.key)
  );

  const visibleMenuItems = ended
    ? baseMenuItems.filter(item => item.external || isAllowedWhenEnded(item.href))
    : baseMenuItems.filter(item => {
        if (role === 'staff') {
          return !['reports', 'import', 'warehouses', 'suppliers', 'purchases', 'transfers'].includes(item.key);
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
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded font-bold uppercase tracking-widest truncate border border-slate-200 dark:border-slate-700">
                  {currentBusinessConfig.label}
                </span>
                <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-widest truncate">
                  {currentPackageConfig.label}
                </span>
              </div>
            </div>
          </div>

          {/* Location Selector */}
          <div className="w-full mt-2 flex items-center justify-between bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700/50 rounded-lg px-3 py-2 group transition-all hover:bg-emerald-50 dark:hover:bg-emerald-500/10 hover:border-emerald-200 dark:hover:border-emerald-500/30">
            <div className="flex items-center gap-2 truncate">
              <span className="text-sm">
                {mounted && profile.subscriptionPlan === 'wholesale' ? '📦' : '🏪'}
              </span>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 truncate">
                {profile.shopName || (mounted && profile.subscriptionPlan === 'wholesale' ? 'Main Warehouse' : 'Main Store')}
              </span>
            </div>
            <ChevronDown size={14} className={cn('text-slate-400 group-hover:text-emerald-500 flex-shrink-0 transition-transform', showShopMenu && 'rotate-180')} />
          </div>
        </button>

        {/* Shop dropdown */}
        {showShopMenu && (
          <div className="absolute top-full left-0 right-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-b-xl shadow-xl z-50 overflow-hidden flex flex-col max-h-[60vh]">
            <p className="text-[9px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest px-4 pt-3 pb-1 flex-shrink-0">Your Shops</p>
            {/* Scrolls when the shop list is long; header above and Add button below stay put. */}
            <div className="overflow-y-auto flex-1 min-h-0">
            {allShops.map(shop => (
              <div key={shop.id} className="relative group">
                <button 
                  onClick={() => handleSwitchShop(shop)}
                  className={cn('w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left pr-10',
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
                
                {allShops.length > 1 && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setShopToDelete(shop.id);
                      setAdminPinInput('');
                      setPinError('');
                      setShowAdminPinModal(true);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-all opacity-100 z-10"
                    title="Remove Shop"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
            </div>

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

      <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar relative p-2 md:p-3 pb-24">
        {isSwitchingShop && (
          <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center pt-10">
            <Loader2 className="w-8 h-8 text-emerald-500 animate-spin mb-3" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300 text-center px-4">Switching to <br/><span className="text-emerald-600">{switchingToName}</span>...</p>
          </div>
        )}
        
        {allShops.length === 0 && !loading && (
          <div className="py-8 px-4 text-center bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800/50 my-4 mx-2">
            <Store className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm font-bold text-emerald-800 dark:text-emerald-400">Create your first Shop</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-500/80 mt-1">Click the button above to get started</p>
          </div>
        )}

        {(!isSwitchingShop && allShops.length > 0) && (
          <nav className="space-y-0.5">
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
                <span className="text-sm">
                  {item.key === 'party' || (item.key === 'customers' && currentPackageConfig.id === 'wholesale')
                    ? t('parties')
                    : item.key === 'udhar' && currentPackageConfig.id === 'wholesale'
                    ? t('partyLedger')
                    : t(item.key as any)}
                </span>
              </a>
            );
          }
          return (
            <Link
              key={item.key}
              href={item.href}
              className={linkClass}
              onClick={() => setIsMobileOpen?.(false)}
              onMouseEnter={() => prefetchForSection(item.key, activeShopId)}
              onTouchStart={() => prefetchForSection(item.key, activeShopId)}
            >
              <div className="flex items-center gap-3 flex-1">
                <Icon size={20} className={cn('transition-colors', isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 group-hover:text-slate-800 dark:group-hover:text-slate-300')} />
                <span className="text-sm">
                  {item.key === 'party' || (item.key === 'customers' && currentPackageConfig.id === 'wholesale')
                    ? t('parties')
                    : item.key === 'udhar' && currentPackageConfig.id === 'wholesale'
                    ? t('partyLedger')
                    : t(item.key as any)}
                </span>
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
        )}
      </div>

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
          onClick={() => setShowLogoutConfirm(true)}
          className="flex items-center gap-3 px-4 py-3 w-full text-slate-600 dark:text-slate-500 hover:bg-red-500/10 hover:text-red-500 dark:hover:text-red-400 rounded-xl transition-all border border-transparent hover:border-red-500/20"
        >
          <LogOut size={18} />
          <span className="text-sm font-semibold">{t('logout') || 'Logout'}</span>
        </button>
      </div>
      </aside>

      {/* Logout confirmation */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          onClick={() => setShowLogoutConfirm(false)}>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-red-500/15 flex items-center justify-center text-red-500 dark:text-red-400 shrink-0">
                <LogOut size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('logout') || 'Logout'}</h2>
                <p className="text-xs text-slate-500">{t('confirmLogout')}</p>
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 py-2.5 rounded-xl font-semibold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                onClick={() => { setShowLogoutConfirm(false); logout(); }}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-xl font-bold text-sm transition-colors"
              >
                {t('logout') || 'Logout'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                  <option key={b.type} value={b.type}>{b.label}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Contact mobile */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Contact Number</label>
                <input
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder="10-digit number"
                  inputMode="numeric"
                  value={shopForm.mobile}
                  onChange={e => setShopForm(f => ({ ...f, mobile: e.target.value.replace(/[^0-9]/g, '').slice(0, 10) }))}
                />
              </div>

              {/* GST */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">GST Number</label>
                <input
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 uppercase"
                  placeholder="Optional"
                  value={shopForm.gst}
                  onChange={e => setShopForm(f => ({ ...f, gst: e.target.value.toUpperCase() }))}
                />
              </div>
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
            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">
              {shopToDelete ? 'Confirm Shop Deletion' : 'Enter Admin PIN / Password'}
            </h3>
            <p className="text-sm text-slate-500 mb-6">
              {shopToDelete ? 'Please enter your password to confirm deletion. This action cannot be undone.' : 'You need to enter your admin PIN or login password to switch back to the admin role.'}
            </p>
            
            <form onSubmit={handleVerifyPin} className="space-y-4">
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
                  onClick={() => {
                    setShowAdminPinModal(false);
                    setShopToDelete(null);
                  }}
                  className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!adminPinInput || verifyingPin}
                  className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {verifyingPin ? 'Verifying...' : shopToDelete ? 'Delete Shop' : 'Verify'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
