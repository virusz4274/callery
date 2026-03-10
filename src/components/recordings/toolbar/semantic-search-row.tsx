import React from 'react';
import { Button, SearchField } from '@heroui/react';
import { X } from 'lucide-react';

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
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
            <div className="flex-1 w-full">
                <label className="text-small font-medium text-default-700 mb-1 block">🔍 AI Search (Semantic)</label>
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        onSemanticSearch();
                    }}
                    className="flex gap-2"
                >
                    <SearchField
                        aria-label="Semantic search recordings"
                        value={semanticQuery}
                        onChange={onSemanticQueryChange}
                        className="flex-1"
                    >
                        <SearchField.Group className="bg-default-50 border border-default-200 rounded-lg shadow-sm focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20 transition-all overflow-hidden flex items-center px-3 h-11">
                            <SearchField.SearchIcon className="text-default-400 mr-2" />
                            <SearchField.Input
                                className="bg-transparent border-none focus:ring-0 text-small w-full p-0 placeholder:text-default-400"
                                placeholder="Ask AI: 'calls about pricing', 'meetings with John'..."
                            />
                            <SearchField.ClearButton />
                        </SearchField.Group>
                    </SearchField>
                    <Button
                        type="submit"
                        isDisabled={isSemanticSearching || !semanticQuery.trim()}
                        className="bg-primary text-primary-foreground font-medium px-6"
                    >
                        {isSemanticSearching ? 'Searching...' : 'Search'}
                    </Button>
                    {semanticResultsCount !== undefined && (
                        <Button variant="ghost" onPress={onClearSemanticSearch} className="text-danger" size="sm">
                            <X className="w-4 h-4 mr-1" /> Clear ({semanticResultsCount})
                        </Button>
                    )}
                </form>
            </div>
        </div>
    );
}
