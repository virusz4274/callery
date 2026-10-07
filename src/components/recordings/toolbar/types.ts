import type { Contact } from '@/lib/types';
import type { SemanticFallbackReason, SemanticSearchMode } from '@/lib/db/search';

export type SavedRecordingsView = {
    needsTranscription?: boolean;
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
    onApplyMobileFilters: (filters: MobileRecordingFilters) => void;
    searchMode: 'text' | 'semantic';
    onSearchModeChange: (mode: 'text' | 'semantic') => void;
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
    semanticSubmittedQuery?: string;
    semanticError?: string;
    onRetrySemanticSearch: () => void;
    onSemanticQueryChange: (val: string) => void;
    onSemanticSearch: () => void;
    onClearSemanticSearch: () => void;
    isSemanticSearching: boolean;
    semanticResultsCount?: number;
    semanticSearchMode?: SemanticSearchMode;
    semanticFallbackReason?: SemanticFallbackReason;
    savedViews: SavedRecordingsView[];
    activeViewId?: string;
    smartCollections: SmartCollection[];
    activeSmartCollectionId?: string;
    onApplySavedView: (viewId: string) => void;
    onDeleteSavedView: (viewId: string) => void;
    onSaveCurrentView: (name: string) => void;
    onApplySmartCollection: (collectionId: string) => void;
    density: 'comfortable' | 'dense';
    onDensityChange: (density: 'comfortable' | 'dense') => void;
    onResetAll: () => void;
};

export type MobileRecordingFilters = {
    search: string;
    contactId?: string;
    startDate?: string;
    endDate?: string;
    sortBy: 'date' | 'duration';
    sortOrder: 'asc' | 'desc';
    density: 'comfortable' | 'dense';
    viewId?: string;
    collectionId?: string;
};
