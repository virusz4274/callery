import React from 'react';
import { Button, Chip, SearchField, Surface } from '@heroui/react';
import { Sparkles, X } from 'lucide-react';

type SemanticSearchRowProps = {
    semanticQuery: string;
    onSemanticQueryChange: (value: string) => void;
    onSemanticSearch: () => void;
    onClearSemanticSearch: () => void;
    isSemanticSearching: boolean;
    semanticResultsCount?: number;
};

export function SemanticSearchRow({
    semanticQuery,
    onSemanticQueryChange,
    onSemanticSearch,
    onClearSemanticSearch,
    isSemanticSearching,
    semanticResultsCount,
}: SemanticSearchRowProps) {
    return (
        <Surface
            id="semantic-search"
            variant="default"
            className="rounded-[1.75rem] border border-default-200/80 bg-linear-to-r from-primary/6 via-background to-secondary/6 p-5 shadow-[0_18px_48px_-42px_rgba(15,23,42,0.45)]"
        >
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
                            <Sparkles className="h-3.5 w-3.5" />
                            Semantic search
                        </div>
                        <div>
                            <h3 className="text-xl font-bold tracking-[-0.03em] text-foreground">
                                Search by meaning, not just by exact words.
                            </h3>
                            <p className="mt-1 text-sm leading-6 text-default-600">
                                Use this when you want themes like invoice disputes, payment
                                confirmations, or older calls that you do not remember by date.
                            </p>
                        </div>
                    </div>

                    {semanticResultsCount !== undefined && (
                        <Chip variant="soft" color="accent" className="self-start rounded-full">
                            {semanticResultsCount} semantic match{semanticResultsCount === 1 ? '' : 'es'}
                        </Chip>
                    )}
                </div>

                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        onSemanticSearch();
                    }}
                    className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end"
                >
                    <SearchField
                        aria-label="Semantic search recordings"
                        value={semanticQuery}
                        onChange={onSemanticQueryChange}
                        className="w-full"
                        variant="secondary"
                    >
                        <SearchField.Group className="flex h-12 items-center overflow-hidden rounded-2xl border border-default-200 bg-background px-3 transition-all focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20">
                            <SearchField.SearchIcon className="text-default-400 mr-2" />
                            <SearchField.Input
                                className="bg-transparent border-none focus:ring-0 text-small w-full p-0 placeholder:text-default-400"
                                placeholder="Search by meaning: 'payment confirmation calls', 'calls with John'..."
                            />
                            <SearchField.ClearButton />
                        </SearchField.Group>
                    </SearchField>
                    <Button
                        type="submit"
                        isDisabled={isSemanticSearching || !semanticQuery.trim()}
                        className="h-12 rounded-full px-6 font-medium"
                    >
                        {isSemanticSearching ? 'Searching...' : 'Search'}
                    </Button>
                    {semanticResultsCount !== undefined && (
                        <Button
                            variant="ghost"
                            onPress={onClearSemanticSearch}
                            className="h-12 rounded-full text-danger"
                        >
                            <X className="w-4 h-4 mr-1" /> Clear search view
                        </Button>
                    )}
                </form>
            </div>
        </Surface>
    );
}
