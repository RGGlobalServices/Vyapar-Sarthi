'use client';

import { useEffect, useState } from 'react';
import { Link, usePathname } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import {
  LayoutDashboard, IndianRupee, Package, Box, Users,
  BarChart3, LogOut, Languages, FolderUp, Settings, User, RotateCcw, Gift, Store, HelpCircle, Bell,
  Warehouse, ChevronDown, Plus, Check, CalendarDays
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SUPPORT_URL } from '@/lib/config';
import { useAuthStore } from '@/lib/store';
import { useBusinessStore } from '@/lib/businessStore';
import { BUSINESS_CONFIGS } from '@/lib/businessConfig';
import { isSubscriptionEnded, isAllowedWhenEnded } from '@/lib/subscriptionAccess';

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
  const { user, loadFromStorage, logout } = useAuthStore();
  const { profile, fetchProfile, allShops, activeShopId, fetchAllShops, switchShop, createShop } = useBusinessStore();
  const t = useTranslations('Nav');
  const ended = isSubscriptionEnded(profile);
  const [showShopMenu, setShowShopMenu] = useState(false);
  const [showNewShop, setShowNewShop] = useState(false);
  const [creatingShop, setCreatingShop] = useState(false);
  const emptyShopForm = { name: '', businessType: 'kirana', address: '', mobile: '' };
  const [shopForm, setShopForm] = useState(emptyShopForm);

  useEffect(() => {
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
    { key: 'stock',     icon: Box,             href: '/stock' },
    { key: 'udhar',     icon: Users,           href: '/udhar' },
    { key: 'calendar',  icon: CalendarDays,    href: '/calendar' },
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
    : menuItems;

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
        "w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-screen z-50",
        "fixed inset-y-0 left-0 transform transition-transform duration-300 md:relative md:translate-x-0 md:sticky md:top-0",
        isMobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Shop header + switcher */}
      <div className="relative border-b border-slate-800">
        <button
          onClick={() => setShowShopMenu(s => !s)}
          className="w-full p-4 flex items-center gap-3 hover:bg-slate-800/40 transition-colors"
        >
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-lg overflow-hidden flex-shrink-0 p-0.5">
            {profile.logoUrl ? (
              <img src={profile.logoUrl} alt="Logo" className="w-full h-full object-cover rounded-lg" />
            ) : (
              <img src="/icon.png" alt="App Icon" className="w-full h-full object-cover rounded-lg" />
            )}
          </div>
          <div className="min-w-0 flex-1 text-left">
            <h1 className="text-sm font-bold text-white truncate leading-tight">
              {profile.shopName || user?.storeName || 'Vyapar Sarthi'}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider truncate">
                {user?.name || 'Owner'}
              </span>
              {profile.shopCode && (
                <span className="text-[9px] text-slate-500 font-mono">{profile.shopCode}</span>
              )}
              <span className={cn(
                "text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-tighter",
                profile.subscriptionPlan === 'wholesale' ? "bg-purple-500 text-white" :
                profile.subscriptionPlan === 'vyapar'    ? "bg-indigo-500 text-white" :
                "bg-sky-500 text-white"
              )}>
                {profile.subscriptionPlan === 'wholesale' ? 'Udyog' :
                 profile.subscriptionPlan === 'vyapar'    ? 'Vyapar' :
                 'Dukaan'}
              </span>
            </div>
          </div>
          {allShops.length > 0 && (
            <ChevronDown size={14} className={cn('text-slate-500 flex-shrink-0 transition-transform', showShopMenu && 'rotate-180')} />
          )}
        </button>

        {/* Shop dropdown */}
        {showShopMenu && (
          <div className="absolute top-full left-0 right-0 bg-slate-900 border border-slate-700 rounded-b-xl shadow-xl z-50 overflow-hidden">
            <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest px-4 pt-3 pb-1">Your Shops</p>
            {allShops.map(shop => (
              <button key={shop.id}
                onClick={() => { switchShop(shop.id); setShowShopMenu(false); }}
                className={cn('w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800 transition-colors text-left',
                  (activeShopId === shop.id || (!activeShopId && shop.id === profile.id)) && 'bg-emerald-500/10'
                )}>
                <div className="w-7 h-7 rounded-lg bg-slate-700 flex items-center justify-center text-xs font-bold text-emerald-400 flex-shrink-0">
                  {(shop.name || 'S').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white truncate">{shop.name}</p>
                  {shop.shopCode && <p className="text-[10px] text-slate-500 font-mono">{shop.shopCode}</p>}
                </div>
                {(activeShopId === shop.id || (!activeShopId && shop.id === profile.id)) && (
                  <Check size={13} className="text-emerald-400 flex-shrink-0" />
                )}
              </button>
            ))}

            {/* Add new shop — opens the full details modal */}
            <button onClick={() => { setShopForm(emptyShopForm); setShowNewShop(true); setShowShopMenu(false); }}
              className="w-full flex items-center gap-2 px-4 py-3 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-colors border-t border-slate-800 text-xs font-semibold">
              <Plus size={13} /> Add New Shop
            </button>
          </div>
        )}
      </div>

      {/* Add New Shop — full details modal */}
      {showNewShop && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          onClick={() => !creatingShop && setShowNewShop(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 shrink-0">
                <Store size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-100">Add New Shop</h2>
                <p className="text-xs text-slate-500">Enter your business details</p>
              </div>
            </div>

            {/* Shop name */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Shop / Store Name <span className="text-red-400">*</span></label>
              <input autoFocus
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="e.g. Rahul Kirana Store"
                value={shopForm.name}
                onChange={e => setShopForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            {/* Business category */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Business Category <span className="text-red-400">*</span></label>
              <select
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                placeholder="Shop no., street, area, city, pincode"
                value={shopForm.address}
                onChange={e => setShopForm(f => ({ ...f, address: e.target.value }))}
              />
            </div>

            {/* Contact mobile */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Contact Number</label>
              <input
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="10-digit mobile number"
                inputMode="numeric"
                value={shopForm.mobile}
                onChange={e => setShopForm(f => ({ ...f, mobile: e.target.value.replace(/[^0-9]/g, '').slice(0, 10) }))}
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => { setShowNewShop(false); setShopForm(emptyShopForm); }} disabled={creatingShop}
                className="flex-1 py-2.5 bg-slate-800 text-slate-300 rounded-xl text-sm font-semibold hover:bg-slate-700 transition-all disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleCreateShop} disabled={!shopForm.name.trim() || creatingShop}
                className="flex-1 py-2.5 bg-emerald-500 text-slate-900 font-bold rounded-xl text-sm hover:bg-emerald-400 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {creatingShop ? 'Creating…' : 'Create Shop'}
              </button>
            </div>
          </div>
        </div>
      )}

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
              ? 'bg-emerald-500/10 text-emerald-400 font-bold shadow-sm'
              : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
          );
          if (item.external) {
            return (
              <a key={item.key} href={item.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                <Icon size={20} className="text-slate-500 group-hover:text-slate-300 transition-colors" />
                <span className="text-sm">{t(item.key as any)}</span>
              </a>
            );
          }
          return (
            <Link key={item.key} href={item.href} className={linkClass} onClick={() => setIsMobileOpen?.(false)}>
              <Icon size={20} className={cn('transition-colors', isActive ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300')} />
              <span className="text-sm">{t(item.key as any)}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800 space-y-4 bg-slate-900/50">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2 text-slate-500">
            <Languages size={14} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Language</span>
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
                    ? 'bg-emerald-500 border-emerald-500 text-slate-950' 
                    : 'border-slate-800 text-slate-500 hover:border-slate-600'
                )}
              >
                {l.toUpperCase()}
              </Link>
            ))}
          </div>
        </div>

        <button
          onClick={() => logout()}
          className="flex items-center gap-3 px-4 py-3 w-full text-slate-500 hover:bg-red-500/10 hover:text-red-400 rounded-xl transition-all border border-transparent hover:border-red-500/20"
        >
          <LogOut size={18} />
          <span className="text-sm font-semibold">Logout</span>
        </button>
      </div>
      </aside>
    </>
  );
}
