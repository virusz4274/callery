import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { SortDirection, SortField, SyncableFile } from './types';
import {
    deselectAllFiles,
    filterAndSortFiles,
    getSelectionMetrics,
    paginateFiles,
    selectAllPendingFiles,
    setSelectionByFingerprints,
    toggleFileSelection,
} from './sync-list-utils';

type UseSyncListStateOptions = {
    files: SyncableFile[];
    setFiles: Dispatch<SetStateAction<SyncableFile[]>>;
};

export function useSyncListState({ files, setFiles }: UseSyncListStateOptions) {
    const [activeTab, setActiveTab] = useState<'new' | 'synced'>('new');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortField, setSortField] = useState<SortField>('mtime');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [page, setPage] = useState(1);

    const rowsPerPage = 50;

    const filteredFiles = useMemo(
        () => filterAndSortFiles(files, activeTab, searchQuery, sortField, sortDirection),
        [activeTab, files, searchQuery, sortDirection, sortField]
    );

    const paginatedFiles = useMemo(
        () => paginateFiles(filteredFiles, page, rowsPerPage),
        [filteredFiles, page, rowsPerPage]
    );

    const totalPages = Math.ceil(filteredFiles.length / rowsPerPage);

    const {
        pendingFiles,
        relevantFiles,
        selectedRelevantCount,
        totalRelevantCount,
        isAllSelected,
        isIndeterminate,
        pendingSize,
    } = useMemo(
        () => getSelectionMetrics(files, filteredFiles, searchQuery),
        [files, filteredFiles, searchQuery]
    );

    const toggleSelectAll = () => {
        const relevantFingerprints = new Set(relevantFiles.map((file) => file.fingerprint));
        setFiles((prev) => setSelectionByFingerprints(prev, relevantFingerprints, !isAllSelected));
    };

    const toggleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
        setPage(1);
    };

    const toggleSingleFileSelection = (fingerprint: string) => {
        setFiles((prev) => toggleFileSelection(prev, fingerprint));
    };

    const selectAllVisible = () => {
        const visibleFingerprints = new Set(
            paginatedFiles
                .filter((file) => file.status === 'pending' || file.status === 'error' || file.status === 'retrying')
                .map((file) => file.fingerprint)
        );
        setFiles((prev) => setSelectionByFingerprints(prev, visibleFingerprints, true));
    };

    const selectAllPending = () => {
        setFiles((prev) => selectAllPendingFiles(prev));
    };

    const deselectAll = () => {
        setFiles((prev) => deselectAllFiles(prev));
    };

    const setActiveTabWithReset = (tab: 'new' | 'synced') => {
        setActiveTab(tab);
        setPage(1);
    };

    const setSearchQueryWithReset = (value: string) => {
        setSearchQuery(value);
        setPage(1);
    };

    return {
        activeTab,
        deselectAll,
        filteredFiles,
        isAllSelected,
        isIndeterminate,
        page,
        paginatedFiles,
        pendingFiles,
        pendingSize,
        relevantFiles,
        searchQuery,
        selectedRelevantCount,
        setActiveTab: setActiveTabWithReset,
        setPage,
        setSearchQuery: setSearchQueryWithReset,
        selectAllPending,
        selectAllVisible,
        sortDirection,
        sortField,
        toggleFileSelection: toggleSingleFileSelection,
        toggleSelectAll,
        toggleSort,
        totalPages,
        totalRelevantCount,
    };
}
