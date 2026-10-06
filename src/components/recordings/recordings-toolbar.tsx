'use client';

import { Surface } from '@heroui/react';
import { SearchSortRow } from './toolbar/search-sort-row';
import { SavedViewsRow } from './toolbar/saved-views-row';
import type { RecordingsToolbarProps } from './toolbar/types';

export function RecordingsToolbar(props: RecordingsToolbarProps) {
    const savedViewsControl = (
        <SavedViewsRow
            savedViews={props.savedViews}
            activeViewId={props.activeViewId}
            smartCollections={props.smartCollections}
            activeSmartCollectionId={props.activeSmartCollectionId}
            onApplySavedView={props.onApplySavedView}
            onDeleteSavedView={props.onDeleteSavedView}
            onSaveCurrentView={props.onSaveCurrentView}
            onApplySmartCollection={props.onApplySmartCollection}
        />
    );

    return (
        <Surface
            id="semantic-search"
            variant="default"
            className="scroll-mt-24 rounded-xl border border-border bg-surface p-4 shadow-none"
        >
            <div className="space-y-3 md:space-y-4">
                <SearchSortRow
                    searchMode={props.searchMode}
                    onSearchModeChange={props.onSearchModeChange}
                    search={props.search}
                    onSearchChange={props.onSearchChange}
                    sortBy={props.sortBy}
                    sortOrder={props.sortOrder}
                    onSortChange={props.onSortChange}
                    contacts={props.contacts}
                    contactId={props.contactId}
                    onContactChange={props.onContactChange}
                    startDate={props.startDate}
                    endDate={props.endDate}
                    onDateChange={props.onDateChange}
                    semanticQuery={props.semanticQuery}
                    onSemanticQueryChange={props.onSemanticQueryChange}
                    onSemanticSearch={props.onSemanticSearch}
                    onClearSemanticSearch={props.onClearSemanticSearch}
                    isSemanticSearching={props.isSemanticSearching}
                    semanticResultsCount={props.semanticResultsCount}
                    semanticSearchMode={props.semanticSearchMode}
                    semanticFallbackReason={props.semanticFallbackReason}
                    density={props.density}
                    onDensityChange={props.onDensityChange}
                    onResetAll={props.onResetAll}
                    supplementalActions={savedViewsControl}
                />

            </div>
        </Surface>
    );
}
