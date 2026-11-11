import { Button } from '@heroui/react';
import type { RecordingsToolbarProps } from './types';

export function SemanticFeedback(props: RecordingsToolbarProps) {
    if (props.searchMode !== 'semantic') return null;
    return <div className="space-y-2 text-sm text-muted">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <p>Search what was said, even when you remember it in different words.</p>
            <Button variant="ghost" size="sm" className="min-h-11 md:min-h-8" onPress={props.onClearSemanticSearch}>Return to library</Button>
        </div>
        {props.isSemanticSearching && <p role="status">Searching recordings…</p>}
        {props.semanticSubmittedQuery && <p>Results for “{props.semanticSubmittedQuery}”</p>}
        {props.semanticCoverage && props.semanticCoverage.total > 0 && <p role="status">
            {props.semanticCoverage.ready} of {props.semanticCoverage.total} recordings ready for search by meaning.
            {props.semanticCoverage.pending > 0 ? ` ${props.semanticCoverage.pending} need indexing or have indexing in progress.` : ''}
            {props.semanticCoverage.failed > 0 ? ` ${props.semanticCoverage.failed} need processing attention.` : ''}
        </p>}
        {props.semanticResultLimit && <p>Search by meaning ranks up to {props.semanticResultLimit} conversations. Narrow the contact or date filters to search a smaller collection.</p>}
        {props.semanticSearchMode === 'fallback' && <p role="status">{props.semanticFallbackReason === 'processing_paused'
            ? 'AI processing is temporarily paused. Showing keyword matches from summaries and transcripts.'
            : props.semanticFallbackReason === 'query_too_long'
                ? 'Use a shorter description for search by meaning. Showing keyword matches for your full query.'
            : props.semanticFallbackReason === 'search_rate_limited'
                ? 'Too many AI searches. Showing keyword matches; try AI search again shortly.'
                : 'AI search is unavailable. Showing keyword matches from summaries and transcripts.'}</p>}
        {props.semanticError && <div role="alert" className="flex flex-wrap items-center gap-2 text-danger"><span>{props.semanticError}</span><Button variant="secondary" size="sm" onPress={props.onRetrySemanticSearch} isDisabled={props.isSemanticSearching}>Try again</Button></div>}
    </div>;
}
