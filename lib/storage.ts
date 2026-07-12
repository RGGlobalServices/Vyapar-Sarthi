'use client';

/**
 * Ensures a key is prefixed with the active shop ID to prevent cross-shop data leaks.
 */
const getShopKey = (shopId: string, key: string) => {
  if (!shopId) return key;
  return `${key}_${shopId}`;
};

export const setShopLocalItem = (shopId: string, key: string, value: string) => {
  if (typeof window !== 'undefined' && shopId) {
    localStorage.setItem(getShopKey(shopId, key), value);
  }
};

export const getShopLocalItem = (shopId: string, key: string): string | null => {
  if (typeof window !== 'undefined' && shopId) {
    return localStorage.getItem(getShopKey(shopId, key));
  }
  return null;
};

export const removeShopLocalItem = (shopId: string, key: string) => {
  if (typeof window !== 'undefined' && shopId) {
    localStorage.removeItem(getShopKey(shopId, key));
  }
};
