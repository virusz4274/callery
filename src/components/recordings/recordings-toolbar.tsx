'use client';

import React from 'react';
import { Surface } from '@heroui/react';
import { SemanticSearchRow } from './toolbar/semantic-search-row';
import { SearchSortRow } from './toolbar/search-sort-row';
import { SavedViewsRow } from './toolbar/saved-views-row';
import type { RecordingsToolbarProps } from './toolbar/types';

export function RecordingsToolbar(props: RecordingsToolbarProps) {
    return (
        <div className="space-y-4">
            <SemanticSearchRow
                semanticQuery={props.semanticQuery}
                onSemanticQueryChange={props.onSemanticQueryChange}
                onSemanticSearch={props.onSemanticSearch}
                onClearSemanticSearch={props.onClearSemanticSearch}
                isSemanticSearching={props.isSemanticSearching}
                semanticResultsCount={props.semanticResultsCount}
            />

            <Surface
                variant="default"
                className="rounded-[1.75rem] border border-default-200/80 p-5 shadow-[0_18px_48px_-42px_rgba(15,23,42,0.45)]"
            >
                <div className="space-y-5">
                    <SearchSortRow
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
                    />

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
                </div>
            </Surface>
        </div>
    );
}
