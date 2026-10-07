import { Button } from '@heroui/react';
import type { RecordingsToolbarProps } from './types';

export function SemanticFeedback(props: RecordingsToolbarProps) {
    if (props.searchMode !== 'semantic') return null;
    return <div className="space-y-2 text-sm text-muted">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <p>AI searches your library by meaning. Matches are ranked by relevance.</p>
            <Button variant="ghost" size="sm" className="min-h-11 md:min-h-8" onPress={props.onClearSemanticSearch}>Return to library</Button>
        </div>
        {props.isSemanticSearching && <p role="status">Searching recordings…</p>}
        {props.semanticSubmittedQuery && <p>Results for “{props.semanticSubmittedQuery}”</p>}
        {props.semanticSearchMode === 'fallback' && <p role="status">AI search is unavailable. Showing keyword matches from summaries and transcripts.</p>}
        {props.semanticError && <div role="alert" className="flex flex-wrap items-center gap-2 text-danger"><span>{props.semanticError}</span><Button variant="secondary" size="sm" onPress={props.onRetrySemanticSearch} isDisabled={props.isSemanticSearching}>Try again</Button></div>}
    </div>;
}
