'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { mutate } from 'swr';
import { useBusinessStore } from '@/lib/businessStore';
import toast from 'react-hot-toast';

export function useRealtimeSync() {
  const { profile } = useBusinessStore();
  const shopId = profile?.id;

  useEffect(() => {
    if (!shopId) return;

    // Listen to all public schema changes where shopId matches ours.
    // Supabase will broadcast these if the table is realtime-enabled.
    const channel = supabase
      .channel(`shop_sync_${shopId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'Sale', filter: `shopId=eq.${shopId}` },
        () => handleSync('New Sale Activity Detected!')
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'PurchaseInvoice', filter: `shopId=eq.${shopId}` },
        () => handleSync('Purchase recorded!')
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'CashBook', filter: `shopId=eq.${shopId}` },
        () => handleSync('Cash flow updated!')
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'StockMovement', filter: `shopId=eq.${shopId}` },
        () => handleSync('Inventory levels changed!')
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ActivityLog', filter: `shopId=eq.${shopId}` },
        () => handleSync() // Silent refresh for minor activity logs
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime Sync] Connected for shop ${shopId}`);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shopId]);

  const handleSync = (message?: string) => {
    // Revalidate ALL SWR keys (undefined key match revalidates everything in SWR globally)
    mutate(() => true, undefined, { revalidate: true });
    
    // Optional toast notification on major events
    if (message) {
      toast.success(message, { 
        id: 'realtime_sync', 
        icon: '🔄',
        duration: 2000 
      });
    }
  };
}
