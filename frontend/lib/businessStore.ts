'use client';

import { create } from 'zustand';
import api from './api';
import { BusinessType } from './businessConfig';

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
}

interface BusinessStore {
  profile: BusinessProfile;
  loading: boolean;
  fetchProfile: () => Promise<void>;
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
};

function loadCachedType(): BusinessType {
  if (typeof window === 'undefined') return 'kirana';
  return (localStorage.getItem('ks_business_type') as BusinessType) ?? 'kirana';
}

function cacheType(type: BusinessType) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('ks_business_type', type);
  }
}

export const useBusinessStore = create<BusinessStore>((set, get) => ({
  profile: {
    ...DEFAULT_PROFILE,
    businessType: loadCachedType(),
  },
  loading: false,

  fetchProfile: async () => {
    set({ loading: true });
    try {
      const res = await api.get('/shop/profile');
      const data = res.data;
      const profile: BusinessProfile = {
        id: data.id ?? '',
        businessType: data.business_type ?? 'kirana',
        shopName: data.name ?? '',
        address: data.address ?? '',
        mobile: data.mobile ?? '',
        logoUrl: data.logo_url ?? '',
        setupComplete: data.setup_complete ?? false,
        subscriptionPlan: data.subscription_plan ?? 'shop',
        subscriptionStatus: data.subscription_status ?? 'active',
        subscriptionExpiry: data.subscription_expiry ?? null,
      };
      set({ profile, loading: false });
      cacheType(profile.businessType);
    } catch (err) {
      // Fail silently — use cached value
      set({ loading: false });
    }
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
      set(state => ({
        profile: { ...state.profile, businessType: type, setupComplete: true }
      }));
      cacheType(type);
    } catch (err) {
      console.error('Failed to complete setup:', err);
    }
  },
}));
