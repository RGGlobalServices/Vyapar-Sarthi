'use client';

import { useEffect } from 'react';
import { Link, usePathname } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { 
  LayoutDashboard, IndianRupee, Package, Box, Users, 
  BarChart3, LogOut, Languages, FolderUp, Settings, User, RotateCcw, Gift, Store, HelpCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PAYMENT_URL, SUPPORT_URL } from '@/lib/config';
import { useAuthStore } from '@/lib/store';
import { useBusinessStore } from '@/lib/businessStore';
import { isSubscriptionEnded, isAllowedWhenEnded } from '@/lib/subscriptionAccess';

export default function Sidebar({ locale }: { locale: string }) {
  const pathname = usePathname();
  const { user, loadFromStorage, logout } = useAuthStore();
  const { profile, fetchProfile } = useBusinessStore();
  const t = useTranslations('Nav');
  const ended = isSubscriptionEnded(profile);

  useEffect(() => {
    loadFromStorage();
    fetchProfile();
  }, [loadFromStorage, fetchProfile]);

  const menuItems = [
    { key: 'dashboard', icon: LayoutDashboard, href: '/' },
    { key: 'profile',   icon: User,            href: '/profile' },
    { key: 'billing',   icon: IndianRupee,     href: '/billing' },
    { key: 'products',  icon: Package,         href: '/products' },
    { key: 'stock',     icon: Box,             href: '/stock' },
    { key: 'udhar',     icon: Users,           href: '/udhar' },
    { key: 'reports',   icon: BarChart3,       href: '/reports' },
    { key: 'import',    icon: FolderUp,        href: '/import' },
    { key: 'referral',  icon: Gift,            href: '/referral' },
    { key: 'dukandar',  icon: Store,           href: '/dukandar' },
    { key: 'support',   icon: HelpCircle,      href: SUPPORT_URL, external: true },
    { key: 'settings',  icon: Settings,        href: '/settings' },
    { key: 'returns',   icon: RotateCcw,       href: '/returns' },
  ];
  const visibleMenuItems = ended
    ? menuItems.filter(item => item.external || isAllowedWhenEnded(item.href))
    : menuItems;

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-screen sticky top-0 z-30">
      <div className="p-6 border-b border-slate-800 flex items-center gap-3">
        <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20 overflow-hidden">
          {profile.logoUrl ? (
            <img src={profile.logoUrl} alt="Logo" className="w-full h-full object-cover" />
          ) : (
            <span className="text-slate-900 font-black text-xl">
              {(profile.shopName || user?.storeName || 'B').charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-bold text-white truncate leading-tight">
            {profile.shopName || user?.storeName || 'Vyapar Sarthi'}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider truncate">
              {user?.name || 'Owner'}
            </span>
            <span className={cn(
              "text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-tighter",
              profile.subscriptionPlan === 'wholesale' ? "bg-purple-500 text-white" :
              "bg-sky-500 text-white"
            )}>
              {profile.subscriptionPlan === 'wholesale' ? 'Wholesale' :
               profile.subscriptionPlan === 'shop'     ? 'Shop' :
               profile.subscriptionPlan || 'Shop'}
            </span>
          </div>
        </div>
      </div>

      {false && (
        <div className="px-4 py-3 mx-4 mt-4 bg-gradient-to-br from-emerald-500/20 to-teal-500/5 border border-emerald-500/30 rounded-xl">
          <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1">Free Plan</p>
          <p className="text-[11px] text-slate-300 leading-tight mb-2">Upgrade to Dukaan, Vyapar or Udyog for full features.</p>
          <a 
            href={PAYMENT_URL}
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
            'flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group',
            isActive
              ? 'bg-emerald-500/10 text-emerald-400 font-bold'
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
            <Link key={item.key} href={item.href} className={linkClass}>
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
  );
}
