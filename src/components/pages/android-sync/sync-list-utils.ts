import type { SortDirection, SortField, SyncableFile } from './types';

export function filterAndSortFiles(
    files: SyncableFile[],
    activeTab: 'new' | 'synced',
    searchQuery: string,
    sortField: SortField,
    sortDirection: SortDirection
): SyncableFile[] {
    const filtered = files.filter((file) => {
        if (activeTab === 'new' && file.status === 'synced') {
            return false;
        }

        if (activeTab === 'synced' && file.status !== 'synced') {
            return false;
        }

        if (!searchQuery) {
            return true;
        }

        return file.name.toLowerCase().includes(searchQuery.toLowerCase());
    });

    filtered.sort((a, b) => {
        let comparison = 0;

        if (sortField === 'name') {
            comparison = a.name.localeCompare(b.name);
        } else if (sortField === 'size') {
            comparison = a.size - b.size;
        } else if (sortField === 'mtime') {
            comparison = a.mtime - b.mtime;
        }

        return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
}

export function paginateFiles(files: SyncableFile[], page: number, rowsPerPage: number): SyncableFile[] {
    const start = (page - 1) * rowsPerPage;
    return files.slice(start, start + rowsPerPage);
}

export function getSelectionMetrics(
    files: SyncableFile[],
    filteredFiles: SyncableFile[],
    searchQuery: string
) {
    const pendingFiles = files.filter((file) => file.status === 'pending' || file.status === 'error');
    const relevantFiles = searchQuery
        ? filteredFiles.filter((file) => file.status === 'pending' || file.status === 'error')
        : pendingFiles;
    const selectedRelevantCount = relevantFiles.filter((file) => file.selected).length;
    const totalRelevantCount = relevantFiles.length;

    return {
        pendingFiles,
        relevantFiles,
        selectedRelevantCount,
        totalRelevantCount,
        isAllSelected: totalRelevantCount > 0 && selectedRelevantCount === totalRelevantCount,
        isIndeterminate: selectedRelevantCount > 0 && selectedRelevantCount < totalRelevantCount,
        pendingSize: pendingFiles.reduce((acc, file) => acc + file.size, 0),
    };
}

export function setSelectionByFingerprints(
    files: SyncableFile[],
    fingerprints: Set<string>,
    selected: boolean
): SyncableFile[] {
    return files.map((file) =>
        fingerprints.has(file.fingerprint) ? { ...file, selected } : file
    );
}

export function toggleFileSelection(files: SyncableFile[], fingerprint: string): SyncableFile[] {
    return files.map((file) =>
        file.fingerprint === fingerprint ? { ...file, selected: !file.selected } : file
    );
}

export function selectAllPendingFiles(files: SyncableFile[]): SyncableFile[] {
    return files.map((file) =>
        file.status === 'pending' || file.status === 'error' ? { ...file, selected: true } : file
    );
}

export function deselectAllFiles(files: SyncableFile[]): SyncableFile[] {
    return files.map((file) => ({ ...file, selected: false }));
}
