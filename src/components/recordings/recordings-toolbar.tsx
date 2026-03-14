'use client';

import React from 'react';
import { Surface } from '@heroui/react';
import { SearchSortRow } from './toolbar/search-sort-row';
import { SavedViewsRow } from './toolbar/saved-views-row';
import type { RecordingsToolbarProps } from './toolbar/types';
import { useIsMobile } from '@/hooks/use-mobile';

export function RecordingsToolbar(props: RecordingsToolbarProps) {
    const isMobile = useIsMobile();
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
            variant="default"
            className="sticky top-[calc(env(safe-area-inset-top)+4.5rem)] z-20 rounded-[1.5rem] border border-default-200/80 bg-background/92 p-3 shadow-[0_18px_48px_-42px_rgba(15,23,42,0.45)] backdrop-blur md:top-4 md:rounded-[1.75rem] md:bg-linear-to-r md:from-primary/6 md:via-background md:to-secondary/6 md:p-4"
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
                    supplementalActions={isMobile ? savedViewsControl : null}
                />

                {!isMobile && <div className="border-t border-default-100/80 pt-3">{savedViewsControl}</div>}
            </div>
        </Surface>
    );
}
