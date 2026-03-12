import type { Contact } from '@/lib/types';

export type SavedRecordingsView = {
    id: string;
    name: string;
    search?: string;
    sortBy: 'date' | 'duration';
    sortOrder: 'asc' | 'desc';
    startDate?: string;
    endDate?: string;
    contactId?: string;
};

export type SmartCollection = {
    id: string;
    name: string;
    description: string;
};

export type RecordingsToolbarProps = {
    search: string;
    onSearchChange: (val: string) => void;
    sortBy: 'date' | 'duration';
    sortOrder: 'asc' | 'desc';
    onSortChange: (by: string, order: string) => void;
    startDate?: string;
    endDate?: string;
    onDateChange: (start?: string, end?: string) => void;
    contacts: Contact[];
    contactId?: string;
    onContactChange: (id?: string) => void;
    semanticQuery: string;
    onSemanticQueryChange: (val: string) => void;
    onSemanticSearch: () => void;
    onClearSemanticSearch: () => void;
    isSemanticSearching: boolean;
    semanticResultsCount?: number;
    savedViews: SavedRecordingsView[];
    activeViewId?: string;
    smartCollections: SmartCollection[];
    activeSmartCollectionId?: string;
    onApplySavedView: (viewId: string) => void;
    onDeleteSavedView: (viewId: string) => void;
    onSaveCurrentView: (name: string) => void;
    onApplySmartCollection: (collectionId: string) => void;
};
