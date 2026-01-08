'use client';

import { useState, useCallback } from 'react';

/**
 * Generic selection state for tables/lists.
 * Manages multi-select functionality with select all and toggle individual items.
 * 
 * @template T The type of items being selected (must have an `id` property)
 */
export interface UseTableSelectionOptions<T extends { id: string }> {
    /** Array of all items that can be selected */
    items: T[];
}

export interface UseTableSelectionResult<T extends { id: string }> {
    /** Set of selected item IDs */
    selectedIds: Set<string>;
    /** Number of selected items */
    selectedCount: number;
    /** Whether all current items are selected */
    isAllSelected: boolean;
    /** Whether some (but not all) items are selected */
    isIndeterminate: boolean;
    /** Check if a specific item is selected */
    isSelected: (id: string) => boolean;
    /** Toggle selection of a single item */
    toggleSelect: (id: string) => void;
    /** Toggle selection of all items */
    toggleSelectAll: () => void;
    /** Clear all selections */
    clearSelection: () => void;
    /** Select specific items by ID */
    selectItems: (ids: string[]) => void;
    /** Get the selected items */
    getSelectedItems: () => T[];
}

/**
 * Hook for managing table/list selection state.
 * 
 * @example
 * ```tsx
 * const { selectedIds, toggleSelect, toggleSelectAll, clearSelection } = useTableSelection({
 *   items: recordings,
 * });
 * ```
 */
export function useTableSelection<T extends { id: string }>({
    items,
}: UseTableSelectionOptions<T>): UseTableSelectionResult<T> {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const selectedCount = selectedIds.size;
    const isAllSelected = items.length > 0 && selectedIds.size === items.length;
    const isIndeterminate = selectedIds.size > 0 && selectedIds.size < items.length;

    const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

    const toggleSelect = useCallback((id: string) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    }, []);

    const toggleSelectAll = useCallback(() => {
        if (selectedIds.size === items.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(items.map(item => item.id)));
        }
    }, [items, selectedIds.size]);

    const clearSelection = useCallback(() => {
        setSelectedIds(new Set());
    }, []);

    const selectItems = useCallback((ids: string[]) => {
        setSelectedIds(new Set(ids));
    }, []);

    const getSelectedItems = useCallback(() => {
        return items.filter(item => selectedIds.has(item.id));
    }, [items, selectedIds]);

    return {
        selectedIds,
        selectedCount,
        isAllSelected,
        isIndeterminate,
        isSelected,
        toggleSelect,
        toggleSelectAll,
        clearSelection,
        selectItems,
        getSelectedItems,
    };
}
