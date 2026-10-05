
import { Recording, Contact } from '@/lib/types';

export type RecordingsTableProps = {
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
