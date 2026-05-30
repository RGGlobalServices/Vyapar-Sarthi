'use client';

import { create } from 'zustand';
import api from './api';

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
  loadFromStorage: () => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,

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
      });
    } catch (e) {
      console.error('Error loading auth from storage', e);
    }
  },

  logout: async () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ks_auth');
      document.cookie = 'ks_auth=; path=/; max-age=0';
      set({ user: null });
      window.location.href = `/${window.location.pathname.split('/')[1] || 'en'}/login`;
    }
  },
}));

// ─── Cart Store ─────────────────────────────────────────────────────────────

export interface CartItem {
  id: number;
  name: string;
  unit: string;
  quantity: number;
  price: number;
  profit: number;
  total: number;
  is_loose?: boolean;
}

interface CartStore {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (id: number) => void;
  updateQuantity: (id: number, quantity: number) => void;
  updatePrice: (id: number, price: number) => void;
  clearCart: () => void;
}

export const useCartStore = create<CartStore>((set) => ({
  items: [],
  addItem: (item) => set((state) => {
    const existing = state.items.find((i) => i.id === item.id && i.unit === item.unit);
    if (existing) {
      return {
        items: state.items.map((i) =>
          i.id === item.id && i.unit === item.unit
            ? { ...i, quantity: i.quantity + item.quantity, total: (i.quantity + item.quantity) * i.price }
            : i
        ),
      };
    }
    return { items: [...state.items, item] };
  }),
  removeItem: (id) => set((state) => ({ items: state.items.filter((i) => i.id !== id) })),
  updateQuantity: (id, quantity) => set((state) => ({
    items: state.items.map((i) =>
      i.id === id ? { ...i, quantity, total: quantity * i.price } : i
    ),
  })),
  updatePrice: (id, price) => set((state) => ({
    items: state.items.map((i) =>
      i.id === id ? { ...i, price, total: i.quantity * price } : i
    ),
  })),
  clearCart: () => set({ items: [] }),
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
  transactions: UdharTransaction[];
}

interface UdharStore {
  customers: UdharCustomer[];
  loading: boolean;
  fetchCustomers: () => Promise<void>;
  addCustomer: (name: string, mobile: string) => Promise<string | number>;
  updateCustomer: (customerId: number | string, name: string, mobile: string) => Promise<void>;
  deleteCustomer: (customerId: number | string) => Promise<void>;
  addTransaction: (customerId: number | string, tx: Omit<UdharTransaction, 'id'>) => Promise<void>;
  deleteTransaction: (customerId: number | string, txId: number | string) => Promise<void>;
  addUdharFromBill: (customerName: string, amount: number, billNumber: string) => Promise<void>;
  addUdharFromImport: (customerName: string, amount: number, note: string, date: string) => Promise<void>;
}

export const useUdharStore = create<UdharStore>((set, get) => ({
  customers: [],
  loading: false,

  fetchCustomers: async () => {
    set({ loading: true });
    try {
      const res = await api.get('/customers');
      set({ customers: res.data || [], loading: false });
    } catch (err) {
      set({ loading: false });
    }
  },

  addCustomer: async (name, mobile) => {
    const res = await api.post('/customers', { name, mobile });
    await get().fetchCustomers();
    return res.data.id;
  },

  updateCustomer: async (customerId, name, mobile) => {
    await api.put(`/customers/${customerId}`, { name, mobile });
    await get().fetchCustomers();
  },

  deleteCustomer: async (customerId) => {
    await api.delete(`/customers/${customerId}`);
    await get().fetchCustomers();
  },

  addTransaction: async (customerId, tx) => {
    await api.post(`/customers/${customerId}/transactions`, tx);
    await get().fetchCustomers();
  },

  deleteTransaction: async (customerId, txId) => {
    await api.delete(`/customers/${customerId}/transactions/${txId}`);
    await get().fetchCustomers();
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
  addItem: (item: Omit<StockItem, 'id' | 'archived'>) => Promise<void>;
  updateItem: (id: number | string, updates: Partial<Omit<StockItem, 'id'>>) => Promise<void>;
  removeItem: (id: number | string) => Promise<void>;
  toggleArchive: (id: number | string) => Promise<void>;
  adjustStock: (id: number | string, delta: number, note: string, pricing?: any) => Promise<void>;
  mergeFromImport: (items: any[], date: string) => Promise<void>;
  clearLog: () => void;
}

export const useStockStore = create<StockStore>((set, get) => ({
  items: [],
  log: [],
  loading: false,

  fetchStock: async () => {
    set({ loading: true });
    try {
      const res = await api.get('/products');
      const items = res.data.map((p: any) => ({
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
      }));

      // Fetch logs
      const logRes = await api.get('/products/logs/all');
      const log = (logRes.data || []).map((l: any) => ({
        id: l.id,
        itemName: l.product_name || l.products?.name || 'Product',
        type: l.type,
        qty: l.quantity,
        note: l.note,
        time: l.createdAt ? new Date(l.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
        date: l.createdAt ? new Date(l.createdAt).toLocaleDateString() : ''
      }));

      set({ items, log, loading: false });
    } catch (err) {
      set({ loading: false });
    }
  },

  addItem: async (item: any) => {
    await api.post('/products', {
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
    });
    await get().fetchStock();
  },

  updateItem: async (id, updates: any) => {
    const backendUpdates: any = {};
    if (updates.name !== undefined) backendUpdates.name = updates.name;
    if (updates.category !== undefined) backendUpdates.category = updates.category;
    if (updates.current !== undefined) backendUpdates.current_stock = updates.current;
    if (updates.min !== undefined) backendUpdates.min_stock = updates.min;
    if (updates.unit !== undefined) backendUpdates.base_unit = updates.unit;
    
    await api.put(`/products/${id}`, backendUpdates);
    await get().fetchStock();
  },

  removeItem: async (id) => {
    await api.delete(`/products/${id}`);
    await get().fetchStock();
  },

  toggleArchive: async (id) => {
    const item = get().items.find(i => i.id === id);
    if (!item) return;
    await api.put(`/products/${id}`, { archived: !item.archived });
    await get().fetchStock();
  },

  adjustStock: async (id, delta, note, pricing?: any) => {
    await api.post(`/products/${id}/adjust`, {
      quantity: delta,
      type: delta > 0 ? 'in' : 'out',
      note
    });

    if (pricing && Object.keys(pricing).length > 0) {
      const updates: any = {};
      if (pricing.mrp !== undefined) updates.mrp = pricing.mrp;
      if (pricing.sellingPrice !== undefined) updates.selling_price = pricing.sellingPrice;
      if (pricing.cost !== undefined) updates.wholesale_cost = pricing.cost;
      await api.put(`/products/${id}`, updates);
    }
    await get().fetchStock();
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
          category: 'Imported',
          current: Number(item.quantity),
          min: 10,
          unit: item.unit || 'Unit',
          mrp: Number(item.price) || 0,
          sellingPrice: Number(item.price) || 0,
          cost: 0,
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
  quantity: number;
  unit?: string;
  price: number;
}

export interface ImportedSaleEntry {
  date?: string;
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
