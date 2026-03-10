'use client';

import React from 'react';
import { SemanticSearchRow } from './toolbar/semantic-search-row';
import { SearchSortRow } from './toolbar/search-sort-row';
import type { RecordingsToolbarProps } from './toolbar/types';

export function RecordingsToolbar(props: RecordingsToolbarProps) {
    return (
        <div className="flex flex-col gap-4 p-4 border rounded-xl bg-background/50 shadow-sm backdrop-blur-sm">
            <SemanticSearchRow
                semanticQuery={props.semanticQuery}
                onSemanticQueryChange={props.onSemanticQueryChange}
                onSemanticSearch={props.onSemanticSearch}
                onClearSemanticSearch={props.onClearSemanticSearch}
                isSemanticSearching={props.isSemanticSearching}
                semanticResultsCount={props.semanticResultsCount}
            />

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
        </div>
    );
}
