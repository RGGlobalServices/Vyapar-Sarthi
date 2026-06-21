'use client';

import { create } from 'zustand';
import api from './api';
import { BusinessType } from './businessConfig';

export interface ShopSummary {
  id: string;
  name: string;
  shopCode: string | null;
  address: string | null;
  mobile: string | null;
  businessType: string;
  subscriptionPlan: string;
}

interface BusinessProfile {
  id: string;
  businessType: BusinessType;
  shopName: string;
  address: string;
  mobile: string;
  logoUrl: string;
  setupComplete: boolean;
  subscriptionPlan: string;
  subscriptionStatus: string;
  subscriptionExpiry: string | null;
  shopCode: string | null;
  trialPaused: boolean;
  trialPauseStart: string | null;
}

interface BusinessStore {
  profile: BusinessProfile;
  loading: boolean;
  // Multi-shop
  allShops: ShopSummary[];
  activeShopId: string | null;
  fetchProfile: () => Promise<void>;
  fetchAllShops: () => Promise<void>;
  switchShop: (shopId: string) => Promise<void>;
  createShop: (data: { name: string; businessType?: string; address?: string; mobile?: string }) => Promise<ShopSummary>;
  updateProfile: (updates: Partial<BusinessProfile>) => Promise<void>;
  setBusinessType: (type: BusinessType) => Promise<void>;
  completeSetup: (type: BusinessType) => Promise<void>;
}

const DEFAULT_PROFILE: BusinessProfile = {
  id: '',
  businessType: 'kirana',
  shopName: '',
  address: '',
  mobile: '',
  logoUrl: '',
  setupComplete: false,
  subscriptionPlan: 'shop',
  subscriptionStatus: 'active',
  subscriptionExpiry: null,
  shopCode: null,
  trialPaused: false,
  trialPauseStart: null,
};

function loadCachedType(): BusinessType {
  if (typeof window === 'undefined') return 'kirana';
  return (localStorage.getItem('ks_business_type') as BusinessType) ?? 'kirana';
}

function cacheType(type: BusinessType) {
  if (typeof window !== 'undefined') localStorage.setItem('ks_business_type', type);
}

export function getActiveShopId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('ks_active_shop_id');
}

function setActiveShopIdStorage(id: string | null) {
  if (typeof window === 'undefined') return;
  if (id) localStorage.setItem('ks_active_shop_id', id);
  else localStorage.removeItem('ks_active_shop_id');
}

function mapShopToProfile(data: any): BusinessProfile {
  return {
    id: data.id ?? '',
    businessType: (data.business_type ?? data.businessType ?? 'kirana') as BusinessType,
    shopName: data.name ?? '',
    address: data.address ?? '',
    mobile: data.mobile ?? '',
    logoUrl: data.logo_url ?? data.logoUrl ?? '',
    setupComplete: data.setup_complete ?? data.setupComplete ?? false,
    subscriptionPlan: ((data.subscription_plan ?? data.subscriptionPlan) || 'shop').toLowerCase(),
    subscriptionStatus: data.subscription_status ?? data.subscriptionStatus ?? 'active',
    subscriptionExpiry: data.subscription_expiry ?? data.subscriptionExpiry ?? null,
    shopCode: data.shop_code ?? data.shopCode ?? null,
    trialPaused: data.trialPaused ?? data.trial_paused ?? false,
    trialPauseStart: data.trialPauseStart ?? data.trial_pause_start ?? null,
  };
}

// In-memory profile cache — 60 second TTL to avoid hammering the API on every
// tab-focus / visibilitychange event (the two main sources of repeat calls).
let profileCacheTs = 0;
const PROFILE_CACHE_TTL = 60_000; // ms

export const useBusinessStore = create<BusinessStore>((set, get) => ({
  profile: { ...DEFAULT_PROFILE, businessType: loadCachedType() },
  loading: false,
  allShops: [],
  activeShopId: null, // loaded from localStorage inside fetchAllShops (client-only) to avoid SSR hydration mismatch

  fetchProfile: async () => {
    // Skip if we fetched recently (e.g. tab focus fires repeatedly)
    if (Date.now() - profileCacheTs < PROFILE_CACHE_TTL && get().profile.id) return;
    set({ loading: true });
    try {
      const res = await api.get('/shop/profile');
      const profile = mapShopToProfile(res.data);
      profileCacheTs = Date.now();
      set({ profile, loading: false });
      cacheType(profile.businessType);
    } catch {
      set({ loading: false });
    }
  },

  fetchAllShops: async () => {
    try {
      const res = await api.get('/shop/my-shops');
      const shops: ShopSummary[] = (res.data || []).map((s: any) => ({
        id: s.id,
        name: s.name ?? '',
        shopCode: s.shop_code ?? s.shopCode ?? null,
        address: s.address ?? null,
        mobile: s.mobile ?? null,
        businessType: s.business_type ?? s.businessType ?? 'kirana',
        subscriptionPlan: (s.subscription_plan ?? s.subscriptionPlan ?? 'shop').toLowerCase(),
      }));
      // Restore active shop from localStorage (safe here — client-only, inside useEffect)
      const storedId = typeof window !== 'undefined' ? localStorage.getItem('ks_active_shop_id') : null;
      const validId = storedId && shops.find(s => s.id === storedId) ? storedId : null;
      set({ allShops: shops, activeShopId: validId });
    } catch {}
  },

  switchShop: async (shopId: string) => {
    setActiveShopIdStorage(shopId);
    set({ activeShopId: shopId });
    // Force a full page reload to the dashboard so all UI, context, and caches are reset to the new shop
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  },

  createShop: async (data) => {
    const res = await api.post('/shop/create', {
      name: data.name,
      businessType: data.businessType,
      address: data.address,
      mobile: data.mobile,
    });
    const shop: ShopSummary = {
      id: res.data.id,
      name: res.data.name,
      shopCode: res.data.shop_code ?? res.data.shopCode ?? null,
      address: res.data.address ?? null,
      mobile: res.data.mobile ?? null,
      businessType: res.data.business_type ?? res.data.businessType ?? 'kirana',
      subscriptionPlan: (res.data.subscription_plan ?? res.data.subscriptionPlan ?? 'shop').toLowerCase(),
    };
    set(state => ({ allShops: [...state.allShops, shop] }));
    return shop;
  },

  updateProfile: async (updates: Partial<BusinessProfile>) => {
    try {
      const apiUpdates: any = {};
      if (updates.shopName !== undefined) apiUpdates.name = updates.shopName;
      if (updates.address !== undefined) apiUpdates.address = updates.address;
      if (updates.mobile !== undefined) apiUpdates.mobile = updates.mobile;
      if (updates.logoUrl !== undefined) apiUpdates.logoUrl = updates.logoUrl;
      if (updates.businessType !== undefined) apiUpdates.businessType = updates.businessType;
      await api.patch('/shop/profile', apiUpdates);
      set(state => ({ profile: { ...state.profile, ...updates } }));
      if (updates.businessType) cacheType(updates.businessType);
    } catch (err) {
      console.error('Failed to update profile:', err);
      throw err;
    }
  },

  setBusinessType: async (type: BusinessType) => {
    try {
      await api.patch('/shop/profile', { business_type: type });
      set(state => ({ profile: { ...state.profile, businessType: type } }));
      cacheType(type);
    } catch (err) {
      console.error('Failed to update business type:', err);
    }
  },

  completeSetup: async (type: BusinessType) => {
    try {
      await api.patch('/shop/profile', { business_type: type, setup_complete: true });
      set(state => ({ profile: { ...state.profile, businessType: type, setupComplete: true } }));
      cacheType(type);
    } catch (err) {
      console.error('Failed to complete setup:', err);
    }
  },
}));
