'use client';

import { create } from 'zustand';
import api from './api';
import { withOfflineCache } from './offlineCache';
import { invalidateProductCaches } from './swrInvalidate';

// ─── Auth / Profile Store ──────────────────────────────────────────────────

interface AuthUser {
  id: string;
  email: string;
  name: string;
  storeName: string;
  storeAddress?: string;
  mobile: string;
  accessToken: string;
}

interface AuthStore {
  user: AuthUser | null;
  role: 'admin' | 'staff';
  setRole: (role: 'admin' | 'staff') => void;
  updateUser: (updates: Partial<AuthUser>) => void;
  loadFromStorage: () => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  role: 'admin',

  setRole: (role) => {
    set({ role });
    if (typeof window !== 'undefined') {
      localStorage.setItem('ks_role', role);
    }
  },

  updateUser: (updates) => {
    set((state) => {
      if (!state.user) return state;
      const updated = { ...state.user, ...updates };
      if (typeof window !== 'undefined') {
        try {
          const raw = localStorage.getItem('ks_auth');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (updates.email !== undefined) parsed.email = updates.email;
            if (updates.name !== undefined) parsed.name = updates.name;
            if (updates.mobile !== undefined) parsed.mobile = updates.mobile;
            if (updates.storeName !== undefined) parsed.storeName = updates.storeName;
            localStorage.setItem('ks_auth', JSON.stringify(parsed));
          }
        } catch (e) {
          console.error('Error updating ks_auth in localStorage', e);
        }
      }
      return { user: updated };
    });
  },

  loadFromStorage: () => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('ks_auth');
      if (!raw) return;
      const d = JSON.parse(raw);
      set({
        user: {
          id: d.user_id || d.id || '',
          email: d.email || '',
          name: d.name || '',
          storeName: d.storeName || 'My Store',
          storeAddress: d.storeAddress || '',
          mobile: d.mobile || '',
          accessToken: d.access_token || d.accessToken || '',
        },
        role: (localStorage.getItem('ks_role') as 'admin' | 'staff') || 'admin'
      });
    } catch (e) {
      console.error('Error loading auth from storage', e);
    }
  },

  logout: async () => {
    if (typeof window !== 'undefined') {
      // Best-effort: invalidate the session server-side so it stops showing
      // as "Active" in Settings and can't be reused. Never let this block or
      // fail the actual client-side logout — a network blip shouldn't strand
      // the user unable to sign out.
      try { await api.post('/auth/logout', {}); } catch {}

      localStorage.removeItem('ks_auth');
      document.cookie = 'ks_auth=; path=/; max-age=0';
      document.cookie = 'ks_plan=; path=/; max-age=0';
      set({ user: null });
      window.location.href = `/${window.location.pathname.split('/')[1] || 'en'}/login`;
    }
  },
}));

// ─── Cart Store ─────────────────────────────────────────────────────────────

export interface CartItem {
  id: string | number;
  name: string;
  unit: string;
  quantity: number;
  price: number;
  profit: number;
  total: number;
  is_loose?: boolean;
  variant?: string;
  batchNumber?: string;
  expiryDate?: string | Date;
  color?: string;
  size?: string;
  model?: string;
  warranty?: string;
  [key: string]: any;
}

interface CartStore {
  carts: Record<string, CartItem[]>;
  addItem: (shopId: string, item: CartItem) => void;
  removeItem: (shopId: string, id: string | number, variant?: string) => void;
  updateQuantity: (shopId: string, id: string | number, quantity: number, variant?: string) => void;
  updatePrice: (shopId: string, id: string | number, price: number, variant?: string) => void;
  clearCart: (shopId: string) => void;
}

// A cart line is uniquely identified by product id + unit + variant (size),
// so the same product can sit in the cart at multiple sizes/prices at once.
const sameLine = (i: CartItem, id: string | number, variant?: string) =>
  i.id === id && (variant === undefined || (i.variant ?? undefined) === (variant ?? undefined));

export const useCartStore = create<CartStore>((set) => ({
  carts: {},
  addItem: (shopId, item) => set((state) => {
    const shopCart = state.carts[shopId] || [];
    const existing = shopCart.find((i) => i.id === item.id && i.unit === item.unit && (i.variant ?? '') === (item.variant ?? ''));
    if (existing) {
      return {
        carts: {
          ...state.carts,
          [shopId]: shopCart.map((i) =>
            i.id === item.id && i.unit === item.unit && (i.variant ?? '') === (item.variant ?? '')
              ? { ...i, quantity: i.quantity + item.quantity, total: (i.quantity + item.quantity) * i.price }
              : i
          ),
        }
      };
    }
    return { carts: { ...state.carts, [shopId]: [...shopCart, item] } };
  }),
  removeItem: (shopId, id, variant) => set((state) => {
    const shopCart = state.carts[shopId] || [];
    return { carts: { ...state.carts, [shopId]: shopCart.filter((i) => !sameLine(i, id, variant)) } };
  }),
  updateQuantity: (shopId, id, quantity, variant) => set((state) => {
    const shopCart = state.carts[shopId] || [];
    return {
      carts: {
        ...state.carts,
        [shopId]: shopCart.map((i) => sameLine(i, id, variant) ? { ...i, quantity, total: quantity * i.price } : i)
      }
    };
  }),
  updatePrice: (shopId, id, price, variant) => set((state) => {
    const shopCart = state.carts[shopId] || [];
    return {
      carts: {
        ...state.carts,
        [shopId]: shopCart.map((i) => {
          if (sameLine(i, id, variant)) {
            return { ...i, price, profit: price - i.cost, total: i.quantity * price };
          }
          return i;
        })
      }
    };
  }),
  clearCart: (shopId) => set((state) => ({ carts: { ...state.carts, [shopId]: [] } })),
}));

// ─── Udhar (Credit) Store ───────────────────────────────────────────────────

export interface UdharTransaction {
  id: number | string;
  type: 'udhar' | 'payment';
  amount: number;
  note: string;
  date: string;
  billNumber?: string;
}

export interface UdharCustomer {
  id: number | string;
  name: string;
  mobile: string;
  email: string;
  totalDue?: number;
  createdAt?: string;
  transactions: UdharTransaction[];
}

interface UdharStore {
  customers: UdharCustomer[];
  loading: boolean;
  fetchCustomers: () => Promise<void>;
  /** Called by switchShop — wipes the previous shop's customer list so it
   *  doesn't flash under the new shop while the refetch is in flight. */
  resetCustomers: () => void;
  silentRefresh: () => Promise<void>;
  addCustomer: (name: string, mobile: string, email?: string) => Promise<string | number>;
  updateCustomer: (customerId: number | string, name: string, mobile: string, email?: string) => Promise<void>;
  deleteCustomer: (customerId: number | string) => Promise<void>;
  addTransaction: (customerId: number | string, tx: Omit<UdharTransaction, 'id'>) => Promise<void>;
  deleteTransaction: (customerId: number | string, txId: number | string) => Promise<void>;
  addUdharFromBill: (customerName: string, amount: number, billNumber: string) => Promise<void>;
  addUdharFromImport: (customerName: string, amount: number, note: string, date: string) => Promise<void>;
}

// Udhar money movements also change what the Dashboard and Customers screens
// show (total udhar, period udhar, customer dues). Those read through SWR, so
// nudge their caches to refetch — otherwise the other sections keep rendering
// pre-mutation numbers until the user reloads the page. Keys may be a plain
// string or a [url, shopId] tuple, so both shapes are matched.
function revalidateUdharDependents() {
  import('swr')
    .then(({ mutate }) => {
      mutate(
        (key) => {
          const k = Array.isArray(key) ? key[0] : key;
          return (
            typeof k === 'string' &&
            (k.startsWith('/reports/') || k.startsWith('/customers') || k.startsWith('/activity'))
          );
        },
        undefined,
        { revalidate: true },
      );
    })
    .catch(() => {});
}

export const useUdharStore = create<UdharStore>((set, get) => ({
  customers: [],
  loading: false,

  resetCustomers: () => set({ customers: [], loading: false }),

  fetchCustomers: async () => {
    const hasData = get().customers.length > 0;
    if (!hasData) {
      set({ loading: true });
    }
    try {
      const res = await api.get('/customers');
      const customers = (res.data || []).map((c: any) => ({ ...c, email: c.email || '', totalDue: c.totalDue || 0, createdAt: c.createdAt || '' }));
      set({ customers, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  // Silent background reconcile — refreshes from the server WITHOUT toggling the
  // loading spinner, so optimistic updates stay instant while eventually syncing
  // server-truth (ids, server-computed fields, other devices).
  silentRefresh: async () => {
    try {
      const res = await api.get('/customers');
      const customers = (res.data || []).map((c: any) => ({ ...c, email: c.email || '', totalDue: c.totalDue || 0, createdAt: c.createdAt || '' }));
      set({ customers });
    } catch { /* keep optimistic state */ }
  },

  // Optimistic: show the new customer immediately, then sync. Returns the real
  // server id (awaited) so chained flows (bill/import) can add a transaction.
  addCustomer: async (name, mobile, email = '') => {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const optimistic: UdharCustomer = { id: tempId, name, mobile, email, totalDue: 0, transactions: [], createdAt: new Date().toISOString() };
    set((state) => ({ customers: [optimistic, ...state.customers] }));
    try {
      const res = await api.post('/customers', { name, mobile, email });
      const realId = res.data.id;
      set((state) => ({
        customers: state.customers.map((c) => (c.id === tempId ? { ...c, id: realId } : c)),
      }));
      revalidateUdharDependents();
      return realId;
    } catch (err) {
      set((state) => ({ customers: state.customers.filter((c) => c.id !== tempId) }));
      throw err;
    }
  },

  updateCustomer: async (customerId, name, mobile, email = '') => {
    const prev = get().customers;
    set((state) => ({
      customers: state.customers.map((c) => (c.id === customerId ? { ...c, name, mobile, email } : c)),
    }));
    try {
      await api.put(`/customers/${customerId}`, { name, mobile, email });
    } catch (err) {
      set({ customers: prev });
      throw err;
    }
  },

  deleteCustomer: async (customerId) => {
    const prev = get().customers;
    set((state) => ({ customers: state.customers.filter((c) => c.id !== customerId) }));
    try {
      await api.delete(`/customers/${customerId}`);
      revalidateUdharDependents();
    } catch (err) {
      set({ customers: prev });
      throw err;
    }
  },

  // Optimistic: the amount + updated due appear instantly, then the server
  // confirms in the background.
  //
  // `totalDue` MUST be adjusted here as well as pushing the transaction. The UI
  // reads the server-computed `totalDue` field in preference to re-deriving the
  // balance from `transactions`, so appending a transaction alone leaves every
  // total showing a stale number until the page is manually refreshed.
  addTransaction: async (customerId, tx) => {
    const tempTx: UdharTransaction = { ...tx, id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
    const prev = get().customers;
    const delta = tx.type === 'udhar' ? tx.amount : -tx.amount;
    set((state) => ({
      customers: state.customers.map((c) =>
        c.id === customerId
          ? {
              ...c,
              transactions: [...(c.transactions || []), tempTx],
              totalDue: (c.totalDue || 0) + delta,
            }
          : c,
      ),
    }));
    try {
      const res = await api.post(`/customers/${customerId}/transactions`, tx);
      const realId = res.data?.id;
      if (realId) {
        set((state) => ({
          customers: state.customers.map((c) =>
            c.id === customerId
              ? { ...c, transactions: c.transactions.map((t) => (t.id === tempTx.id ? { ...t, id: realId } : t)) }
              : c,
          ),
        }));
      }
      // Reconcile against server truth (rounding, concurrent edits, other
      // devices) without flipping the loading spinner, and refresh the other
      // screens that show these same numbers.
      get().silentRefresh();
      revalidateUdharDependents();
    } catch (err) {
      set({ customers: prev });
      throw err;
    }
  },

  deleteTransaction: async (customerId, txId) => {
    const prev = get().customers;
    // Reverse the deleted entry's effect on the running balance too, otherwise
    // the total keeps counting a transaction that is no longer listed.
    const removed = prev
      .find((c) => c.id === customerId)
      ?.transactions?.find((t) => t.id === txId);
    const delta = removed ? (removed.type === 'udhar' ? -removed.amount : removed.amount) : 0;
    set((state) => ({
      customers: state.customers.map((c) =>
        c.id === customerId
          ? {
              ...c,
              transactions: c.transactions.filter((t) => t.id !== txId),
              totalDue: (c.totalDue || 0) + delta,
            }
          : c,
      ),
    }));
    try {
      await api.delete(`/customers/${customerId}/transactions/${txId}`);
      get().silentRefresh();
      revalidateUdharDependents();
    } catch (err) {
      set({ customers: prev });
      throw err;
    }
  },

  addUdharFromBill: async (customerName, amount, billNumber) => {
    const existing = get().customers.find(
      c => c.name.toLowerCase() === customerName.toLowerCase()
    );
    let customerId: string | number;
    if (existing) {
      customerId = existing.id;
    } else {
      customerId = await get().addCustomer(customerName, '');
    }
    await get().addTransaction(customerId, {
      type: 'udhar',
      amount,
      note: `Bill: ${billNumber}`,
      date: new Date().toISOString().split('T')[0],
      billNumber,
    });
  },

  addUdharFromImport: async (customerName, amount, note, date) => {
    const existing = get().customers.find(
      c => c.name.toLowerCase() === customerName.toLowerCase()
    );
    let customerId: string | number;
    if (existing) {
      customerId = existing.id;
    } else {
      customerId = await get().addCustomer(customerName, '');
    }
    await get().addTransaction(customerId, {
      type: 'udhar',
      amount,
      note: note || `Imported record`,
      date: date.split('T')[0],
    });
  },
}));

// ─── Stock Store ─────────────────────────────────────────────────────────────

export interface StockItem {
  id: number | string;
  name: string;
  category: string;
  current: number;
  min: number;
  unit: string;
  archived: boolean;
  mrp: number;
  sellingPrice: number;
  cost: number;
  model_number?: string | null;
  warranty_months?: number | null;
  expiry_date?: string | null;
  batch_number?: string | null;
  drug_schedule?: string | null;
  gender?: string | null;
  shade?: string | null;
  size_variants?: string | null;
  metadata?: any;
  recentlyAdded?: number;
}

export interface StockLogEntry {
  id: number | string;
  itemName: string;
  type: 'in' | 'out' | 'edit';
  qty: number;
  note: string;
  time: string;
  date: string;
}

interface StockStore {
  items: StockItem[];
  log: StockLogEntry[];
  loading: boolean;
  fetchStock: () => Promise<void>;
  /** Wipe every cached item + reset the freshness gate — called by switchShop
   *  so the previous shop's products don't linger in the UI. */
  resetStock: () => void;
  addItem: (item: Omit<StockItem, 'id' | 'archived'>) => Promise<void>;
  updateItem: (id: number | string, updates: Partial<Omit<StockItem, 'id'>>) => Promise<void>;
  removeItem: (id: number | string) => Promise<void>;
  toggleArchive: (id: number | string) => Promise<void>;
  adjustStock: (id: number | string, delta: number, note: string, pricing?: any) => Promise<void>;
  mergeFromImport: (items: any[], date: string) => Promise<void>;
  mergePurchaseBill: (items: any[], date: string, vendorName: string) => Promise<void>;
  clearLog: () => void;
}

// Module-scoped dedupe: a hover-prefetch on the Stock link followed by the
// actual navigation would otherwise fire /products twice on the same tick.
let stockFetchInFlight: Promise<void> | null = null;
let stockFetchedAt = 0;
const STOCK_FRESH_MS = 30_000;

export const useStockStore = create<StockStore>((set, get) => ({
  items: [],
  log: [],
  loading: false,

  resetStock: () => {
    stockFetchInFlight = null;
    stockFetchedAt = 0;
    set({ items: [], log: [], loading: false });
  },

  fetchStock: async () => {
    // Reuse an in-flight fetch, and skip entirely if we have fresh data.
    if (stockFetchInFlight) return stockFetchInFlight;
    if (get().items.length > 0 && Date.now() - stockFetchedAt < STOCK_FRESH_MS) return;
    const hasData = get().items.length > 0;
    if (!hasData) {
      set({ loading: true });
    }
    stockFetchInFlight = (async () => {
    try {
      // Products load first; the stock page can render as soon as they arrive.
      // `/products/logs/all` scans every stock movement ever recorded — it's
      // slow, only powers the recent-activity strip, and nothing hard-depends
      // on it, so it fetches in the background and updates the store when done.
      const productsData = await withOfflineCache('stock-products', () => api.get('/products').then(r => r.data));

      const items = productsData.map((p: any) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        current: p.currentStock,
        min: p.minStock,
        unit: p.baseUnit || 'Unit',
        archived: p.archived || false,
        mrp: p.mrp || 0,
        sellingPrice: p.sellingPrice || 0,
        cost: p.wholesaleCost || 0,
        model_number: p.model_number || null,
        warranty_months: p.warranty_months || null,
        expiry_date: p.expiryDate || null,
        batch_number: p.batch_number || null,
        drug_schedule: p.drug_schedule || null,
        gender: p.gender || null,
        shade: p.shade || null,
        size_variants: p.size_variants || null,
        metadata: p.metadata ?? null,
        recentlyAdded: p.recentlyAdded || 0,
      }));

      set({ items, loading: false });

      // Background: load activity log without blocking first paint.
      withOfflineCache('stock-logs', () => api.get('/products/logs/all').then(r => r.data))
        .then((logsData: any[]) => {
          const log = (logsData || []).map((l: any) => ({
            id: l.id,
            itemName: l.product_name || l.products?.name || 'Product',
            type: l.type,
            qty: l.quantity,
            note: l.note,
            time: l.createdAt ? new Date(l.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
            date: l.createdAt ? new Date(l.createdAt).toLocaleDateString() : ''
          }));
          set({ log });
        })
        .catch(() => { /* activity log is best-effort; page still works without it */ });
      stockFetchedAt = Date.now();
    } catch (err) {
      set({ loading: false });
    } finally {
      stockFetchInFlight = null;
    }
    })();
    return stockFetchInFlight;
  },

  // Optimistic: the product appears immediately, then syncs. The real server id
  // replaces the temp id on success; on failure the row is removed.
  addItem: async (item: any) => {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const optimistic: StockItem = {
      id: tempId,
      name: item.name,
      category: item.category,
      current: item.current,
      min: item.min,
      unit: item.unit,
      archived: false,
      mrp: item.mrp || 0,
      sellingPrice: item.sellingPrice || 0,
      cost: item.cost || 0,
      model_number: item.model_number || null,
      warranty_months: item.warranty_months ? Number(item.warranty_months) : null,
      expiry_date: item.expiry_date || null,
      batch_number: item.batch_number || null,
      drug_schedule: item.drug_schedule || null,
      gender: item.gender || null,
      shade: item.shade || null,
      size_variants: item.size_variants || null,
      metadata: item.metadata ?? null,
      // New product's opening stock is entirely "newly added" → show +N instantly.
      recentlyAdded: Number(item.current) > 0 ? Number(item.current) : 0,
    };
    set((state) => ({ items: [optimistic, ...state.items] }));
    try {
      const res = await api.post('/products', {
        name: item.name,
        category: item.category,
        current_stock: item.current,
        min_stock: item.min,
        base_unit: item.unit,
        mrp: item.mrp || 0,
        selling_price: item.sellingPrice || 0,
        wholesale_cost: item.cost || 0,
        barcode: `BAR-${Date.now()}`,
        model_number: item.model_number || null,
        warranty_months: item.warranty_months ? Number(item.warranty_months) : null,
        expiry_date: item.expiry_date || null,
        batch_number: item.batch_number || null,
        drug_schedule: item.drug_schedule || null,
        gender: item.gender || null,
        shade: item.shade || null,
        size_variants: item.size_variants || null,
        metadata: item.metadata ?? undefined,
      });
      const realId = res.data?.id;
      if (realId) {
        set((state) => ({ items: state.items.map((i) => (i.id === tempId ? { ...i, id: realId } : i)) }));
      }
      invalidateProductCaches();
    } catch (err) {
      set((state) => ({ items: state.items.filter((i) => i.id !== tempId) }));
      throw err;
    }
  },

  updateItem: async (id, updates: any) => {
    const prev = get().items;
    set((state) => ({ items: state.items.map((i) => (i.id === id ? { ...i, ...updates } : i)) }));
    try {
      const backendUpdates: any = {};
      if (updates.name !== undefined) backendUpdates.name = updates.name;
      if (updates.category !== undefined) backendUpdates.category = updates.category;
      if (updates.current !== undefined) backendUpdates.current_stock = updates.current;
      if (updates.min !== undefined) backendUpdates.min_stock = updates.min;
      if (updates.unit !== undefined) backendUpdates.base_unit = updates.unit;
      if (updates.size_variants !== undefined) backendUpdates.size_variants = updates.size_variants;
      if (updates.metadata !== undefined) backendUpdates.metadata = updates.metadata;
      if (updates.mrp !== undefined) backendUpdates.mrp = updates.mrp;
      if (updates.sellingPrice !== undefined) backendUpdates.selling_price = updates.sellingPrice;
      if (updates.cost !== undefined) backendUpdates.wholesale_cost = updates.cost;
      await api.put(`/products/${id}`, backendUpdates);
      invalidateProductCaches();
    } catch (err) {
      set({ items: prev });
      throw err;
    }
  },

  removeItem: async (id) => {
    const prev = get().items;
    set((state) => ({ items: state.items.filter((i) => i.id !== id) }));
    try {
      await api.delete(`/products/${id}`);
      invalidateProductCaches();
    } catch (err) {
      set({ items: prev });
      throw err;
    }
  },

  toggleArchive: async (id) => {
    const item = get().items.find((i) => i.id === id);
    if (!item) return;
    const prev = get().items;
    const next = !item.archived;
    set((state) => ({ items: state.items.map((i) => (i.id === id ? { ...i, archived: next } : i)) }));
    try {
      await api.put(`/products/${id}`, { archived: next });
      invalidateProductCaches();
    } catch (err) {
      set({ items: prev });
      throw err;
    }
  },

  // Optimistic: stock number changes instantly (current ± delta), pricing updates
  // apply immediately, and a log row appears — then the server confirms.
  adjustStock: async (id, delta, note, pricing?: any) => {
    const prevItems = get().items;
    const prevLog = get().log;
    const item = get().items.find((i) => i.id === id);

    const pricingPatch: Partial<StockItem> = {};
    if (pricing) {
      if (pricing.mrp !== undefined) pricingPatch.mrp = pricing.mrp;
      if (pricing.sellingPrice !== undefined) pricingPatch.sellingPrice = pricing.sellingPrice;
      if (pricing.cost !== undefined) pricingPatch.cost = pricing.cost;
    }
    const now = new Date();
    const logEntry: StockLogEntry = {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      itemName: item?.name || 'Product',
      type: delta > 0 ? 'in' : 'out',
      qty: Math.abs(delta),
      note,
      time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      date: now.toLocaleDateString(),
    };
    set((state) => ({
      items: state.items.map((i) => (i.id === id ? {
        ...i,
        current: (i.current || 0) + delta,
        // Optimistically bump the "+N recently added" badge on a stock-IN so it
        // appears instantly, without waiting for the next server refetch.
        recentlyAdded: delta > 0 ? (i.recentlyAdded || 0) + delta : (i.recentlyAdded || 0),
        ...pricingPatch,
      } : i)),
      log: [logEntry, ...state.log],
    }));

    try {
      await api.post(`/products/${id}/adjust`, { quantity: delta, type: delta > 0 ? 'in' : 'out', note });
      if (pricing && Object.keys(pricing).length > 0) {
        const updates: any = {};
        if (pricing.mrp !== undefined) updates.mrp = pricing.mrp;
        if (pricing.sellingPrice !== undefined) updates.selling_price = pricing.sellingPrice;
        if (pricing.cost !== undefined) updates.wholesale_cost = pricing.cost;
        await api.put(`/products/${id}`, updates);
      }
      invalidateProductCaches();
    } catch (err) {
      set({ items: prevItems, log: prevLog });
      throw err;
    }
  },

  mergeFromImport: async (importedItems, date) => {
    for (const item of importedItems) {
      if (!item.productName || !item.quantity) continue;
      
      const existing = get().items.find(i => i.name.toLowerCase() === item.productName.toLowerCase());
      if (existing) {
        await get().adjustStock(existing.id, Number(item.quantity), `Imported from file`, {
          mrp: Number(item.price) || existing.mrp,
          sellingPrice: Number(item.price) || existing.sellingPrice,
        });
      } else {
        await get().addItem({
          name: item.productName,
          category: item.category || 'Imported',
          current: Number(item.quantity),
          min: 10,
          unit: item.unit || 'Unit',
          mrp: Number(item.price) || 0,
          sellingPrice: Number(item.price) || 0,
          cost: 0,
          expiry_date: item.expiryDate || null,
        });
      }
    }
  },

  mergePurchaseBill: async (importedItems, date, vendorName) => {
    for (const item of importedItems) {
      if (!item.productName || !item.quantity) continue;
      
      const existing = get().items.find(i => i.name.toLowerCase() === item.productName.toLowerCase());
      if (existing) {
        await get().adjustStock(existing.id, Number(item.quantity), `Purchase Bill from ${vendorName}`, {
          cost: Number(item.wholesaleCost) || existing.cost,
          sellingPrice: Number(item.suggestedSellingPrice) || existing.sellingPrice,
        });
      } else {
        await get().addItem({
          name: item.productName,
          category: item.category || 'Imported Purchase',
          current: Number(item.quantity),
          min: 10,
          unit: item.unit || 'Unit',
          mrp: Number(item.suggestedSellingPrice) || 0,
          sellingPrice: Number(item.suggestedSellingPrice) || 0,
          cost: Number(item.wholesaleCost) || 0,
          expiry_date: item.expiryDate || null,
          gender: item.gender || null,
          shade: item.shade || null,
          size_variants: item.size_variants || null,
          batch_number: item.batch_number || null,
          drug_schedule: item.drug_schedule || null,
          model_number: item.model_number || null,
          warranty_months: item.warranty_months ? Number(item.warranty_months) : null,
        });
      }
    }
  },

  clearLog: () => set({ log: [] }),
}));

// ─── Data Import Store ──────────────────────────────────────────────────────

export interface ImportedFileData {
  id: number;
  name: string;
  fileName: string;
  fileType: 'image' | 'excel' | 'pdf' | 'other';
  dataType: ImportDataType;
  summary: string;
  rawText?: string;
  khata: any[];
  stock: any[];
  sales: any[];
  loans: any[];
  importedAt: string;
}

export type ImportFileType = 'image' | 'excel' | 'pdf' | 'other';
export type ImportDataType = 'khata' | 'stock' | 'sales' | 'loans' | 'mixed' | 'unknown';

export interface ImportedKhataEntry {
  customerName: string;
  amount: number;
  note: string;
  date?: string;
}

export interface ImportedStockEntry {
  productName: string;
  category?: string;
  quantity: number;
  unit?: string;
  price: number;
  expiryDate?: string;
  wholesaleCost?: number;
  mrp?: number;
  sellingPrice?: number;
}

export interface ImportedSaleEntry {
  date?: string;
  endDate?: string;
  totalAmount: number;
  paymentMethod?: string;
  note?: string;
}

interface ImportStore {
  files: ImportedFileData[];
  addFile: (file: ImportedFileData) => void;
  deleteFile: (id: number) => void;
}

export const useImportStore = create<ImportStore>((set) => ({
  files: [],
  addFile: (file) => set((state) => ({ files: [file, ...state.files] })),
  deleteFile: (id) => set((state) => ({ files: state.files.filter((f) => f.id !== id) })),
}));
