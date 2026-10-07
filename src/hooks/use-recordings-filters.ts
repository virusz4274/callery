'use client';

import { useCallback } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';
import { buildCurrentPath } from '@/lib/auth-redirect';

export function useRecordingsFilters() {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const createQueryString = useCallback(
        (updates: Record<string, string | undefined>) => {
            const params = new URLSearchParams(searchParams.toString());
            for (const [name, value] of Object.entries(updates)) {
                if (value) {
                    params.set(name, value);
                } else {
                    params.delete(name);
                }
            }
            return params.toString();
        },
        [searchParams]
    );

    const updateUrl = useCallback(
        (updates: Record<string, string | undefined>) => {
            const query = createQueryString(updates);
            const url = query ? `${pathname}?${query}` : pathname;
            if ('q' in updates && Object.keys(updates).every(key => ['q', 'view', 'collection', 'page'].includes(key))) {
                window.history.replaceState(null, '', url);
            } else {
                window.history.pushState(null, '', url);
            }
        },
        [pathname, createQueryString]
    );

    const page = Number(searchParams.get('page')) || 1;
    const limit = Number(searchParams.get('limit')) || 10;
    const search = searchParams.get('q') || '';
    const sortBy = (searchParams.get('sortBy') as 'date' | 'duration') || 'date';
    const sortOrder = (searchParams.get('order') as 'asc' | 'desc') || 'desc';
    const startDate = searchParams.get('start') || undefined;
    const endDate = searchParams.get('end') || undefined;
    const contactId = searchParams.get('contact') || undefined;
    const activeViewId = searchParams.get('view') || undefined;
    const activeSmartCollectionId = searchParams.get('collection') || undefined;
    const linkedRecordingId = searchParams.get('id') || undefined;
    const redirectPath = buildCurrentPath(pathname, searchParams.toString());

    const handlePageChange = useCallback(
        (newPage: number) => updateUrl({ page: newPage.toString() }),
        [updateUrl]
    );

    const handleSearchChange = useCallback(
        (val: string) => updateUrl({ q: val || undefined, view: undefined, collection: undefined, page: '1' }),
        [updateUrl]
    );

    const handleSortChange = useCallback(
        (by: string, order: string) =>
            updateUrl({ sortBy: by, order, view: undefined, collection: undefined, page: '1' }),
        [updateUrl]
    );

    const handleDateChange = useCallback(
        (start?: string, end?: string) =>
            updateUrl({
                start: start || undefined,
                end: end || undefined,
                view: undefined,
                collection: undefined,
                page: '1',
            }),
        [updateUrl]
    );

    const handleContactChange = useCallback(
        (id?: string) =>
            updateUrl({ contact: id || undefined, view: undefined, collection: undefined, page: '1' }),
        [updateUrl]
    );

    const applySmartCollection = useCallback(
        (collectionId: string) => {
            const today = new Date();
            const toDate = today.toISOString().slice(0, 10);
            const fromDate = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

            if (collectionId === 'recent-week') {
                updateUrl({
                    start: fromDate,
                    end: toDate,
                    sortBy: 'date',
                    order: 'desc',
                    collection: collectionId,
                    view: undefined,
                    page: '1',
                });
                return;
            }
            if (collectionId === 'longest-calls') {
                updateUrl({ sortBy: 'duration', order: 'desc', collection: collectionId, view: undefined, page: '1' });
                return;
            }
            if (collectionId === 'needs-transcription') {
                updateUrl({ collection: collectionId, view: undefined, page: '1' });
            }
        },
        [updateUrl]
    );

    return {
        page,
        limit,
        search,
        sortBy,
        sortOrder,
        startDate,
        endDate,
        contactId,
        activeViewId,
        activeSmartCollectionId,
        linkedRecordingId,
        redirectPath,
        updateUrl,
        handlePageChange,
        handleSearchChange,
        handleSortChange,
        handleDateChange,
        handleContactChange,
        applySmartCollection,
    };
}
