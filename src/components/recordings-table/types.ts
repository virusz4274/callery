
import { Recording, Contact } from '@/lib/types';
import type { useRecordingWorkspace } from '@/hooks/use-recording-workspace';

export type RecordingsTableProps = {
    emptyState?: RecordingEmptyState;
    semanticPagination?: { hasMore: boolean; isLoading: boolean };
    recordingWorkspace?: ReturnType<typeof useRecordingWorkspace>;
    recordings: Recording[];
    contacts: Contact[];
    page: number;
    setPage: (page: number) => void;
    totalCount: number;
    itemsPerPage: number;
    onRecordingsChange?: () => Promise<void> | void;
    onRetryTranscription?: (recording: Recording) => void;
    variant?: 'default' | 'flat';
    density?: 'comfortable' | 'dense';
};

export type RecordingEmptyState = { kind?: 'library' | 'filtered' | 'semantic'; onClear?: () => void };

export type TableSelectionState = {
    selectedIds: Set<string>;
    selectedCount: number;
    isAllSelected: boolean;
    isSelected: (id: string) => boolean;
    toggleSelect: (id: string) => void;
    toggleSelectAll: () => void;
    clearSelection: () => void;
    getSelectedItems: () => Recording[];
};
