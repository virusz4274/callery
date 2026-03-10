import React from 'react';
import { Button, ListBox, SearchField, Select } from '@heroui/react';
import { Filter, User, X } from 'lucide-react';
import type { Contact } from '@/lib/types';

type SearchSortRowProps = {
    search: string;
    onSearchChange: (value: string) => void;
    sortBy: 'date' | 'duration';
    sortOrder: 'asc' | 'desc';
    onSortChange: (by: string, order: string) => void;
    contacts: Contact[];
    contactId?: string;
    onContactChange: (id?: string) => void;
    startDate?: string;
    endDate?: string;
    onDateChange: (start?: string, end?: string) => void;
};

function resolveSortKey(key: unknown): string | null {
    if (!key) {
        return null;
    }

    if (typeof key === 'string') {
        return key;
    }

    if (typeof key === 'object' && key !== null) {
        return Array.from(key as Set<string>)[0] || null;
    }

    return null;
}

export function SearchSortRow({
    search,
    onSearchChange,
    sortBy,
    sortOrder,
    onSortChange,
    contacts,
    contactId,
    onContactChange,
    startDate,
    endDate,
    onDateChange,
}: SearchSortRowProps) {
    return (
        <>
            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                <div className="w-full md:max-w-md">
                    <label className="text-small font-medium text-default-500 mb-1 block">Filter by text</label>
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

                <div className="flex items-center gap-2 min-w-[200px]">
                    <span className="text-small text-default-500 font-medium">Sort by:</span>
                    <Select
                        className="flex-1"
                        aria-label="Sort options"
                        selectedKey={`${sortBy}-${sortOrder}`}
                        onSelectionChange={(keys) => {
                            const selectedKey = resolveSortKey(keys);
                            if (!selectedKey) {
                                return;
                            }

                            const [by, order] = selectedKey.split('-');
                            onSortChange(by, order);
                        }}
                    >
                        <Select.Trigger>
                            <Select.Value />
                            <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                            <ListBox selectionMode="single">
                                <ListBox.Item key="date-desc" id="date-desc">
                                    Newest First
                                </ListBox.Item>
                                <ListBox.Item key="date-asc" id="date-asc">
                                    Oldest First
                                </ListBox.Item>
                                <ListBox.Item key="duration-desc" id="duration-desc">
                                    Longest Duration
                                </ListBox.Item>
                                <ListBox.Item key="duration-asc" id="duration-asc">
                                    Shortest Duration
                                </ListBox.Item>
                            </ListBox>
                        </Select.Popover>
                    </Select>
                </div>
            </div>

            <div className="flex flex-wrap gap-4 items-center pt-2 border-t border-default-100">
                <div className="flex items-center gap-2 text-default-500">
                    <Filter className="w-4 h-4" />
                    <span className="text-small font-medium">Filters:</span>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2">
                        <span className="text-small text-default-500">From:</span>
                        <input
                            type="date"
                            className="h-10 px-3 rounded-lg border border-default-200 bg-default-100 text-small focus:outline-none focus:ring-2 focus:ring-primary"
                            value={startDate || ''}
                            onChange={(event) => onDateChange(event.target.value || undefined, endDate)}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-small text-default-500">To:</span>
                        <input
                            type="date"
                            className="h-10 px-3 rounded-lg border border-default-200 bg-default-100 text-small focus:outline-none focus:ring-2 focus:ring-primary"
                            value={endDate || ''}
                            onChange={(event) => onDateChange(startDate, event.target.value || undefined)}
                        />
                    </div>
                </div>

                {contactId && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-lg border border-primary/20">
                        <User className="w-4 h-4 text-primary" />
                        <span className="text-small font-medium text-primary">
                            Contact: {contacts.find((contact) => contact.id === contactId)?.name || 'Unknown'}
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
        </>
    );
}
