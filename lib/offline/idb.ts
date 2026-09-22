'use client';

/**
 * Native IndexedDB Storage Engine for Vyapar Sarthii
 * Database: vyapar_sarthi_offline_db
 * Version: 1
 */

const DB_NAME = 'vyapar_sarthi_offline_db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openOfflineDB(): Promise<IDBDatabase> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('IndexedDB is only available in browser environment.'));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;

      // 1. Auth Session store (keyed by shopId)
      if (!db.objectStoreNames.contains('auth_session')) {
        db.createObjectStore('auth_session', { keyPath: 'shopId' });
      }

      // 2. Outbox / Sync Queue store
      if (!db.objectStoreNames.contains('outbox')) {
        const outboxStore = db.createObjectStore('outbox', { keyPath: 'localTransactionId' });
        outboxStore.createIndex('by_shop', 'shopId', { unique: false });
        outboxStore.createIndex('by_shop_status', ['shopId', 'status'], { unique: false });
        outboxStore.createIndex('by_idempotency', 'idempotencyKey', { unique: false });
        outboxStore.createIndex('by_created_at', 'createdAt', { unique: false });
      }

      // 3. Products store
      if (!db.objectStoreNames.contains('products')) {
        const store = db.createObjectStore('products', { keyPath: 'compoundKey' });
        store.createIndex('by_shop', 'shopId', { unique: false });
        store.createIndex('by_id', 'id', { unique: false });
        store.createIndex('by_barcode', ['shopId', 'barcode'], { unique: false });
        store.createIndex('by_category', ['shopId', 'category'], { unique: false });
      }

      // 4. Customers store
      if (!db.objectStoreNames.contains('customers')) {
        const store = db.createObjectStore('customers', { keyPath: 'compoundKey' });
        store.createIndex('by_shop', 'shopId', { unique: false });
        store.createIndex('by_id', 'id', { unique: false });
        store.createIndex('by_mobile', ['shopId', 'mobile'], { unique: false });
      }

      // 5. Suppliers store
      if (!db.objectStoreNames.contains('suppliers')) {
        const store = db.createObjectStore('suppliers', { keyPath: 'compoundKey' });
        store.createIndex('by_shop', 'shopId', { unique: false });
        store.createIndex('by_id', 'id', { unique: false });
      }

      // 6. Invoices store (Sales)
      if (!db.objectStoreNames.contains('invoices')) {
        const store = db.createObjectStore('invoices', { keyPath: 'compoundKey' });
        store.createIndex('by_shop', 'shopId', { unique: false });
        store.createIndex('by_id', 'id', { unique: false });
        store.createIndex('by_invoice_num', ['shopId', 'invoice_number'], { unique: false });
        store.createIndex('by_offline_ref', ['shopId', 'offlineRefNumber'], { unique: false });
      }

      // 7. Purchases store
      if (!db.objectStoreNames.contains('purchases')) {
        const store = db.createObjectStore('purchases', { keyPath: 'compoundKey' });
        store.createIndex('by_shop', 'shopId', { unique: false });
        store.createIndex('by_id', 'id', { unique: false });
      }

      // 8. Stock Movements store
      if (!db.objectStoreNames.contains('stock_movements')) {
        const store = db.createObjectStore('stock_movements', { keyPath: 'compoundKey' });
        store.createIndex('by_shop', 'shopId', { unique: false });
        store.createIndex('by_product', ['shopId', 'productId'], { unique: false });
      }

      // 9. Mill Entries store
      if (!db.objectStoreNames.contains('mill_entries')) {
        const store = db.createObjectStore('mill_entries', { keyPath: 'compoundKey' });
        store.createIndex('by_shop', 'shopId', { unique: false });
        store.createIndex('by_type', ['shopId', 'entryType'], { unique: false });
      }

      // 10. Sync Metadata store
      if (!db.objectStoreNames.contains('sync_metadata')) {
        db.createObjectStore('sync_metadata', { keyPath: 'compoundKey' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });

  return dbPromise;
}

// ── Generic IndexedDB Operations ──

export async function idbGet<T>(storeName: string, key: IDBValidKey): Promise<T | null> {
  const db = await openOfflineDB();
  return new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function idbPut<T>(storeName: string, value: T): Promise<void> {
  const db = await openOfflineDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function idbDelete(storeName: string, key: IDBValidKey): Promise<void> {
  const db = await openOfflineDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function idbGetAllByShop<T>(storeName: string, shopId: string): Promise<T[]> {
  const db = await openOfflineDB();
  return new Promise<T[]>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    if (!store.indexNames.contains('by_shop')) {
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result || []).filter((item: any) => item.shopId === shopId));
      req.onerror = () => reject(req.error);
      return;
    }
    const index = store.index('by_shop');
    const req = index.getAll(shopId);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function idbBulkPut<T>(storeName: string, items: T[]): Promise<void> {
  if (!items || items.length === 0) return;
  const db = await openOfflineDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    for (const item of items) {
      store.put(item);
    }
  });
}

export async function idbClearShopData(storeName: string, shopId: string): Promise<void> {
  const items = await idbGetAllByShop<any>(storeName, shopId);
  if (!items || items.length === 0) return;
  const db = await openOfflineDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    for (const item of items) {
      const key = item.compoundKey || item.localTransactionId || item.shopId;
      if (key) store.delete(key);
    }
  });
}

export async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openOfflineDB();
  return new Promise<T[]>((resolve, reject) => {
    const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/** Delete every record in a store for which `shouldDelete` returns true. */
export async function idbDeleteWhere<T>(storeName: string, shouldDelete: (item: T) => boolean): Promise<void> {
  const db = await openOfflineDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) return;
      if (shouldDelete(cursor.value as T)) cursor.delete();
      cursor.continue();
    };
  });
}
