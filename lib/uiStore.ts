'use client';

import { create } from 'zustand';

// Desktop-only "hide the sidebar for more width" preference — persisted so it
// survives navigation/reload, same direct-localStorage convention useAuthStore
// already uses for `role` rather than a Zustand persist middleware. Read via
// loadSidebarPref() in a useEffect (not the initializer) to avoid an SSR/CSR
// hydration mismatch, matching businessStore's hydrateFromCache() precedent.
interface UIStore {
  sidebarHidden: boolean;
  toggleSidebar: () => void;
  setSidebarHidden: (hidden: boolean) => void;
  loadSidebarPref: () => void;
}

const SIDEBAR_HIDDEN_KEY = 'ks_sidebar_hidden';

export const useUIStore = create<UIStore>((set) => ({
  sidebarHidden: false,

  toggleSidebar: () => set((state) => {
    const next = !state.sidebarHidden;
    if (typeof window !== 'undefined') localStorage.setItem(SIDEBAR_HIDDEN_KEY, next ? '1' : '0');
    return { sidebarHidden: next };
  }),

  setSidebarHidden: (hidden) => {
    if (typeof window !== 'undefined') localStorage.setItem(SIDEBAR_HIDDEN_KEY, hidden ? '1' : '0');
    set({ sidebarHidden: hidden });
  },

  loadSidebarPref: () => {
    if (typeof window === 'undefined') return;
    set({ sidebarHidden: localStorage.getItem(SIDEBAR_HIDDEN_KEY) === '1' });
  },
}));
