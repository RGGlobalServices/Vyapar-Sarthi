import { useState, useCallback, useMemo } from 'react';

/**
 * Shared multi-select state for a list of row ids — the same toggle/toggle-all
 * logic that lived only inside WholesaleProductsUI.tsx, generalized so every
 * module's bulk-delete UI can reuse one implementation instead of re-deriving
 * it per page.
 */
export function useRowSelection(visibleIds: string[]) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds(prev => {
      const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => prev.includes(id));
      return allVisibleSelected ? prev.filter(id => !visibleIds.includes(id)) : Array.from(new Set([...prev, ...visibleIds]));
    });
  }, [visibleIds]);

  const clear = useCallback(() => setSelectedIds([]), []);

  const isAllSelected = useMemo(
    () => visibleIds.length > 0 && visibleIds.every(id => selectedIds.includes(id)),
    [visibleIds, selectedIds]
  );

  return { selectedIds, isAllSelected, toggleOne, toggleAll, clear, setSelectedIds };
}
