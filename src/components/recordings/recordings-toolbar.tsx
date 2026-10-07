'use client';

import { Surface } from '@heroui/react';
import { SearchSortRow } from './toolbar/search-sort-row';
import { SavedViewsRow } from './toolbar/saved-views-row';
import type { RecordingsToolbarProps } from './toolbar/types';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileRecordingsToolbar } from './toolbar/mobile-recordings-toolbar';

export function RecordingsToolbar(props: RecordingsToolbarProps) {
    const isMobile = useIsMobile();
    if (isMobile) return <MobileRecordingsToolbar {...props} />;
    return <Surface id="semantic-search" variant="default" className="scroll-mt-24 rounded-xl border border-border bg-surface p-3 shadow-none lg:p-4">
        <SearchSortRow {...props} supplementalActions={<SavedViewsRow
            savedViews={props.savedViews} activeViewId={props.activeViewId}
            smartCollections={props.smartCollections} activeSmartCollectionId={props.activeSmartCollectionId}
            onApplySavedView={props.onApplySavedView} onDeleteSavedView={props.onDeleteSavedView}
            onSaveCurrentView={props.onSaveCurrentView} onApplySmartCollection={props.onApplySmartCollection}
        />} />
    </Surface>;
}
