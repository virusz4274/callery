'use client';

import React from 'react';
import {
    SearchField,
    Select,
    Button,
    ListBox
} from '@heroui/react';
import { Filter, Calendar as CalendarIcon, X, User, Search as SearchIcon } from 'lucide-react';
import { Contact } from '@/lib/types';

interface RecordingsToolbarProps {
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
    // Semantic Search
    semanticQuery: string;
    onSemanticQueryChange: (val: string) => void;
    onSemanticSearch: () => void;
    onClearSemanticSearch: () => void;
    isSemanticSearching: boolean;
    semanticResultsCount?: number;
}

export function RecordingsToolbar({
    search,
    onSearchChange,
    sortBy,
    sortOrder,
    onSortChange,
    startDate,
    endDate,
    onDateChange,
    contacts,
    contactId,
    onContactChange,
    semanticQuery,
    onSemanticQueryChange,
    onSemanticSearch,
    onClearSemanticSearch,
    isSemanticSearching,
    semanticResultsCount
}: RecordingsToolbarProps) {

    // Simple duration filter state could be local or lifted if complex
    // For now, let's keep it simple with just Date/Contact/Search 

    return (
        <div className="flex flex-col gap-4 p-4 border rounded-xl bg-background/50 shadow-sm backdrop-blur-sm">
            {/* Semantic Search Row */}
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
                <div className="flex-1 w-full">
                    <label className="text-small font-medium text-default-700 mb-1 block">
                        🔍 AI Search (Semantic)
                    </label>
                    <form onSubmit={(e) => { e.preventDefault(); onSemanticSearch(); }} className="flex gap-2">
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
                        <Button type="submit" isDisabled={isSemanticSearching || !semanticQuery.trim()} className="bg-primary text-primary-foreground font-medium px-6">
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

            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                {/* Text Search */}
                <div className="w-full md:max-w-md">
                    <label className="text-small font-medium text-default-500 mb-1 block">
                        Filter by text
                    </label>
                    <SearchField
                        aria-label="Filter recordings"
                        value={search}
                        onChange={onSearchChange}
                        className="w-full"
                    >
                        <SearchField.Group className="bg-default-50 border border-default-200 rounded-lg shadow-sm focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20 transition-all overflow-hidden flex items-center px-3 h-10">
                            <Filter className="w-4 h-4 text-default-400 mr-2" />
                            <SearchField.Input
                                className="bg-transparent border-none focus:ring-0 text-small w-full p-0 placeholder:text-default-400"
                                placeholder="Filter by name, notes..."
                            />
                            <SearchField.ClearButton />
                        </SearchField.Group>
                    </SearchField>
                </div>

                {/* Sort */}
                <div className="flex items-center gap-2 min-w-[200px]">
                    <span className="text-small text-default-500 font-medium">Sort by:</span>
                    <Select
                        className="flex-1"
                        aria-label="Sort options"
                        defaultSelectedKey={`${sortBy}-${sortOrder}`}
                        selectedKey={`${sortBy}-${sortOrder}`}
                        onSelectionChange={(keys) => {
                            if (!keys) return;
                            // Select returns a Set or Key, cast to any to be safe
                            const key = (typeof keys === 'string' ? keys : Array.from(keys as any)[0]) as string;
                            if (key) {
                                const [by, order] = key.split('-');
                                onSortChange(by, order);
                            }
                        }}
                    >
                        <Select.Trigger>
                            <Select.Value />
                            <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                            <ListBox selectionMode="single">
                                <ListBox.Item key="date-desc" id="date-desc">Newest First</ListBox.Item>
                                <ListBox.Item key="date-asc" id="date-asc">Oldest First</ListBox.Item>
                                <ListBox.Item key="duration-desc" id="duration-desc">Longest Duration</ListBox.Item>
                                <ListBox.Item key="duration-asc" id="duration-asc">Shortest Duration</ListBox.Item>
                            </ListBox>
                        </Select.Popover>
                    </Select>
                </div>
            </div>

            {/* Advanced Filters Row */}
            <div className="flex flex-wrap gap-4 items-center pt-2 border-t border-default-100">
                <div className="flex items-center gap-2 text-default-500">
                    <Filter className="w-4 h-4" />
                    <span className="text-small font-medium">Filters:</span>
                </div>

                {/* Date Range */}
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2">
                        <span className="text-small text-default-500">From:</span>
                        <input
                            type="date"
                            className="h-10 px-3 rounded-lg border border-default-200 bg-default-100 text-small focus:outline-none focus:ring-2 focus:ring-primary"
                            value={startDate || ''}
                            onChange={(e) => onDateChange(e.target.value || undefined, endDate)}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-small text-default-500">To:</span>
                        <input
                            type="date"
                            className="h-10 px-3 rounded-lg border border-default-200 bg-default-100 text-small focus:outline-none focus:ring-2 focus:ring-primary"
                            value={endDate || ''}
                            onChange={(e) => onDateChange(startDate, e.target.value || undefined)}
                        />
                    </div>
                </div>

                {/* Contact Filter - VIEW ONLY (Removed Selector) */}
                {contactId && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-lg border border-primary/20">
                        <User className="w-4 h-4 text-primary" />
                        <span className="text-small font-medium text-primary">
                            Contact: {contacts.find(c => c.id === contactId)?.name || 'Unknown'}
                        </span>
                        <Button
                            size="sm"
                            variant="ghost"
                            isIconOnly
                            className="w-4 h-4 min-w-4 text-primary/70 hover:text-primary"
                            onPress={() => onContactChange(undefined)}
                        >
                            <X className="w-3 h-3" />
                        </Button>
                    </div>
                )}

                {(startDate || endDate || contactId) && (
                    <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger"
                        onPress={() => {
                            onDateChange(undefined, undefined);
                            onContactChange(undefined);
                        }}
                    >
                        <X className="w-4 h-4 mr-1" />
                        Clear Filters
                    </Button>
                )}
            </div>
        </div>
    );
}
